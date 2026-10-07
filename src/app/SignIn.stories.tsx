import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { api } from "../../convex/_generated/api";
import type { NotAllowed } from "../../convex/allowlist";
import { SignInScreen } from "./SignIn";
import { answer, StoryConvex } from "./storyConvex";

// The signed-out screen, large and on a phone; the same screen after an account that isn't invited came back from
// Google (the waitlist with its email filled in, or another account), without an email, and after joining from it;
// and when sign-in didn't work. Joining is answered here instead of by a deployment. (Getting started, after signing
// in, is in Screens/Getting started.)

const meta = {
  title: "Screens/Sign in",
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
const joins = answer(api.waitlist.join, () => ({ ok: true as const }));
const refused: NotAllowed = { kind: "notAllowed", message: "This account isn't allowed to sign in.", email: "sam.rivera@example.com", provider: "google" };

function Screen({ notAllowed = null, failed = false }: { notAllowed?: NotAllowed | null; failed?: boolean }) {
  const [shown, setShown] = useState(notAllowed);
  return (
    <StoryConvex answers={joins}>
      <SignInScreen notAllowed={shown} methods={["google", "github"]} failed={failed} onSignIn={() => {}} onTryAnother={() => setShown(null)} />
    </StoryConvex>
  );
}

export const SignIn: Story = { name: "Sign in", render: () => <Screen /> };
export const SignInPhone: Story = { name: "Sign in, phone", globals: phone, render: () => <Screen /> };

export const NotInvited: Story = { name: "Not invited", render: () => <Screen notAllowed={refused} /> };
export const NotInvitedPhone: Story = { name: "Not invited, phone", globals: phone, render: () => <Screen notAllowed={refused} /> };
export const NotInvitedNoEmail: Story = { name: "Not invited, no email", render: () => <Screen notAllowed={{ ...refused, email: null }} /> };
export const NotInvitedJoined: Story = {
  name: "Not invited, joined",
  render: () => <Screen notAllowed={refused} />,
  play: async () => {
    const page = within(document.body);
    const [button] = await page.findAllByRole("button", { name: "Get notified" });
    await userEvent.click(button);
    await page.findAllByText(/^You’re on the list/);
  },
};

export const Failed: Story = { name: "Sign-in didn’t work", render: () => <Screen failed /> };
