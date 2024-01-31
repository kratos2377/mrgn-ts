import React from "react";
import { MarginRequirementType, MarginfiAccountWrapper } from "@mrgnlabs/marginfi-client-v2";
import { usdFormatterDyn } from "@mrgnlabs/mrgn-common";

import { getMaintHealthColor } from "~/utils";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { IconInfoCircle } from "~/components/ui/icons";
import { Skeleton } from "~/components/ui/skeleton";

import { ActionPreview } from "./LendingPreview";

type ActionBoxAvailableCollateralProps = {
  isLoading: boolean;
  marginfiAccount: MarginfiAccountWrapper;
  preview: ActionPreview | null;
};

export const AvailableCollateral = ({ isLoading, marginfiAccount, preview }: ActionBoxAvailableCollateralProps) => {
  const [availableRatio, setAvailableRatio] = React.useState<number>(0);
  const [availableAmount, setAvailableAmount] = React.useState<number>(0);

  const healthColor = React.useMemo(
    () => getMaintHealthColor(preview?.availableCollateral.ratio ?? availableRatio),
    [availableRatio, preview?.availableCollateral.ratio]
  );

  React.useEffect(() => {
    const currentAvailableCollateralAmount = marginfiAccount.computeFreeCollateral().toNumber();
    const currentAvailableCollateralRatio =
      currentAvailableCollateralAmount /
      marginfiAccount.computeHealthComponents(MarginRequirementType.Initial).assets.toNumber();
    setAvailableAmount(currentAvailableCollateralAmount);
    setAvailableRatio(currentAvailableCollateralRatio);
  }, [marginfiAccount]);

  return (
    <div className="pb-6">
      <dl className="flex justify-between items-center text-muted-foreground  gap-2">
        <dt className="flex items-center gap-1.5 text-sm pb-2">
          Available collateral
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconInfoCircle size={16} />
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-2">
                  <p>Available collateral is the USD value of your collateral not actively backing a loan.</p>
                  <p>It can be used to open additional borrows or withdraw part of your collateral.</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </dt>
        <dd className="text-xl md:text-sm font-medium text-white">
          {isLoading ? (
            <Skeleton className="h-4 w-[45px] bg-[#373F45]" />
          ) : (
            usdFormatterDyn.format(preview?.availableCollateral.amount ?? availableAmount)
          )}
        </dd>
      </dl>
      <div className="h-2 mb-2 bg-background-gray-light">
        <div
          className="h-2"
          style={{
            backgroundColor: `${healthColor}`,
            width: `${(preview?.availableCollateral.ratio ?? availableRatio) * 100}%`,
          }}
        />
      </div>
    </div>
  );
};
