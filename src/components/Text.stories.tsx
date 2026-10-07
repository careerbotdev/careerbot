import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { ScoreBadge } from "./ScoreBadge";
import { Heading, Text } from "./Text";

const meta = { title: "Components/Text", component: Text } satisfies Meta<typeof Text>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Typefaces: Story = {
  args: { children: "Aa" },
  render: () => (
    <div className="flex gap-4">
      <div className="flex h-[300px] flex-1 flex-col justify-between rounded-sm bg-subtle p-8">
        <span className="text-[140px] leading-[120px] font-semibold tracking-[-0.04em] text-text">Aa</span>
        <div className="flex items-end justify-between">
          <Text size="row-title">Inter</Text>
          <Text size="mono" muted className="font-normal">
            Regular 400 · Medium 500 · Semibold 600
          </Text>
        </div>
      </div>
      <div className="flex h-[300px] w-[420px] flex-col justify-between rounded-sm bg-inverse p-8 dark:border">
        <span className="font-mono text-[80px] leading-[80px] font-medium text-inverse-text">⌘K</span>
        <div className="flex items-end justify-between">
          <span className="text-row-title leading-row-title font-medium text-inverse-text">JetBrains Mono</span>
          <span className="font-mono text-mono leading-mono text-inverse-muted">Keys · codes · IDs</span>
        </div>
      </div>
    </div>
  ),
};

function Style({ name, spec, use, children }: { name: string; spec: string; use: string; children: ReactNode }) {
  return (
    <div className="flex min-h-15 items-center gap-6 border-t py-3">
      <Text size="mono" className="w-40 shrink-0">
        {name}
      </Text>
      <div className="min-w-0 flex-1">{children}</div>
      <Text size="mono" muted className="w-44 shrink-0 font-normal">
        {spec}
      </Text>
      <Text size="sm" muted className="w-72 shrink-0">
        {use}
      </Text>
    </div>
  );
}

export const Scale: Story = {
  args: { children: "Scale" },
  render: () => (
    <div className="flex min-w-[1000px] flex-col">
      <Style name="display" spec="28 / 36 · 600 · -0.02em" use="Today’s date, sign-in and Getting started. Once per screen, never inside a pane.">
        <Heading size="display">Monday, September 28</Heading>
      </Style>
      <Style name="title-lg" spec="20 / 28 · 600 · -0.01em" use="The item’s title in the item pane. Dialog titles.">
        <Heading size="lg">Senior Product Manager, Load Planning</Heading>
      </Style>
      <Style name="title-md" spec="16 / 22 · 600" use="Pane titles, section heads, review card heads.">
        <Heading size="md">Pursuits</Heading>
      </Style>
      <Style name="body-md" spec="14 / 20 · 400" use="Everything you read: postings, facts, resume lines, answers.">
        <Text>Opened the Ohio Valley cross-dock and planned its first 40 lanes.</Text>
      </Style>
      <Style name="body-md medium" spec="14 / 20 · 500" use="Row titles and emphasis inside reading text.">
        <Text size="row-title">Solutions Engineer, Manufacturing</Text>
      </Style>
      <Style name="body-sm" spec="13 / 18 · 400" use="Meta lines, secondary text, sidebar and menus (500 for nav).">
        <Text size="sm">Lumen Planning · Remote, US · posted 2 days ago</Text>
      </Style>
      <Style name="label" spec="12 / 16 · 500" use="Buttons, tags, field labels and counts.">
        <Text size="label">Tailor a resume</Text>
      </Style>
      <Style name="label-caps" spec="12 / 16 · 500 · +0.04em" use="Group labels in lists and section eyebrows. Uppercase.">
        <Text size="label-caps">Next step</Text>
      </Style>
      <Style name="mono" spec="JetBrains Mono · 12 / 16 · 500" use="Key hints, API keys, IDs and code.">
        <Text size="mono">⌘K sk-or-v1-…4f2a</Text>
      </Style>
    </div>
  ),
};

export const Hierarchy: Story = {
  name: "Hierarchy in a pane",
  args: { children: "Hierarchy" },
  render: () => (
    <div className="flex max-w-[606px] flex-col gap-5 rounded-sm border bg-surface p-8">
      <div className="flex items-start gap-3.5">
        <ScoreBadge score={91} level="strong" size="lg" />
        <div className="flex flex-col gap-0.5">
          <Heading>Senior Product Manager, Load Planning</Heading>
          <Text size="sm" muted>
            Loadstar Systems · Remote, US · $165k–$205k
          </Text>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-l-2 border-caution pl-3.5">
        <Text size="label-caps" muted>
          Next step
        </Text>
        <Text className="font-semibold">Panel interview, Thursday Oct 1 at 10:00</Text>
        <Text size="sm" muted>
          With Rafael Duarte, Head of Product, and two senior engineers.
        </Text>
      </div>
      <Text className="max-w-[520px]">
        Loadstar builds the transportation management software dispatchers and planners work in all day. You moved 180 of them onto a new system at
        Ironbridge and wrote your own load planner for Brightwater’s docks.
      </Text>
    </div>
  ),
};

const money = ["$1,111.11", "$808.80", "$41.14", "$999.99"];

function Rule({ tone, label, children }: { tone: "good" | "red"; label: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 border-t pt-3 ${tone === "good" ? "border-good" : "border-red"}`}>
      <Text size="label" className={tone === "good" ? "text-good-text" : "text-red dark:text-text"}>
        {label}
      </Text>
      <Text size="sm">{children}</Text>
    </div>
  );
}

export const NumbersAndLineLength: Story = {
  name: "Numbers and line length",
  args: { children: "Numbers" },
  render: () => (
    <div className="flex min-w-[1000px] items-start gap-4">
      {[true, false].map((tabular) => (
        <div key={String(tabular)} className="flex w-[234px] shrink-0 flex-col gap-3">
          <div className="flex flex-col items-end rounded-sm border px-6 py-5">
            {money.map((m) => (
              <Text key={m} tabular={tabular} className={tabular ? "" : "[font-variant-numeric:proportional-nums]"}>
                {m}
              </Text>
            ))}
          </div>
          {tabular ? (
            <Rule tone="good" label="Do">
              Tabular figures for scores, counts, money and dates in columns.
            </Rule>
          ) : (
            <Rule tone="red" label="Don’t">
              Proportional figures where numbers stack.
            </Rule>
          )}
        </div>
      ))}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="rounded-sm border px-6 py-5">
          <div className="flex max-w-[640px] justify-between border-b border-steel pb-2 font-mono text-mono leading-mono font-normal text-muted">
            <span>640px</span>
            <span>≈ 75 characters</span>
          </div>
          <Text measure className="pt-3">
            The night we opened the Ohio Valley cross-dock, half the trailers showed up in the wrong order and I rebuilt the door plan by hand until six in
            the morning. By the end of that first month all forty lanes ran on time, and the planners had stopped calling me at home on the
            weekends.
          </Text>
        </div>
        <Rule tone="good" label="Do">
          Keep long reading text (a story, a posting, a resume) to about 640px inside its pane, even on a wide screen.
        </Rule>
      </div>
    </div>
  ),
};
