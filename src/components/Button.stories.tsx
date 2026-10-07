import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";
import { ExternalLink } from "./ExternalLink";

const meta = { title: "Components/Button", component: Button } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

// Hover, press and focus held still for the specimen; the live buttons in every other cell react as usual.
const held: Record<"hover" | "active", Record<ButtonVariant, string>> = {
  hover: { primary: "bg-primary-hover!", secondary: "bg-border!", ghost: "bg-subtle!", destructive: "bg-red-hover!", outline: "bg-subtle!" },
  active: { primary: "bg-primary-active!", secondary: "bg-subtle-active!", ghost: "bg-border!", destructive: "bg-red-active!", outline: "bg-border!" },
};
const focus = "outline-2 outline-offset-1 outline-steel";

const rows: { name: string; variant: ButtonVariant; label?: string; loadingLabel?: string; icon?: "more" | "edit"; reason: string }[] = [
  { name: "Primary", variant: "primary", label: "Approve", loadingLabel: "Approving", reason: "Answer the open question first." },
  { name: "Secondary", variant: "secondary", label: "Edit", reason: "This fact is locked while it’s being read." },
  { name: "Ghost", variant: "ghost", label: "Not for me", reason: "You already passed on this role." },
  { name: "Destructive", variant: "destructive", label: "Delete story", loadingLabel: "Deleting", reason: "Remove it from the resume first." },
  { name: "Icon", variant: "ghost", icon: "more", reason: "Nothing else to do here." },
  { name: "Icon, secondary", variant: "secondary", icon: "edit", reason: "This fact is locked while it’s being read." },
];
const states = ["Default", "Hover", "Active", "Focus", "Disabled", "Loading"] as const;

function Cell({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 basis-0">{children}</div>;
}

export const VariantsAndStates: Story = {
  name: "Variants and states",
  render: () => (
    <div className="flex min-w-[900px] flex-col">
      <div className="flex h-7 items-center">
        <div className="w-[150px] shrink-0" />
        {states.map((s) => (
          <Cell key={s}>
            <span className="text-label leading-label text-muted">{s}</span>
          </Cell>
        ))}
      </div>
      {rows.map((r) => {
        const shared = { variant: r.variant, iconOnly: !r.label, icon: r.icon, "aria-label": r.label ? undefined : r.icon === "more" ? "More actions" : "Edit" };
        return (
          <div key={r.name} className="flex h-15 items-center border-t">
            <div className="w-[150px] shrink-0 text-body-sm leading-body-sm font-medium">{r.name}</div>
            <Cell>
              <Button {...shared}>{r.label}</Button>
            </Cell>
            <Cell>
              <Button {...shared} className={held.hover[r.variant]}>
                {r.label}
              </Button>
            </Cell>
            <Cell>
              <Button {...shared} className={held.active[r.variant]}>
                {r.label}
              </Button>
            </Cell>
            <Cell>
              <Button {...shared} className={focus}>
                {r.label}
              </Button>
            </Cell>
            <Cell>
              <Button {...shared} reason={r.reason}>
                {r.label}
              </Button>
            </Cell>
            <Cell>
              <Button {...shared} loading loadingLabel={r.loadingLabel}>
                {r.label}
              </Button>
            </Cell>
          </div>
        );
      })}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex items-center gap-3">
          <div className="flex w-24 shrink-0 gap-1.5 font-mono text-mono leading-mono">
            <span className="font-medium text-text">{size}</span>
            <span className="text-muted">{{ sm: "28", md: "32", lg: "44 touch" }[size]}</span>
          </div>
          <Button size={size} variant="primary">
            Approve
          </Button>
          <Button size={size} icon="edit">
            Edit
          </Button>
          <Button size={size} icon="more" iconOnly aria-label="More actions" />
        </div>
      ))}
    </div>
  ),
};

function Row({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="flex items-center gap-3">
      {children}
      <span className="text-body-sm leading-body-sm text-muted">{caption}</span>
    </div>
  );
}

export const Content: Story = {
  render: () => (
    <div className="flex flex-col gap-3.5">
      <Row caption="Label and key hint">
        <Button variant="primary" keys="A">
          Approve
        </Button>
      </Row>
      <Row caption="Icon and label">
        <Button icon="resumes">Tailor a resume</Button>
      </Row>
      <Row caption="Opens a menu">
        <Button variant="outline" iconEnd="expand">
          Interviewing
        </Button>
      </Row>
      <Row caption="Opens elsewhere">
        <ExternalLink href="https://loadstar.example.com/careers" label="Loadstar Systems careers, opens in a new tab">
          Loadstar Systems careers
        </ExternalLink>
      </Row>
      <Row caption="Icon only, always with a tooltip">
        <Button icon="thirdPane" iconOnly aria-label="Show details" keys="]" />
        <Button variant="ghost" icon="more" iconOnly aria-label="More actions" />
      </Row>
    </div>
  ),
};

export const Groups: Story = {
  render: () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-label leading-label font-medium text-muted">In a pane header</span>
        <div className="flex items-center gap-2">
          <Button variant="primary" keys="S">
            Start
          </Button>
          <Button icon="resumes">Tailor a resume</Button>
          <Button icon="ask" iconOnly aria-label="Ask about this role" />
          <Button variant="ghost" icon="more" iconOnly aria-label="More actions" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label leading-label font-medium text-muted">On a phone, pinned to the bottom</span>
        <div className="flex w-[358px] items-center gap-2 border-t px-4 py-3">
          <Button size="lg" variant="primary" className="flex-1">
            Approve
          </Button>
          <Button size="lg">Edit</Button>
          <Button size="lg" icon="more" iconOnly aria-label="More actions" />
        </div>
      </div>
    </div>
  ),
};

export const Explained: Story = {
  name: "With an explainer",
  render: () => (
    <div className="flex items-center gap-2">
      <Button variant="primary" keys="A" detail="Adds this fact to your record." note="Free · Undo with U">
        Approve
      </Button>
      <Button icon="tryAgain" detail="Looks for new openings at Loadstar Systems." note="About 1 Apollo credit">
        Find roles now
      </Button>
      <Button icon="resumes" reason="Add an OpenRouter key in Settings to write resumes.">
        Tailor a resume
      </Button>
    </div>
  ),
};
