"use client";

import { useState } from "react";
import { Closing } from "./Closing";
import { Compare } from "./Compare";
import { Licence } from "./Licence";
import { Needs } from "./Needs";
import { PageHeader } from "./PageHeader";
import { SiteFrame } from "./SiteFrame";
import { OPEN_SOURCE } from "./words";

// Open source (Website v4 — Pages, Open source), public at /open-source: the page's heading, the licence and the way to
// the source, what you need to run it, how it differs from the hosted version, and the close (Hear when the hosted
// version opens.), whose form is the page's own.
export function OpenSourcePage() {
  const [joined, setJoined] = useState(false);
  return (
    <SiteFrame form="closing" joined={joined}>
      <PageHeader heading={OPEN_SOURCE.heading} sub={OPEN_SOURCE.sub} />
      <Licence />
      <Needs />
      <Compare />
      <Closing
        own
        source="open-source-closing"
        heading={OPEN_SOURCE.closing.heading}
        cta={OPEN_SOURCE.closing.cta}
        joined={joined}
        onJoined={() => setJoined(true)}
      />
    </SiteFrame>
  );
}
