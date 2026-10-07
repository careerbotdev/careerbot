import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { BarList, Bars, CATEGORIES, Chart, ChartNumber, Funnel, LineChart, Swatch, type Tone } from "./Chart";

// The Chart board: what each colour means, numbers with a meter or sparkline, upright and lying bars with a budget
// line, stacked bars, lines over time, funnels, and the hover, loading and empty states. Hover, focus or long-press any
// number, bar, row or point for its explainer; arrow keys move within a chart.

const meta = { title: "Components/Chart", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const Frame = ({ children }: { children: React.ReactNode }) => <div className="flex max-w-[566px] flex-col gap-8">{children}</div>;
const months = ["Jun", "Jul", "Aug", "Sep"];
const money = (n: number) => `$${n.toFixed(2)}`;

const COLORS: { tone: Tone | Tone[]; name: string; line: string }[] = [
  { tone: "steel", name: "Steel", line: "Amounts and series that mean nothing on their own: spending, counts, roles ranked" },
  { tone: "good", name: "Green", line: "Good outcomes only: a reply, an offer, facts approved, work done, strong fit" },
  { tone: "caution", name: "Burnt orange", line: "Caution: close to a budget, some fit, waiting longer than usual" },
  { tone: "red", name: "Red", line: "Problems: over a budget, work that failed" },
  { tone: "track", name: "Track", line: "Weak fit, the empty part of a meter, a bar still loading" },
  { tone: CATEGORIES, name: "Categories", line: "Telling series apart, such as directions, in this order. Never a status" },
];

export const Colors: Story = {
  render: () => (
    <Frame>
      <ul className="flex flex-col gap-4">
        {COLORS.map((c) => (
          <li key={c.name} className="flex items-center gap-4">
            <span className="flex w-[120px] shrink-0 gap-[3px]">
              {(Array.isArray(c.tone) ? c.tone : [c.tone]).map((t) => (
                <Swatch key={t} tone={t} large />
              ))}
            </span>
            <span className="flex flex-col gap-px">
              <span className="text-body-sm leading-body-sm font-medium text-text">{c.name}</span>
              <span className="text-label leading-label text-muted">{c.line}</span>
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  ),
};

export const NumberAndSparkline: Story = {
  name: "Number and sparkline",
  render: () => (
    <Frame>
      <div className="grid grid-cols-3 gap-8">
        <ChartNumber label="Spent this month" value="$9.14" of="of $25" meter={{ value: 9.14, max: 25 }} lines={[{ text: "$2.10 more than August" }]} explain={{ title: "AI spending", detail: "$9.14 this month, Sep 1–29, of a $25 budget." }} />
        <ChartNumber label="Close to a budget" value="$21.40" of="of $25" meter={{ value: 21.4, max: 25 }} lines={[{ text: "86% used, 1 day left", tone: "caution" }]} explain={{ title: "AI spending", detail: "$21.40 this month, 86% of a $25 budget." }} />
        <ChartNumber label="Over a budget" value="$26.10" of="of $25" meter={{ value: 26.1, max: 25 }} lines={[{ text: "$1.10 over. Automatic work paused", tone: "problem" }]} explain={{ title: "AI spending", detail: "$26.10 this month, $1.10 over a $25 budget." }} />
      </div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-3 gap-8">
        <ChartNumber label="Replies" value="3" lines={[{ text: "2 more than August", tone: "good" }]} explain={{ title: "Replies", detail: "3 this month, Sep 1–29.", note: "A company asked you to interview, made an offer or said no." }} />
        <ChartNumber
          label="Roles ranked"
          value="412"
          spark={{ values: [3, 5, 4, 6, 5, 7, 6, 8, 6, 5, 7, 9, 8, 6, 7, 8, 10, 9, 7, 8, 9, 11, 10, 8, 9, 12, 10, 9, 11, 10] }}
          lines={[{ text: "187 this month" }]}
          explain={{ title: "Roles ranked", detail: "412 since Jun 2; 187 this month." }}
        />
        <ChartNumber label="Facts approved" value="38" explain={{ title: "Facts approved", detail: "38 this month, Sep 1–29.", note: "Approved in Review; 14 are waiting." }} />
      </div>
    </Frame>
  ),
};

const AI = [3.8, 6.25, 7.04, 9.14];
const APOLLO = [48, 131, 206, 64];
const TASKS: [string, number][] = [
  ["Sorting roles", 2.86],
  ["Writing resumes", 1.64],
  ["Screening companies", 1.42],
  ["Reading narratives", 1.18],
  ["Writing cover letters", 0.71],
  ["7 other tasks", 1.33],
];

export const Bar: Story = {
  render: () => (
    <Frame>
      <div className="grid grid-cols-2 gap-8">
        <Chart title="AI spending" meta="by month" legend={[{ label: "Budget $25 a month", budget: true }]}>
          <Bars
            label="AI spending by month"
            budget={25}
            points={AI.map((v, i) => ({ key: months[i], label: months[i], value: v, display: money(v), explain: { title: months[i], detail: `${money(v)} of your $25 budget.` } }))}
          />
        </Chart>
        <Chart title="Apollo credits" meta="by month" legend={[{ label: "200 a month", budget: true }]}>
          <Bars
            label="Apollo credits by month"
            budget={200}
            points={APOLLO.map((v, i) => ({ key: months[i], label: months[i], value: v, display: String(v), explain: { title: months[i], detail: `${v} of 200 credits.`, note: v > 200 ? `${v - 200} over the budget.` : undefined } }))}
          />
        </Chart>
      </div>
      <Chart title="AI spending by task" meta="Sep 1–29 · $9.14">
        <BarList label="AI spending by task" rows={TASKS.map(([t, v]) => ({ key: t, label: t, value: v, display: money(v), explain: { title: t, detail: `${money(v)} this month.` } }))} />
      </Chart>
    </Frame>
  ),
};

const SPLIT: [number, number][] = [
  [1.1, 2.7],
  [2.85, 3.4],
  [3.62, 3.42],
  [5.02, 4.12],
];
const WORK: [string, number, number][] = [
  ["Finding roles", 30, 1],
  ["Cover letters", 5, 1],
  ["Screening", 22, 0],
  ["Resumes", 9, 0],
];
const FIT: [string, number, number, number][] = [
  ["Supply Chain Product", 14, 38, 66],
  ["Solutions Consulting", 9, 27, 48],
  ["Supply Planning", 6, 22, 43],
  ["Startup Operations", 5, 8, 13],
];

export const StackedBar: Story = {
  name: "Stacked bar",
  render: () => (
    <Frame>
      <div className="grid grid-cols-2 gap-8">
        <Chart title="Automatic and requested" meta="by month" legend={[{ label: "Automatic", tone: "steel" }, { label: "You asked", tone: "blue" }]}>
          <Bars
            label="Automatic and requested, by month"
            height={182}
            points={SPLIT.map(([auto, you], i) => ({
              key: months[i],
              label: months[i],
              value: auto + you,
              display: money(auto + you),
              parts: [
                { label: "Automatic", value: auto, display: money(auto), tone: "steel" },
                { label: "You asked", value: you, display: money(you), tone: "blue" },
              ],
              explain: { title: months[i], detail: `${money(auto)} automatic, ${money(you)} you asked for.` },
            }))}
          />
        </Chart>
        <Chart title="Work" meta="done and failed" legend={[{ label: "Done", tone: "good" }, { label: "Failed", tone: "red" }]}>
          <BarList
            label="Work done and failed"
            labelWidth={92}
            valueWidth={24}
            rows={WORK.map(([k, done, failed]) => ({
              key: k,
              label: k,
              value: done + failed,
              display: String(done + failed),
              parts: [
                { label: "Done", value: done, display: String(done), tone: "good" },
                { label: "Failed", value: failed, display: String(failed), tone: "red" },
              ],
              explain: { title: k, detail: `${done} done, ${failed} failed.` },
            }))}
          />
        </Chart>
      </div>
      <Chart title="Roles by fit" meta="each direction, share of its roles" legend={[{ label: "Strong", tone: "good" }, { label: "Some", tone: "caution" }, { label: "Weak", tone: "track" }]}>
        <BarList
          label="Roles by fit"
          labelWidth={140}
          valueWidth={32}
          share
          rows={FIT.map(([d, strong, some, weak]) => ({
            key: d,
            label: d,
            value: strong + some + weak,
            display: String(strong + some + weak),
            parts: [
              { label: "Strong", value: strong, display: String(strong), tone: "good" },
              { label: "Some", value: some, display: String(some), tone: "caution" },
              { label: "Weak", value: weak, display: String(weak), tone: "track" },
            ],
            explain: { title: d, detail: `${strong} strong, ${some} some and ${weak} weak fits.` },
          }))}
        />
      </Chart>
    </Frame>
  ),
};

const WEEKS = ["Jun 2", "Jun 16", "Jun 30", "Jul 14", "Jul 28", "Aug 11", "Aug 25", "Sep 8", "Sep 22"];
const FOUND = [18, 31, 44, 64, 81, 98, 112, 131, 146];
const TARGETS = [4, 7, 10, 14, 17, 21, 25, 29, 32];
const FACTS = [0, 34, 70, 90, 109, 127, 145, 164, 212];

export const Line: Story = {
  render: () => (
    <Frame>
      <Chart title="Companies" meta="found and targets" legend={[{ label: "Found", tone: "steel" }, { label: "Targets", tone: "blue" }]}>
        <LineChart
          label="Companies found and targets"
          xLabels={WEEKS}
          series={[
            { key: "found", label: "Found", tone: "steel", values: FOUND },
            { key: "targets", label: "Targets", tone: "blue", values: TARGETS },
          ]}
          explain={(i) => ({ title: WEEKS[i], detail: `${FOUND[i]} companies found.`, note: `${TARGETS[i]} targets that fit your goals.` })}
        />
      </Chart>
      <Chart title="Facts approved" meta="since Jun 2">
        <LineChart label="Facts approved" height={96} xLabels={WEEKS} series={[{ key: "facts", label: "Facts approved", tone: "good", values: FACTS }]} explain={(i) => ({ title: WEEKS[i], detail: `${FACTS[i]} facts approved.` })} />
      </Chart>
    </Frame>
  ),
};

const DIRECTIONS = ["Supply Chain Product", "Solutions Consulting", "Startup Operations", "Supply Planning"];
const BY: [string, number[]][] = [
  ["Started", [5, 2, 1, 1]],
  ["Applied", [4, 1, 1, 1]],
  ["Interviewed", [2, 0, 1, 0]],
  ["Offer", [0, 0, 1, 0]],
];

export const FunnelStory: Story = {
  name: "Funnel",
  render: () => (
    <Frame>
      <Chart title="Pursuits" meta="all directions, since Jun 2">
        <Funnel
          label="Pursuits"
          steps={BY.map(([s, parts]) => {
            const n = parts.reduce((a, b) => a + b, 0);
            return { key: s, label: s, value: n, explain: { title: s, detail: `${n} pursuits.` } };
          })}
        />
      </Chart>
      <Chart title="Pursuits by direction" meta="since Jun 2" legend={DIRECTIONS.map((d, i) => ({ label: d, tone: CATEGORIES[i] }))}>
        <Funnel
          label="Pursuits by direction"
          outcome={false}
          steps={BY.map(([s, parts]) => ({
            key: s,
            label: s,
            value: parts.reduce((a, b) => a + b, 0),
            parts: parts.map((v, i) => ({ label: DIRECTIONS[i], value: v, display: String(v), tone: CATEGORIES[i] })),
            explain: { title: s, detail: parts.map((v, i) => `${DIRECTIONS[i]} ${v}`).join(", ") },
          }))}
        />
      </Chart>
    </Frame>
  ),
};

export const States: Story = {
  render: () => (
    <Frame>
      <Chart title="Hover">
        <BarList
          label="AI spending by task"
          rows={TASKS.slice(0, 3).map(([t, v]) => ({ key: t, label: t, value: v, display: money(v), explain: { title: t, detail: `${money(v)} this month, on 31 runs.`, note: "$2.51 of it was automatic." } }))}
        />
      </Chart>
      <div className="grid grid-cols-2 gap-8">
        <Chart title="Loading" loading />
        <Chart title="Empty" empty={{ title: "Nothing spent yet", line: "Spending shows here after the first AI call this month." }} />
      </div>
    </Frame>
  ),
  play: async () => {
    const rows = await within(document.body).findAllByRole("group", { name: "AI spending by task" });
    await userEvent.hover(rows[0].querySelector<HTMLElement>("[data-point]")!);
  },
};
