import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { List, ListRow } from "./ListRow";
import { LoadMore, Pagination } from "./Pagination";
import { ScoreBadge } from "./ScoreBadge";
import { StatusTag } from "./StatusTag";

const meta = { title: "Components/Pagination", component: Pagination } satisfies Meta<typeof Pagination>;
export default meta;
type Story = StoryObj<typeof meta>;

const northgate = (
  <ListRow
    lead={<ScoreBadge score={72} level="some" />}
    title="Distribution Operations Manager"
    line="Northgate Grocers · Cleveland, OH"
    tag={<StatusTag tone="info">Applied</StatusTag>}
    meta="Sent Sep 18"
  />
);
const parcelpoint = (
  <ListRow
    lead={<ScoreBadge score={64} level="some" />}
    title="Head of Operations"
    line="Parcelpoint · Philadelphia or remote"
    tag={<StatusTag tone="good">Offer</StatusTag>}
    meta="Reply by Oct 2"
  />
);

// Long lists load forty at a time as you reach the end, with a button for keyboards: more to show, loading, and
// everything in.
export const LoadMoreStates: Story = {
  name: "Load more",
  args: { shown: 40, total: 412, onMore: () => {} },
  render: () => (
    <div className="flex max-w-[566px] flex-col gap-4">
      <div className="flex flex-col border border-border">
        <List label="Roles">
          {northgate}
          {parcelpoint}
        </List>
        <Pagination shown={40} total={412} onMore={() => {}} />
      </div>
      <div className="flex flex-col border border-border">
        <List label="Roles">{parcelpoint}</List>
        <Pagination shown={80} total={412} loading onMore={() => {}} />
      </div>
      <Pagination shown={412} total={412} onMore={() => {}} />
    </div>
  ),
};

const titles = ["Product Manager", "Solutions Consultant", "Solutions Engineer", "Supply Planning Manager", "Network Planner", "Operations Lead"];
const places = ["Loadstar Systems · Remote, US", "Meridian Coldchain · Chicago, IL", "Orchard Forecasting · Pittsburgh or remote", "Northgate Grocers · Cleveland, OH", "Parcelpoint · Philadelphia or remote"];

// Scroll to the end of the pane and the next page loads by itself.
export const Live: Story = {
  args: { shown: 40, total: 412, onMore: () => {} },
  render: function Render() {
    const total = 132;
    const [shown, setShown] = useState(40);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
      if (!loading) return;
      const t = setTimeout(() => {
        setShown((s) => Math.min(s + 40, total));
        setLoading(false);
      }, 800);
      return () => clearTimeout(t);
    }, [loading]);
    return (
      <div className="flex h-[480px] max-w-[566px] flex-col overflow-auto border border-border">
        <List label="Roles">
          {Array.from({ length: shown }, (_, i) => (
            <ListRow
              key={i}
              lead={<ScoreBadge score={92 - (i % 40)} level={92 - (i % 40) >= 80 ? "strong" : "some"} />}
              title={`${titles[i % titles.length]}, ${["Load Planning", "Demand Planning", "Food & Beverage", "Manufacturing"][i % 4]}`}
              line={places[i % places.length]}
            />
          ))}
        </List>
        <LoadMore shown={shown} total={total} loading={loading} onMore={() => setLoading(true)} />
      </div>
    );
  },
};
