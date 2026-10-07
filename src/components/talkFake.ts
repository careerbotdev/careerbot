import type { Recognition } from "./Talk";

// A stand-in for the browser's speech recognition, for Storybook and the rendered checks (never the app): Talk starts
// it, and `window.talkFake` plays what it "hears": `hear("words")` for words still being heard, `hear("words", true)`
// once they're final, `fail("not-allowed")` for an error, `end()` for the browser ending a session by itself.
// `installTalkFake(false)` takes speech recognition away, as in Firefox; `device` pretends to be that device.

type Said = { transcript: string; isFinal: boolean };
export type TalkFake = { hear: (text: string, final?: boolean) => void; fail: (error: string) => void; end: () => void; listening: () => boolean; starts: () => number };

class FakeRecognition implements Recognition {
  static current: FakeRecognition | null = null;
  static started = 0;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  onstart: Recognition["onstart"] = null;
  said: Said[] = [];
  on = false;
  start() {
    FakeRecognition.current = this;
    FakeRecognition.started++;
    this.on = true;
    setTimeout(() => this.onstart?.(), 0);
  }
  // Like Chrome: the words still being heard become final, then it ends.
  stop() {
    const last = this.said.at(-1);
    if (last && !last.isFinal) this.hear(last.transcript, true);
    setTimeout(() => this.end(), 50);
  }
  abort() {
    this.end();
  }
  hear(text: string, final = false) {
    if (!this.on) return;
    const last = this.said.at(-1);
    const at = last && !last.isFinal ? this.said.length - 1 : this.said.length;
    this.said[at] = { transcript: text, isFinal: final };
    const results = this.said.map((s) => Object.assign([{ transcript: s.transcript }], { isFinal: s.isFinal }));
    this.onresult?.({ resultIndex: at, results });
  }
  end() {
    if (!this.on) return;
    this.on = false;
    if (FakeRecognition.current === this) FakeRecognition.current = null;
    this.onend?.();
  }
}

const AGENTS = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/150.0",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
  phone: "Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0",
} as const;

// What the stories' play functions and the rendered checks drive.
export const talkFake: TalkFake = {
  hear: (text, final) => FakeRecognition.current?.hear(text, final),
  fail: (error) => {
    FakeRecognition.current?.onerror?.({ error });
    FakeRecognition.current?.end();
  },
  end: () => FakeRecognition.current?.end(),
  listening: () => !!FakeRecognition.current,
  starts: () => FakeRecognition.started,
};
declare global {
  interface Window {
    talkFake?: TalkFake;
  }
}

export function installTalkFake(supported: boolean, device?: keyof typeof AGENTS) {
  const w = window as unknown as Record<string, unknown>;
  w.SpeechRecognition = supported ? FakeRecognition : undefined;
  w.webkitSpeechRecognition = supported ? FakeRecognition : undefined;
  if (device) Object.defineProperty(navigator, "userAgent", { value: AGENTS[device], configurable: true });
  else delete (navigator as unknown as Record<string, unknown>).userAgent;
  window.talkFake = talkFake;
}
