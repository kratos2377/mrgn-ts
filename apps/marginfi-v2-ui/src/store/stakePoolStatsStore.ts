import { shortenAddress } from "@mrgnlabs/mrgn-common";
import { create, StateCreator } from "zustand";

export type StakePoolStatsWithMeta = StakePoolStats & StakePoolMeta & { epoch: number };
export type StakePoolsStatsPerEpoch = Map<number, StakePoolStatsWithMeta[] | null>;
export type GeneralStatsPerEpoch = Map<number, EpochStats | null>;

export interface RawStats {
  epoch: number;
  total_sol_supply: number;
  total_native_stake: number;
  total_liquid_stake: number;
  total_undelegated_lamports: number;
  stake_pools: StakePoolStats[];
}

export interface EpochStats {
  epoch: number;
  totalSolSupply: number;
  totalNativeStake: number;
  totalLiquidStake: number;
  totalUndelegatedLamports: number;
}

export interface Manifest {
  latest: number;
  epochs: number[];
}

export interface StakePoolStats {
  address: string;
  manager: number;
  management_fee: number;
  provider: string;
  is_valid: boolean;
  mint: string;
  lst_price: number;
  lst_supply: number;
  staked_validator_count: number;
  undelegated_lamports: number;
  total_lamports_locked: number;
  active_lamports: number;
  activating_lamports: number;
  deactivating_lamports: number;
  inflation_rewards: number;
  jito_rewards: number;
  apr_baseline: number;
  apy_baseline: number;
  apr_effective: number;
  apy_effective: number;
  liquidity_delta: number;
}

export interface StakePoolMeta {
  name: string;
}

export const STAKE_POOLS_METAS: Record<string, StakePoolMeta> = {
  DqhH94PjkZsjAqEze2BEkWhFQJ6EyU6MdtMphMgnXqeK: { name: "mrgn" },
  Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb: { name: "Jito" },
  stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi: { name: "Blaze" },
  CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1: { name: "JPool" },
  CgntPoLka5pD5fesJYhGmUCF8KU1QS1ZmZiuAuMZr2az: { name: "Cogent" },
  "8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC": { name: "Marinade" },
  "5oc4nmbNTda9fx8Tw57ShLD132aqDK65vuHH4RU1K4LZ": { name: "Socean" },
  "2qyEeSAWKfU18AFthrF7JA8z8ZCi1yt76Tqs917vwQTV": { name: "Laine" },
  "7ge2xKsZXmqPxa3YmXxXmzCp9Hc2ezrTxh6PECaxCwrL": { name: "DAOPool" },
};
const STATS_BUCKET_NAME = "mrgn-public";
const STATS_FOLDER = "stake_pool_data";

const MANIFEST_URL = `https://storage.googleapis.com/${STATS_BUCKET_NAME}/${STATS_FOLDER}/manifest.json`;
const STAT_FILE_URL_PREFIX = `https://storage.googleapis.com/${STATS_BUCKET_NAME}/${STATS_FOLDER}/stats_`;
const STAT_FILE_URL_SUFFIX = ".json";

const EPOCH_WINDOW = 10;

interface StakePoolsStatsState {
  // State
  stakePoolsStatsPerEpoch: StakePoolsStatsPerEpoch | null;
  generalStatsPerEpoch: GeneralStatsPerEpoch | null;

  // Actions
  fetchStats: () => void;
}

function createStakePoolsStatsStore() {
  return create<StakePoolsStatsState>(stateCreator);
}

const stateCreator: StateCreator<StakePoolsStatsState, [], []> = (set, get) => ({
  // State
  stakePoolsStatsPerEpoch: null,
  generalStatsPerEpoch: null,

  // Actions
  fetchStats: async () => {
    try {
      const response = await fetch(MANIFEST_URL);
      const manifest = (await response.json()) as Manifest;

      const minEpoch = manifest.latest - EPOCH_WINDOW + 1;
      const epochsInWindow = Array.from({ length: EPOCH_WINDOW }, (_, i) => i + minEpoch);

      const stakePoolStats = await Promise.all(
        manifest.epochs.map(async (epoch) => {
          const response = await fetch(STAT_FILE_URL_PREFIX + epoch + STAT_FILE_URL_SUFFIX);
          const data = (await response.json()) as RawStats;
          return data;
        })
      );

      const stakePoolsStatsPerEpoch: StakePoolsStatsPerEpoch = new Map();
      const generalStatsPerEpoch: GeneralStatsPerEpoch = new Map();
      epochsInWindow.forEach((epoch, index) => {
        const epochStats = stakePoolStats[index];
        const stakePoolsStats = epochStats.stake_pools.map((pool) => {
          const meta = STAKE_POOLS_METAS[pool.address];
          return {
            ...pool,
            name: meta ? meta.name : `Unknown (${shortenAddress(pool.address)})`,
            epoch,
          } as StakePoolStatsWithMeta;
        });
        stakePoolsStatsPerEpoch.set(epoch, stakePoolsStats);
        generalStatsPerEpoch.set(epoch, {
          epoch,
          totalSolSupply: epochStats.total_sol_supply,
          totalNativeStake: epochStats.total_native_stake,
          totalLiquidStake: epochStats.total_liquid_stake,
          totalUndelegatedLamports: epochStats.total_undelegated_lamports,
        });
      });

      for (const epoch of epochsInWindow) {
        if (!stakePoolsStatsPerEpoch.get(epoch)) {
          stakePoolsStatsPerEpoch.set(epoch, null);
          generalStatsPerEpoch.set(epoch, null);
        }
      }

      set({
        stakePoolsStatsPerEpoch,
        generalStatsPerEpoch,
      });
    } catch (e) {
      console.error(e);
    }
  },
});

export { createStakePoolsStatsStore };
export type { StakePoolsStatsState };
