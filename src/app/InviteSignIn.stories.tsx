import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import type { NotAllowed } from "../../convex/allowlist";
import { type Invite, InviteScreen } from "./InviteSignIn";

// careerbot.dev's invite link, large and on a phone: the invite (what the beta is, what's included, Google and
// GitHub); the same link once it expired, was withdrawn or used, or when it's no invite's; and after signing in with
// another account than the invited one, or a suspended one. (Getting started, after signing in, is in
// Screens/Getting started.)

const meta = {
  title: "Screens/Invite",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="-m-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: "mobile2" } };
const open: Invite = { state: "open", email: "sam.rivera@example.com", expiresAt: Date.UTC(2026, 9, 27), allowanceUsd: 5 };
const refused = (reason: NotAllowed["reason"], email: string | null): NotAllowed => ({ kind: "notAllowed", reason, message: "", email, provider: "google" });

function Screen({ invite = open, notAllowed = null }: { invite?: Invite; notAllowed?: NotAllowed | null }) {
  const [shown, setShown] = useState(notAllowed);
  return <InviteScreen invite={invite} notAllowed={shown} methods={["google", "github"]} onSignIn={() => {}} onTryAnother={() => setShown(null)} />;
}

export const Invited: Story = { name: "Invite", render: () => <Screen /> };
export const InvitedPhone: Story = { name: "Invite, phone", globals: phone, render: () => <Screen /> };
export const InvitedOwnKey: Story = { name: "Invite, no AI included", render: () => <Screen invite={{ ...open, allowanceUsd: null }} /> };
export const Expired: Story = { name: "Expired", render: () => <Screen invite={{ ...open, state: "expired" }} /> };
export const Withdrawn: Story = { name: "Withdrawn", render: () => <Screen invite={{ ...open, state: "revoked" }} /> };
export const Used: Story = { name: "Used", render: () => <Screen invite={{ ...open, state: "accepted" }} /> };
export const Unknown: Story = { name: "Link doesn’t work", render: () => <Screen invite={{ state: "unknown", email: null, expiresAt: null, allowanceUsd: 5 }} /> };
export const WrongAccount: Story = { name: "Another account", render: () => <Screen notAllowed={refused("notInvited", "sam@work.example")} /> };
export const WrongAccountPhone: Story = { name: "Another account, phone", globals: phone, render: () => <Screen notAllowed={refused("notInvited", "sam@work.example")} /> };
export const Suspended: Story = { name: "Suspended", render: () => <Screen notAllowed={refused("suspended", "sam.rivera@example.com")} /> };
