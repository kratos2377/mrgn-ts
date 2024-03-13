import React from "react";

import dynamic from "next/dynamic";
import { useRouter } from "next/router";

import { MarginfiAccountWrapper } from "@mrgnlabs/marginfi-client-v2";
import { shortenAddress } from "@mrgnlabs/mrgn-common";
import { ActionType } from "@mrgnlabs/marginfi-v2-ui-state";

import { Desktop, Mobile } from "~/mediaQueries";
import { useMrgnlendStore, useUiStore } from "~/store";
import { useWalletContext } from "~/hooks/useWalletContext";
import { UserMode, LendingModes } from "~/types";

import { Banner } from "~/components/desktop/Banner";
import { PageHeader } from "~/components/common/PageHeader";
import { ActionBoxLendWrapper } from "~/components/common/ActionBox";
import { Stats } from "~/components/common/Stats";
import { ActionComplete } from "~/components/common/ActionComplete";
import { Announcements, AnnouncementCustomItem, AnnouncementBankItem } from "~/components/common/Announcements";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "~/components/ui/select";
import { OverlaySpinner } from "~/components/ui/overlay-spinner";
import { IconAlertTriangle, IconBackpackWallet } from "~/components/ui/icons";
import { Loader } from "~/components/ui/loader";

const AssetsList = dynamic(async () => (await import("~/components/desktop/AssetsList")).AssetsList, { ssr: false });

export default function HomePage() {
  const router = useRouter();
  const { walletAddress, isOverride } = useWalletContext();
  const [userMode, previousTxn] = useUiStore((state) => [state.userMode, state.previousTxn]);
  const [
    fetchMrgnlendState,
    isStoreInitialized,
    isRefreshingStore,
    setIsRefreshingStore,
    marginfiAccounts,
    selectedAccount,
    extendedBankInfos,
  ] = useMrgnlendStore((state) => [
    state.fetchMrgnlendState,
    state.initialized,
    state.isRefreshingStore,
    state.setIsRefreshingStore,
    state.marginfiAccounts,
    state.selectedAccount,
    state.extendedBankInfos,
  ]);

  const annoucements = React.useMemo(() => {
    const pyth = extendedBankInfos.find((bank) => bank.meta.tokenSymbol === "PYTH");
    const lst = extendedBankInfos.find((bank) => bank.meta.tokenSymbol === "LST");
    const bonk = extendedBankInfos.find((bank) => bank.meta.tokenSymbol === "Bonk");
    const wif = extendedBankInfos.find((bank) => bank.meta.tokenSymbol === "$WIF");

    return [
      {
        image: <IconBackpackWallet className="w-6 h-6" />,
        text: "5% points boost for Backpack users!",
        onClick: () => router.push("/points"),
      },
      { bank: lst, text: "deposit caps raised!" },
      { bank: pyth, text: "deposit caps raised!" },
      { bank: bonk, text: "borrow caps raised!", lendingMode: LendingModes.BORROW, actionType: ActionType.Borrow },
      { bank: wif, text: "borrow caps raised!", lendingMode: LendingModes.BORROW, actionType: ActionType.Borrow },
    ] as (AnnouncementBankItem | AnnouncementCustomItem)[];
  }, [extendedBankInfos, router]);

  return (
    <>
      <Desktop>
        <PageHeader>lend</PageHeader>
        {!isStoreInitialized && <Loader label="Loading mrgnlend..." className="mt-16" />}
        {isStoreInitialized && (
          <>
            <div className="flex flex-col h-full justify-start content-start pt-[16px] w-full xl:w-4/5 xl:max-w-7xl gap-4">
              {walletAddress && selectedAccount && isOverride && (
                <Banner
                  text={`Read-only view of ${selectedAccount.address.toBase58()} (owner: ${shortenAddress(
                    walletAddress
                  )}) - All actions are simulated`}
                  backgroundColor="#DCE85D"
                />
              )}
              {walletAddress && selectedAccount && marginfiAccounts.length > 1 && (
                <MultipleAccountsBanner
                  selectedAccount={selectedAccount}
                  marginfiAccounts={marginfiAccounts}
                  fetchMrgnlendState={fetchMrgnlendState}
                  isRefreshing={isRefreshingStore}
                  setIsRefreshing={setIsRefreshingStore}
                />
              )}
              <Stats />
              <Announcements items={annoucements} />
              {userMode === UserMode.LITE && <ActionBoxLendWrapper />}
            </div>
            <div className="pt-[16px] pb-[64px] px-4 w-full xl:w-4/5 xl:max-w-7xl mt-8 gap-4">
              <AssetsList />
            </div>
          </>
        )}
        <OverlaySpinner fetching={!isStoreInitialized || isRefreshingStore} />
      </Desktop>

      <Mobile>
        <PageHeader>lend</PageHeader>
        {!isStoreInitialized && <Loader label="Loading mrgnlend..." className="mt-16" />}
        {isStoreInitialized && (
          <>
            {walletAddress && selectedAccount && marginfiAccounts.length > 1 && (
              <MultipleAccountsBanner
                selectedAccount={selectedAccount}
                marginfiAccounts={marginfiAccounts}
                fetchMrgnlendState={fetchMrgnlendState}
                isRefreshing={isRefreshingStore}
                setIsRefreshing={setIsRefreshingStore}
              />
            )}
            <Stats />
            <Announcements items={annoucements} />
            <ActionBoxLendWrapper />
          </>
        )}
      </Mobile>
      {isStoreInitialized && previousTxn && <ActionComplete />}
    </>
  );
}

const MultipleAccountsBanner = ({
  selectedAccount,
  marginfiAccounts,
  fetchMrgnlendState,
  isRefreshing,
  setIsRefreshing,
}: {
  selectedAccount: MarginfiAccountWrapper;
  marginfiAccounts: MarginfiAccountWrapper[];
  fetchMrgnlendState: any;
  isRefreshing: boolean;
  setIsRefreshing: (isRefreshingStore: boolean) => void;
}) => {
  const shortAddress = React.useMemo(
    () => shortenAddress(selectedAccount.address.toBase58()),
    [selectedAccount.address]
  );

  return (
    <div className="bg-muted text-white/80 py-4 px-5 rounded-sm w-full flex">
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex gap-2 items-center">
          <IconAlertTriangle className="text-[#FF0]/80" size={16} />
          <h2 className="font-medium">
            Multiple accounts found <span className="font-light text-sm ml-1">(support coming soon)</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-normal">Select account:</p>
          <Select
            value={selectedAccount.address.toBase58()}
            disabled={isRefreshing}
            onValueChange={(value) => {
              setIsRefreshing(true);
              localStorage.setItem("mfiAccount", value);
              fetchMrgnlendState();
            }}
          >
            <SelectTrigger className="w-[180px]">{isRefreshing ? "Loading..." : shortAddress}</SelectTrigger>
            <SelectContent className="w-full">
              <SelectGroup>
                <SelectLabel>Accounts</SelectLabel>
                {marginfiAccounts.map((account, index) => (
                  <SelectItem key={index} value={account.address.toBase58()} className="!text-xs">
                    {account.address.toBase58()}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
