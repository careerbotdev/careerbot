import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { ConfirmDialog } from "@/components/Dialog";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../storyConvex";
import { accountFixtures } from "./accountFixtures";
import { compareFixtures } from "./compareFixtures";
import { settingsFixtures } from "./fixtures";
import { Settings } from "./Settings";
import { type UpdateState, updateFixtures } from "./updateFixtures";
import { type YourDataState, yourDataFixtures } from "./yourDataFixtures";

// The Settings screen with fixture data, one story per board of the Settings page: each section, AI with Advanced open
// and choosing a model for a task, Compare models (its last comparison, a read, insights by three models), Keys
// replacing a key and asking before removing one; and Account on a self-hosted copy (Settings — Account, self-hosted on
// Self-hosting and getting started): the owner's People, adding a person, resetting a password and the temporary
// password, removing someone, changing your password, with Google and GitHub set up, and someone who isn't the owner;
// and its owner's Updates (the Releases boards): a new version with steps to read first, up to date, not checked yet,
// and the check off; and Your data (the Your data boards): export ready, running and done, import in a workspace that
// isn't empty, the place to choose a file, a file's preview, importing, done and stopped partway, and each file it
// refuses.
// Resize the window for medium (768 to 1279) and the phone (under 768), where the sections list comes first
// ("Sections").

type SelfHosted = { oauth?: boolean; owner?: boolean; updates?: UpdateState };

function Fixture({ query = "", drive = true, selfHosted, yourData }: { query?: string; drive?: boolean; selfHosted?: SelfHosted; yourData?: YourDataState }) {
  const [answers] = useState(() => ({
    ...settingsFixtures({ drive }),
    ...compareFixtures(),
    ...(selfHosted ? accountFixtures(selfHosted) : {}),
    ...(selfHosted?.updates ? updateFixtures(selfHosted.updates) : {}),
    ...(yourData ? yourDataFixtures(yourData) : {}),
  }));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/settings" query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <Settings signOut={() => {}} selfHosted={!!selfHosted} />
            </div>
            <Asked />
          </div>
        </StoryRouter>
      </StoryConvex>
    </ShellProvider>
  );
}

// What the shell shows for a screen: its bar on a phone, and the question before something is deleted (the dialog on
// medium screens and up, the bar on a phone).
function Asked() {
  const small = useScreenSize() === "small";
  const { bar, asked } = useShellState();
  if (small) {
    const mode = asked
      ? { kind: "confirm" as const, message: asked.title, detail: typeof asked.body === "string" ? asked.body : undefined, confirmLabel: asked.confirmLabel, onConfirm: () => asked.answer(true), onCancel: () => asked.answer(false) }
      : bar;
    return mode ? <BottomBar mode={mode} /> : null;
  }
  return (
    <ConfirmDialog
      open={!!asked}
      onOpenChange={(open) => !open && asked?.answer(false)}
      title={asked?.title ?? ""}
      body={asked?.body}
      confirmLabel={asked?.confirmLabel ?? ""}
      onConfirm={() => asked?.answer(true)}
    />
  );
}

const meta = { title: "Screens/Settings", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = () => within(document.body);

export const Sections: Story = { name: "Sections (phone)", render: () => <Fixture /> };
export const Account: Story = { render: () => <Fixture query="section=account" /> };

const own = (selfHosted: SelfHosted = {}) => <Fixture query="section=account" selfHosted={selfHosted} />;
export const AccountSelfHosted: Story = { name: "Account, self-hosted", render: () => own() };
export const AccountSelfHostedOAuth: Story = { name: "Account, self-hosted, with Google and GitHub", render: () => own({ oauth: true }) };
export const AccountSelfHostedNotOwner: Story = { name: "Account, self-hosted, not the owner", render: () => own({ owner: false }) };

export const AccountAddPerson: Story = {
  name: "Account, self-hosted, add a person",
  render: () => own(),
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Add a person" }));
    await userEvent.type(await page().findByRole("textbox", { name: "Username" }), "maya");
    await userEvent.click((await page().findAllByRole("button", { name: "Add a person" })).at(-1)!);
    await page().findByText("Temporary password for maya");
  },
};

export const AccountResetPassword: Story = {
  name: "Account, self-hosted, reset password",
  render: () => own(),
  play: async () => {
    const reset = page().queryByRole("button", { name: "Reset password" });
    if (reset) await userEvent.click(reset);
    else {
      await userEvent.click(await page().findByRole("button", { name: "More for alex" }));
      await userEvent.click(await page().findByText("Reset password"));
    }
    await page().findByText("Temporary password for alex");
  },
};

export const AccountRemovePerson: Story = {
  name: "Account, self-hosted, remove someone",
  render: () => own(),
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "More for alex" }));
    await userEvent.click(await page().findByText("Remove"));
  },
};

export const AccountChangePassword: Story = {
  name: "Account, self-hosted, change password",
  render: () => own(),
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Change password" }));
  },
};
export const Ai: Story = { name: "AI", render: () => <Fixture query="section=ai" /> };

export const AiAdvanced: Story = {
  name: "AI, Advanced",
  render: () => <Fixture query="section=ai" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: /Advanced/ }));
  },
};

export const AiChooseForTask: Story = {
  name: "AI, choose for a task",
  render: () => <Fixture query="section=ai" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: /Advanced/ }));
    await userEvent.click(await page().findByRole("button", { name: "Choose for a task" }));
  },
};

export const Compare: Story = { name: "AI, Compare models", render: () => <Fixture query="section=ai&compare=1" /> };

export const CompareRead: Story = {
  name: "AI, Compare models, a read",
  render: () => <Fixture query="section=ai&compare=1" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: /Reading “Kettle & Crane Brewing”/ }));
  },
};

export const CompareInsights: Story = {
  name: "AI, Compare models, insights with three models",
  render: () => <Fixture query="section=ai&compare=1" />,
  play: async () => {
    await userEvent.click(await page().findByRole("radio", { name: "Insights" }));
    await userEvent.click(await page().findByRole("button", { name: /^Insights/ }));
  },
};

export const Budgets: Story = { name: "Budgets and spending", render: () => <Fixture query="section=budgets" /> };
export const Keys: Story = { render: () => <Fixture query="section=keys" /> };

export const KeysReplacing: Story = {
  name: "Keys, replacing",
  render: () => <Fixture query="section=keys" />,
  play: async () => {
    const openRouter = within(await page().findByRole("region", { name: "OpenRouter" }));
    await userEvent.click(openRouter.getByRole("button", { name: "Replace" }));
    await userEvent.keyboard("sk-or-v1-8d2c61b0e7f4");
  },
};

export const KeysRemove: Story = {
  name: "Keys, remove",
  render: () => <Fixture query="section=keys" />,
  play: async () => {
    const apollo = within(await page().findByRole("region", { name: "Apollo" }));
    await userEvent.click(apollo.getByRole("button", { name: "Remove" }));
  },
};

export const Companies: Story = { render: () => <Fixture query="section=companies" /> };
export const Reminders: Story = { render: () => <Fixture query="section=reminders" /> };
export const Contact: Story = { name: "Contact and GitHub", render: () => <Fixture query="section=contact" /> };
export const Drive: Story = { name: "Google Drive", render: () => <Fixture query="section=drive" /> };
export const DriveNotConnected: Story = { name: "Google Drive, not connected", render: () => <Fixture query="section=drive" drive={false} /> };

export const DriveDisconnect: Story = {
  name: "Google Drive, disconnect",
  render: () => <Fixture query="section=drive" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Disconnect" }));
  },
};

const updates = (state: UpdateState) => <Fixture query="section=updates" selfHosted={{ updates: state }} />;
export const UpdatesOut: Story = { name: "Updates, a new version", render: () => updates("out") };
export const UpdatesCurrent: Story = { name: "Updates, up to date", render: () => updates("current") };
export const UpdatesUnchecked: Story = { name: "Updates, not checked yet", render: () => updates("unchecked") };
export const UpdatesOff: Story = { name: "Updates, not checking", render: () => updates("off") };

const phone = { viewport: { value: "mobile2" } };
const yourData = (state: YourDataState) => <Fixture query="section=yourdata" yourData={state} />;
export const YourDataReady: Story = { name: "Your data, export", render: () => yourData("ready") };
export const YourDataExporting: Story = { name: "Your data, exporting", render: () => yourData("exporting") };
export const YourDataExported: Story = { name: "Your data, exported", render: () => yourData("exported") };
export const YourDataNotEmpty: Story = { name: "Your data, import, workspace not empty", render: () => yourData("notEmpty") };
export const YourDataEmpty: Story = { name: "Your data, import", render: () => yourData("empty") };
export const YourDataPreview: Story = { name: "Your data, import preview", render: () => yourData("preview") };
export const YourDataImporting: Story = { name: "Your data, importing", render: () => yourData("importing") };
export const YourDataImported: Story = { name: "Your data, imported", render: () => yourData("imported") };
export const YourDataStopped: Story = { name: "Your data, import stopped partway", render: () => yourData("stopped") };
export const YourDataNewer: Story = { name: "Your data, file from a newer CareerBot", render: () => yourData("newer") };
export const YourDataWrongFile: Story = { name: "Your data, not an export", render: () => yourData("wrongFile") };
export const YourDataTooLarge: Story = { name: "Your data, file too large", render: () => yourData("tooLarge") };
export const YourDataReadyPhone: Story = { name: "Your data, export, phone", globals: phone, render: () => yourData("ready") };
export const YourDataPreviewPhone: Story = { name: "Your data, import preview, phone", globals: phone, render: () => yourData("preview") };
export const YourDataImportingPhone: Story = { name: "Your data, importing, phone", globals: phone, render: () => yourData("importing") };
