import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WEBSITE } from "../mode";
import { pageMetadata } from "../site/meta";
import { QuestionsPage } from "../site/QuestionsPage";
import { HEADS } from "../site/words";

export const metadata: Metadata = pageMetadata("/questions", HEADS.questions);

// Public to everyone, signed in or not, outside the app's frame (Shell). Part of careerbot.dev only: not on a
// self-hosted copy or the demo (mode.ts).
export default function QuestionsRoute() {
  if (!WEBSITE) notFound();
  return <QuestionsPage />;
}
