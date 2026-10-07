import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { api } from "../../../convex/_generated/api";
import { answer, StoryConvex } from "../storyConvex";
import { CtaBand } from "./CtaBand";
import { CTA_BAND } from "./words";

// Home's call to action after the pains: large (the waitlist beside the heading; resize for medium, where it goes
// under), on a phone (one Get notified that takes you to the hero's form), and after joining.

const meta = { title: "Site/Parts/CTA band", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const joins = answer(api.waitlist.join, () => ({ ok: true as const }));

function Band({ joined = false }: { joined?: boolean }) {
  return (
    <StoryConvex answers={joins}>
      <CtaBand {...CTA_BAND} source="story" joined={joined} onJoined={() => {}} />
    </StoryConvex>
  );
}

export const Large: Story = { render: () => <Band /> };
export const Phone: Story = { globals: { viewport: { value: "mobile2" } }, render: () => <Band /> };
export const Joined: Story = { render: () => <Band joined /> };
export const JoinedPhone: Story = { name: "Joined, phone", globals: { viewport: { value: "mobile2" } }, render: () => <Band joined /> };
