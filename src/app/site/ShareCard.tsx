import type { CSSProperties, ReactNode } from "react";
import tokens from "../tokens.json";
import { HEADLINE, HEADLINE_LEAD, HEADLINE_MARK, HERO } from "./words";

// The card shown when a link to careerbot.dev is shared (scripts/share-card.tsx writes it to opengraph-image.png and
// twitter-image.png): the wordmark, the headline (a sentence a line) and the waitlist (an amber Get notified and the
// address) on the left, the hero's mock-up on the right in its final frame, as drawn for a phone: envelopes drifting
// into a grey void, a resume with one line lit amber, a thread to a person and their reply with a check. Drawn in code
// with inline styles from DESIGN.md's resolved values (tokens.json), because it's rendered to a PNG by Takumi, not a
// browser.

export const SHARE_SIZE = { width: 1200, height: 630 };
export const SHARE_ALT = `${HEADLINE} ${HERO.cta} at careerbot.dev. CareerBot: envelopes drifting into a grey void beside a resume with one line lit amber, a thread from that line to a person, and their reply with a green check.`;

const { colors: c, typography: t, rounded: r } = tokens;
// The soft card shadow (globals.css, shadow-site-card): ink at 4% and 6%.
const cardShadow = `0 1px 2px ${c.ink}0a, 0 10px 28px ${c.ink}0f`;

type Box = { x: number; y: number; w: number; h: number };
const at = ({ x, y, w, h }: Box): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h });

function Bar({ x, y, w, h = 6, color = c["site-skeleton"], opacity = 1 }: Omit<Box, "h"> & { h?: number; color?: string; opacity?: number }) {
  return <div style={{ ...at({ x, y, w, h }), background: color, opacity, borderRadius: h / 2 }} />;
}

function Card({ radius = r["site-card"], children, ...box }: Box & { radius?: string; children: ReactNode }) {
  return <div style={{ ...at(box), display: "flex", background: c.paper, border: `1px solid ${c.border}`, borderRadius: radius, boxShadow: cardShadow, overflow: "hidden" }}>{children}</div>;
}

function Word({ x, y, children }: { x: number; y: number; children: string }) {
  const tag = t["site-tag"];
  return <div style={{ position: "absolute", left: x, top: y, color: c.muted, fontSize: tag.fontSize, lineHeight: tag.lineHeight, fontWeight: tag.fontWeight }}>{children}</div>;
}

// The envelopes in the void (mockups/Hero.tsx): where each sits, its tilt, its size against a 76 × 52 envelope and its
// strength. In the final frame they've drifted 90px in and are at 45%.
const MAIL = [
  [470, 250, -4, 1, 1],
  [400, 150, 6, 0.92, 0.9],
  [385, 345, -8, 0.9, 0.85],
  [310, 225, 10, 0.8, 0.7],
  [255, 120, -12, 0.7, 0.55],
  [235, 330, 14, 0.68, 0.5],
  [170, 200, -16, 0.58, 0.35],
  [120, 285, 18, 0.5, 0.25],
  [95, 150, -20, 0.45, 0.18],
  [60, 240, 22, 0.4, 0.12],
];

// The hero's phone drawing (mockups/Hero.tsx, 760 × 640, 350 wide on a phone), still, at 440 wide.
const SCALE = 440 / 760;

function HeroStill() {
  const heading = { color: c.ink, opacity: 0.78 };
  return (
    <div style={{ display: "flex", position: "relative", alignSelf: "center", flexShrink: 0, width: 760 * SCALE, height: 640 * SCALE, background: c.subtle, borderRadius: r["site-band"], overflow: "hidden" }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 760, height: 640, transform: `scale(${SCALE})`, transformOrigin: "0 0" }}>
        <svg width="480" height="445.71" viewBox="0 0 560 520" style={{ position: "absolute", left: 0, top: 0 }}>
          <defs>
            <radialGradient id="void" cx="0" cy="0.48" r="0.6">
              <stop offset="0" stopColor={c["site-line"]} />
              <stop offset="1" stopColor={c.subtle} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="560" height="520" fill="url(#void)" />
          <g transform="translate(-90 0)" opacity="0.45">
            {MAIL.map(([x, y, turn, s, opacity]) => (
              <g key={x} transform={`translate(${x} ${y}) rotate(${turn})`} opacity={opacity}>
                <rect x={-38 * s} y={-26 * s} width={76 * s} height={52 * s} rx={6 * s} fill={c.paper} stroke={c.border} />
                <path d={`M${-33 * s} ${-20 * s} L0 ${3 * s} L${33 * s} ${-20 * s}`} fill="none" stroke={c["site-skeleton-strong"]} strokeWidth={1.4 * s} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ))}
          </g>
        </svg>

        <Card x={80} y={220} w={250} h={380}>
          <Word x={24} y={20}>Resume</Word>
          <Bar x={24} y={52} w={120} h={11} {...heading} />
          <Bar x={24} y={72} w={80} />
          <div style={{ ...at({ x: 24, y: 94, w: 202, h: 1 }), background: c.border }} />
          {[
            [114, 190, 172, 120],
            [183, 200, 160],
            [239],
            [311, 184, 140],
          ].map(([top, ...lines]) => [
            <Bar key={top} x={24} y={top} w={64} color={c["site-skeleton-strong"]} />,
            ...lines.map((w, i) => <Bar key={`${top} ${w}`} x={24} y={top + 18 + i * 13} w={w} h={5} />),
          ])}
          <div style={{ ...at({ x: 14, y: 251, w: 222, h: 20 }), background: c["site-highlight"], borderRadius: r["site-mark"] }} />
          <Bar x={24} y={257} w={176} color={c.primary} />
          <Bar x={24} y={273} w={150} h={5} />
          <Bar x={24} y={286} w={110} h={5} />
        </Card>

        <Card x={440} y={300} w={230} h={88}>
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: "absolute", left: 20, top: 22 }}>
            <circle cx="22" cy="22" r="22" fill={c["steel-subtle"]} />
            <circle cx="22" cy="18" r="7" fill={c.steel} />
            <path d="M9 38c2-7 7-10 13-10s11 3 13 10" fill={c.steel} />
          </svg>
          <Bar x={78} y={30} w={104} h={8} {...heading} />
          <Bar x={78} y={48} w={72} />
        </Card>

        <Card x={470} y={450} w={200} h={96} radius={`${r["site-card"]} ${r["site-card"]} ${r["site-card"]} ${r["site-mark"]}`}>
          <Word x={18} y={16}>Reply</Word>
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ position: "absolute", left: 164, top: 16 }}>
            <circle cx="9" cy="9" r="9" fill={c.good} />
            <path d="M5.2 9.3l2.4 2.4 5-5.2" fill="none" stroke={c.paper} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <Bar x={18} y={48} w={150} />
          <Bar x={18} y={62} w={120} />
        </Card>

        <svg width="760" height="640" viewBox="0 0 760 640" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M280 480 C 350 480, 370 344, 440 344" fill="none" stroke={c.steel} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M555 388 L555 450" fill="none" stroke={c.steel} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 4" />
          <circle cx="280" cy="480" r="3.5" fill={c.steel} />
          <circle cx="440" cy="344" r="3.5" fill={c.steel} />
        </svg>
      </div>
    </div>
  );
}

// `wordmark`: the light wordmark as a data URL (public/brand/wordmark-light.svg).
export function ShareCard({ wordmark }: { wordmark: string }) {
  const headline = t["site-section"];
  const cta = t["site-subheading"];
  const address = t["site-lead"];
  return (
    <div style={{ display: "flex", width: SHARE_SIZE.width, height: SHARE_SIZE.height, padding: 64, gap: 48, background: c.paper, fontFamily: "Inter" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG by Takumi, not served as a page */}
        <img src={wordmark} alt="CareerBot" width={194} height={34} />
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", color: c.ink, fontSize: headline.fontSize, lineHeight: headline.lineHeight, letterSpacing: headline.letterSpacing, fontWeight: headline.fontWeight }}>
            {HEADLINE_LEAD.split(/(?<=\.)\s+/).map((sentence) => (
              <div key={sentence}>{sentence}</div>
            ))}
            {/* The mark, as on the page (globals.css site-mark): amber from 46% to 88% of the line. */}
            <div style={{ display: "flex", alignSelf: "flex-start", position: "relative", padding: "0 6px", margin: "0 -6px" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: "46%", bottom: "12%", background: c.primary, borderRadius: 2 }} />
              <div style={{ position: "relative" }}>{HEADLINE_MARK}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", height: 56, padding: "0 24px", background: c.primary, borderRadius: r["site-field"], color: c.ink, fontSize: cta.fontSize, fontWeight: cta.fontWeight }}>{HERO.cta}</div>
            <div style={{ color: c.muted, fontSize: address.fontSize, fontWeight: address.fontWeight }}>careerbot.dev</div>
          </div>
        </div>
      </div>
      <HeroStill />
    </div>
  );
}
