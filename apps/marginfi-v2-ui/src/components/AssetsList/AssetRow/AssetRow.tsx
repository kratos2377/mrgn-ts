import MarginfiAccount from "@mrgnlabs/marginfi-client-v2/src/account";
import { TableCell, TableRow, Tooltip } from "@mui/material";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { ActionType, ProductType, ExtendedBankInfo, isActiveBankInfo } from "~/types";
import { AssetRowInputBox } from "./AssetRowInputBox";
import { AssetRowAction } from "./AssetRowAction";
import { AssetRowHeader, AssetRowEnder } from "./AssetRowHeader";
import { AssetRowMetric } from "./AssetRowMetric";
import { MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import { WSOL_MINT } from "~/config";
import { Keypair, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { groupedNumberFormatter, usdFormatter } from "~/utils/formatters";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@mrgnlabs/mrgn-common/src/spl";
import { uiToNative } from "@mrgnlabs/mrgn-common";
import { productConfig } from "~/config";

const BORROW_OR_LEND_TOAST_ID = "borrow-or-lend";
const REFRESH_ACCOUNT_TOAST_ID = "refresh-account";
const ACCOUNT_DETECTION_ERROR_TOAST_ID = "account-detection-error";

// @todo currently, action for only lend & borrow is enabled
// @todo enable lock and superstake progressively
const AssetRow: FC<{
  bankInfo: ExtendedBankInfo;
  nativeSolBalance: number;
  productType: ProductType;
  isConnected: boolean;
  marginfiAccount: MarginfiAccount | null;
  marginfiClient: MarginfiClient | null;
  reloadBanks: () => Promise<void>;
}> = ({ bankInfo, nativeSolBalance, productType, isConnected, marginfiAccount, marginfiClient, reloadBanks }) => {
  const [borrowOrLendAmount, setBorrowOrLendAmount] = useState(0);

  // Reset b/l amounts on toggle
  useEffect(() => {
    setBorrowOrLendAmount(0);
  }, [productType]);

  const currentAction = useMemo(() => getCurrentAction(productType, bankInfo), [productType, bankInfo]);
  const isInLendingMode = useMemo(() => productType === ProductType.Lend ? true : false, [productType]);

  const maxAmount = useMemo(() => {
    switch (currentAction) {
      case ActionType.Deposit:
        return bankInfo.maxDeposit;
      case ActionType.Withdraw:
        return bankInfo.maxWithdraw;
      case ActionType.Borrow:
        return bankInfo.maxBorrow;
      case ActionType.Repay:
        return bankInfo.maxRepay;
    }
  }, [bankInfo.maxBorrow, bankInfo.maxDeposit, bankInfo.maxRepay, bankInfo.maxWithdraw, currentAction]);

  const borrowOrLend = useCallback(async () => {
    if (marginfiClient === null) throw Error("Marginfi client not ready");

    if (currentAction === ActionType.Deposit && bankInfo.maxDeposit === 0) {
      toast.error(`You don't have any ${bankInfo.tokenName} to lend in your wallet.`);
      return;
    }

    if (currentAction === ActionType.Borrow && bankInfo.maxBorrow === 0) {
      toast.error(`You cannot borrow any ${bankInfo.tokenName} right now.`);
      return;
    }

    if (borrowOrLendAmount <= 0) {
      toast.error("Please enter an amount over 0.");
      return;
    }

    let _marginfiAccount = marginfiAccount;

    // -------- Create marginfi account if needed
    try {
      if (_marginfiAccount === null) {
        if (currentAction !== ActionType.Deposit) {
          toast.error("An account is required for anything operation except deposit.");
          return;
        }

        toast.loading("Creating account", {
          toastId: BORROW_OR_LEND_TOAST_ID,
        });

        const userAccounts = await marginfiClient.getMarginfiAccountsForAuthority();
        if (userAccounts.length > 0) {
          toast.update(BORROW_OR_LEND_TOAST_ID, {
            render: "Uh oh, data seems out-of-sync",
            toastId: BORROW_OR_LEND_TOAST_ID,
            type: toast.TYPE.WARNING,
            autoClose: 3000,
            isLoading: false,
          });
          toast.loading("Refreshing data...", { toastId: ACCOUNT_DETECTION_ERROR_TOAST_ID });
          try {
            await reloadBanks();
            toast.update(ACCOUNT_DETECTION_ERROR_TOAST_ID, {
              render: "Refreshing data... Done. Please try again",
              type: toast.TYPE.SUCCESS,
              autoClose: 3000,
              isLoading: false,
            });
          } catch (error: any) {
            toast.update(ACCOUNT_DETECTION_ERROR_TOAST_ID, {
              render: `Error while reloading state: ${error.message}`,
              type: toast.TYPE.ERROR,
              autoClose: 5000,
              isLoading: false,
            });
            console.log("Error while reloading state");
            console.log(error);
          }
          return;
        }

        _marginfiAccount = await marginfiClient.createMarginfiAccount();
        toast.update(BORROW_OR_LEND_TOAST_ID, {
          render: `${currentAction + "ing"} ${borrowOrLendAmount} ${bankInfo.tokenName}`,
        });
      }
    } catch (error: any) {
      toast.update(BORROW_OR_LEND_TOAST_ID, {
        render: `Error while ${currentAction + "ing"}: ${error.message}`,
        type: toast.TYPE.ERROR,
        autoClose: 5000,
        isLoading: false,
      });
      console.log(`Error while ${currentAction + "ing"}`);
      console.log(error);
      return;
    }

    // -------- Perform relevant operation
    try {
      let ixs: TransactionInstruction[] = [];
      let signers: Keypair[] = [];

      if (currentAction === ActionType.Deposit) {
        if (bankInfo.tokenMint.equals(WSOL_MINT)) {
          const ata = getAssociatedTokenAddressSync(bankInfo.tokenMint, _marginfiAccount.authority, false);

          ixs.push(
            createAssociatedTokenAccountIdempotentInstruction(
              _marginfiAccount.authority,
              ata,
              _marginfiAccount.authority,
              bankInfo.tokenMint
            )
          );

          const tokenBalanceNative = uiToNative(bankInfo.tokenBalance, bankInfo.tokenMintDecimals);
          const borrowOrLendAmountNative = uiToNative(borrowOrLendAmount, bankInfo.tokenMintDecimals);
          const nativeSolTopUpAmount = borrowOrLendAmountNative.sub(tokenBalanceNative);
          if (nativeSolTopUpAmount.gtn(0)) {
            ixs.push(
              SystemProgram.transfer({
                fromPubkey: _marginfiAccount.authority,
                toPubkey: ata,
                lamports: BigInt(nativeSolTopUpAmount.toString()),
              })
            );
            ixs.push(createSyncNativeInstruction(ata));
          }

          const depositIxs = await _marginfiAccount.makeDepositIx(borrowOrLendAmount, bankInfo.bank);
          ixs = ixs.concat(depositIxs.instructions);
          signers = signers.concat(depositIxs.keys);

          await marginfiClient.processTransaction(new Transaction().add(...ixs), signers);
        } else {
          await _marginfiAccount.deposit(borrowOrLendAmount, bankInfo.bank);
        }
        toast.update(BORROW_OR_LEND_TOAST_ID, {
          render: `${currentAction + "ing"} ${borrowOrLendAmount} ${bankInfo.tokenName} 👍`,
          type: toast.TYPE.SUCCESS,
          autoClose: 2000,
          isLoading: false,
        });
      }

      toast.loading(`${currentAction + "ing"} ${borrowOrLendAmount} ${bankInfo.tokenName}`, {
        toastId: BORROW_OR_LEND_TOAST_ID,
      });
      if (_marginfiAccount === null) {
        // noinspection ExceptionCaughtLocallyJS
        throw Error("Marginfi account not ready");
      }

      if (currentAction === ActionType.Borrow) {
        await _marginfiAccount.borrow(borrowOrLendAmount, bankInfo.bank);
      } else if (currentAction === ActionType.Repay) {
        const repayAll = isActiveBankInfo(bankInfo) ? borrowOrLendAmount === bankInfo.position.amount : false;
        await _marginfiAccount.repay(borrowOrLendAmount, bankInfo.bank, repayAll);
      } else if (currentAction === ActionType.Withdraw) {
        const withdrawAll = isActiveBankInfo(bankInfo) ? borrowOrLendAmount === bankInfo.position.amount : false;
        await _marginfiAccount.withdraw(borrowOrLendAmount, bankInfo.bank, withdrawAll);
      }

      toast.update(BORROW_OR_LEND_TOAST_ID, {
        render: `${currentAction + "ing"} ${borrowOrLendAmount} ${bankInfo.tokenName} 👍`,
        type: toast.TYPE.SUCCESS,
        autoClose: 2000,
        isLoading: false,
      });
    } catch (error: any) {
      toast.update(BORROW_OR_LEND_TOAST_ID, {
        render: `Error while ${currentAction + "ing"}: ${error.message}`,
        type: toast.TYPE.ERROR,
        autoClose: 5000,
        isLoading: false,
      });
      console.log(`Error while ${currentAction + "ing"}`);
      console.log(error);
    }

    setBorrowOrLendAmount(0);

    // -------- Refresh state
    toast.loading("Refreshing state", { toastId: REFRESH_ACCOUNT_TOAST_ID });
    try {
      await reloadBanks();
      toast.update(REFRESH_ACCOUNT_TOAST_ID, {
        render: "Refreshing state 👍",
        type: toast.TYPE.SUCCESS,
        autoClose: 2000,
        isLoading: false,
      });
    } catch (error: any) {
      toast.update(REFRESH_ACCOUNT_TOAST_ID, {
        render: `Error while reloading state: ${error.message}`,
        type: toast.TYPE.ERROR,
        autoClose: 5000,
        isLoading: false,
      });
      console.log("Error while reloading state");
      console.log(error);
    }
  }, [bankInfo, borrowOrLendAmount, currentAction, marginfiAccount, marginfiClient, reloadBanks]);


  // @todo these types of styling attributes need to be organized better
  const assetBorders = {
    "SOL": "#9945FF",
    "USDC": "#2775CA",
  }

  const Mobile = () => (
    // padding here is a mess
    <TableRow
      className='flex lg:hidden h-full justify-between items-center min-h-[78px] sm:h-[78px] flex-col sm:flex-row p-0 pt-2 px-4 sm:p-2 lg:p-4 border-solid sm:border-[#1C2125] border rounded-xl gap-2 lg:gap-4'
      style={{
        border: `1px solid ${assetBorders[bankInfo.tokenName] || "#1C2125"}`,
      }}
    >
      <AssetRowHeader
        assetName={bankInfo.tokenName}
        icon={bankInfo.tokenIcon}
        usdPrice={usdFormatter.format(bankInfo.tokenPrice)}
      />

      <TableCell
        className="h-full w-full flex py-0 px-0 mb-5 sm:mb-0 border-hidden flex justify-center items-center w-full max-w-[600px] min-w-fit"
      >
        <AssetRowMetric
          longLabel="Current Price"
          shortLabel="Price"
          value={usdFormatter.format(bankInfo.tokenPrice)}
          firstMetric
        />
        <AssetRowMetric
          longLabel={isInLendingMode ? "Total Pool Deposits" : "Total Pool Borrows"}
          shortLabel={isInLendingMode ? "Deposits" : "Borrows"}
          value={groupedNumberFormatter.format(
            isInLendingMode ? bankInfo.totalPoolDeposits : bankInfo.totalPoolBorrows
          )}
          usdEquivalentValue={usdFormatter.format(
            (isInLendingMode ? bankInfo.totalPoolDeposits : bankInfo.totalPoolBorrows) * bankInfo.tokenPrice
          )}
          lastMetric={isConnected ? false : true}
        />
        {isConnected && (
          <AssetRowMetric
            longLabel={isInLendingMode ? "Wallet Balance" : "Available Liquidity"}
            shortLabel="Available"
            value={groupedNumberFormatter.format(
              isInLendingMode
                ? bankInfo.tokenMint.equals(WSOL_MINT)
                  ? bankInfo.tokenBalance + nativeSolBalance
                  : bankInfo.tokenBalance
                : bankInfo.availableLiquidity
            )}
            usdEquivalentValue={usdFormatter.format(
              (isInLendingMode
                ? bankInfo.tokenMint.equals(WSOL_MINT)
                  ? bankInfo.tokenBalance + nativeSolBalance
                  : bankInfo.tokenBalance
                : bankInfo.availableLiquidity) * bankInfo.tokenPrice
            )}
            lastMetric
          />
        )}
      </TableCell>
      <AssetRowEnder
        assetName={bankInfo.tokenName}
        icon={bankInfo.tokenIcon}
        tableCellStyling={productConfig[productType].dataRow.ender.cellStyling}
        actionButtonOnClick={borrowOrLend}
        currentAction={currentAction}
        borrowOrLendAmount={borrowOrLendAmount}
        setBorrowOrLendAmount={setBorrowOrLendAmount}
        maxAmount={maxAmount}
        maxDecimals={bankInfo.tokenMintDecimals}
        isConnected={isConnected}
      />
    </TableRow>
  )

  const DesktopTableRow = ({ data }) => (
    <TableRow
      className="hidden lg:flex min-h-14 sm:h-14 h-full justify-between items-center flex-col sm:flex-row p-0"
    >
      <AssetRowHeader
        assetName={bankInfo.tokenName}
        icon={bankInfo.tokenIcon}
        usdPrice={usdFormatter.format(bankInfo.tokenPrice)}
        tableCellStyling={productConfig[productType].dataRow.header.cellStyling}
      />
      <div
        className="h-full w-full min-w-[62.5%] flex rounded-md border border-solid border-[#1C2125] mx-2"
      >
        {
          data.map( item => (
            <TableCell
              className={`border-hidden text-white h-full w-full pr-1 pl-[2%] flex justify-start items-center gap-1 bg-[#0D0F11] ${productConfig[productType].dataRow.inner.cellStyling} rounded-md text-base`}
              style={{
                fontFamily: "Aeonik Pro",
              }}
            >
              {item}
            </TableCell>
          ))
        }
      </div>
      <AssetRowEnder
        assetName={bankInfo.tokenName}
        icon={bankInfo.tokenIcon}
        tableCellStyling={productConfig[productType].dataRow.ender.cellStyling}
        actionButtonOnClick={borrowOrLend}
        currentAction={currentAction}
        borrowOrLendAmount={borrowOrLendAmount}
        setBorrowOrLendAmount={setBorrowOrLendAmount}
        maxAmount={maxAmount}
        maxDecimals={bankInfo.tokenMintDecimals}
        isConnected={isConnected}
      />
    </TableRow>
  )

  // @todo this needs to be dynamic
  const rowData = {
    [ProductType.Lock]: [
      "0.00%",
      "◎40,234",,
      "2 weeks",
      "◎234,524",
      isConnected ?
        groupedNumberFormatter.format(
          bankInfo.tokenMint.equals(WSOL_MINT)
          ? bankInfo.tokenBalance + nativeSolBalance
          : bankInfo.tokenBalance
        )
      : '-'
    ],
    [ProductType.Lend]: [
      "0.00%",
      "◎40,234",,
      "◎40,234",
      isConnected ?
        groupedNumberFormatter.format(
          bankInfo.tokenMint.equals(WSOL_MINT)
          ? bankInfo.tokenBalance + nativeSolBalance
          : bankInfo.tokenBalance
        )
      : '-'
    ],
    [ProductType.Borrow]: [
      "0.00%",
      "◎40,234",,
      "◎40,234",
      "◎234,523",
      isConnected ?
        groupedNumberFormatter.format(
          bankInfo.tokenMint.equals(WSOL_MINT)
          ? bankInfo.tokenBalance + nativeSolBalance
          : bankInfo.tokenBalance
        )
      : '-'
    ],
    [ProductType.Superstake]: [],
  }

  return (
    <>
      <Mobile />
      <DesktopTableRow data={rowData[productType]} />
    </>
  );
};

function getCurrentAction(
  productType: ProductType,
  bankInfo: ExtendedBankInfo,
): ActionType {
  if (!((productType === ProductType.Lend) || (productType === ProductType.Borrow))) {
    console.log("Product type not implemented yet");
    // @todo this is a dummy return, should error
    return ActionType.Deposit;
  }

  if (!isActiveBankInfo(bankInfo)) {
    return productType === ProductType.Lend ? ActionType.Deposit : ActionType.Borrow;
  } else {
    if (bankInfo.position.isLending) {
      if (productType === ProductType.Lend) {
        return ActionType.Deposit;
      } else {
        return ActionType.Withdraw;
      }
    } else {
      if (productType === ProductType.Lend) {
        return ActionType.Repay;
      } else {
        return ActionType.Borrow;
      }
    }
  }
}

export { AssetRow };
