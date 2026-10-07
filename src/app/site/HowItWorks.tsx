"use client";

import { useEffect, useState } from "react";
import { Closing } from "./Closing";
import { FeaturesTable } from "./FeaturesTable";
import { Horizons } from "./Horizons";
import { Method } from "./Method";
import { showSection } from "./nav";
import { PageHeader } from "./PageHeader";
import { Paths } from "./Paths";
import { Portal } from "./Portal";
import { SiteFrame } from "./SiteFrame";
import { Trust } from "./Trust";
import { Why } from "./Why";
import { HOW_IT_WORKS, TABLE } from "./words";

// How it works (Website v4 — Pages, How it works), public at /how-it-works: the page's heading, Why isn't your job
// search working?, the four steps, Two paths: Apply and Outreach, See where else your experience fits, Your whole
// search in one place, It writes boldly, Everything CareerBot does (where Home's feature names land, at #features) and
// the close, whose form is the page's own.
export function HowItWorks() {
  const [joined, setJoined] = useState(false);
  const join = () => setJoined(true);
  useEffect(() => {
    if (location.hash) showSection(location.hash);
  }, []);
  return (
    <SiteFrame form="closing" joined={joined}>
      <PageHeader heading={HOW_IT_WORKS.heading} sub={HOW_IT_WORKS.sub} />
      <Why />
      <Method />
      <Paths />
      <Horizons />
      <Portal />
      <Trust />
      <FeaturesTable groups={TABLE} />
      <Closing own source="how-it-works-closing" doorOnPhone={false} joined={joined} onJoined={join} />
    </SiteFrame>
  );
}
