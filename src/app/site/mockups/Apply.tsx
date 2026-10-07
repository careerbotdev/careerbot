"use client";

import { Bar, Card, Label, Mark, type MarkState, Stage } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Step 03's mock-up (Read the room): a resume being written for one job beside that job's
// requirements. Written sections sit under the header, an amber rule marks the section being written, and dashed
// placeholders hold the sections still to come; each requirement is checked against the resume (strong, strong,
// partial, strong, thin). The still (the Calm — large board) has the third section being written and four
// requirements checked. Its motion (Calm — motion, Apply) plays once when scrolled into view, about 4s: the sections
// fade up one by one as they're written, the rule moves down to each in turn and the requirements tick in step, until
// all four sections are written and all five requirements checked.

const LABEL = "A resume being written section by section for one job, beside the job's requirements, each checked against it as it's written.";

// The requirements, top to bottom: their line's width and how well the resume meets them.
const requirements: { w: number; state: MarkState }[] = [
  { w: 110, state: "done" },
  { w: 86, state: "done" },
  { w: 120, state: "partial" },
  { w: 70, state: "done" },
  { w: 96, state: "thin" },
];

// From the first frame (section 1 written, nothing checked) to all four sections written. A section's last line grows
// from 0.55 of its width, where the board shows it while it's being written.
const steps: Step[] = [
  { m: "s1-end", to: { scaleX: [0.55, 1] }, at: 0.1, duration: 0.5 },
  { m: "r1", to: { opacity: [0, 1] }, at: 0.5, duration: 0.25 },
  { m: "r2", to: { opacity: [0, 1] }, at: 0.75, duration: 0.25 },
  { m: "rule", to: { y: [-148, -74] }, at: 0.7, duration: 0.4 },
  { m: "ph1", to: { opacity: [1, 0] }, at: 0.7, duration: 0.3 },
  { m: "s2", to: { opacity: [0, 1], y: [6, 0] }, at: 0.8, duration: 0.4 },
  { m: "s2-end", to: { scaleX: [0.55, 1] }, at: 1.35, duration: 0.5 },
  { m: "r3", to: { opacity: [0, 1] }, at: 1.7, duration: 0.25 },
  { m: "r4", to: { opacity: [0, 1] }, at: 1.95, duration: 0.25 },
  { m: "rule", to: { y: [-74, 0] }, at: 1.9, duration: 0.4 },
  { m: "ph2", to: { opacity: [1, 0] }, at: 1.9, duration: 0.3 },
  { m: "s3", to: { opacity: [0, 1], y: [6, 0] }, at: 2.0, duration: 0.4 },
  { m: "s3-end", to: { opacity: [0, 1] }, at: 2.55, duration: 0.01 },
  { m: "s3-end", to: { scaleX: [0.55, 1] }, at: 2.55, duration: 0.5 },
  { m: "rule", to: { y: [0, 74] }, at: 2.8, duration: 0.4 },
  { m: "ph3", to: { opacity: [1, 0] }, at: 2.8, duration: 0.3 },
  { m: "s4", to: { opacity: [0, 1], y: [6, 0] }, at: 2.9, duration: 0.4 },
  { m: "s4-end", to: { scaleX: [0.55, 1] }, at: 3.3, duration: 0.45 },
  { m: "r5-empty", to: { opacity: [1, 0] }, at: 3.3, duration: 0.25 },
  { m: "r5", to: { opacity: [0, 1] }, at: 3.3, duration: 0.25 },
  { m: "rule", to: { opacity: [1, 0] }, at: 3.6, duration: 0.4 },
];

// 640 × 440: the resume, then the requirements.
export function ApplyMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(steps, { still });
  return (
    <Stage w={640} h={440} label={LABEL} scope={scope}>
      <Card x={60} y={36} w={300} h={368}>
        <Bar x={24} y={28} w={120} h={11} tone="heading" />
        <Bar x={24} y={48} w={80} h={6} />
        <div className="absolute top-17.5 left-6 h-px w-63 bg-border" />
        <Section n={1} y={90} lines={[239.4, 216.7, 156.2]} />
        <Section n={2} y={164} lines={[226.8, 244.4, 176.4]} />
        <Section n={3} y={238} lines={[234.4, 211.7, 126]} writing={69.3} />
        <Section n={4} y={312} lines={[221.8, 151.2]} className="opacity-0" />
        {[
          { y: 160, h: 58, className: "opacity-0" },
          { y: 234, h: 58, className: "opacity-0" },
          { y: 308, h: 44, className: "" },
        ].map(({ y, h, className }, i) => (
          <div
            key={y}
            data-m={`ph${i + 1}`}
            className={`absolute rounded-site-mark border border-dashed border-site-line ${className}`}
            style={{ left: 24, top: y, width: 252, height: h }}
          />
        ))}
        <Bar x={12} y={236} w={3} h={60} tone="primary" m="rule" />
      </Card>

      <Card x={392} y={112} w={196} h={212}>
        <Label x={18} y={16}>
          Requirements
        </Label>
        {requirements.map(({ w, state }, i) => (
          <div key={w}>
            <Mark x={18} y={54 + i * 30} size={16} state="empty" m={`r${i + 1}-empty`} />
            <Bar x={46} y={58.5 + i * 30} w={w} h={7} />
            <div data-m={`r${i + 1}`} className={`absolute inset-0 ${state === "thin" ? "opacity-0" : ""}`}>
              <Mark x={18} y={54 + i * 30} size={16} state={state} />
              <Bar x={46} y={58.5 + i * 30} w={w} h={7} tone="strong" />
            </div>
          </div>
        ))}
      </Card>
    </Stage>
  );
}

// A resume section: its heading, then lines 14px apart; the last line is `s${n}-end`, the one that finishes as the
// section is written. `writing`: how far the last line has got in the still, for the section being written there.
function Section({ n, y, lines, writing, className = "" }: { n: number; y: number; lines: number[]; writing?: number; className?: string }) {
  const last = lines.length - 1;
  return (
    <div data-m={`s${n}`} className={`absolute inset-0 ${className}`}>
      <Bar x={24} y={y} w={60} h={6} tone="strong" />
      {lines.map((w, i) => (
        <Bar key={w} x={24} y={y + 18 + i * 14} w={w} h={5} m={i === last ? `s${n}-end` : undefined} className={i === last && writing ? "opacity-0" : ""} />
      ))}
      {writing && <Bar x={24} y={y + 18 + last * 14} w={writing} h={5} />}
    </div>
  );
}
