import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ReactNode } from "react";
import { BudgetMeter, BudgetNotice, CostAction, CostEstimate, PersonReveal } from "./CostEstimate";

const meta = { title: "Patterns/Cost", component: CostEstimate } satisfies Meta<typeof CostEstimate>;
export default meta;
type Story = StoryObj<typeof meta>;

const ai = "From your AI budget: $18.40 of $25 used in September.";
const apollo = "From your Apollo credits: 312 of 500 used in September.";

function Rows({ children }: { children: ReactNode }) {
  return <div className="flex w-141 max-w-full flex-col *:h-13 *:border-t *:first:border-t-0">{children}</div>;
}

// Actions that spend say about how much, right beside them. Hover the estimate (or focus the action) for the budget
// it counts against.
export const Estimates: Story = {
  args: { amount: "About $0.04" },
  render: () => (
    <Rows>
      <CostAction variant="primary" icon="resumes" amount="About $0.04" budget={ai} detail="Writes a resume for this role from your approved record.">
        Tailor a resume
      </CostAction>
      <CostAction icon="edit" amount="About $0.02" budget={ai} detail="Writes a cover letter for this role.">
        Write a letter
      </CostAction>
      <CostAction icon="tryAgain" amount="About 1 Apollo credit" budget={apollo} detail="Searches for new roles across your directions now instead of tonight.">
        Find roles now
      </CostAction>
      <CostAction icon="people" amount="Free" budget="Finding people doesn’t use credits; revealing an email does." detail="Finds hiring managers and recruiters at this company.">
        Find people
      </CostAction>
    </Rows>
  ),
};

// With the AI budget spent, the actions that need it are disabled with the reason, and say where to raise it. The ones
// that don't need it carry on.
export const BudgetReached: Story = {
  name: "Budget reached",
  args: Estimates.args,
  render: () => {
    const reached = {
      label: "AI budget reached",
      reason: "The AI budget for September is spent. Tailoring picks up on Oct 1, or now if you raise the budget.",
      onRaise: () => {},
    };
    return (
      <Rows>
        <CostAction variant="primary" icon="resumes" amount="About $0.04" reached={reached}>
          Tailor a resume
        </CostAction>
        <CostAction icon="edit" amount="About $0.02" reached={{ ...reached, reason: "The AI budget for September is spent. Letters pick up on Oct 1, or now if you raise the budget." }}>
          Write a letter
        </CostAction>
        <CostAction icon="people" amount="Free" budget="Finding people doesn’t use credits; revealing an email does." detail="Finds hiring managers and recruiters at this company.">
          Find people
        </CostAction>
      </Rows>
    );
  },
};

function Reveal() {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex w-141 max-w-full flex-col border *:border-t *:first:border-t-0">
      <PersonReveal
        name="Rafael Duarte"
        title="Head of Product"
        cost="1 credit · 188 left"
        note="Uses 1 Apollo credit; 188 left this month."
        email={revealed ? "rafael@loadstar.example.com" : undefined}
        loading={busy}
        onReveal={() => {
          setBusy(true);
          window.setTimeout(() => {
            setBusy(false);
            setRevealed(true);
          }, 800);
        }}
      />
      <PersonReveal name="Lena Marsh" title="Senior Recruiter, Product" cost="1 credit · 188 left" email="lena.marsh@loadstar.example.com" onReveal={() => {}} />
    </div>
  );
}

// Always your choice, one person at a time: the cost and what's left beside Reveal email, then the address.
export const RevealingAnEmail: Story = { name: "Revealing an email", args: Estimates.args, render: () => <Reveal /> };

// When a budget runs out, work pauses and says so.
export const Budgets: Story = {
  args: Estimates.args,
  render: () => (
    <div className="flex w-141 max-w-full flex-col gap-5">
      <BudgetNotice title="AI budget reached for September" detail="Tailoring and ranking pick up on Oct 1, or now if you raise the budget." onRaise={() => {}} />
      <div className="flex flex-col gap-3.5">
        <BudgetMeter label="AI" value={25} max={25} detail="$25.00 of $25" />
        <BudgetMeter label="Apollo" value={312} max={500} detail="312 of 500 credits" />
      </div>
    </div>
  ),
};
