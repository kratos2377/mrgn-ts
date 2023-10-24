import { shortenAddress } from "@mrgnlabs/mrgn-common";
import { FaWallet } from "react-icons/fa";
import { useWalletContext } from "~/hooks/useWalletContext";
import { Button } from "~/components/ui/button";

type AuthDialogButtonProps = {
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

export const AuthDialogTriggerButton = ({ connected, onConnect, onDisconnect }: AuthDialogButtonProps) => {
  const { wallet } = useWalletContext();
  return (
    <>
      {!connected ? (
        <Button onClick={() => onConnect()}>
          <FaWallet /> Connect
        </Button>
      ) : (
        <Button onClick={() => onDisconnect()}>
          <>{wallet?.publicKey && shortenAddress(wallet.publicKey.toString())}</>
        </Button>
      )}
    </>
  );
};