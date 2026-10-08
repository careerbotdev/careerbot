"use client";

import { useEffect, useState } from "react";
import { Cards } from "./Cards";
import { Closing } from "./Closing";
import { CtaBand } from "./CtaBand";
import { MOVED } from "./nav";
import { Pains } from "./Pains";
import { Questions } from "./Questions";
import { SiteFrame } from "./SiteFrame";
import { SiteHero } from "./SiteHero";
import { Start } from "./Start";
import { Steps } from "./Steps";
import { goToWaitlist, WAITLIST_ID } from "./Waitlist";
import { CTA_BAND, HOME_QUESTIONS } from "./words";

// Home, the public website at careerbot.dev for signed-out visitors (Website v4 — Pages, Home), led by the reader's
// pain: the hero, Where job searches go wrong, a call to action, Where it starts (your resume or your career), How
// CareerBot fixes it, the two cards (Open source, and It writes boldly), a few questions and the close. Joining on any
// form shows it's done on all of them. Arriving at /#waitlist (the sign-in page's Get notified, the privacy page's)
// puts the cursor in the hero's form; an address from before the site was split into pages (/#features, /#open-source,
// /#questions) opens the page it moved to.

export function Website() {
  const [joined, setJoined] = useState(false);
  const join = () => setJoined(true);
  useEffect(() => {
    const moved = MOVED[location.hash];
    if (moved) location.replace(moved);
    else if (location.hash === `#${WAITLIST_ID}`) goToWaitlist();
  }, []);
  return (
    <SiteFrame form="hero" joined={joined}>
      <SiteHero joined={joined} onJoined={join} />
      <Pains />
      <CtaBand {...CTA_BAND} source="band-pains" joined={joined} onJoined={join} />
      <Start />
      <Steps />
      <Cards />
      <Questions items={HOME_QUESTIONS} />
      <Closing source="closing" doorOnPhone={false} joined={joined} onJoined={join} />
    </SiteFrame>
  );
}
