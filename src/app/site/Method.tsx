"use client";

import type { ReactNode } from "react";
import { Answers } from "./Answers";
import { ApplyMockup } from "./mockups/Apply";
import { PeopleMockup } from "./mockups/People";
import { RolesMockup } from "./mockups/Roles";
import { StoryMockup } from "./mockups/Story";
import { Section } from "./Section";
import { METHOD } from "./words";

// Four steps, from your work history to the people who hire (the Website v4 — Pages boards, How it works): the heading,
// then the four steps, each its mock-up beside its number, title, what it does and the pain it answers. On a large
// screen the mock-ups alternate sides; narrower, each mock-up comes first and its words follow.

const DRAWINGS: ReactNode[] = [<StoryMockup key="story" />, <RolesMockup key="roles" />, <ApplyMockup key="apply" />, <PeopleMockup key="people" />];

export function Method() {
  return (
    <Section className="pb-24 md:pb-40" inner="flex flex-col gap-16 md:gap-20 lg:gap-24">
      <h2 className="max-w-275 text-site-display-sm leading-site-display-sm tracking-site-display-sm font-semibold lg:text-site-display lg:leading-site-display lg:tracking-site-display">
        {METHOD.heading}
      </h2>
      {METHOD.steps.map((s, i) => (
        <MethodStep key={s.n} n={s.n} title={s.title} body={s.body} pain={s.pain} side={i % 2 ? "right" : "left"}>
          {DRAWINGS[i]}
        </MethodStep>
      ))}
    </Section>
  );
}

// One step: `side` is where its mock-up sits on a large screen.
export function MethodStep({ n, title, body, pain, side = "left", children }: { n: string; title: string; body: string; pain: string; side?: "left" | "right"; children: ReactNode }) {
  return (
    <div className={`flex flex-col lg:items-center lg:justify-between lg:gap-10 ${side === "right" ? "lg:flex-row-reverse" : "lg:flex-row"}`}>
      <div className="w-full md:max-w-160 lg:min-w-0 lg:flex-1">{children}</div>
      <div className="flex flex-col gap-3.5 pt-7 md:max-w-160 lg:w-120 lg:shrink-0 lg:gap-5 lg:pt-0">
        <p className="font-mono text-site-index leading-site-index tracking-site-index text-muted">{n}</p>
        <h3 className="text-site-step-sm leading-site-step-sm tracking-site-step-sm font-semibold lg:text-site-step lg:leading-site-step lg:tracking-site-step">{title}</h3>
        <p className="text-site-body-lg-sm leading-site-body-lg-sm text-muted lg:text-site-body-lg lg:leading-site-body-lg">{body}</p>
        <div className="pt-1 lg:pt-2">
          <Answers pain={pain} />
        </div>
      </div>
    </div>
  );
}
