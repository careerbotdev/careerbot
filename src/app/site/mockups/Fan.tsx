"use client";

import { Bar, Card, Disc, End, Label, Lines, Marks, Stage, Thread } from "./draw";
import { type Step, useMockupMotion } from "./motion";

// Directions (See where else your experience fits, How it works): where you are now, fanning out to five directions;
// the steel path goes to the amber one, which leads to a card of what carries over, three things checked. 1200 × 400,
// from medium screens up (a phone's page leaves it out). Its motion plays once when scrolled into view: the Now pill
// appears, the fan draws out and the directions fade in as their lines reach them, the steel path draws to the chosen
// one as it fills amber, then the card fades up and its checks fill one after another.

const LABEL = "Where you are now, with paths fanning out to five directions; the steel one leads to the amber direction and a card of three things that carry over, each checked.";

// The directions, top to bottom: the pill's width and its line's. The third is the one chosen.
const DIRECTIONS = [
  { w: 140, bar: 73 },
  { w: 126, bar: 66 },
  { w: 172, bar: 100 },
  { w: 150, bar: 78 },
  { w: 132, bar: 69 },
];
const CHOSEN = 2;
// What carries over: its lines' widths.
const CARRIES = [110, 90, 120];

// Where the drawing puts things: the Now pill's left and top, the directions' left and first top (68 apart), the
// card's left and top, and the fan's curve (how far its handles reach).
const W = 1200;
const H = 400;
const NOW = { x: 96, y: 180 };
const TO = { x: 700, y: 64 };
const CARD = { x: 960, y: 132 };
const BEND = [466, 460];

const steps: Step[] = [
  { m: "now", to: { opacity: [0, 1], x: [-6, 0] }, at: 0, duration: 0.35 },
  ...DIRECTIONS.flatMap((_, i): Step[] => [
    { m: `path-${i}`, to: { strokeDashoffset: [1, 0] }, at: 0.3 + i * 0.07, duration: 0.6, ease: "easeInOut" },
    { m: `direction-${i}`, to: { opacity: [0, 1], x: [-6, 0] }, at: 0.75 + i * 0.07, duration: 0.35 },
  ]),
  { m: "chosen-path", to: { strokeDashoffset: [1, 0] }, at: 1.25, duration: 0.5, ease: "easeInOut" },
  { m: "chosen", to: { opacity: [0, 1] }, at: 1.65, duration: 0.3 },
  { m: "carry", to: { strokeDashoffset: [1, 0] }, at: 1.8, duration: 0.25, ease: "easeInOut" },
  { m: "carry-end", to: { opacity: [0, 1] }, at: 2.0, duration: 0.15 },
  { m: "card", to: { opacity: [0, 1], y: [8, 0] }, at: 1.9, duration: 0.4 },
  ...CARRIES.map((_, i): Step => ({ m: `check-${i}-done`, to: { opacity: [0, 1] }, at: 2.15 + i * 0.15, duration: 0.2 })),
];

export function FanMockup({ still = false }: { still?: boolean }) {
  const scope = useMockupMotion(steps, { still });
  const start = { x: NOW.x + 130, y: NOW.y + 20 };
  const top = (i: number) => TO.y + i * 68;
  const path = (i: number) => `M${start.x} ${start.y} C ${BEND[0]} ${start.y} ${BEND[1]} ${top(i) + 17} ${TO.x} ${top(i) + 17}`;
  const chosen = { x: TO.x + DIRECTIONS[CHOSEN].w, y: top(CHOSEN) + 17 };
  const cardMiddle = CARD.y + 68;
  const reach = (chosen.x + CARD.x) / 2;
  return (
    <Stage w={W} h={H} label={LABEL} radius="none" className="rounded-site-band bg-subtle" scope={scope}>
      <Lines w={W} h={H}>
        {DIRECTIONS.map((_, i) => (
          <Thread key={i} d={path(i)} tone="line" m={`path-${i}`} />
        ))}
        <Thread d={path(CHOSEN)} width={2} m="chosen-path" />
        <Thread d={`M${chosen.x} ${chosen.y} C ${reach} ${chosen.y}, ${reach} ${cardMiddle}, ${CARD.x} ${cardMiddle}`} m="carry" />
        <End cx={CARD.x} cy={cardMiddle} m="carry-end" />
      </Lines>

      <Card x={NOW.x} y={NOW.y} w={130} h={40} r="pill" m="now">
        <Disc x={12} y={11} size={16} className="bg-text opacity-80" />
        <Bar x={36} y={15} w={70} tone="strong" />
      </Card>

      {DIRECTIONS.map(({ w: pill, bar }, i) => (
        <Card key={i} x={TO.x} y={top(i)} w={pill} h={34} r="pill" shadow={false} m={`direction-${i}`}>
          <Bar x={16} y={12} w={bar} tone="strong" />
        </Card>
      ))}
      <Card x={TO.x} y={top(CHOSEN)} w={DIRECTIONS[CHOSEN].w} h={34} r="pill" tone="amber" m="chosen">
        <Bar x={16} y={12} w={DIRECTIONS[CHOSEN].bar} tone="onAmber" />
      </Card>

      <Card x={CARD.x} y={CARD.y} w={184} h={136} m="card">
        <Label x={18} y={16} className="text-site-tag leading-site-tag font-medium text-muted">
          Carries over
        </Label>
        {CARRIES.map((line, i) => (
          <div key={line}>
            <Marks x={18} y={46 + i * 26} states={["empty", "done"]} m={`check-${i}`} />
            <Bar x={46} y={52 + i * 26} w={line} h={6} />
          </div>
        ))}
      </Card>
    </Stage>
  );
}
