"use client";

import type { ReactNode } from "react";
import { Stage } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Home's four step tiles (Website v4 — Pages, Home — large, How CareerBot fixes it): small drawings on a grey stage,
// 282 × 184, one per step. 01 a story with an amber line linked to the facts drawn from it; 02 roles ranked, the top
// one outlined with its fit bar in amber; 03 a resume beside its requirements (met, half met, not checked) with an
// amber rule by the line that answers them; 04 an org chart with one person lit amber, a dotted line to a drafted note,
// then the note in the inbox. Each plays once when scrolled into view (Website v4 motion plan, on the Calm v3 motion
// rules): 01 the amber line draws, the connector runs down and the new fact arrives; 02 the rows arrive, then the top
// row's outline and amber bar fill in; 03 the marks fill in one by one, then the amber rule appears; 04 the person
// lights amber, the dotted line shows the way to the note, then the inbox row fades in.

const W = 282;
const H = 184;

// Grows a bar or a line from its own left (or top) edge, as drawn.
const fromLeft = "origin-left [transform-box:fill-box]";
const fromTop = "origin-top [transform-box:fill-box]";

// A done check inside a chip: a green disc and a white tick.
function Check({ cx, cy, r = 5 }: { cx: number; cy: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} className="fill-good" />
      <path d={`M${cx - 2.4} ${cy} l1.7 1.7 l3.2 -3.4`} fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-surface" />
    </>
  );
}

function Tile({ label, steps, still, children }: { label: string; steps: Step[]; still: boolean; children: ReactNode }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <Stage w={W} h={H} label={label} scope={scope}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="absolute inset-0 size-full overflow-visible">
        {children}
      </svg>
    </Stage>
  );
}

const recordSteps: Step[] = [
  { m: "amber", to: { scaleX: [0, 1] }, at: 0.1, duration: 0.6 },
  { m: "ends", to: { opacity: [0, 1] }, at: 0.6, duration: 0.2 },
  { m: "connector", to: { strokeDashoffset: [1, 0] }, at: 0.65, duration: 0.5, ease: "easeInOut" },
  { m: "fact", to: { opacity: [0, 1], y: [6, 0] }, at: 1.1, duration: 0.4 },
];

export function RecordTile({ still = false }: { still?: boolean }) {
  return (
    <Tile label="A story with one line marked in amber, linked to a new fact beside two approved ones." steps={recordSteps} still={still}>
      <rect x="36" y="26" width="210" height="132" rx="8" strokeWidth="1" className="fill-surface stroke-border" />
      <rect x="52" y="44" width="176" height="5" rx="2.5" className="fill-site-skeleton" />
      <rect x="52" y="56" width="160" height="5" rx="2.5" className="fill-site-skeleton" />
      <rect x="52" y="68" width="120" height="5" rx="2.5" className="fill-site-skeleton" />
      <rect x="52" y="80" width="64" height="5" rx="2.5" className="fill-site-skeleton" />
      <rect data-m="amber" x="122" y="80" width="92" height="5" rx="2.5" className={`fill-primary ${fromLeft}`} />
      <line x1="36" y1="98.5" x2="246" y2="98.5" strokeWidth="1" className="stroke-border" />
      <path data-m="connector" d="M168 85 C168 100, 204 98, 206 112" fill="none" strokeWidth="1.2" pathLength={1} strokeDasharray="1 1" strokeDashoffset={0} className="stroke-steel" />
      <g data-m="ends">
        <circle cx="168" cy="85" r="2" className="fill-steel" />
        <circle cx="206" cy="112" r="2" className="fill-steel" />
      </g>
      <rect x="48" y="112" width="68" height="22" rx="11" strokeWidth="1" className="fill-surface stroke-border" />
      <Check cx={60} cy={123} />
      <rect x="70" y="120.5" width="36" height="5" rx="2.5" className="fill-control-border" />
      <rect x="122" y="112" width="60" height="22" rx="11" strokeWidth="1" className="fill-surface stroke-border" />
      <Check cx={134} cy={123} />
      <rect x="144" y="120.5" width="28" height="5" rx="2.5" className="fill-control-border" />
      <g data-m="fact">
        <rect x="188" y="112" width="48" height="22" rx="11" strokeWidth="1" className="fill-steel-subtle stroke-steel" />
        <circle cx="200" cy="123" r="4.5" strokeWidth="1" className="fill-surface stroke-steel" />
        <rect x="209" y="120.5" width="18" height="5" rx="2.5" className="fill-control-border" />
      </g>
    </Tile>
  );
}

// Each role row: where it sits, and how full its fit bar is.
const ROWS = [
  { y: 82, fit: 34 },
  { y: 118, fit: 26 },
];

const rolesSteps: Step[] = [
  { m: "row-0", to: { opacity: [0, 1], y: [8, 0] }, at: 0, duration: 0.4 },
  { m: "row-1", to: { opacity: [0, 1], y: [8, 0] }, at: 0.1, duration: 0.4 },
  { m: "row-2", to: { opacity: [0, 1], y: [8, 0] }, at: 0.2, duration: 0.4 },
  { m: "outline", to: { opacity: [0, 1] }, at: 0.7, duration: 0.3 },
  { m: "fit", to: { scaleX: [0, 1] }, at: 0.75, duration: 0.5 },
  { m: "note", to: { opacity: [0, 1] }, at: 1.1, duration: 0.3 },
];

export function RolesTile({ still = false }: { still?: boolean }) {
  return (
    <Tile label="Three roles ranked for you, the top one outlined in steel with its fit bar in amber." steps={rolesSteps} still={still}>
      <g data-m="row-0">
        <rect x="40" y="28" width="202" height="46" rx="6" strokeWidth="1" className="fill-surface stroke-border" />
        <rect data-m="outline" x="40" y="28" width="202" height="46" rx="6" fill="none" strokeWidth="1" className="stroke-steel" />
        <rect x="50" y="34" width="16" height="16" rx="3" strokeWidth="1" className="fill-subtle stroke-border" />
        <rect x="74" y="37" width="44" height="4" rx="2" className="fill-control-border" />
        <rect x="74" y="44" width="64" height="4" rx="2" className="fill-site-skeleton" />
        <rect x="184" y="40" width="48" height="4" rx="2" className="fill-site-skeleton" />
        <rect data-m="fit" x="184" y="40" width="42" height="4" rx="2" className={`fill-primary ${fromLeft}`} />
        <g data-m="note">
          <circle cx="52" cy="64" r="2" className="fill-steel" />
          <rect x="58" y="62" width="110" height="4" rx="2" className="fill-site-skeleton" />
        </g>
      </g>
      {ROWS.map(({ y, fit }, i) => (
        <g key={y} data-m={`row-${i + 1}`}>
          <rect x="40" y={y} width="202" height="30" rx="6" strokeWidth="1" className="fill-surface stroke-border" />
          <rect x="50" y={y + 7} width="16" height="16" rx="3" strokeWidth="1" className="fill-subtle stroke-border" />
          <rect x="74" y={y + 10} width="44" height="4" rx="2" className="fill-control-border" />
          <rect x="74" y={y + 17} width="64" height="4" rx="2" className="fill-site-skeleton" />
          <rect x="184" y={y + 13} width="48" height="4" rx="2" className="fill-site-skeleton" />
          <rect x="184" y={y + 13} width={fit} height="4" rx="2" className="fill-control-border" />
        </g>
      ))}
    </Tile>
  );
}

const tailorSteps: Step[] = [
  ...[0, 1, 2, 3, 4].map((i): Step => ({ m: `mark-${i}`, to: { opacity: [0, 1], scale: [0.6, 1] }, at: 0.1 + i * 0.15, duration: 0.3 })),
  { m: "rule", to: { opacity: [0, 1], scaleY: [0, 1] }, at: 0.95, duration: 0.4 },
];

// The requirements' rows, top to bottom: the mark's centre and the line's width.
const REQUIREMENTS = [
  { y: 76, w: 52 },
  { y: 91, w: 40 },
  { y: 106, w: 56 },
  { y: 121, w: 36 },
  { y: 136, w: 44 },
];

export function TailorTile({ still = false }: { still?: boolean }) {
  return (
    <Tile label="A resume beside its requirements, each met, half met or not checked, with an amber rule by the line that answers them." steps={tailorSteps} still={still}>
      <rect x="46" y="20" width="118" height="146" rx="6" strokeWidth="1" className="fill-surface stroke-border" />
      <rect x="58" y="32" width="52" height="6" rx="3" className="fill-text" />
      <rect x="58" y="43" width="30" height="4" rx="2" className="fill-site-skeleton" />
      <line x1="58" y1="54.5" x2="152" y2="54.5" strokeWidth="1" className="stroke-border" />
      <rect x="58" y="64" width="22" height="4" rx="2" className="fill-control-border" />
      <rect x="58" y="73" width="90" height="4" rx="2" className="fill-site-skeleton" />
      <rect x="58" y="81" width="80" height="4" rx="2" className="fill-site-skeleton" />
      <rect x="58" y="95" width="22" height="4" rx="2" className="fill-control-border" />
      <rect x="58" y="104" width="92" height="4" rx="2" className="fill-site-skeleton" />
      <rect x="58" y="112" width="70" height="4" rx="2" className="fill-site-skeleton" />
      <rect data-m="rule" x="52" y="124" width="2.5" height="26" rx="1" className={`fill-primary ${fromTop}`} />
      <rect x="58" y="126" width="22" height="4" rx="2" className="fill-control-border" />
      <rect x="58" y="135" width="88" height="4" rx="2" className="fill-site-skeleton" />
      <rect x="58" y="143" width="64" height="4" rx="2" className="fill-site-skeleton" />
      <rect x="150" y="50" width="90" height="100" rx="6" strokeWidth="1" className="fill-surface stroke-border" />
      <rect x="160" y="60" width="34" height="4" rx="2" className="fill-control-border" />
      {REQUIREMENTS.map(({ y, w }, i) => (
        <g key={y}>
          <g data-m={`mark-${i}`} className="origin-center [transform-box:fill-box]">
            {i === 2 ? (
              <>
                <circle cx="165" cy={y} r="4.4" strokeWidth="1.2" className="fill-surface stroke-caution" />
                <path d={`M165 ${y - 4.4} A4.4 4.4 0 0 0 165 ${y + 4.4} Z`} className="fill-caution" />
              </>
            ) : i === 4 ? (
              <circle cx="165" cy={y} r="4.4" strokeWidth="1" className="fill-surface stroke-control-border" />
            ) : (
              <Check cx={165} cy={y} r={4.5} />
            )}
          </g>
          <rect x="174" y={y - 2} width={w} height="4" rx="2" className="fill-site-skeleton" />
        </g>
      ))}
    </Tile>
  );
}

const writeSteps: Step[] = [
  { m: "lit", to: { opacity: [0, 1], scale: [0.5, 1] }, at: 0.1, duration: 0.4 },
  { m: "way", to: { opacity: [0, 1] }, at: 0.55, duration: 0.4 },
  { m: "note", to: { opacity: [0, 1], x: [-6, 0] }, at: 0.7, duration: 0.4 },
  { m: "down", to: { opacity: [0, 1] }, at: 1.05, duration: 0.3 },
  { m: "inbox", to: { opacity: [0, 1], y: [6, 0] }, at: 1.2, duration: 0.4 },
];

export function WriteTile({ still = false }: { still?: boolean }) {
  return (
    <Tile label="An org chart with the likely hiring manager lit in amber, a dotted line to a drafted note, and the note in your inbox." steps={writeSteps} still={still}>
      <path
        d="M86 42 V58 M58 58 H114 M58 58 V72 M114 58 V72 M58 84 V94 M46 94 H70 M46 94 V104 M70 94 V104 M114 84 V94 M102 94 H126 M102 94 V104 M126 94 V104"
        fill="none"
        strokeWidth="1"
        className="stroke-control-border"
      />
      <circle cx="86" cy="36" r="6" strokeWidth="1" className="fill-surface stroke-control-border" />
      <circle cx="58" cy="78" r="6" strokeWidth="1" className="fill-surface stroke-control-border" />
      {[46, 70, 102, 126].map((cx) => (
        <circle key={cx} cx={cx} cy="110" r="5.5" strokeWidth="1" className="fill-surface stroke-control-border" />
      ))}
      <circle cx="114" cy="78" r="6" strokeWidth="1" className="fill-surface stroke-control-border" />
      <g data-m="lit" className="origin-center [transform-box:fill-box]">
        <circle cx="114" cy="78" r="11" strokeWidth="1" className="fill-steel-subtle stroke-steel" />
        <circle cx="114" cy="78" r="6" className="fill-primary" />
      </g>
      <path data-m="way" d="M125 78 C138 78, 140 70, 156 70" fill="none" strokeWidth="1" strokeDasharray="2 3" className="stroke-steel" />
      <g data-m="note">
        <rect x="156" y="40" width="92" height="72" rx="6" strokeWidth="1" className="fill-surface stroke-border" />
        <circle cx="170" cy="54" r="6" strokeWidth="1" className="fill-subtle stroke-border" />
        <rect x="181" y="49" width="40" height="4" rx="2" className="fill-control-border" />
        <rect x="181" y="56" width="26" height="4" rx="2" className="fill-site-skeleton" />
        <rect x="166" y="70" width="72" height="4" rx="2" className="fill-site-skeleton" />
        <rect x="166" y="78" width="64" height="4" rx="2" className="fill-site-skeleton" />
        <rect x="166" y="86" width="48" height="4" rx="2" className="fill-site-skeleton" />
        <rect x="166" y="96" width="30" height="8" rx="4" strokeWidth="1" className="fill-surface stroke-border" />
      </g>
      <path data-m="down" d="M202 113 V128" fill="none" strokeWidth="1" strokeDasharray="2 3" className="stroke-steel" />
      <g data-m="inbox">
        <rect x="156" y="130" width="92" height="28" rx="6" strokeWidth="1" className="fill-surface stroke-border" />
        <rect x="164" y="137" width="14" height="14" rx="3" className="fill-subtle" />
        <rect x="167" y="141" width="8" height="6" rx="1" fill="none" strokeWidth="0.9" className="stroke-text" />
        <path d="M167 141.5 L171 144.5 L175 141.5" fill="none" strokeWidth="0.9" className="stroke-text" />
        <rect x="184" y="140" width="40" height="4" rx="2" className="fill-text" />
        <rect x="184" y="147" width="30" height="3" rx="1.5" className="fill-site-skeleton" />
        <path d="M231 144 H239 M236 141 L239 144 L236 147" fill="none" strokeWidth="1" strokeLinecap="round" className="stroke-steel" />
      </g>
    </Tile>
  );
}

export const STEP_TILES = [RecordTile, RolesTile, TailorTile, WriteTile];
