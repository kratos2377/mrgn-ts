import Link from "next/link";
import React from "react";

interface PageHeadingProps {
  heading: JSX.Element;
  body?: JSX.Element;
  links: {
    href: string;
    icon: JSX.Element;
  }[];
}

export const PageHeading = ({ heading, body, links }: PageHeadingProps) => {
  return (
    <div className="text-muted-foreground text-xl text-center mb-12 space-y-4">
      <h1 className="text-4xl font-medium text-primary">{heading}</h1>
      <div className="max-w-2xl w-full mx-auto">{body}</div>

      {links.length > 0 && (
        <ul className="flex items-center gap-4 justify-center pt-2">
          {links.map((link, idx) => (
            <li key={idx}>
              <Link
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-chartreuse"
              >
                {link.icon}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
