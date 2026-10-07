import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { DeviceDictation, Listening, LiveText, Saved, type Talk, TalkButton, TalkStopped, TalkTip } from "./Talk";

// Talk's parts (the Voice boards in Paper): the button, the listening bar in its three places, the words as they
// arrive, the tip, the line after Stop (and after a problem), and where the browser can't listen, the device's own
// dictation. The screens' stories (Story, Getting started) play them for real with a stand-in recogniser.

const meta = { title: "Components/Talk" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const talk = (over: Partial<Talk> = {}): Talk => ({ state: "listening", interim: "", added: 96, elapsed: 252, start: () => {}, stop: () => {}, dismiss: () => {}, ...over });

function Row({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label leading-label text-muted">{caption}</span>
      {children}
    </div>
  );
}

export const Button: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Row caption="Beside a story’s actions">
        <div>
          <TalkButton talk={talk({ state: "idle" })} />
        </div>
      </Row>
      <Row caption="In a writing box’s footer">
        <div>
          <TalkButton talk={talk({ state: "idle" })} size="sm" variant="secondary" />
        </div>
      </Row>
      <Row caption="On a phone’s bar">
        <div>
          <TalkButton talk={talk({ state: "idle" })} size="lg" variant="secondary" />
        </div>
      </Row>
    </div>
  ),
};

const HEARD = "One more thing about the forecast. The demand team ran it from a forty-tab spreadsheet, and by spring nobody in sales trusted a number in it.\n\nSo I rebuilt it as a Python model the demand team reruns every Monday, and we tested it against last year.";

export const ListeningStory: Story = {
  name: "Listening",
  render: () => (
    <div className="flex max-w-[640px] flex-col gap-4">
      <LiveText text={HEARD} interim="Forecast accuracy went from 61% to 74%, and now the" />
      <Listening talk={talk()} saved={<Saved />} />
      <TalkTip href="/docs/best-practices/your-story" className="pt-1 pl-3.5" />
    </div>
  ),
};

export const ListeningInline: Story = {
  name: "Listening, in a writing box",
  render: () => (
    <div className="flex max-w-[640px] flex-col gap-2 rounded-sm border border-steel px-2.5 py-2">
      <LiveText text="The other half was damage claims. I traced a year of them back to one pallet supplier and sat down with their plant manager." interim="By the next quarter claims had" />
      <Listening talk={talk({ elapsed: 108 })} saved={<Saved />} look="inline" />
    </div>
  ),
};

export const ListeningBar: Story = {
  name: "Listening, phone bar",
  globals: { viewport: { value: "mobile2" } },
  render: () => (
    <div className="border-t px-4 pt-2 pb-2">
      <Listening talk={talk()} saved={<Saved />} look="bar" />
    </div>
  ),
};

export const NothingHeardYet: Story = {
  name: "Listening, nothing heard yet",
  render: () => <LiveText text="" interim="" />,
};

export const Stopped: Story = {
  render: () => (
    <div className="flex max-w-[640px] flex-col gap-6">
      <TalkStopped talk={talk({ state: "stopped" })} saved="saved" />
      <TalkStopped talk={talk({ state: "stopped" })} saved="saving" />
      <TalkStopped talk={talk({ state: "stopped", added: 1 })} saved="saved" noun="note" />
      <div className="max-w-[358px]">
        <TalkStopped talk={talk({ state: "stopped" })} saved="saved" phone />
      </div>
    </div>
  ),
};

export const Problems: Story = {
  render: () => (
    <div className="flex max-w-[640px] flex-col gap-6">
      <TalkStopped talk={talk({ state: "stopped", added: 0, problem: "The microphone is blocked for this site. Allow it in your browser’s site settings, then press Talk again." })} saved="saved" />
      <TalkStopped talk={talk({ state: "stopped", added: 0, problem: "Didn’t hear anything. Check that your microphone is on, then press Talk again." })} saved="saved" />
      <TalkStopped talk={talk({ state: "stopped", added: 42, problem: "Couldn’t reach your browser’s speech service. Check your connection, then press Talk again." })} saved="saved" />
    </div>
  ),
};

export const DeviceDictationStory: Story = {
  name: "Device dictation",
  render: () => (
    <div className="flex flex-col gap-4">
      <DeviceDictation device="mac" />
      <DeviceDictation device="windows" />
      <DeviceDictation device="phone" />
    </div>
  ),
};
