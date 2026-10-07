import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { FilterBar, FilterChip, FilterOptions, type Filter } from "./FilterBar";
import { List, ListRow } from "./ListRow";
import { ScoreBadge } from "./ScoreBadge";

const meta = { title: "Patterns/Filters", component: FilterBar } satisfies Meta<typeof FilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

const choices = {
  direction: { label: "Direction", multiple: false, options: ["Supply Chain Product", "Solutions Consulting", "Supply Planning"] },
  fit: { label: "Fit", multiple: true, options: ["Strong", "Some", "Weak"] },
  location: { label: "Location", multiple: true, options: ["Remote, US", "Pittsburgh", "Chicago", "Columbus"] },
  pay: { label: "Pay", multiple: false, options: ["$135k and up", "$160k and up", "$190k and up"] },
  company: { label: "Company", multiple: true, options: ["Loadstar Systems", "Meridian Coldchain", "Orchard Forecasting", "Lumen Planning", "Fernhill Foods"] },
  posted: { label: "Posted", multiple: false, options: ["Today", "This week", "This month"] },
};
type Key = keyof typeof choices;

// Filters sit as chips under the tabs and say how many match. Each chip edits in place; "+ Filter" adds one; Clear
// removes them all. On phones every chip and the "+ Filter" list open as sheets.
export const FilterBarStory: Story = {
  name: "Filter bar",
  args: { filters: [] },
  render: function Render() {
    const [set, setSet] = useState<Record<Key, string[]>>({ direction: ["Supply Chain Product"], fit: ["Strong", "Some"], location: [], pay: [], company: [], posted: [] });
    const filters: Filter[] = (Object.keys(choices) as Key[]).map((key) => {
      const c = choices[key];
      return {
        id: key,
        label: c.label,
        value: set[key].length ? set[key].join(", ") : undefined,
        onClear: () => setSet((s) => ({ ...s, [key]: [] })),
        editor: (
          <FilterOptions
            label={c.label}
            multiple={c.multiple}
            options={c.options.map((o) => ({ value: o, label: o }))}
            selected={set[key]}
            onChange={(next) => setSet((s) => ({ ...s, [key]: next }))}
          />
        ),
      };
    });
    const active = Object.values(set).filter((v) => v.length).length;
    return (
      <div className="flex max-w-[566px] flex-col border border-border">
        <FilterBar
          filters={filters}
          matches={{ shown: [412, 124, 38, 21, 9, 4, 2][active] ?? 1, total: 412 }}
          onClearAll={() => setSet({ direction: [], fit: [], location: [], pay: [], company: [], posted: [] })}
        />
        <List label="Roles" className="p-1">
          <ListRow lead={<ScoreBadge score={91} level="strong" />} title="Senior Product Manager, Load Planning" line="Loadstar Systems · Remote, US" />
          <ListRow lead={<ScoreBadge score={86} level="strong" />} title="Product Manager, Carrier Network" line="Loadstar Systems · Columbus or remote" />
        </List>
      </div>
    );
  },
};

// One chip on its own; its editor lists counts beside each choice.
export const Chip: Story = {
  args: { filters: [] },
  render: function Render() {
    const [fit, setFit] = useState(["Strong", "Some"]);
    return (
      <div className="h-56">
        <FilterChip label="Fit" value={fit.length ? fit.join(", ") : undefined} onRemove={() => setFit([])}>
          <FilterOptions
            label="Fit"
            options={[
              { value: "Strong", label: "Strong", count: 24 },
              { value: "Some", label: "Some", count: 14 },
              { value: "Weak", label: "Weak", count: 374 },
            ]}
            selected={fit}
            onChange={setFit}
          />
        </FilterChip>
      </div>
    );
  },
};
