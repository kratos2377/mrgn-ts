import dynamic from "next/dynamic";
import { FC, useEffect } from "react";
import Image from "next/image";
import styles from "./Navbar.module.css";
import { useWallet } from "@solana/wallet-adapter-react";
import { v4 as uuidv4 } from "uuid";
import { getAuth, signOut, signInWithCustomToken } from "firebase/auth";

const WalletMultiButtonDynamic = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const WalletButton: FC = () => {
  const wallet = useWallet();
  const auth = getAuth();

  useEffect(() => {
    if (!wallet.connected) {
      signOut(auth)
        .then(() => {
          console.log("Signed user out.");
        })
        .catch((error) => {
          console.log("Error signing out:", error);
        });
    } else if (wallet && wallet.connected && wallet.publicKey) {
      console.log('authenticating user - client side');

      const uuid = uuidv4();
      const encodedMessage = new TextEncoder().encode(uuid);

      //@ts-ignore
      wallet.signMessage(encodedMessage)
        .then((signature) => {
          const base64Signature = Buffer.from(signature).toString('base64');
          return fetch('/api/authUser', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              publicKey: wallet?.publicKey?.toBase58(),
              signature: base64Signature,
              uuid,
            }),
          });
        })
        .then(response => response.json())
        .then(data => {
          console.log(data);
          // Now that we have the custom token, use it to sign in
          if (data.token) {
            signInWithCustomToken(auth, data.token)
              .then((userCredential) => {
                console.log("Signed in with custom token: ", userCredential);
              })
              .catch((error) => {
                console.error("Error signing in with custom token: ", error);
                if (error.code === 'auth/network-request-failed') {
                  // @todo need to give user better experience here
                  console.log("It appears there was a network error. Please check your internet connection and try again. If the problem persists, please try again later.");
                } else {
                  console.log("An error occurred while signing in. Please try again later.");
                }
              });
          }
        })
        .catch(error => {
          console.error('Error:', error);
          // If the user chose not to sign the message, sign them out
          if (error.message.includes('User denied signing the message.')) {
            signOut(auth)
              .then(() => {
                console.log("Signed user out due to error.");
              })
              .catch((signOutError) => {
                console.log("Error signing out due to error:", signOutError);
              });
          }
        });
    }
  }, [wallet.connected]);

  return (
    <WalletMultiButtonDynamic
      className={`${wallet.connected ? "glow-on-hover" : "glow"} bg-transparent px-0 font-aeonik font-[500]`}
    >
      {!wallet.connected && "CONNECT"}
    </WalletMultiButtonDynamic>
  );
};

export { WalletButton };
