import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WEBSITE } from "../mode";
import { pageMetadata } from "../site/meta";
import { OpenSourcePage } from "../site/OpenSourcePage";
import { HEADS } from "../site/words";

export const metadata: Metadata = pageMetadata("/open-source", HEADS.openSource);

// Public to everyone, signed in or not, outside the app's frame (Shell). Part of careerbot.dev only: not on a
// self-hosted copy or the demo (mode.ts).
export default function OpenSourceRoute() {
  if (!WEBSITE) notFound();
  return <OpenSourcePage />;
}
