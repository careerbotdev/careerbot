"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, type ButtonSize } from "./Button";
import { ErrorLine } from "./Field";
import { Icons } from "./icons";
import { Kbd } from "./Kbd";

// Talking instead of typing (the Voice boards in Paper): Talk (⇧T) listens with the browser's own speech recognition,
// shows the words it's still hearing greyed at the caret, and hands each finished phrase to the writing, which saves it
// like typing. Stop (⇧T) ends it and says how many words went in. Nothing is recorded or kept. Where the browser can't
// (Firefox), there's no Talk: a line points to the device's own dictation instead.

// The Web Speech API, as much of it as Talk uses (TypeScript's DOM types don't carry it yet).
type Heard = { isFinal: boolean; length: number; [i: number]: { transcript: string } };
type ResultEvent = { resultIndex: number; results: { length: number; [i: number]: Heard } };
export type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionClass = new () => Recognition;
type SpeechWindow = { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };

const recognition = () => {
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const never = () => () => {};

// Whether this browser can listen: null until it's known (on the server and in the first render).
export function useCanTalk(): boolean | null {
  return useSyncExternalStore(never, () => !!recognition(), () => null);
}

// Which device's own dictation to point to where the browser can't listen: a phone's (or tablet's) keyboard, a Mac's,
// or Windows'. null when there's nothing to point to (Linux) or before it's known.
export type Device = "phone" | "mac" | "windows";
function device(): Device | null {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "phone";
  if (/Mac/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return null;
}
export function useDevice(): Device | null {
  return useSyncExternalStore(never, device, () => null);
}

export const wordsIn = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// What went wrong, in plain words, by the browser's error code. "no-speech" is only a problem when nothing at all was
// heard; "aborted" is our own stop.
const PROBLEMS: Record<string, string> = {
  "not-allowed": "The microphone is blocked for this site. Allow it in your browser’s site settings, then press Talk again.",
  "service-not-allowed": "Speech recognition is turned off in this browser. Turn it on (on a Mac or iPhone, Dictation in the system settings), then press Talk again.",
  "no-speech": "Didn’t hear anything. Check that your microphone is on, then press Talk again.",
  "audio-capture": "No microphone found. Connect one, then press Talk again.",
  network: "Couldn’t reach your browser’s speech service. Check your connection, then press Talk again.",
  "language-not-supported": "Your browser can’t turn this language into text.",
};
const SOMETHING = "Listening stopped. Press Talk to try again.";

export type TalkState = "idle" | "listening" | "stopped";
export type Talk = {
  state: TalkState;
  // The words still being heard, not yet in the writing.
  interim: string;
  // Words added since Talk was pressed.
  added: number;
  // Seconds since Talk was pressed.
  elapsed: number;
  // Why it stopped by itself, in plain words.
  problem?: string;
  start: () => void;
  stop: () => void;
  // Back to idle once the stopped line has been seen (they typed, or started again).
  dismiss: () => void;
};

type Session = { rec: Recognition | null; wanted: boolean; heard: boolean; first: boolean; added: number; began: number; quick: number; timer?: number };

// Listening, continuous, with words in progress. `onWords` gets each finished phrase (`first` for the first of a
// session, to start a new paragraph); `onStopped` runs once the last words are in, to save them. If the browser ends a
// session by itself mid-talk (a pause, its time limit), it listens again until Stop.
export function useTalk({ onStart, onWords, onStopped }: { onStart?: () => void; onWords: (text: string, first: boolean) => void; onStopped?: (added: number) => void }): Talk {
  const [state, setState] = useState<TalkState>("idle");
  const [interim, setInterim] = useState("");
  const [added, setAdded] = useState(0);
  const [began, setBegan] = useState(0);
  const [now, setNow] = useState(0);
  const [problem, setProblem] = useState<string>();
  const handlers = useRef({ onStart, onWords, onStopped });
  useEffect(() => {
    handlers.current = { onStart, onWords, onStopped };
  });
  const session = useRef<Session | null>(null);
  // Words added by the session that just ended, for onStopped once the last of them has rendered.
  const ended = useRef<number | null>(null);

  const finish = (s: Session) => {
    if (session.current !== s) return;
    window.clearTimeout(s.timer);
    session.current = null;
    s.rec = null;
    ended.current = s.added;
    setInterim("");
    setState("stopped");
  };
  const fail = (s: Session, why: string) => {
    s.wanted = false;
    setProblem(why);
  };
  const listen = (s: Session) => {
    const Rec = recognition();
    if (!Rec) return finish(s);
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      if (s.rec !== rec) return;
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0]?.transcript.trim() ?? "";
        if (!text) continue;
        if (!e.results[i].isFinal) {
          pending = pending ? `${pending} ${text}` : text;
          continue;
        }
        s.heard = true;
        s.added += wordsIn(text);
        handlers.current.onWords(text, s.first);
        s.first = false;
        setAdded(s.added);
      }
      setInterim(pending);
    };
    rec.onerror = (e) => {
      if (s.rec !== rec || e.error === "aborted" || (e.error === "no-speech" && s.heard)) return;
      fail(s, PROBLEMS[e.error] ?? SOMETHING);
    };
    rec.onend = () => {
      if (s.rec !== rec) return;
      if (s.wanted) {
        // Ended by the browser: listen again, unless it keeps ending at once.
        s.quick = !s.began || Date.now() - s.began < 1000 ? s.quick + 1 : 0;
        if (s.quick < 3) return listen(s);
        fail(s, SOMETHING);
      }
      finish(s);
    };
    rec.onstart = () => {
      s.began = Date.now();
    };
    s.rec = rec;
    s.began = 0;
    try {
      rec.start();
    } catch {
      fail(s, SOMETHING);
      finish(s);
    }
  };

  const start = () => {
    if (session.current || !recognition()) return;
    const s: Session = { rec: null, wanted: true, heard: false, first: true, added: 0, began: 0, quick: 0 };
    session.current = s;
    setProblem(undefined);
    setAdded(0);
    setInterim("");
    setBegan(Date.now());
    setNow(Date.now());
    setState("listening");
    handlers.current.onStart?.();
    listen(s);
  };
  const stop = () => {
    const s = session.current;
    if (!s || !s.wanted) return;
    s.wanted = false;
    // The last words arrive before it ends; if it never says it has, stop waiting.
    s.timer = window.setTimeout(() => {
      s.rec?.abort();
      finish(s);
    }, 2000);
    s.rec?.stop();
  };
  const dismiss = () => {
    if (session.current) return;
    setState("idle");
    setProblem(undefined);
  };

  // The clock while listening.
  useEffect(() => {
    if (state !== "listening") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [state]);
  // Stopped: the writing now holds every word, so onStopped sees them all (to save).
  useEffect(() => {
    if (state !== "stopped" || ended.current === null) return;
    const added = ended.current;
    ended.current = null;
    handlers.current.onStopped?.(added);
  }, [state]);
  // A phone stops listening when the screen locks or the app goes to the background; so does a hidden tab.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && session.current && stopRef.current();
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  // Leaving stops listening; what was heard is already in the writing.
  useEffect(
    () => () => {
      const s = session.current;
      if (!s) return;
      session.current = null;
      window.clearTimeout(s.timer);
      s.wanted = false;
      s.rec?.abort();
    },
    [],
  );

  return { state, interim, added, elapsed: state === "listening" ? Math.max(0, Math.floor((now - began) / 1000)) : 0, problem, start, stop, dismiss };
}

// ⇧T starts and stops, away from text fields and menus (like the screen's other keys).
export function useTalkKey(talk: Talk, on: boolean) {
  const latest = useRef(talk);
  useEffect(() => {
    latest.current = talk;
  });
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "T" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true'], [role=menu], [role=listbox], [role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      const t = latest.current;
      if (t.state === "listening") t.stop();
      else t.start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);
}

// Adds a finished phrase to the writing: the first of a session starts a new paragraph after what's there, the rest
// follow with a space; a phrase that starts a sentence gets its capital.
export function addSpoken(body: string, text: string, first: boolean) {
  const kept = body.replace(/\s+$/, "");
  const sentence = !kept || /[.!?]["”’)]?$/.test(kept) || first;
  const words = sentence ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  if (!kept) return words;
  return `${kept}${first ? "\n\n" : " "}${words}`;
}

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Talk: secondary in a box's footer and on a phone's bar, outline beside the story's actions. `noun`: what the words
// go into ("story", "note").
export function TalkButton({ talk, noun = "story", size = "md", variant = "outline", tour, className = "" }: { talk: Talk; noun?: string; size?: ButtonSize; variant?: "outline" | "secondary"; tour?: string; className?: string }) {
  return (
    <Button
      variant={variant}
      size={size}
      icon="talk"
      keys={size === "lg" ? undefined : "⇧T"}
      className={className}
      detail={`Type by speaking: your words appear in the ${noun} as you talk, and save like typing.`}
      note="Free · Stop with ⇧T"
      onClick={talk.start}
      data-tour={tour}
    >
      Talk
    </Button>
  );
}

// While listening: the mark, how long, whether it's saved, and Stop. "panel" sits under the story's text, "inline" is a
// writing box's footer, "bar" fills a phone's bottom bar.
export function Listening({ talk, saved, look = "panel" }: { talk: Talk; saved: ReactNode; look?: "panel" | "inline" | "bar" }) {
  const status = (
    <span className="flex items-center gap-2">
      <span aria-hidden className="size-2 shrink-0 rounded-xs bg-steel ring-3 ring-steel/30" />
      <span className="text-body-sm leading-body-sm font-medium text-text">Listening</span>
      <span className="text-body-sm leading-body-sm text-text tabular-nums">
        {minutes(talk.elapsed)}
      </span>
    </span>
  );
  const save = <span className="flex items-center gap-1 text-body-sm leading-body-sm text-muted">{saved}</span>;
  const stop = (
    <Button variant="primary" size={look === "bar" ? "lg" : "md"} icon="stop" keys={look === "bar" ? undefined : "⇧T"} className={look === "bar" ? "w-full" : ""} detail="Stops listening. What you said stays in the story." note="Free" onClick={talk.stop}>
      Stop
    </Button>
  );
  if (look === "bar")
    return (
      <div role="group" aria-label="Listening" className="-mx-4 -mt-2 flex w-[calc(100%+32px)] flex-col gap-3 bg-subtle px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          {status}
          {save}
        </div>
        {stop}
      </div>
    );
  return (
    <div
      role="group"
      aria-label="Listening"
      className={look === "panel" ? "flex h-12 w-full max-w-[614px] items-center gap-3 rounded-sm border border-steel bg-steel-subtle pr-2 pl-3.5" : "flex items-center gap-3"}
    >
      {status}
      {save}
      <span className="flex-1" />
      {stop}
    </div>
  );
}

// "Saved" with its check, for Listening's save state.
export function Saved() {
  return (
    <>
      <Icons.approve aria-hidden size={14} className="text-good" />
      Saved
    </>
  );
}

// The words of this time talking, as they arrive, beside a steel rule: finished ones in the text colour, the ones still
// being heard greyed at the caret, which stays in sight as the words grow.
export function LiveText({ text, interim }: { text: string; interim: string }) {
  const paragraphs = text ? text.split(/\n{2,}/) : [];
  const caretRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    caretRef.current?.scrollIntoView({ block: "nearest" });
  }, [text, interim]);
  const caret = <span ref={caretRef} aria-hidden className="ml-0.5 inline-block h-[18px] w-px translate-y-[3px] bg-text motion-safe:animate-pulse" />;
  return (
    <div role="group" aria-label="Being heard" className="flex max-w-[614px] flex-col gap-4 border-l-2 border-steel pl-3.5 text-body-md leading-body-md text-text">
      {(paragraphs.length ? paragraphs : [""]).map((p, i, all) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
          {i === all.length - 1 && (
            <>
              {interim && <span className="text-muted">{p ? ` ${interim}` : interim}</span>}
              {caret}
            </>
          )}
        </p>
      ))}
    </div>
  );
}

// Under the text while listening: how to talk to it, and the docs' page on telling your story.
export function TalkTip({ href, className = "" }: { href: string; className?: string }) {
  return (
    <div className={`flex max-w-[614px] flex-col gap-1 ${className}`}>
      <p className="text-label leading-label font-medium text-text">How to talk to it</p>
      <p className="text-body-sm leading-body-sm text-muted">Tell it like you’d tell a friend, one job at a time, with the names and numbers. Fix a misheard word by typing over it.</p>
      <a href={href} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-1 self-start text-body-sm leading-body-sm font-medium text-text underline decoration-1 underline-offset-3">
        How to tell your story
        <Icons.openElsewhere size={12} aria-hidden="true" className="text-muted" />
      </a>
    </div>
  );
}

// After Stop: how many words went in and whether they're saved; or why it stopped by itself. `phone` adds that a
// phone stops listening when the screen locks.
export type SaveState = "saving" | "saved" | "unsaved";
export function TalkStopped({ talk, saved, noun = "story", phone = false }: { talk: Talk; saved: SaveState; noun?: string; phone?: boolean }) {
  const count = `${talk.added.toLocaleString("en-US")} ${talk.added === 1 ? "word" : "words"} added to your ${noun}.`;
  const words = { saving: "Saving…", saved: "Saved", unsaved: "Not saved yet" }[saved];
  if (talk.problem)
    return (
      <div role="status" className="flex flex-col gap-1">
        <ErrorLine>{talk.problem}</ErrorLine>
        {talk.added > 0 && <p className="pl-5.5 text-body-sm leading-body-sm text-muted">{`${count} ${words}`}</p>}
      </div>
    );
  return (
    <div role="status" className="flex items-start gap-2 text-body-sm leading-body-sm">
      <Icons.approve aria-hidden size={14} className="mt-0.5 shrink-0 text-good" />
      <p className={phone ? "flex flex-col" : "flex flex-wrap gap-x-2"}>
        <span className="font-medium text-text">Stopped. {count}</span>
        <span className="text-muted">{phone ? `${words}${saved === "saving" ? "" : "."} Your phone stops listening when the screen locks.` : words}</span>
      </p>
    </div>
  );
}

// Where the browser can't listen: the device's own dictation, which types into the text box. Nothing on a device
// without one.
export function DeviceDictation({ device }: { device: Device | null }) {
  const muted = "text-body-sm leading-body-sm text-muted";
  if (device === "phone")
    return (
      <p className={`flex items-center gap-2 ${muted}`}>
        <Icons.talk aria-hidden size={14} className="shrink-0" />
        To talk instead, tap the mic on your keyboard.
      </p>
    );
  if (!device) return null;
  const mac = device === "mac";
  return (
    <p className={`flex flex-wrap items-center gap-1.5 ${muted}`}>
      To talk instead, press
      <Kbd>{mac ? "Fn" : "Win"}</Kbd>
      <Kbd>{mac ? "Fn" : "H"}</Kbd>
      {mac ? "for your Mac’s dictation" : "for Windows dictation"}
    </p>
  );
}
