"use client";

import type { ReactNode } from "react";
import { Icons } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { SELF_HOSTED, WEBSITE } from "../mode";
import { FOOTER, PAGES, SIGN_IN_LINK } from "./words";

// The public pages' footer (the Website v4 — Pages boards in Paper), and the docs': the wordmark, a line on what
// CareerBot is for and, on careerbot.dev only, CareerBot elsewhere (GitHub, X and LinkedIn, as their marks), the links
// in two groups (Product: the pages, Home first, then Docs, Changelog and Source on GitHub; Account: Sign in, or the
// demo's Open the demo), then under a hairline the licence and Privacy (none on a self-hosted copy, which has only the
// docs; the demo's goes to careerbot.dev's). From medium up the groups sit beside the line and Privacy at the end of the
// licence's row; on a phone the groups are two columns of 44px rows, the marks are 44px targets, and Privacy sits above
// the licence. The pages and Privacy are plain links: each loads the whole page (nav.ts).

const link = "tap text-site-item-sm leading-site-item-sm text-muted transition-colors duration-100 hover:text-text";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 md:gap-4">
      <h2 className="text-body-sm leading-body-sm font-semibold text-text">{title}</h2>
      <ul className="flex flex-col md:gap-3">{children}</ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="w-full shrink-0 border-t border-border px-5 pt-10 pb-8 md:px-10 md:pt-16 md:pb-10 lg:px-16">
      <div className="mx-auto flex w-full max-w-300 flex-col gap-8 md:gap-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between md:gap-12">
          <div className="flex min-w-0 flex-col gap-3 md:max-w-150 md:gap-4">
            <span className="inline-flex md:hidden">
              <Logo height={21} />
            </span>
            <span className="hidden md:inline-flex">
              <Logo height={24} />
            </span>
            <p className="text-site-body-sm leading-site-body-sm text-muted">{FOOTER.description}</p>
            {WEBSITE && (
              <ul className="-ml-3 flex items-center md:ml-0 md:gap-5 md:pt-1">
                {FOOTER.elsewhere.map(({ label, href, icon }) => {
                  const Mark = Icons[icon];
                  return (
                    <li key={href} className="flex">
                      <a
                        href={href}
                        aria-label={label}
                        className="flex size-11 items-center justify-center rounded-sm text-muted transition-colors duration-100 hover:text-text md:size-auto"
                      >
                        <Mark size={20} aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-4 md:flex md:shrink-0 md:gap-24">
            <Group title={FOOTER.product}>
              {[...PAGES, FOOTER.changelog, FOOTER.source].map((p) => (
                <li key={p.href} className="flex h-11 items-center md:h-auto">
                  <a href={p.href} className={link}>
                    {p.label}
                  </a>
                </li>
              ))}
            </Group>
            <Group title={FOOTER.account}>
              <li className="flex h-11 items-center md:h-auto">
                <a href={SIGN_IN_LINK.href} className={link}>
                  {SIGN_IN_LINK.label}
                </a>
              </li>
            </Group>
          </nav>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 md:flex-row md:items-center md:justify-between md:gap-6">
          <p className="text-body-sm leading-body-sm text-muted">{FOOTER.licence}</p>
          {!SELF_HOSTED && (
            <a
              href={FOOTER.privacy.href}
              className="tap flex h-11 items-center self-start text-site-item-sm leading-site-item-sm text-muted transition-colors duration-100 hover:text-text md:h-auto md:self-auto md:text-body-sm md:leading-body-sm md:font-medium"
            >
              {FOOTER.privacy.label}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
