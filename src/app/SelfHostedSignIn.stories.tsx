import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import type { NotAllowed } from "../../convex/allowlist";
import type { PasswordRefusal } from "../../convex/passwordRules";
import { SelfHostedScreen, type Start } from "./SelfHostedSignIn";

// The signed-out screen of a self-hosted copy (the Self-hosted — … boards on Self-hosting and getting started), large
// and on a phone: Create your account with the setup code, and with a setup code that didn't work; Sign in with a
// username and password only, and with Google and GitHub too; a wrong password; Forgot password?; Choose a new password
// after a temporary one; and a Google account the copy doesn't let in. The deployment's answers are made up here:
// setup code 7KQ4-M2XD, sam's password "correct horse", alex's temporary password maple-tide-4182.

const meta = {
  title: "Screens/Sign in, self-hosted",
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
const refusal = (reason: PasswordRefusal["reason"], message: string): PasswordRefusal => ({ kind: "password", reason, message });
const WRONG = refusal("wrongPassword", "That username and password don’t match. Try again, or reset your password.");
const refused: NotAllowed = { kind: "notAllowed", message: "This account can’t sign in to this copy. Ask its owner to add you.", email: "sam.rivera@example.com", provider: "google" };

function Screen({
  ownerNeeded = false,
  methods = ["password"],
  notAllowed = null,
  start,
}: {
  ownerNeeded?: boolean;
  methods?: string[];
  notAllowed?: NotAllowed | null;
  start?: Start;
}) {
  const [shown, setShown] = useState(notAllowed);
  const wait = () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 300);
    return promise;
  };
  return (
    <SelfHostedScreen
      methods={methods}
      ownerNeeded={ownerNeeded}
      notAllowed={shown}
      start={start}
      onOAuth={() => {}}
      onTryAnother={() => setShown(null)}
      onCreate={async ({ setupCode }) => {
        await wait();
        return setupCode.replace("-", "").toUpperCase() === "7KQ4M2XD" ? null : refusal("setupCode", "That setup code doesn’t work. Check it in the install’s output, or make a new one.");
      }}
      onSignIn={async ({ username, password }) => {
        await wait();
        if (username === "alex" && password === "maple-tide-4182") return refusal("newPasswordNeeded", "");
        return username === "sam" && password === "correct horse" ? null : WRONG;
      }}
      onNewPassword={async () => {
        await wait();
        return null;
      }}
    />
  );
}

const page = () => within(document.body);

export const CreateAccount: Story = { name: "Create your account", render: () => <Screen ownerNeeded /> };
export const CreateAccountPhone: Story = { name: "Create your account, phone", globals: phone, render: () => <Screen ownerNeeded /> };
export const CreateAccountWrongCode: Story = {
  name: "Create your account, setup code didn’t work",
  render: () => <Screen ownerNeeded />,
  play: async () => {
    await userEvent.type(await page().findByRole("textbox", { name: "Setup code" }), "7KQ4-M2XB");
    await userEvent.type(page().getByRole("textbox", { name: "Username" }), "sam");
    await userEvent.type(page().getByLabelText("Password"), "correct horse");
    await userEvent.type(page().getByLabelText("Confirm password"), "correct horse");
    await userEvent.click(page().getByRole("button", { name: "Create account" }));
    await page().findByText(/That setup code doesn’t work/);
  },
};

export const SignIn: Story = { name: "Sign in, password only", render: () => <Screen /> };
export const SignInPhone: Story = { name: "Sign in, password only, phone", globals: phone, render: () => <Screen /> };
export const SignInWithOAuth: Story = { name: "Sign in, with Google and GitHub", render: () => <Screen methods={["password", "google", "github"]} /> };
export const SignInWithOAuthPhone: Story = { name: "Sign in, with Google and GitHub, phone", globals: phone, render: () => <Screen methods={["password", "google", "github"]} /> };
export const WrongPassword: Story = { name: "Sign in, wrong password", render: () => <Screen start={{ view: "signIn", username: "sam", refusal: WRONG }} /> };
export const WrongPasswordPhone: Story = { name: "Sign in, wrong password, phone", globals: phone, render: () => <Screen start={{ view: "signIn", username: "sam", refusal: WRONG }} /> };

export const Forgot: Story = { name: "Forgotten password", render: () => <Screen start={{ view: "forgot", username: "sam" }} /> };
export const ForgotPhone: Story = { name: "Forgotten password, phone", globals: phone, render: () => <Screen start={{ view: "forgot", username: "sam" }} /> };

export const ChooseNewPassword: Story = {
  name: "Choose a new password",
  render: () => <Screen />,
  play: async () => {
    await userEvent.type(await page().findByRole("textbox", { name: "Username" }), "alex");
    await userEvent.type(page().getByLabelText("Password"), "maple-tide-4182");
    await userEvent.click(page().getByRole("button", { name: "Sign in" }));
    await page().findByRole("heading", { name: "Choose a new password" });
  },
};
export const ChooseNewPasswordPhone: Story = { name: "Choose a new password, phone", globals: phone, render: () => <Screen start={{ view: "newPassword", username: "alex", password: "maple-tide-4182" }} /> };

export const NotLetIn: Story = { name: "Google account not let in", render: () => <Screen methods={["password", "google"]} notAllowed={refused} /> };
