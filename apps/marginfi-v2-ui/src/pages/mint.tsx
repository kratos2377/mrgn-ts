import React from "react";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { IconYBX, IconLST, IconCheck, IconExternalLink } from "~/components/ui/icons";
import { Input } from "~/components/ui/input";

const integrations = [
  {
    title: "SOL-YBX",
    icon: IconYBX,
    altIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    info: {
      liquidity: "$456,435",
      apy: "4%",
    },
    link: "https://raydium.io/",
    action: "Deposit",
    platform: "Raydium",
  },
  {
    title: "SOL-YBX",
    icon: IconYBX,
    altIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    info: {
      liquidity: "$456,435",
      apy: "4%",
    },
    link: "https://raydium.io/",
    action: "Deposit",
    platform: "Raydium",
  },
  {
    title: "SOL-LST",
    icon: IconLST,
    altIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    info: {
      liquidity: "$456,435",
      apy: "4%",
    },
    link: "https://raydium.io/",
    action: "Deposit",
    platform: "Raydium",
  },
  {
    title: "SOL-LST",
    icon: IconLST,
    altIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    info: {
      liquidity: "$456,435",
      apy: "4%",
    },
    link: "https://raydium.io/",
    action: "Deposit",
    platform: "Raydium",
  },
];

enum MintPageState {
  DEFAULT = "default",
  ERROR = "error",
  SUCCESS = "success",
}

export default function MintPage() {
  const [mintPageState, setMintPageState] = React.useState<MintPageState>(MintPageState.DEFAULT);
  const [ybxDialogOpen, setYBXDialogOpen] = React.useState(false);

  const cards = React.useMemo(
    () => [
      {
        title: "YBX",
        icon: IconYBX,
        description: "Solana's decentralised stablecoin, backed by LSTs",
        price: "1 YBX = 1 USD",
        features: ["Earn compounded staking yield 8%", "Earn MEV rewards 1.1%", "Earn lending yield 5%"],
        footer: "...just by minting YBX",
        action: () => {
          setYBXDialogOpen(true);
        },
      },
      {
        title: "LST",
        icon: IconLST,
        description: "Solana's highest yielding LST, secured by mrgn validators",
        price: "1 LST = 1.268 SOL",
        features: ["Pay 0% commission", "Earn MEV from Jito", "Access $3 million in liquidity"],
        footer: "...just by minting LST",
      },
    ],
    []
  );

  const signUp = React.useCallback(() => {
    console.log("sign up");
  }, []);

  return (
    <>
      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 space-y-20 pt-20 pb-28">
        <div className="w-full max-w-3xl mx-auto space-y-20">
          <h1 className="text-3xl font-medium text-center leading-normal">
            Crypto&apos;s highest yielding, decentralised stablecoin Backed by Solana&apos;s MEV-boosted, highest
            yielding LST
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-11">
            {cards.map((item) => (
              <Card variant="secondary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-3xl">
                    <item.icon />
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{item.description}</p>

                  <p className="text-lg font-semibold my-6">{item.price}</p>

                  <ul className="space-y-2.5 mb-4">
                    {item.features.map((feature) => (
                      <li className="flex items-center gap-1">
                        <IconCheck className="text-success" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <p className="text-right text-sm">{item.footer}</p>

                  <Button
                    variant="secondary"
                    size="lg"
                    className="mt-4"
                    onClick={() => {
                      if (item.action) {
                        item.action();
                      }
                    }}
                  >
                    Mint {item.title}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="w-full bg-background p-10 xl:px-16 text-center rounded-xl border border-border">
          <h2 className="text-3xl font-medium mb-6">Integrations</h2>
          <p>40+ dAPPs where you can use YBX and LST</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mt-10">
            {integrations.map((item, i) => (
              <Card key={i} variant="gradient">
                <CardHeader>
                  <CardTitle className="flex items-center justify-center text-xl">
                    <div className="flex items-center">
                      <img src={item.altIcon} className="w-8 h-8 rounded-full" />
                      <item.icon className="-translate-x-3.5" size={32} />
                    </div>
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {Object.entries(item.info).map(([key, value], j) => (
                      <li className="flex items-center justify-between gap-1" key={j}>
                        <span className="text-muted-foreground">
                          {key.substring(0, 1).toUpperCase() + key.substring(1)}
                        </span>{" "}
                        {value}
                      </li>
                    ))}
                  </ul>

                  <Link href={item.link} target="_blank" rel="noreferrer" className="w-full">
                    <Button variant="default" size="lg" className="mt-4 w-full">
                      {item.action} <IconExternalLink size={20} />
                    </Button>
                  </Link>

                  <p className="text-muted-foreground text-sm mt-4">{item.platform}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <Dialog open={ybxDialogOpen} onOpenChange={(open) => setYBXDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Get Notified</DialogTitle>
            <DialogDescription>Sign up to stay up to date with YBX</DialogDescription>
          </DialogHeader>
          <form
            className="w-full px-8"
            onSubmit={(e) => {
              e.preventDefault();
              signUp();
            }}
          >
            <div className="flex items-center w-full gap-2">
              <Input type="email" placeholder="Email" className="w-full" required />
              <Button type="submit">Sign Up</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
