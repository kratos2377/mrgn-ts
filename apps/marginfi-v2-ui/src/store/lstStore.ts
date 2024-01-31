import { ACCOUNT_SIZE, Wallet, aprToApy } from "@mrgnlabs/mrgn-common";
import { Connection, PublicKey } from "@solana/web3.js";
import { QuoteResponseMeta } from "@jup-ag/react-hook";
import { create, StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import * as solanaStakePool from "@solana/spl-stake-pool";

import { EPOCHS_PER_YEAR, StakeData, fetchStakeAccounts } from "~/utils";


const STAKEVIEW_APP_URL = "https://stakeview.app/apy/prev3.json";
const BASELINE_VALIDATOR_ID = "mrgn28BhocwdAUEenen3Sw2MR9cPKDpLkDvzDdR7DBD";

export const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const LST_MINT = new PublicKey("LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp");
const NETWORK_FEE_LAMPORTS = 15000; // network fee + some for potential account creation
const SOL_USD_PYTH_ORACLE = new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG");
const STAKE_POOL_ID = new PublicKey("DqhH94PjkZsjAqEze2BEkWhFQJ6EyU6MdtMphMgnXqeK");

const SUPPORTED_TOKENS = [
  "7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
  "So11111111111111111111111111111111111111112",
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
];

export type SupportedSlippagePercent = 0.1 | 0.5 | 1.0 | 5.0;

interface LstState {
  // State
  initialized: boolean;
  isRefreshingStore: boolean;
  connection: Connection | null;
  wallet: Wallet | null;
  lstData: LstData | null;
  feesAndRent: number;
  stakeAccounts: StakeData[];
  slippagePct: SupportedSlippagePercent;
  quoteResponseMeta: QuoteResponseMeta | null

  // Actions
  fetchLstState: (args?: { connection?: Connection; wallet?: Wallet; isOverride?: boolean }) => Promise<void>;
  setIsRefreshingStore: (isRefreshingStore: boolean) => void;
  setSlippagePct: (slippagePct: SupportedSlippagePercent) => void;
  setQuoteResponseMeta: (quoteResponseMeta: QuoteResponseMeta | null) => void;
}

function createLstStore() {
  return create<LstState, [["zustand/persist", Pick<LstState, "slippagePct">]]>(
    persist(stateCreator, {
      name: "lst-peristent-store",
      partialize(state) {
        return {
          slippagePct: state.slippagePct,
        };
      },
    })
  );
}

export interface LstData {
  poolAddress: PublicKey;
  tvl: number;
  projectedApy: number;
  lstSolValue: number;
  solDepositFee: number;
  accountData: solanaStakePool.StakePool;
  validatorList: PublicKey[];
}

const stateCreator: StateCreator<LstState, [], []> = (set, get) => ({
  // State
  initialized: false,
  isRefreshingStore: false,
  connection: null,
  wallet: null,
  lstData: null,
  feesAndRent: 0,
  stakeAccounts: [],
  slippagePct: 1,
  stakePoolProxyProgram: null,
  quoteResponseMeta: null,

  // Actions
  fetchLstState: async (args?: { connection?: Connection; wallet?: Wallet }) => {
    try {
      const connection = args?.connection || get().connection;
      if (!connection) throw new Error("Connection not found");

      const wallet = args?.wallet || get().wallet;

      let stakeAccounts: StakeData[] = [];
      const lstData = await fetchLstData(connection);
      const minimumRentExemption = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE)

      if (wallet?.publicKey) {
        const [_stakeAccounts] = await Promise.all([
          fetchStakeAccounts(connection, wallet.publicKey),
        ]);
        stakeAccounts = _stakeAccounts.filter(
          (stakeAccount) =>
            stakeAccount.isActive && lstData.validatorList.find((v) => v.equals(stakeAccount.validatorVoteAddress))
        );
      }

      set({
        initialized: true,
        feesAndRent: minimumRentExemption + NETWORK_FEE_LAMPORTS,
        isRefreshingStore: false,
        connection,
        wallet,
        lstData,
        stakeAccounts,
      });
    } catch (err) {
      console.error("error refreshing state: ", err);
      set({ isRefreshingStore: false });
    }
  },
  setIsRefreshingStore: (isRefreshingStore: boolean) => set({ isRefreshingStore }),
  setSlippagePct: (slippagePct: SupportedSlippagePercent) => set({ slippagePct }),
  setQuoteResponseMeta: (quoteResponseMeta: QuoteResponseMeta | null) => set({ quoteResponseMeta })
});

async function fetchLstData(connection: Connection): Promise<LstData> {
  const [stakePoolInfo, stakePoolAccount, apyData] = await Promise.all([
    solanaStakePool.stakePoolInfo(connection, STAKE_POOL_ID),
    solanaStakePool.getStakePoolAccount(connection, STAKE_POOL_ID),
    fetch(STAKEVIEW_APP_URL).then((res) => res.json()),
  ]);
  const stakePool = stakePoolAccount.account.data;

  const poolTokenSupply = Number(stakePoolInfo.poolTokenSupply);
  const totalLamports = Number(stakePoolInfo.totalLamports);
  const lastPoolTokenSupply = Number(stakePoolInfo.lastEpochPoolTokenSupply);
  const lastTotalLamports = Number(stakePoolInfo.lastEpochTotalLamports);

  const solDepositFee = stakePoolInfo.solDepositFee.denominator.eqn(0)
    ? 0
    : stakePoolInfo.solDepositFee.numerator.toNumber() / stakePoolInfo.solDepositFee.denominator.toNumber();

  const lstSolValue = poolTokenSupply > 0 ? totalLamports / poolTokenSupply : 1;

  let projectedApy: number;
  if (lastTotalLamports === 0 || lastPoolTokenSupply === 0) {
    projectedApy = 0.08;
  } else {
    const lastLstSolValue = lastPoolTokenSupply > 0 ? lastTotalLamports / lastPoolTokenSupply : 1;
    const epochRate = lstSolValue / lastLstSolValue - 1;
    const apr = epochRate * EPOCHS_PER_YEAR;
    projectedApy = aprToApy(apr, EPOCHS_PER_YEAR);
  }

  if (projectedApy < 0.08) {
    // temporarily use baseline validator APY waiting for a few epochs to pass
    const baselineValidatorData = apyData.validators.find((validator: any) => validator.id === BASELINE_VALIDATOR_ID);
    if (baselineValidatorData) projectedApy = baselineValidatorData.apy;
  }

  return {
    poolAddress: new PublicKey(stakePoolInfo.address),
    tvl: totalLamports / 1e9,
    projectedApy,
    lstSolValue,
    solDepositFee,
    accountData: stakePool,
    validatorList: stakePoolInfo.validatorList.map((v) => new PublicKey(v.voteAccountAddress)),
  };
}

export { createLstStore };
export type { LstState };
