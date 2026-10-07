import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { selfHosted } from "./allowlist";
import { mutation } from "./functions";
import { compareVersions, type Release, release } from "./releases";
import { VERSION } from "./version";

// New versions and what changed in them.
//
// What's new: each person's newest version used (users.seenVersion). When the app they open is newer, it says so once,
// with a link to its notes (src/app/shell/WhatsNew.tsx).
//
// A self-hosted copy's check for a new version: once a day (crons.ts), the copy reads careerbot.dev/releases.json, the
// public list of releases /changelog shows, with a plain GET that carries nothing about the copy or its people, and
// keeps the releases newer than itself (updateCheck). Its owner sees them in Settings, Updates, and a line on Today. A
// failed or slow read is skipped until the next day. On by default; off with the owner's switch in Settings, Updates, or
// with UPDATE_CHECK=off in the deployment's environment. careerbot.dev and the demo never check.

export const FEED = "https://careerbot.dev/releases.json";
const TIMEOUT_MS = 10_000;

const offByEnv = () => process.env.UPDATE_CHECK?.trim().toLowerCase() === "off";
const VERSION_FORMAT = /^\d+\.\d+\.\d+$/;

// The releases in a releases.json newer than `than`, newest first; anything that isn't a release as /changelog writes
// them is left out.
export function newerReleases(feed: unknown, than: string): Release[] {
  if (!Array.isArray(feed)) return [];
  const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
  const shots = (x: unknown): x is Release["shots"] => Array.isArray(x) && x.every((s) => typeof s?.id === "string" && typeof s?.alt === "string");
  const releases: Release[] = [];
  for (const r of feed) {
    if (typeof r !== "object" || r === null) continue;
    const { version, date, summary, new: added, better, fixed, selfHost, needsAction, shots: pictures } = r as Record<string, unknown>;
    if (typeof version !== "string" || !VERSION_FORMAT.test(version) || typeof date !== "string" || typeof summary !== "string") continue;
    if (!strings(added) || !strings(better) || !strings(fixed) || !strings(selfHost) || typeof needsAction !== "boolean") continue;
    if (compareVersions(version, than) <= 0) continue;
    releases.push({ version, date, summary, new: added, better, fixed, selfHost, needsAction, shots: shots(pictures) ? pictures.map(({ id, alt }) => ({ id, alt })) : [] });
  }
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

async function ownerOfThisCopy(ctx: QueryCtx) {
  if (!selfHosted()) return null;
  const userId = await getAuthUserId(ctx);
  const user = userId && (await ctx.db.get(userId));
  return user?.owner ? user : null;
}

const checkRow = (ctx: QueryCtx) => ctx.db.query("updateCheck").first();

// ─── What's new ───────────────────────────────────────────────────────────────────────────────────────────────────────

// The app at `version` was opened. True when it's newer than the last version this person used, so What's new shows
// (once: the version is kept). Their first time, there's nothing to compare with and nothing shows.
export const sawVersion = mutation({
  args: { version: v.string() },
  handler: async (ctx, { version }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || !VERSION_FORMAT.test(version)) return false;
    const user = await ctx.db.get(userId);
    if (!user) return false;
    const seen = user.seenVersion;
    if (seen && compareVersions(version, seen) <= 0) return false;
    await ctx.db.patch(userId, { seenVersion: version });
    return !!seen;
  },
});

// ─── A self-hosted copy's check ───────────────────────────────────────────────────────────────────────────────────────

export type UpdateStatus = {
  current: string;
  off: boolean;
  offByEnv: boolean;
  checkedAt: number | null;
  newer: Release[];
  needsAction: boolean;
};

// What its owner sees in Settings, Updates and on Today: this copy's version, whether the check is off (and whether the
// environment turned it off), when it last read the list, and the releases newer than this copy, newest first.
// Null for anyone but a self-hosted copy's owner.
export const status = query({
  args: {},
  handler: async (ctx): Promise<UpdateStatus | null> => {
    if (!(await ownerOfThisCopy(ctx))) return null;
    const row = await checkRow(ctx);
    const off = offByEnv() || !!row?.off;
    const newer = off ? [] : (row?.newer ?? []).filter((r) => compareVersions(r.version, VERSION) > 0);
    return { current: VERSION, off, offByEnv: offByEnv(), checkedAt: off ? null : (row?.checkedAt ?? null), newer, needsAction: newer.some((r) => r.needsAction) };
  },
});

// The owner's switch. Turning it off forgets what was found; turning it on checks at once.
export const setCheck = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    if (!(await ownerOfThisCopy(ctx))) throw new ConvexError("Only this copy’s owner can do that.");
    const row = await checkRow(ctx);
    if (on) {
      if (row) await ctx.db.patch(row._id, { off: undefined });
      await ctx.scheduler.runAfter(0, internal.updates.check, {});
    } else if (row) await ctx.db.replace(row._id, { off: true });
    else await ctx.db.insert("updateCheck", { off: true });
  },
});

export const checkOff = internalQuery({
  args: {},
  handler: async (ctx) => offByEnv() || !!(await checkRow(ctx))?.off,
});

export const store = internalMutation({
  args: { checkedAt: v.number(), newer: v.array(release) },
  handler: async (ctx, args) => {
    const row = await checkRow(ctx);
    if (row?.off) return;
    if (row) await ctx.db.patch(row._id, args);
    else await ctx.db.insert("updateCheck", args);
  },
});

// Once a day (crons.ts) and when the owner turns the check on: reads careerbot.dev/releases.json and keeps the
// releases newer than this copy. Only on a self-hosted copy with the check on; a failed, slow or unreadable answer is
// left for the next day.
export const check = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!selfHosted() || (await ctx.runQuery(internal.updates.checkOff, {}))) return;
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
    try {
      const reply = await fetch(FEED, { signal: stop.signal, headers: { accept: "application/json" } });
      if (!reply.ok) return;
      await ctx.runMutation(internal.updates.store, { checkedAt: Date.now(), newer: newerReleases(await reply.json(), VERSION) });
    } catch {
      // Offline, slow or not JSON: tried again tomorrow.
    } finally {
      clearTimeout(timer);
    }
  },
});
