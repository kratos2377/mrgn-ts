import React from "react";

import { cn } from "~/utils";
import { useConvertkit } from "~/hooks/useConvertkit";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
import { WalletTokens } from "~/components/common/Wallet/WalletTokens";
import { Label } from "~/components/ui/label";
import { IconCheck, IconInfoCircle, IconLoader, IconAlertTriangle } from "~/components/ui/icons";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";

enum WalletSettingsState {
  DEFAULT = "default",
  UPDATING = "updating",
  SUCCESS = "success",
}

export const WalletSettings = ({ tokens }: { tokens: any[] }) => {
  const { addSubscriber } = useConvertkit();
  const [walletSettingsState, setWalletSettingsState] = React.useState<WalletSettingsState>(
    WalletSettingsState.DEFAULT
  );
  const [email, setEmail] = React.useState<string | null>(null);
  const [notificationSettings, setNotificationSettings] = React.useState({
    health: false,
    ybx: false,
    updates: false,
  });
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const notificationFormDisabled = React.useMemo(() => {
    return (
      walletSettingsState === WalletSettingsState.UPDATING ||
      !email ||
      (!notificationSettings.health && !notificationSettings.updates && !notificationSettings.ybx)
    );
  }, [walletSettingsState, email, notificationSettings]);

  const updateNotificationSettings = React.useCallback(async () => {
    if (!email || (!notificationSettings.health && !notificationSettings.updates && !notificationSettings.ybx)) {
      return;
    }

    setWalletSettingsState(WalletSettingsState.UPDATING);

    if (notificationSettings.ybx) {
      const res = await addSubscriber(process.env.NEXT_PUBLIC_CONVERT_KIT_YBX_FORM_UID!, email);
      console.log(res);

      if (res.error) {
        setErrorMsg(res.error);
        setWalletSettingsState(WalletSettingsState.DEFAULT);
        return;
      }
    }

    if (notificationSettings.updates) {
      const res = await addSubscriber(process.env.NEXT_PUBLIC_CONVERT_KIT_UPDATES_FORM_UID!, email);
      console.log(res);

      if (res.error) {
        setErrorMsg(res.error);
        setWalletSettingsState(WalletSettingsState.DEFAULT);
        return;
      }
    }

    if (notificationSettings.health) {
      console.log("Add to Firebase");
    }

    setErrorMsg(null);
    setWalletSettingsState(WalletSettingsState.SUCCESS);

    setTimeout(() => {
      setWalletSettingsState(WalletSettingsState.DEFAULT);
    }, 2000);
  }, [email, notificationSettings]);
  email;
  return (
    <Accordion type="single" collapsible className="w-full mt-8 space-y-4">
      <AccordionItem value="assets">
        <AccordionTrigger className="bg-background-gray px-4 rounded-lg transition-colors hover:bg-background-gray-hover data-[state=open]:rounded-b-none data-[state=open]:bg-background-gray">
          Assets
        </AccordionTrigger>
        <AccordionContent className="bg-background-gray p-4 pt-0 rounded-b-lg">
          <WalletTokens tokens={tokens} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="notifications">
        <AccordionTrigger className="bg-background-gray px-4 rounded-lg transition-colors hover:bg-background-gray-hover data-[state=open]:rounded-b-none data-[state=open]:bg-background-gray">
          Notifications
        </AccordionTrigger>
        <AccordionContent className="bg-background-gray p-4 pt-0 rounded-b-lg">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              updateNotificationSettings();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1.5 text-muted-foreground">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1.5">
                      <IconInfoCircle size={16} /> Configure email notifications
                    </TooltipTrigger>
                    <TooltipContent>Click to copy</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@example.com"
                value={email || ""}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            </div>

            <ul className="space-y-3">
              <li className="flex items-center gap-1.5">
                <Checkbox
                  checked={notificationSettings.health}
                  id="health"
                  className={cn(
                    !notificationSettings.health && "border-muted-foreground transition-colors hover:border-primary"
                  )}
                  onCheckedChange={(checked) =>
                    setNotificationSettings({ ...notificationSettings, health: checked as boolean })
                  }
                />{" "}
                <Label
                  htmlFor="health"
                  className={cn(
                    "text-primary",
                    !notificationSettings.health && "text-muted-foreground transition-colors hover:text-primary"
                  )}
                >
                  Account heath / liquidation risk
                </Label>
              </li>
              <li className="flex items-center gap-1.5">
                <Checkbox
                  checked={notificationSettings.ybx}
                  id="ybx"
                  className={cn(
                    !notificationSettings.ybx && "border-muted-foreground transition-colors hover:border-primary"
                  )}
                  onCheckedChange={(checked) =>
                    setNotificationSettings({ ...notificationSettings, ybx: checked as boolean })
                  }
                />{" "}
                <Label
                  htmlFor="ybx"
                  className={cn(
                    "text-primary",
                    !notificationSettings.ybx && "text-muted-foreground transition-colors hover:text-primary"
                  )}
                >
                  YBX launch notifications
                </Label>
              </li>
              <li className="flex items-center gap-1.5">
                <Checkbox
                  checked={notificationSettings.updates}
                  id="updates"
                  className={cn(
                    "border-primary",
                    !notificationSettings.updates && "border-muted-foreground transition-colors hover:border-primary"
                  )}
                  onCheckedChange={(checked) =>
                    setNotificationSettings({ ...notificationSettings, updates: checked as boolean })
                  }
                />{" "}
                <Label
                  htmlFor="updates"
                  className={cn(
                    "text-primary",
                    !notificationSettings.updates && "text-muted-foreground transition-colors hover:text-primary"
                  )}
                >
                  Future updates &amp; announcements
                </Label>
              </li>
            </ul>

            {errorMsg && (
              <div className="flex items-start gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg my-4">
                <IconAlertTriangle size={18} className="translate-y-0.5" />
                {errorMsg}
              </div>
            )}

            <Button disabled={notificationFormDisabled} type="submit">
              {walletSettingsState === WalletSettingsState.DEFAULT && "Update notifications"}
              {walletSettingsState === WalletSettingsState.UPDATING && (
                <>
                  <IconLoader size={18} /> Updating...
                </>
              )}
              {walletSettingsState === WalletSettingsState.SUCCESS && (
                <>
                  <IconCheck size={18} /> Updated!
                </>
              )}
            </Button>
          </form>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
