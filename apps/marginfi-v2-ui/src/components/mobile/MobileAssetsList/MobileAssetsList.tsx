import React, { FC, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Skeleton, Typography } from "@mui/material";
import { useMrgnlendStore } from "~/store";
import { useWalletContext } from "~/hooks/useWalletContext";
import { MrgnContainedSwitch, MrgnSwitch, MrgnTooltip } from "~/components/common";

import { AssetCard } from "./AssetCard";

export const MobileAssetsList: FC = () => {
  const [isFiltered, setIsFiltered] = useState(false);
  const togglePositions = () => setIsFiltered((previousState) => !previousState);

  const { connected } = useWalletContext();
  const [isStoreInitialized, sortedBanks, nativeSolBalance, selectedAccount] = useMrgnlendStore((state) => [
    state.initialized,
    state.extendedBankInfos,
    state.nativeSolBalance,
    state.selectedAccount,
  ]);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [isInLendingMode, setIsInLendingMode] = useState(true);

  const globalBanks = useMemo(
    () =>
      sortedBanks &&
      sortedBanks.filter((b) => !b.info.state.isIsolated).filter((b) => (isFiltered ? b.isActive : true)),
    [sortedBanks, isFiltered]
  );

  const isolatedBanks = useMemo(
    () =>
      sortedBanks && sortedBanks.filter((b) => b.info.state.isIsolated).filter((b) => (isFiltered ? b.isActive : true)),
    [sortedBanks, isFiltered]
  );

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="flex w-[150px] h-[42px]">
          <MrgnSwitch
            labelLeft="Lend"
            labelRight="Borrow"
            checked={!isInLendingMode}
            onClick={() => setIsInLendingMode(!isInLendingMode)}
          />
        </div>
        <div className="flex items-center gap-1">
          <MrgnContainedSwitch
            checked={isFiltered}
            onChange={togglePositions}
            inputProps={{ "aria-label": "controlled" }}
          />
          <div>My positions</div>
        </div>
      </div>
      <div className="w-full">
        <div className="font-aeonik font-normal flex items-center text-2xl text-white pt-2 pb-5">Global pool</div>
        <div className="flex flew-row flex-wrap gap-6">
          {isStoreInitialized ? (
            globalBanks.length > 0 ? (
              globalBanks.map((bank, i) => (
                <AssetCard
                  key={bank.meta.tokenSymbol}
                  nativeSolBalance={nativeSolBalance}
                  bank={bank}
                  isInLendingMode={isInLendingMode}
                  isConnected={connected}
                  marginfiAccount={selectedAccount}
                  inputRefs={inputRefs}
                />
              ))
            ) : (
              <Typography color="#868E95" className="font-aeonik font-[300] text-sm flex gap-1" gutterBottom>
                No {isInLendingMode ? "lending" : "borrowing"} {isFiltered ? "positions" : "pools"} found.
              </Typography>
            )
          ) : (
            <Skeleton sx={{ bgcolor: "grey.900" }} variant="rounded" width={390} height={215} />
          )}
        </div>
      </div>
      <div className="w-full">
        <div className="font-aeonik font-normal flex gap-1 items-center text-2xl text-white pb-2">
          Isolated pool
          <MrgnTooltip
            title={
              <>
                <Typography color="inherit" style={{ fontFamily: "Aeonik Pro" }}>
                  Isolated pools are risky ⚠️
                </Typography>
                Assets in isolated pools cannot be used as collateral. When you borrow an isolated asset, you cannot
                borrow other assets. Isolated pools should be considered particularly risky. As always, remember that
                marginfi is a decentralized protocol and all deposited funds are at risk.
              </>
            }
            placement="top"
          >
            <Image src="/info_icon.png" alt="info" height={16} width={16} />
          </MrgnTooltip>
        </div>
        <div className="flex flew-row flex-wrap gap-4">
          {isStoreInitialized ? (
            isolatedBanks.length > 0 ? (
              isolatedBanks.map((bank, i) => (
                <AssetCard
                  key={bank.meta.tokenSymbol}
                  nativeSolBalance={nativeSolBalance}
                  bank={bank}
                  isInLendingMode={isInLendingMode}
                  isConnected={connected}
                  marginfiAccount={selectedAccount}
                  inputRefs={inputRefs}
                />
              ))
            ) : (
              <Typography color="#868E95" className="font-aeonik font-[300] text-sm flex gap-1" gutterBottom>
                No {isInLendingMode ? "lending" : "borrowing"} {isFiltered ? "positions" : "pools"} found.
              </Typography>
            )
          ) : (
            <Skeleton sx={{ bgcolor: "grey.900" }} variant="rounded" width={390} height={215} />
          )}
        </div>
      </div>
    </>
  );
};