"use client";

import type { ReactNode } from "react";
import { Analytics } from "./Analytics";
import { SiteFooter } from "./SiteFooter";
import { type SiteForm, SiteHeader } from "./SiteHeader";

// The public pages' frame: the sticky header, the page, and the footer, and the public pages' analytics (Analytics).
// `form`: where the page's waitlist form is (SiteHeader). `joined`: the waitlist has been joined on this page, so the
// header stops offering Get notified.
export function SiteFrame({ form, joined = false, children }: { form?: SiteForm; joined?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-surface text-text">
      <SiteHeader form={form} joined={joined} />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      <Analytics />
    </div>
  );
}
