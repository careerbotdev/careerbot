"use client";

import { useState } from "react";
import { Closing } from "./Closing";
import { Questions } from "./Questions";
import { SiteFrame } from "./SiteFrame";
import { DEMO_QUESTION, DEMO_URL, FAQ } from "./words";

// Questions (Website v4 — Pages, Questions), public at /questions: every question with its answer, and the close,
// whose form is the page's own. `demo`: the demo's way in (DEMO_URL, set once it's live); with it, Can I try it first?
// comes before the last question, with Open the demo under its answer.
export function QuestionsPage({ demo = DEMO_URL }: { demo?: string }) {
  const [joined, setJoined] = useState(false);
  const items = demo ? [...FAQ.slice(0, -1), { q: DEMO_QUESTION.q, a: DEMO_QUESTION.a, link: { label: DEMO_QUESTION.link, href: demo } }, ...FAQ.slice(-1)] : FAQ;
  return (
    <SiteFrame form="closing" joined={joined}>
      <Questions page items={items} />
      <Closing own source="questions-closing" joined={joined} onJoined={() => setJoined(true)} />
    </SiteFrame>
  );
}
