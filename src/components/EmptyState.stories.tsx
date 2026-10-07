import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Kbd } from "./Kbd";

const meta = { title: "Components/EmptyState", component: EmptyState } satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

function Pane({ children }: { children: ReactNode }) {
  return <div className="h-[300px] min-w-0 flex-1 border border-border bg-surface">{children}</div>;
}

// First use, all done, filtered to nothing, nothing selected.
export const Variants: Story = {
  args: { icon: "companies", title: "No companies yet" },
  render: () => (
    <div className="flex flex-wrap gap-3 *:basis-[240px]">
      <Pane>
        <EmptyState icon="companies" title="No companies yet" action={<Button variant="primary">Set your directions</Button>}>
          Companies worth wanting collect here once your directions are set.
        </EmptyState>
      </Pane>
      <Pane>
        <EmptyState icon="review" title="Nothing to review" action={<Button>Open Pursuits</Button>}>
          New facts, roles and updates arrive here.
        </EmptyState>
      </Pane>
      <Pane>
        <EmptyState icon="filter" title="No roles match" action={<Button variant="ghost">Clear filters</Button>}>
          Supply Chain Product, remote, $135k and up.
        </EmptyState>
      </Pane>
      <Pane>
        <EmptyState
          icon="pursuits"
          title="Pick a role"
          action={
            <p className="flex items-center gap-1.5 text-body-sm leading-body-sm text-muted">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd>
              to move
              <Kbd>↵</Kbd>
              to open
            </p>
          }
        >
          It opens here.
        </EmptyState>
      </Pane>
    </div>
  ),
};
