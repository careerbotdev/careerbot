"use client";

import type { ReactNode } from "react";
import { PORTAL } from "../words";
import { Bar, Card, Mark, Stage } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// The career portal (Your whole search in one place, How it works): a white app window rising out of the stage's bottom
// edge, a top bar with the logo and the avatar, and seven tiles, one per thing the portal keeps (PORTAL.items), each
// with its words and a small drawing: fact chips, a direction fan, a company watchlist with one company new, roles
// ranked by fit (the top one amber), three fanned documents, people and a drafted note, and application tracks with a
// follow-up bell. Wide, in three rows, from medium screens up (a phone's page lists the seven instead). Its motion
// (Calm v3 — motion) plays once when scrolled into view: the window rises a few px, then the tiles fade up in reading
// order, 80 ms apart.

// The tiles carry real words, so the label reads them all.
const LABEL = `A career portal with seven tiles: ${PORTAL.items.join("; ")}.`;

const steps: Step[] = [
  { m: "window", to: { y: [16, 0] }, at: 0, duration: 0.6 },
  ...PORTAL.items.map((_, i): Step => ({ m: `tile-${i}`, to: { opacity: [0, 1], y: [8, 0] }, at: 0.25 + i * 0.08, duration: 0.45 })),
];

// 1200 × 852: a 1040-wide window, its tiles in three rows (wide and narrow, three narrow, narrow and wide).
const WIDE_TILES = [
  { x: 24, y: 88, w: 656, text: 300 },
  { x: 696, y: 88, w: 320, text: 272 },
  { x: 24, y: 316, w: 320, text: 272 },
  { x: 360, y: 316, w: 320, text: 272 },
  { x: 696, y: 316, w: 320, text: 272 },
  { x: 24, y: 544, w: 320, text: 272 },
  { x: 360, y: 544, w: 656, text: 300 },
];
const WIDE_DRAWINGS: ReactNode[] = [<Facts key="facts" />, <Fan key="fan" />, <Watchlist key="watchlist" />, <Ranked key="ranked" />, <Documents key="documents" />, <Contacts key="contacts" />, <Tracks key="tracks" />];

export function PortalMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <Stage w={1200} h={852} label={LABEL} radius="none" className="rounded-site-band bg-subtle" scope={scope}>
      <div data-m="window" className="absolute rounded-t-site-stage-sm bg-surface shadow-site-card" style={{ left: 80, top: 64, width: 1040, height: 788 }}>
        <div className="absolute rounded-site-mark bg-text" style={{ left: 24, top: 20.5, width: 22, height: 22 }} />
        <Bar x={58} y={27} w={120} h={9} tone="heading" />
        <Bar x={790} y={27.5} w={84} />
        <Bar x={888} y={27.5} w={84} />
        <div className="absolute rounded-site-pill border border-steel bg-steel-subtle" style={{ left: 986, top: 16.5, width: 30, height: 30 }} />
        <div className="absolute bg-border" style={{ left: 0, top: 63, width: 1040, height: 1 }} />

        {WIDE_TILES.map(({ x, y, w, text }, i) => (
          <div key={x * 1000 + y} data-m={`tile-${i}`} className="absolute rounded-site-stage-sm bg-subtle" style={{ left: x, top: y, width: w, height: 212 }}>
            <div className="absolute" style={{ left: 24, top: 22, width: w - 48, height: 84 }}>
              {WIDE_DRAWINGS[i]}
            </div>
            <p aria-hidden className="absolute text-site-tile leading-site-tile font-medium text-text" style={{ left: 24, bottom: 24, width: text }}>
              {PORTAL.items[i]}
            </p>
          </div>
        ))}
      </div>
    </Stage>
  );
}

// The career record: six checked facts as chips, in two rows.
const FACTS = [
  [0, 0, 150],
  [160, 0, 190],
  [360, 0, 130],
  [0, 42, 176],
  [186, 42, 140],
  [336, 42, 168],
];
function Facts() {
  return FACTS.map(([x, y, w]) => (
    <Card key={`${x} ${y}`} x={x} y={y} w={w} h={32} r="pill" shadow={false}>
      <Mark x={8} y={6} state="done" />
      <Bar x={34} y={12} w={w - 52} h={7} tone="strong" />
    </Card>
  ));
}

// Directions: three lines fanning out from you, the matched one steel.
function Fan() {
  return (
    <>
      <svg viewBox="0 0 272 84" aria-hidden className="absolute top-0 left-0" style={{ width: 272, height: 84 }}>
        <path d="M22 42 C 80 42, 80 12, 140 12" fill="none" strokeWidth="1.5" className="stroke-site-line" />
        <path d="M22 42 L140 42" fill="none" strokeWidth="2" className="stroke-steel" />
        <path d="M22 42 C 80 42, 80 72, 140 72" fill="none" strokeWidth="1.5" className="stroke-site-line" />
        <circle cx="16" cy="42" r="8" className="fill-text opacity-80" />
      </svg>
      <Card x={140} y={0} w={96} h={24} r="pill" shadow={false}>
        <Bar x={12} y={8} w={48} h={6} tone="strong" />
      </Card>
      <Card x={140} y={30} w={116} h={24} r="pill" tone="selected" shadow={false}>
        <Bar x={12} y={8} w={58} h={6} tone="strong" />
      </Card>
      <Card x={140} y={60} w={84} h={24} r="pill" shadow={false}>
        <Bar x={12} y={8} w={42} h={6} tone="strong" />
      </Card>
    </>
  );
}

// The watchlist: five companies, the second one steel with a green dot: it's new.
function Watchlist() {
  return (
    <>
      {[0, 52, 104, 156, 208].map((x) => (
        <Card key={x} x={x} y={14} w={42} h={42} r="card-sm" tone={x === 52 ? "outlined" : "paper"} shadow={false}>
          <div className={`absolute rounded-site-mark ${x === 52 ? "bg-steel" : "bg-site-skeleton"}`} style={{ left: 12, top: 12, width: 16, height: 16 }} />
        </Card>
      ))}
      <div className="absolute rounded-site-pill border-2 border-surface bg-good" style={{ left: 85, top: 11, width: 12, height: 12 }} />
      <Bar x={0} y={70} w={120} h={6} />
    </>
  );
}

// New roles, ranked: three rows with fit bars, the top one amber (the portal's one amber).
function Ranked() {
  return ([92, 70, 52] as const).map((fit, i) => (
    <Card key={fit} x={0} y={i * 29} w={272} h={24} r="mark" tone={i === 0 ? "outlined" : "paper"} shadow={false}>
      <Bar x={10} y={9} w={90} h={6} tone="strong" />
      <Bar x={150} y={9} w={106} h={6} tone="subtle" />
      <Bar x={150} y={9} w={fit} h={6} tone={i === 0 ? "primary" : "fit"} />
    </Card>
  ));
}

// Tailored documents: three pages fanned out.
function Documents() {
  return ([
    [28, -6],
    [92, 0],
    [156, 6],
  ] as const).map(([x, turn]) => (
    <div key={x} className="absolute origin-top-left" style={{ left: x, top: 0, width: 62, height: 82, rotate: `${turn}deg` }}>
      <Card x={0} y={0} w={62} h={82} r="mark" shadow={false}>
        <Bar x={8} y={10} w={30} h={5} tone="heading" />
        {[
          [24, 44],
          [33, 38],
          [42, 44],
          [56, 40],
          [65, 30],
        ].map(([y, w]) => (
          <Bar key={y} x={8} y={y} w={w} h={4} />
        ))}
      </Card>
    </div>
  ));
}

// The right people: three contacts, the third ringed, and a dotted line to the note drafted for them.
function Contacts() {
  return (
    <>
      <svg viewBox="0 0 272 84" aria-hidden className="absolute top-0 left-0" style={{ width: 272, height: 84 }}>
        <path d="M150 42 L 162 42" fill="none" strokeWidth="1.5" strokeDasharray="3 3" className="stroke-steel" />
        <circle cx="128" cy="42" r="23.5" className="fill-steel" />
        <circle cx="128" cy="42" r="22" className="fill-surface" />
        {[2, 54, 108].map((x) => (
          <svg key={x} x={x} y={22} width={40} height={40} viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="22" className="fill-steel-subtle" />
            <circle cx="22" cy="18" r="7" className="fill-steel" />
            <path d="M9 38c2-7 7-10 13-10s11 3 13 10" className="fill-steel" />
          </svg>
        ))}
      </svg>
      <Card x={164} y={6} w={108} h={72} r="card-sm" className="rounded-bl-sm" shadow={false}>
        <Bar x={12} y={14} w={60} h={6} tone="heading" />
        {[
          [32, 80],
          [44, 66],
          [56, 50],
        ].map(([y, w]) => (
          <Bar key={y} x={12} y={y} w={w} h={5} />
        ))}
      </Card>
    </>
  );
}

// Applications, tracked: three rows of four stages (3, 2 and 1 done), each with the company's name after its logo, the
// middle one with a follow-up bell. The track starts at 150, its stages 100 apart.
const TRACK_X = 150;
const STEP = 100;
const BELL_X = 486;
function Tracks() {
  const width = BELL_X + 30;
  return (
    <svg viewBox={`0 0 ${width} 84`} aria-hidden className="absolute top-0 left-0 overflow-visible" style={{ width, height: 84 }}>
      {[3, 2, 1].map((done, row) => {
        const y = row * 29;
        return (
          <g key={done}>
            <rect x="0" y={y + 2} width="20" height="20" rx="5" className="fill-site-skeleton" />
            <rect x="30" y={y + 9} width="90" height="6" rx="3" className="fill-site-skeleton-strong" />
            <rect x={TRACK_X} y={y + 11} width={STEP * 3} height="2" className="fill-site-skeleton" />
            <rect x={TRACK_X} y={y + 11} width={STEP * (done - 1)} height="2" className="fill-good" />
            {[0, 1, 2, 3].map((k) => (
              <circle
                key={k}
                cx={TRACK_X + k * STEP}
                cy={y + 12}
                r="5.25"
                strokeWidth="1.5"
                className={k < done ? "fill-good stroke-good" : "fill-surface stroke-site-skeleton-strong"}
              />
            ))}
          </g>
        );
      })}
      <circle cx={BELL_X + 14} cy="41" r="13.5" strokeWidth="1" className="fill-steel-subtle stroke-steel" />
      <svg x={BELL_X + 6} y={33} width={16} height={16} viewBox="0 0 20 20">
        <path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 2h-13z" fill="none" strokeWidth="1.5" strokeLinejoin="round" className="stroke-text" />
        <path d="M8.5 17.5a1.5 1.5 0 0 0 3 0" fill="none" strokeWidth="1.5" className="stroke-text" />
      </svg>
    </svg>
  );
}
