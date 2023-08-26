import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  MarginRequirementType,
  MarginfiAccountWrapper,
  MarginfiClient,
  PriceBias,
  USDC_DECIMALS,
} from "@mrgnlabs/marginfi-client-v2";
import { nativeToUi, NodeWallet, shortenAddress, sleep, uiToNative } from "@mrgnlabs/mrgn-common";
import BigNumber from "bignumber.js";
import { associatedAddress } from "@project-serum/anchor/dist/cjs/utils/token";
import { NATIVE_MINT } from "@solana/spl-token";
import { Jupiter } from "@jup-ag/core";
import { captureException, captureMessage, env_config } from "./config";
import JSBI from "jsbi";
import BN from "bn.js";
import { BankMetadataMap, loadBankMetadatas } from "./utils/bankMetadata";
import { Bank } from "@mrgnlabs/marginfi-client-v2/dist/models/bank";

const DUST_THRESHOLD = new BigNumber(10).pow(USDC_DECIMALS - 2);
const DUST_THRESHOLD_UI = new BigNumber(0.1);
const MIN_LIQUIDATION_AMOUNT_USD_UI = env_config.MIN_LIQUIDATION_AMOUNT_USD_UI;

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const MIN_SOL_BALANCE = env_config.MIN_SOL_BALANCE * LAMPORTS_PER_SOL;
const SLIPPAGE_BPS = 10000;

const EXCLUDE_ISOLATED_BANKS: boolean = process.env.EXCLUDE_ISOLATED_BANKS === "true"; // eslint-disable-line

function getDebugLogger(context: string) {
  return require("debug")(`mfi:liquidator:${context}`);
}

class Liquidator {
  private bankMetadataMap: BankMetadataMap;

  constructor(
    readonly connection: Connection,
    readonly account: MarginfiAccountWrapper,
    readonly client: MarginfiClient,
    readonly wallet: NodeWallet,
    readonly jupiter: Jupiter,
    readonly account_whitelist: PublicKey[] | undefined,
    readonly account_blacklist: PublicKey[] | undefined
  ) {
    this.bankMetadataMap = {};
  }

  async start() {
    console.log("Starting liquidator");

    console.log("Wallet: %s", this.account.authority);
    console.log("Liquidator account: %s", this.account.address);
    console.log("Program id: %s", this.client.program.programId);
    console.log("Group: %s", this.client.groupAddress);
    if (this.account_blacklist) {
      console.log("Blacklist: %s", this.account_blacklist);
    }
    if (this.account_whitelist) {
      console.log("Whitelist: %s", this.account_whitelist);
    }

    setInterval(async () => {
      try {
        this.bankMetadataMap = await loadBankMetadatas();
      } catch (e) {
        console.error("Failed to refresh bank metadata");
      }
    }, 10 * 60 * 1000); // refresh cache every 10 minutes

    console.log("Liquidating on %s banks", this.client.banks.size);

    console.log("Start with DEBUG=mfi:* to see more logs");

    await this.mainLoop();
  }

  private async mainLoop() {
    const debug = getDebugLogger("main-loop");
    drawSpinner("Scanning")
    try {
      await this.swapNonUsdcInTokenAccounts();
      while (true) {
        debug("Started main loop iteration");
        if (await this.needsToBeRebalanced()) {
          await this.rebalancingStage();
          continue;
        }

        // Don't sleep after liquidating an account, start rebalance immediately
        if (!await this.liquidationStage()) {
          await sleep(env_config.SLEEP_INTERVAL);
        }
      }
    } catch (e) {
      console.error(e);

      captureException(e);

      await sleep(env_config.SLEEP_INTERVAL);
      await this.mainLoop();
    }
  }

  private async swap(mintIn: PublicKey, mintOut: PublicKey, amountIn: BN) {
    const debug = getDebugLogger("swap");

    debug("Swapping %s %s to %s", amountIn, mintIn.toBase58(), mintOut.toBase58());

    const { routesInfos } = await this.jupiter.computeRoutes({
      inputMint: mintIn,
      outputMint: mintOut,
      amount: JSBI.BigInt(amountIn.toString()),
      slippageBps: SLIPPAGE_BPS,
      forceFetch: true,
    });

    const route = routesInfos[0];

    const { execute } = await this.jupiter.exchange({ routeInfo: route });

    const result = await execute();

    // @ts-ignore
    if (result.error && false) {
      // @ts-ignore
      debug("Error: %s", result.error);
      // @ts-ignore
      throw new Error(result.error);
    }

    // @ts-ignore
    debug("Trade successful %s", result.txid);
  }

  /**
   * 1. step of the account re-balancing

   * Withdraw all non-usdc deposits from account and sell them to usdc.
   * This step will only withdraw up until the free collateral threshold, if some collateral is tied up the bot will deposit
   * in a later stage the borrowed liabilities and usdc to untie the remaining collateral.
   */
  private async sellNonUsdcDeposits() {
    const debug = getDebugLogger("sell-non-usdc-deposits");
    debug("Starting non-usdc deposit sell step (1/3)");
    let balancesWithNonUsdcDeposits = this.account.activeBalances
      .map((balance) => {
        let bank = this.client.getBankByPk(balance.bankPk)!;
        let priceInfo = this.client.getOraclePriceByBank(balance.bankPk)!;
        let { assets } = balance.computeQuantity(bank);

        return { assets, bank, priceInfo };
      })
      .filter(({ assets, bank }) => !bank.mint.equals(USDC_MINT) && assets.gt(DUST_THRESHOLD));

    for (let { bank } of balancesWithNonUsdcDeposits) {
      let maxWithdrawAmount = this.account.computeMaxWithdrawForBank(bank.address);

      if (maxWithdrawAmount.eq(0)) {
        debug("No untied %s to withdraw", this.getTokenSymbol(bank));
        continue;
      }

      debug("Withdrawing %d %s", maxWithdrawAmount, this.getTokenSymbol(bank));
      let withdrawSig = await this.account.withdraw(maxWithdrawAmount, bank.address);

      debug("Withdraw tx: %s", withdrawSig);

      await this.account.reload();

      debug("Swapping %s to USDC", bank.mint);

      const balance = await this.getTokenAccountBalance(bank.mint);

      await this.swap(bank.mint, USDC_MINT, uiToNative(balance, bank.mintDecimals));
    }
  }

  /**
   * 2. step of the account re-balancing
   *
   * At this stage we assume that the lending account has not more untied non-usdc collateral.
   * Only usdc collateral and liabilities are left.
   *
   * We first calculate the cost of paying down the liability in usdc, if we don't have enough usdc in the token account,
   * we withdraw any additional usdc we need from the lending account.
   *
   * We then buy liability with the usdc we have available and deposit the usdc and liability to the lending account.
   *
   * Depositing the liability should unlock any tied up collateral.
   *
   */
  private async repayAllDebt() {
    const debug = getDebugLogger("repay-all-debt");
    debug("Starting debt repayment step (2/3)");
    const balancesWithNonUsdcLiabilities = this.account.activeBalances
      .map((balance) => {
        let bank = this.client.getBankByPk(balance.bankPk)!;
        let { liabilities } = balance.computeQuantity(bank);

        return { liabilities, bank };
      })
      .filter(({ liabilities, bank }) => liabilities.gt(new BigNumber(0)) && !bank.mint.equals(USDC_MINT));

    for (let { liabilities, bank } of balancesWithNonUsdcLiabilities) {
      debug("Repaying %d %si", nativeToUi(liabilities, bank.mintDecimals), this.getTokenSymbol(bank));
      let availableUsdcInTokenAccount = await this.getTokenAccountBalance(USDC_MINT);

      await this.client.reload();

      const usdcBank = this.client.getBankByMint(USDC_MINT)!;
      const priceInfo = this.client.getOraclePriceByBank(bank.address)!;
      const availableUsdcLiquidity = this.account.computeMaxBorrowForBank(usdcBank.address);

      const baseLiabUsdcValue = bank.computeLiabilityUsdValue(
        priceInfo,
        liabilities,
        MarginRequirementType.Equity,
        // We might need to use a Higher price bias to account for worst case scenario.
        PriceBias.None
      );

      /// When a liab value is super small (1 BONK), we cannot feasibly buy it for the exact amount,
      // so the solution is to buy more (trivial amount more), and then over repay.
      const liabUsdcValue = BigNumber.max(baseLiabUsdcValue, new BigNumber(1));

      debug("Liab usd value %s", liabUsdcValue);

      // We can possibly withdraw some usdc from the lending account if we are short.
      let usdcBuyingPower = BigNumber.min(availableUsdcInTokenAccount, liabUsdcValue);
      const missingUsdc = liabUsdcValue.minus(usdcBuyingPower);

      if (missingUsdc.gt(0)) {
        const usdcToWithdraw = BigNumber.min(missingUsdc, availableUsdcLiquidity);
        debug("Withdrawing %d USDC", usdcToWithdraw);
        const withdrawSig = await this.account.withdraw(usdcToWithdraw, usdcBank.address);
        debug("Withdraw tx: %s", withdrawSig);
        await this.account.reload();
      }

      availableUsdcInTokenAccount = await this.getTokenAccountBalance(USDC_MINT);

      usdcBuyingPower = BigNumber.min(availableUsdcInTokenAccount, liabUsdcValue);

      debug("Swapping %d USDC to %s", usdcBuyingPower, this.getTokenSymbol(bank));

      await this.swap(USDC_MINT, bank.mint, uiToNative(usdcBuyingPower, USDC_DECIMALS));

      const liabsUi = new BigNumber(nativeToUi(liabilities, bank.mintDecimals));
      const liabBalance = BigNumber.min(await this.getTokenAccountBalance(bank.mint, true), liabsUi);

      debug("Got %s of %s, depositing to marginfi", liabBalance, bank.mint);

      const depositSig = await this.account.repay(liabBalance, bank.address, liabBalance.gte(liabsUi));
      debug("Deposit tx: %s", depositSig);
    }
  }

  /**
   * 3. step of the account re-balancing
   *
   * At this stage we assume that the lending account has not more untied non-usdc collateral, and we have repaid all liabilities
   * given our current purchasing power.
   *
   * We can now deposit the remaining usdc in the lending account to untie the collateral.
   *
   * Assuming everything went well the account should be balanced now, however if that is not the case
   * the re-balancing mechanism will start again.
   */
  private async depositRemainingUsdc() {
    const debug = getDebugLogger("deposit-remaining-usdc");
    debug("Starting remaining usdc deposit step (3/3)");

    const usdcBalance = await this.getTokenAccountBalance(USDC_MINT);

    const usdcBank = this.client.getBankByMint(USDC_MINT)!;
    const depositTx = await this.account.deposit(usdcBalance, usdcBank.address);
    debug("Deposit tx: %s", depositTx);
  }

  private async rebalancingStage() {
    const debug = getDebugLogger("rebalancing-stage");
    debug("Starting rebalancing stage");
    captureMessage("Starting rebalancing stage");
    await this.sellNonUsdcDeposits();
    await this.repayAllDebt();
    await this.depositRemainingUsdc();
  }

  private async getTokenAccountBalance(mint: PublicKey, ignoreNativeMint: boolean = false): Promise<BigNumber> {
    const tokenAccount = await associatedAddress({ mint, owner: this.wallet.publicKey });
    const nativeAmount = nativeToUi(
      mint.equals(NATIVE_MINT)
        ? Math.max(
            (await this.connection.getBalance(this.wallet.publicKey)) -
              (ignoreNativeMint ? MIN_SOL_BALANCE / 2 : MIN_SOL_BALANCE),
            0
          )
        : 0,
      9
    );

    try {
      return new BigNumber((await this.connection.getTokenAccountBalance(tokenAccount)).value.uiAmount!).plus(
        nativeAmount
      );
    } catch (e) {
      return new BigNumber(0).plus(nativeAmount);
    }
  }

  private async swapNonUsdcInTokenAccounts() {
    const debug = getDebugLogger("swap-non-usdc-in-token-accounts");
    debug("Swapping any remaining non-usdc to usdc");
    const banks = this.client.banks.values();
    const usdcBank = this.client.getBankByMint(USDC_MINT)!;
    for (let bankInterEntry = banks.next(); !bankInterEntry.done; bankInterEntry = banks.next()) {
      const bank = bankInterEntry.value;
      if (bank.mint.equals(USDC_MINT) || bank.mint.equals(NATIVE_MINT)) {
        continue;
      }

      let amount = await this.getTokenAccountBalance(bank.mint);

      if (amount.lte(DUST_THRESHOLD_UI)) {
        continue;
      }

      const balance = this.account.getBalance(bank.address);
      const { liabilities } = balance.computeQuantityUi(bank);

      if (liabilities.gt(0)) {
        debug("Account has %d liabilities in %s", liabilities, this.getTokenSymbol(bank));
        const depositAmount = BigNumber.min(amount, liabilities);

        debug("Paying off %d %s liabilities", depositAmount, this.getTokenSymbol(bank));
        await this.account.repay(depositAmount, bank.address, amount.gte(liabilities));

        amount = await this.getTokenAccountBalance(bank.mint);
      }

      debug("Swapping %d %s to USDC", amount, this.getTokenSymbol(bank));

      await this.swap(bank.mint, USDC_MINT, uiToNative(amount, bank.mintDecimals));
    }

    const usdcBalance = await this.getTokenAccountBalance(USDC_MINT);

    if (usdcBalance.eq(0)) {
      debug("No USDC to deposit");
      return;
    }

    debug("Depositing %d USDC", usdcBalance);

    const tx = await this.account.deposit(usdcBalance, usdcBank.address);

    debug("Deposit tx: %s", tx);
  }

  private async needsToBeRebalanced(): Promise<boolean> {
    const debug = getDebugLogger("rebalance-check");

    debug("Checking if liquidator needs to be rebalanced");
    await this.client.reload();
    await this.account.reload();

    const lendingAccountToRebalance = this.account.activeBalances
      .map((lendingAccount) => {
        const bank = this.client.getBankByPk(lendingAccount.bankPk)!;
        const { assets, liabilities } = lendingAccount.computeQuantity(bank);

        return { bank, assets, liabilities };
      })
      .filter(({ bank, assets, liabilities }) => {
        return (assets.gt(DUST_THRESHOLD) && !bank.mint.equals(USDC_MINT)) || liabilities.gt(new BigNumber(0));
      });

    const lendingAccountToRebalanceExists = lendingAccountToRebalance.length > 0;
    debug("Liquidator account needs to be rebalanced: %s", lendingAccountToRebalanceExists ? "true" : "false");

    if (lendingAccountToRebalanceExists) {
      debug("Lending accounts to rebalance:");
      lendingAccountToRebalance.forEach(({ bank, assets, liabilities }) => {
        debug(`Bank: ${this.getTokenSymbol(bank)}, Assets: ${assets}, Liabilities: ${liabilities}`);
      });
    }

    return lendingAccountToRebalanceExists;
  }

  private async liquidationStage(): Promise<boolean> {
    const debug = getDebugLogger("liquidation-stage");
    debug("Started liquidation stage");
    const allAccounts = await this.client.getAllMarginfiAccounts();
    const targetAccounts = allAccounts.filter((account) => {
      if (this.account_whitelist) {
        return this.account_whitelist.find((whitelistedAddress) => whitelistedAddress.equals(account.address)) !== undefined;
      } else if (this.account_blacklist) {
        return this.account_blacklist.find((whitelistedAddress) => whitelistedAddress.equals(account.address)) === undefined;
      }
      return true;
    });

    const accounts = shuffle(targetAccounts);
    debug("Found %s accounts in total", allAccounts.length);
    debug("Monitoring %s accounts", targetAccounts.length);

    for (let i = 0; i < accounts.length; i++) {
      const liquidatedAccount = await this.processAccount(accounts[i]);

      debug("Account %s liquidated: %s", accounts[i], liquidatedAccount);

      if (liquidatedAccount) {
        debug("Account liquidated, stopping to rebalance");
        return true;
      }
    }

    return false;
  }

  private async processAccount(marginfiAccount: MarginfiAccountWrapper): Promise<boolean> {
    const group = this.client.group;
    const liquidatorAccount = this.account;

    if (marginfiAccount.address.equals(liquidatorAccount.address)) {
      return false;
    }

    const debug = getDebugLogger(`process-account:${marginfiAccount.address.toBase58()}`);

    debug("Processing account %s", marginfiAccount.address);

    if (marginfiAccount.canBeLiquidated()) {
      const { assets, liabilities } = marginfiAccount.computeHealthComponents(MarginRequirementType.Maintenance);

      const maxLiabilityPaydown = assets.minus(liabilities);
      debug("Account can be liquidated, account health: %d", maxLiabilityPaydown);
    } else {
      debug("Account cannot be liquidated");
      return false;
    }

    captureMessage(`Liquidating account ${marginfiAccount.address.toBase58()}`);

    let maxLiabilityPaydownUsdValue = new BigNumber(0);
    let bestLiabAccountIndex = 0;

    // Find the biggest liability account that can be covered by liquidator
    for (let i = 0; i < marginfiAccount.activeBalances.length; i++) {
      const balance = marginfiAccount.activeBalances[i];
      const bank = this.client.getBankByPk(balance.bankPk)!;
      const priceInfo = this.client.getOraclePriceByBank(balance.bankPk)!;

      if (EXCLUDE_ISOLATED_BANKS && bank.config.assetWeightInit.isEqualTo(0)) {
        debug("Skipping isolated bank %s", this.getTokenSymbol(bank));
        continue;
      }

      const maxLiabCoverage = liquidatorAccount.computeMaxBorrowForBank(bank.address);
      const liquidatorLiabPayoffCapacityUsd = bank.computeUsdValue(
        priceInfo,
        maxLiabCoverage,
        PriceBias.None,
        undefined,
        false
      );
      debug("Max borrow for bank: %d ($%d)", maxLiabCoverage, liquidatorLiabPayoffCapacityUsd);
      const { liabilities: liquidateeLiabUsdValue } = balance.computeUsdValue(
        bank,
        priceInfo,
        MarginRequirementType.Equity
      );

      debug("Balance: liab: $%d, max coverage: %d", liquidateeLiabUsdValue, liquidatorLiabPayoffCapacityUsd);

      if (liquidateeLiabUsdValue.gt(maxLiabilityPaydownUsdValue)) {
        maxLiabilityPaydownUsdValue = liquidateeLiabUsdValue;
        bestLiabAccountIndex = i;
      }
    }

    debug(
      "Biggest liability balance paydown USD value: %d, mint: %s",
      maxLiabilityPaydownUsdValue,
      this.client.getBankByPk(marginfiAccount.activeBalances[bestLiabAccountIndex].bankPk)!.mint
    );

    if (maxLiabilityPaydownUsdValue.lt(MIN_LIQUIDATION_AMOUNT_USD_UI)) {
      debug("No liability to liquidate");
      return false;
    }

    let maxCollateralUsd = new BigNumber(0);
    let bestCollateralIndex = 0;

    // Find the biggest collateral account
    for (let i = 0; i < marginfiAccount.activeBalances.length; i++) {
      const balance = marginfiAccount.activeBalances[i];
      const bank = this.client.getBankByPk(balance.bankPk)!;
      const priceInfo = this.client.getOraclePriceByBank(balance.bankPk)!;

      if (EXCLUDE_ISOLATED_BANKS && bank.config.assetWeightInit.isEqualTo(0)) {
        debug("Skipping isolated bank %s", this.getTokenSymbol(bank));
        continue;
      }

      const { assets: collateralUsdValue } = balance.computeUsdValue(bank, priceInfo, MarginRequirementType.Equity);
      if (collateralUsdValue.gt(maxCollateralUsd)) {
        maxCollateralUsd = collateralUsdValue;
        bestCollateralIndex = i;
      }
    }

    debug(
      "Max collateral USD value: %d, mint: %s",
      maxCollateralUsd,
      this.client.getBankByPk(marginfiAccount.activeBalances[bestCollateralIndex].bankPk)!.mint
    );

    const collateralBankPk = marginfiAccount.activeBalances[bestCollateralIndex].bankPk;
    const collateralBank = this.client.getBankByPk(collateralBankPk)!;
    const collateralPriceInfo = this.client.getOraclePriceByBank(collateralBankPk)!;

    const liabBankPk = marginfiAccount.activeBalances[bestLiabAccountIndex].bankPk;
    const liabBank = this.client.getBankByPk(liabBankPk)!;
    const liabPriceInfo = this.client.getOraclePriceByBank(liabBankPk)!;

    // MAX collateral amount to liquidate for given banks and the trader marginfi account balances
    // this doesn't account for liquidators liquidation capacity
    const maxCollateralAmountToLiquidate = marginfiAccount.computeMaxLiquidatableAssetAmount(
      collateralBank.address,
      liabBank.address
    );

    debug("Max collateral amount to liquidate: %d", maxCollateralAmountToLiquidate);

    // MAX collateral amount to liquidate given liquidators current margin account
    const liquidatorMaxLiquidationCapacityLiabAmount = liquidatorAccount.computeMaxBorrowForBank(liabBank.address);
    const liquidatorMaxLiquidationCapacityUsd = liabBank.computeUsdValue(
      liabPriceInfo,
      liquidatorMaxLiquidationCapacityLiabAmount,
      PriceBias.None,
      undefined,
      false
    );
    const liquidatorMaxLiqCapacityAssetAmount = collateralBank.computeQuantityFromUsdValue(
      collateralPriceInfo,
      liquidatorMaxLiquidationCapacityUsd,
      PriceBias.None
    );

    debug(
      "Liquidator max liquidation capacity: %d ($%d) for bank %s",
      liquidatorMaxLiquidationCapacityLiabAmount,
      liquidatorMaxLiquidationCapacityUsd,
      liabBank.mint
    );

    const collateralAmountToLiquidate = BigNumber.min(
      maxCollateralAmountToLiquidate,
      liquidatorMaxLiqCapacityAssetAmount
    );

    const slippageAdjustedCollateralAmountToLiquidate = collateralAmountToLiquidate.times(0.75);

    if (slippageAdjustedCollateralAmountToLiquidate.lt(MIN_LIQUIDATION_AMOUNT_USD_UI)) {
      debug("No collateral to liquidate");
      return false;
    }

    console.log(
      "Liquidating %d %s for %s",
      slippageAdjustedCollateralAmountToLiquidate,
      this.getTokenSymbol(collateralBank),
      this.getTokenSymbol(liabBank)
    );

    const sig = await liquidatorAccount.lendingAccountLiquidate(
      marginfiAccount.data,
      collateralBank.address,
      slippageAdjustedCollateralAmountToLiquidate,
      liabBank.address
    );
    console.log("Liquidation tx: %s", sig);

    return true;
  }

  getTokenSymbol(bank: Bank): string {
    const bankMetadata = this.bankMetadataMap[bank.address.toBase58()];
    if (!bankMetadata) {
      console.log("Bank metadata not found for %s", bank.address.toBase58());
      return shortenAddress(bank.mint.toBase58());
    }

    return bankMetadata.tokenSymbol;
  }
}

const shuffle = ([...arr]) => {
  let m = arr.length;
  while (m) {
    const i = Math.floor(Math.random() * m--);
    [arr[m], arr[i]] = [arr[i], arr[m]];
  }
  return arr;
};

export { Liquidator };

function drawSpinner(message: string) {
  if (!!process.env.DEBUG) {
    // Don't draw spinner when logging is enabled
    return;
  }
  const spinnerFrames = ['-', '\\', '|', '/'];
  let frameIndex = 0;

  setInterval(() => {
    process.stdout.write(`\r${message} ${spinnerFrames[frameIndex]}`);
    frameIndex = (frameIndex + 1) % spinnerFrames.length;
  }, 100);
}
