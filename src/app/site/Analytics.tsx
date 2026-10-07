"use client";

import { useConvexAuth } from "convex/react";
import Script from "next/script";
import { useSyncExternalStore } from "react";
import { BEACON_SRC, beaconConfig, measuredSite, optedOut } from "./beacon";

// Cloudflare Web Analytics for the public pages (beacon.ts). Nothing outside careerbot.dev's build, so Storybook,
// local and dev render nothing and need no Convex.
export function Analytics() {
  return measuredSite(process.env.SITE_URL) ? <Beacon /> : null;
}

const never = () => () => {};

function Beacon() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  // On the server, counted as opted out: the beacon is only ever added in the browser.
  const optOut = useSyncExternalStore(never, () => optedOut(navigator as Navigator & { globalPrivacyControl?: boolean }), () => true);
  const config = beaconConfig({ site: process.env.SITE_URL, signedOut: !isLoading && !isAuthenticated, optedOut: optOut });
  return config ? <Script src={BEACON_SRC} data-cf-beacon={config} strategy="afterInteractive" /> : null;
}
