import React from "react";

import Image from "next/image";

import { numeralFormatter, usdFormatter, WSOL_MINT } from "@mrgnlabs/mrgn-common";
import { ExtendedBankInfo } from "@mrgnlabs/marginfi-v2-ui-state";

import { LendingModes } from "~/types";
import { cn } from "~/utils";

type ActionBoxItemProps = {

    bank: ExtendedBankInfo;
    nativeSolBalance: number;
    showBalanceOverride: boolean;
    rate?: string;
    lendingMode?: LendingModes;
};

export const ActionBoxItem = ({ bank, nativeSolBalance, showBalanceOverride, rate, lendingMode }: ActionBoxItemProps) => {
    const balance = React.useMemo(() => {
        const isWSOL = bank.info.state.mint?.equals ? bank.info.state.mint.equals(WSOL_MINT) : false;

        return isWSOL ? bank.userInfo.tokenAccount.balance + nativeSolBalance : bank.userInfo.tokenAccount.balance;
    }, [bank, nativeSolBalance]);

    const balancePrice = React.useMemo(
        () =>
            balance * bank.info.state.price > 0.01
                ? usdFormatter.format(balance * bank.info.state.price)
                : `$${(balance * bank.info.state.price).toExponential(2)}`,
        [bank, balance]
    );

    return (
        <>
            <div className="flex items-center gap-3">
                {bank.meta.tokenLogoUri && (
                    <Image
                        src={bank.meta.tokenLogoUri}
                        alt={bank.meta.tokenName}
                        width={28}
                        height={28}
                        className="rounded-full"
                    />
                )}
                <div>
                    <p>{bank.meta.tokenSymbol}</p>
                    {lendingMode && <p
                        className={cn(
                            "text-xs font-normal",
                            lendingMode === LendingModes.LEND && "text-success",
                            lendingMode === LendingModes.BORROW && "text-warning"
                        )}
                    >
                        {rate}
                    </p>}
                </div>
            </div>

            {((lendingMode && lendingMode === LendingModes.BORROW && balance > 0) || showBalanceOverride) && (
                <div className="space-y-0.5 text-right font-normal text-sm">
                    <p>{balance > 0.01 ? numeralFormatter(balance) : "< 0.01"}</p>
                    <p className="text-xs text-muted-foreground">{balancePrice}</p>
                </div>
            )}
        </>
    );
};
