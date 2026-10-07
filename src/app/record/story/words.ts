import { clockNow } from "../../clock";

// What the Story screen says about stories and their versions: when, how long, what changed between two versions.

// What the moves on a story do, the same in its ⋯ menu, its buttons and the phone bar.
export const EXPLAIN = {
  versions: { detail: "Opens every saved version, to compare two or restore one.", note: "Free" },
  newStory: { detail: "Opens a new story to write in. Reading it later proposes roles and facts for your record.", note: "Free" },
  quickNote: { detail: "Opens a short note to write in, for something smaller than a story.", note: "Free" },
  restore: { detail: "Brings it back as a source; what came from it returns to review.", note: "Free · Undo with U" },
} as const;

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hourCycle: "h23" });
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

// "10:42" today, else "Sep 26" (with the year when it isn't this one).
export function when(ms: number, now = clockNow()) {
  if (sameDay(ms, now)) return time(ms);
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }) });
}

// "Today 10:42", else "Sep 23".
export const whenLong = (ms: number, now = clockNow()) => (sameDay(ms, now) ? `Today ${time(ms)}` : when(ms, now));

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// "1,812 words".
export function wordsLabel(n: number) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "word" : "words"}`;
}

export const paragraphsOf = (body: string) =>
  body
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

// A line on its own that reads as a heading: short, with no closing punctuation.
export const isHeading = (p: string) => p.length <= 70 && !/[.!?:;,"”’)]$/.test(p);

export type Change = { kind: "same" | "added" | "removed"; text: string };

// The paragraphs of `to` against those of `from`: kept, added and removed, in reading order (longest common run). A
// changed paragraph reads as the old one struck, then the new one.
export function diff(from: string, to: string): Change[] {
  const a = paragraphsOf(from);
  const b = paragraphsOf(to);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: Change[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push({ kind: "removed", text: a[i++] });
    else out.push({ kind: "added", text: b[j++] });
  }
  return out;
}

// How many separate places changed.
export const changesIn = (changes: Change[]) => changes.filter((c, k) => c.kind !== "same" && (k === 0 || changes[k - 1].kind === "same")).length;

const opening = (text: string) => {
  const words = text.split(/\s+/);
  return words.length > 8 ? `${words.slice(0, 8).join(" ")}…` : text;
};

// What a version changed from the one before it, in a line: the first thing it added or took out, and how much else.
export function whatChanged(version: { title: string; body: string }, before: { title: string; body: string } | undefined, earlier: { version: number; body: string }[]) {
  if (!before) return "First version.";
  const same = earlier.find((e) => e.body === version.body);
  if (same && before.body !== version.body) return `Same text as version ${same.version}.`;
  const changes = diff(before.body, version.body);
  const count = changesIn(changes);
  if (!count) return version.title !== before.title ? `Renamed from ${before.title}.` : "No change to the text.";
  const first = changes.find((c) => c.kind === "added") ?? changes.find((c) => c.kind === "removed")!;
  const more = count > 1 ? `, and ${count - 1} more ${count === 2 ? "change" : "changes"}.` : "";
  return `${first.kind === "added" ? "Adds" : "Takes out"} “${opening(first.text)}”${more}`;
}
