import { FC, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUserProfileStore } from "~/store";
import { useRouter } from "next/router";
import { useFirebaseAccount } from "~/hooks/useFirebaseAccount";
import { useWalletContext } from "~/hooks/useWalletContext";

// @todo implement second pretty navbar row
const MobileNavbar: FC = () => {
  useFirebaseAccount();

  const { walletAddress } = useWalletContext();
  const router = useRouter();
  const [fetchPoints] = useUserProfileStore((state) => [state.fetchPoints]);

  useEffect(() => {
    if (!walletAddress) return;
    fetchPoints(walletAddress.toBase58()).catch(console.error);
  }, [fetchPoints, walletAddress]);

  return (
    <header>
      <nav className="fixed w-full bottom-0 h-[64px] z-20 bg-[#0F1111]">
        <div className="h-full w-full border-t-2 border-[#1C2125] border-solid text-sm font-[500] text-[#868E95] z-10 px-4 flex justify-around items-center z-10 gap-4 lg:gap-8">
          <Link
            href={"/"}
            className={`${router.pathname === "/" ? "hover-underline-static" : "hover-underline-animation"} block`}
          >
            <Image className="m-auto" src="/receive_money.svg" alt="wallet icon" width={18.9} height={18.9} />
            lend
          </Link>

          <Link
            href={"/swap"}
            className={`${router.pathname === "/swap" ? "hover-underline-static" : "hover-underline-animation"}`}
          >
            <Image className="m-auto" src="/token_swap.svg" alt="wallet icon" width={18.9} height={18.9} />
            swap
          </Link>
          <Link
            href={"/portfolio"}
            className={`${router.pathname === "/portfolio" ? "hover-underline-static" : "hover-underline-animation"}`}
          >
            <Image className="m-auto" src="/pie_chart.svg" alt="wallet icon" width={18.9} height={18.9} />
            portfolio
          </Link>
        </div>
      </nav>
    </header>
  );
};

export { MobileNavbar };
