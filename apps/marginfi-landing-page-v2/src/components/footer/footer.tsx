import Link from "next/link";

import { cn } from "~/lib/utils";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
import { IconMrgn } from "~/components/ui/icons";

type NavItems = {
  [key: string]: { label: string; href: string }[];
};

const navItems: NavItems = {
  About: [
    {
      label: "Product",
      href: "#",
    },
    {
      label: "Developers",
      href: "#",
    },
    {
      label: "Ecosystem",
      href: "#",
    },
    {
      label: "Community",
      href: "#",
    },
  ],
  Resources: [
    {
      label: "Documentation",
      href: "#",
    },
    {
      label: "Github",
      href: "#",
    },
    {
      label: "Analytics",
      href: "#",
    },
  ],
  Community: [
    {
      label: "Twitter",
      href: "#",
    },
    {
      label: "Discord",
      href: "#",
    },
    {
      label: "Github",
      href: "#",
    },
  ],
};

export const Footer = () => {
  return (
    <footer
      className={cn(
        "w-full py-10 px-6 flex flex-col justify-between items-center gap-12 border-t border-border",
        "md:gap-16 md:pt-12 md:pb-6",
        "lg:flex-row lg:items-start lg:gap-8 lg:pt-10 lg:pb-6"
      )}
    >
      <div className="flex flex-col gap-4 justify-between h-full">
        <div className="flex flex-col gap-4 items-center lg:items-start">
          <div className="flex items-center gap-4 text-3xl">
            <IconMrgn size={42} />
            marginfi
          </div>
          <small className="block text-xs text-muted-foreground">
            {new Date().getFullYear()} &copy; Margin Labs INC. All rights reserved.
          </small>
        </div>
        <ul className="items-center gap-6 text-xs hidden lg:flex">
          <li>
            <Link href="" className="text-muted-foreground transition-colors hover:text-primary">
              Terms of Service
            </Link>
          </li>
          <li>
            <Link href="" className="text-muted-foreground transition-colors hover:text-primary">
              Privacy Policy
            </Link>
          </li>
        </ul>
      </div>

      <div className="hidden gap-32 text-sm mb-8 md:flex lg:ml-auto">
        {Object.keys(navItems).map((key, index) => (
          <div key={index} className="w-full space-y-4 min-w-fit">
            <h4 className=" text-base">{key}</h4>
            <ul className="space-y-2 w-full">
              {navItems[key].map((item, index) => (
                <li key={index}>
                  <Link href={item.href} className="text-muted-foreground transition-colors hover:text-primary">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="md:hidden w-full">
        {Object.keys(navItems).map((key, index) => (
          <Accordion key={index} type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="hover:no-underline">{key}</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 w-full">
                  {navItems[key].map((item, index) => (
                    <li key={index}>
                      <Link href={item.href} className="text-muted-foreground transition-colors hover:text-primary">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </div>

      <ul className="flex items-center gap-6 text-xs lg:hidden">
        <li>
          <Link href="" className="text-muted-foreground transition-colors hover:text-primary">
            Terms of Service
          </Link>
        </li>
        <li>
          <Link href="" className="text-muted-foreground transition-colors hover:text-primary">
            Privacy Policy
          </Link>
        </li>
      </ul>
    </footer>
  );
};
