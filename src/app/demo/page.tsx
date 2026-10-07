import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEMO } from "../mode";
import { OnToToday } from "../shell/OnToToday";
import { pageMetadata } from "../site/meta";
import { DEMO_ENTRY } from "../site/words";

export const metadata: Metadata = pageMetadata("/demo", { title: DEMO_ENTRY.heading, description: DEMO_ENTRY.body });

// The demo's way in, where careerbot.dev's Open the demo leads (site/words.ts, DEMO_URL). On the demo's build
// (mode.ts), signed out, the frame (Shell) shows the demo's entry here as it does at any address (SignIn, DemoEntry);
// once signed in, by Open the demo or before, this goes on to Today. careerbot.dev's build never gets here: its
// next.config.ts sends /demo to the demo's own address first. A self-hosted copy has no demo.
export default function DemoPage() {
  if (!DEMO) notFound();
  return <OnToToday />;
}
