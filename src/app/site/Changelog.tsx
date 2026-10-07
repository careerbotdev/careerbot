"use client";

import { Markdown } from "../changelog/Markdown";
import { type Release, releaseAnchor, releaseDate } from "../changelog/releases";
import { Shot } from "../docs/parts";
import { PageHeader } from "./PageHeader";
import { Section } from "./Section";
import { SiteFrame } from "./SiteFrame";
import { CHANGELOG } from "./words";

// The changelog (the Releases boards in Paper), public at /changelog on careerbot.dev, the demo and every self-hosted
// copy, each with the releases up to its own: the heading and the RSS feed, then each release newest first, at its own
// address (#v0.7.0). A release is its version and date (with Read before updating when a self-hoster has steps to do)
// beside its two sentences, its screenshots, what's new, better and fixed, and If you host your own copy. On medium
// screens and phones the notes go under the version.

const listText = "text-site-body leading-site-body lg:text-site-body-lg-sm lg:leading-site-body-lg-sm";

function Group({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2.5 lg:gap-3">
      <h3 className="text-site-item leading-site-item font-semibold">{title}</h3>
      <ul className={`flex list-disc flex-col gap-1.5 pl-5 marker:text-muted lg:gap-2 ${listText}`}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ReadFirst({ solid = false }: { solid?: boolean }) {
  return solid ? (
    <span className="flex h-6 w-fit shrink-0 items-center rounded-site-pill bg-caution px-2.5 text-site-tag leading-site-tag font-medium text-paper">{CHANGELOG.readFirst}</span>
  ) : (
    <span className="flex h-7 w-fit shrink-0 items-center rounded-site-pill border border-caution px-3 text-site-tag leading-site-tag font-medium text-caution-text">{CHANGELOG.readFirst}</span>
  );
}

function ReleaseNotes({ release: r }: { release: Release }) {
  return (
    <Section id={releaseAnchor(r.version)} className="scroll-mt-20 pb-16 md:pb-24" inner="flex flex-col gap-6 border-t border-border pt-10 md:pt-14 lg:flex-row lg:justify-between lg:gap-10">
      <header className="flex flex-col gap-1.5 lg:w-100 lg:shrink-0 lg:gap-2">
        <h2 className="text-site-headline-sm leading-site-headline-sm tracking-site-headline-sm font-semibold lg:text-site-section lg:leading-site-section lg:tracking-site-section">
          <a href={`#${releaseAnchor(r.version)}`} className="rounded-sm">
            {r.version}
          </a>
        </h2>
        <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-start">
          <p className="text-site-body leading-site-body text-muted lg:text-site-body-lg-sm lg:leading-site-body-lg-sm">
            <time dateTime={r.date}>{releaseDate(r.date)}</time>
          </p>
          {r.needsAction && <ReadFirst />}
        </div>
      </header>
      <div className="flex min-w-0 flex-col gap-8 lg:w-180 lg:shrink-0 lg:gap-10 lg:pt-3.5">
        <p className="text-site-body-lg leading-site-body-lg lg:text-site-lead lg:leading-site-lead">{r.summary}</p>
        {r.shots.map((s) => (
          <Shot key={s.id} id={s.id} alt={s.alt} />
        ))}
        <Group title={CHANGELOG.new} items={r.new} />
        <Group title={CHANGELOG.better} items={r.better} />
        <Group title={CHANGELOG.fixed} items={r.fixed} />
        {r.selfHost.length > 0 && (
          <section className={`flex flex-col gap-3 rounded-sm p-5 lg:p-6 ${r.needsAction ? "bg-caution-subtle" : "bg-subtle"}`}>
            <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
              <h3 className="text-site-item leading-site-item font-semibold">{CHANGELOG.selfHost}</h3>
              {r.needsAction && <ReadFirst solid />}
            </div>
            <ul className={`flex list-disc flex-col gap-2 pl-5 marker:text-muted ${listText}`}>
              {r.selfHost.map((step) => (
                <li key={step}>
                  <Markdown text={step} code="rounded-sm bg-surface px-3 py-2.5" />
                </li>
              ))}
            </ul>
            <a
              href={CHANGELOG.howToUpdate.href}
              className={`tap flex h-11 w-fit items-center text-site-item-sm leading-site-item-sm font-medium underline underline-offset-3 md:h-auto ${r.needsAction ? "text-caution-text" : "text-text"}`}
            >
              {CHANGELOG.howToUpdate.label}
            </a>
          </section>
        )}
      </div>
    </Section>
  );
}

export function Changelog({ releases }: { releases: Release[] }) {
  return (
    <SiteFrame>
      <PageHeader heading={CHANGELOG.heading} sub={CHANGELOG.sub} />
      <Section className="-mt-12 pb-12 md:-mt-16 md:pb-16 lg:-mt-20">
        <a
          href={CHANGELOG.rss.href}
          className="tap flex h-11 w-fit items-center text-site-item-sm leading-site-item-sm font-medium underline decoration-border underline-offset-3 transition-colors duration-100 hover:decoration-text md:h-auto"
        >
          {CHANGELOG.rss.label}
        </a>
      </Section>
      {releases.map((r) => (
        <ReleaseNotes key={r.version} release={r} />
      ))}
    </SiteFrame>
  );
}
