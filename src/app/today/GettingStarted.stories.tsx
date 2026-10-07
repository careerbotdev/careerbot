import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { BottomBar } from "@/components/BottomBar";
import { useScreenSize } from "@/components/Panes";
import { installTalkFake, talkFake } from "@/components/talkFake";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { StoryConvex, StoryRouter } from "../storyConvex";
import { type Stage, gettingStartedFixtures } from "./fixtures";
import { Today } from "./Today";

// Getting started on Today, at each stage: Setup at its OpenRouter key, its first story, its Apollo key (large and on
// a phone, the list and the step) and Google Drive; then your first pursuit starting, choosing a path, on the Outreach
// path (the outreach message to send, with Apply too), on the Apply path (applying, with Outreach too), following up
// after each, and all done. On a phone the list shows alone until a step is opened (?step=), and the step's main action
// sits in the bottom bar. Start, the path check boxes, Outreach too and Apply too, Mark Applied, Skip and Hide until
// later work as they would.

function Screen({ stage, step }: { stage: Stage; step?: string }) {
  const [answers] = useState(() => gettingStartedFixtures(stage));
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path="/" query={step ? `step=${step}` : ""}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <Today />
            </div>
            <Bar />
          </div>
        </StoryRouter>
      </StoryConvex>
    </ShellProvider>
  );
}

function Bar() {
  const small = useScreenSize() === "small";
  const { bar } = useShellState();
  return small && bar ? <BottomBar mode={bar} /> : null;
}

const meta = { title: "Screens/Getting started", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: "mobile2" } };

export const KeyAndBudget: Story = { name: "Setup, key and budget", render: () => <Screen stage="key" /> };
export const KeyAndBudgetPhone: Story = { name: "Setup, key and budget, phone", globals: phone, render: () => <Screen stage="key" step="key" /> };
export const FirstStory: Story = { name: "Setup, first story", render: () => <Screen stage="story" /> };
export const FirstStoryPhone: Story = { name: "Setup, first story, phone", globals: phone, render: () => <Screen stage="story" step="story" /> };
export const SetupInProgress: Story = { name: "Setup in progress", render: () => <Screen stage="apollo" /> };
export const SetupInProgressPhone: Story = { name: "Setup in progress, phone", globals: phone, render: () => <Screen stage="apollo" /> };
export const ApolloPhone: Story = { name: "Setup, Apollo key, phone", globals: phone, render: () => <Screen stage="apollo" step="apollo" /> };
export const Drive: Story = { name: "Setup, Google Drive", render: () => <Screen stage="drive" /> };
export const PursuitStarting: Story = { name: "First pursuit starting", render: () => <Screen stage="starting" /> };
export const PursuitStartingPhone: Story = { name: "First pursuit starting, phone", globals: phone, render: () => <Screen stage="starting" /> };
export const SetupOpened: Story = { name: "First pursuit, Setup opened", render: () => <Screen stage="starting" step="drive" /> };
export const ChoosingPath: Story = { name: "Choose a path", render: () => <Screen stage="choosing" /> };
export const ChoosingPathPhone: Story = { name: "Choose a path, phone", globals: phone, render: () => <Screen stage="choosing" step="path" /> };
export const OutreachPath: Story = { name: "Outreach path, message to send", render: () => <Screen stage="outreach" /> };
export const OutreachPathPhone: Story = { name: "Outreach path, message to send, phone", globals: phone, render: () => <Screen stage="outreach" step="message" /> };
export const ApplyToo: Story = { name: "Outreach path, Apply too", render: () => <Screen stage="outreach" step="applyPath" /> };
export const ApplyPath: Story = { name: "Apply path, to apply", render: () => <Screen stage="apply" /> };
export const ApplyPathPhone: Story = { name: "Apply path, to apply, phone", globals: phone, render: () => <Screen stage="apply" step="applied" /> };
export const OutreachToo: Story = { name: "Apply path, Outreach too", render: () => <Screen stage="apply" step="outreachPath" /> };
export const OutreachSent: Story = { name: "Outreach sent, follow up", render: () => <Screen stage="outreachSent" /> };
export const Applied: Story = { name: "Applied, follow up", render: () => <Screen stage="applied" /> };
export const AppliedPhone: Story = { name: "Applied, follow up, phone", globals: phone, render: () => <Screen stage="applied" /> };
export const AllDone: Story = { name: "All done", render: () => <Screen stage="done" /> };
export const AllDonePhone: Story = { name: "All done, phone", globals: phone, render: () => <Screen stage="done" /> };

// The first story with Talk, with a stand-in for the browser's speech recognition (talkFake): idle, listening, and
// where the browser can't listen, the line for a Mac's own dictation.
function TalkScreen({ supported = true, step }: { supported?: boolean; step?: string }) {
  useState(() => installTalkFake(supported, supported ? undefined : "mac"));
  return <Screen stage="story" step={step} />;
}
export const FirstStoryTalk: Story = { name: "Setup, first story, talk", render: () => <TalkScreen /> };
export const FirstStoryTalkPhone: Story = { name: "Setup, first story, talk, phone", globals: phone, render: () => <TalkScreen step="story" /> };
export const FirstStoryListening: Story = {
  name: "Setup, first story, listening",
  render: () => <TalkScreen />,
  play: async () => {
    await userEvent.click((await within(document.body).findAllByRole("button", { name: "Talk" }))[0]);
    talkFake.hear("the other half was damage claims. I traced a year of them back to one pallet supplier and sat down with their plant manager.", true);
    talkFake.hear("by the next quarter claims had");
  },
};
export const FirstStoryUnsupported: Story = { name: "Setup, first story, unsupported browser", render: () => <TalkScreen supported={false} /> };
