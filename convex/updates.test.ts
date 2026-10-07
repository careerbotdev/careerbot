import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { FEED, newerReleases } from "./updates";
import { VERSION } from "./version";

const modules = import.meta.glob("./**/*.ts");

// Versions around this copy's own.
const [major, minor, patch] = VERSION.split(".").map(Number);
const NEXT_PATCH = `${major}.${minor}.${patch + 1}`;
const NEXT_MINOR = `${major}.${minor + 1}.0`;
const OLDER = patch > 0 ? `${major}.${minor}.${patch - 1}` : "0.0.0";

const entry = (version: string, needsAction = false) => ({
  version,
  date: "2026-10-20",
  summary: `What ${version} brings.`,
  new: [`Something new in ${version}.`],
  better: [],
  fixed: [],
  selfHost: needsAction ? ["Run `git pull` first."] : [],
  needsAction,
  shots: [],
});

beforeEach(() => {
  process.env.CAREERBOT_MODE = "self-hosted";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CAREERBOT_MODE;
  delete process.env.UPDATE_CHECK;
});

async function copyWithOwner() {
  const t = convexTest(schema, modules);
  const [owner, other] = await t.run(async (ctx) => [await ctx.db.insert("users", { username: "sam", owner: true }), await ctx.db.insert("users", { username: "alex" })]);
  return { t, asOwner: t.withIdentity({ subject: `${owner}|s1` }), asOther: t.withIdentity({ subject: `${other}|s2` }) };
}

// careerbot.dev answering with `feed`; the requests it got.
function serve(feed: unknown, ok = true) {
  const asked: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    asked.push({ url, init });
    return new Response(JSON.stringify(feed), { status: ok ? 200 : 503 });
  });
  return asked;
}

test("only releases newer than the copy are kept, newest first; anything that isn't a release is left out", () => {
  const feed = [entry(OLDER), entry(NEXT_PATCH), { version: "next", summary: "x" }, entry(VERSION), entry(NEXT_MINOR), null, { ...entry("9.9.9"), new: "not a list" }];
  expect(newerReleases(feed, VERSION).map((r) => r.version)).toEqual([NEXT_MINOR, NEXT_PATCH]);
  expect(newerReleases({ releases: [] }, VERSION)).toEqual([]);
});

test("the daily check asks careerbot.dev with nothing about the copy, and only its owner sees what's out", async () => {
  const { t, asOwner, asOther } = await copyWithOwner();
  const asked = serve([entry(NEXT_MINOR), entry(NEXT_PATCH, true), entry(VERSION)]);
  await t.action(internal.updates.check, {});
  expect(asked).toHaveLength(1);
  expect(asked[0].url).toBe(FEED);
  expect(Object.keys(asked[0].init?.headers ?? {})).toEqual(["accept"]);
  expect(asked[0].init?.body).toBeUndefined();

  const seen = await asOwner.query(api.updates.status, {});
  expect(seen?.newer.map((r) => r.version)).toEqual([NEXT_MINOR, NEXT_PATCH]);
  // A release in between needs reading, so the update does.
  expect(seen?.needsAction).toBe(true);
  expect(await asOther.query(api.updates.status, {})).toBeNull();
  expect(await t.query(api.updates.status, {})).toBeNull();
});

test("a failed check keeps what was found before", async () => {
  const { t, asOwner } = await copyWithOwner();
  serve([entry(NEXT_PATCH)]);
  await t.action(internal.updates.check, {});
  serve("down", false);
  await t.action(internal.updates.check, {});
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("offline");
  });
  await t.action(internal.updates.check, {});
  expect((await asOwner.query(api.updates.status, {}))?.newer.map((r) => r.version)).toEqual([NEXT_PATCH]);
});

test("off in Settings or with UPDATE_CHECK=off, nothing is asked or shown; on again checks at once", async () => {
  const { t, asOwner } = await copyWithOwner();
  const asked = serve([entry(NEXT_PATCH, true)]);
  await t.action(internal.updates.check, {});
  await asOwner.mutation(api.updates.setCheck, { on: false });
  await t.action(internal.updates.check, {});
  expect(asked).toHaveLength(1);
  expect(await asOwner.query(api.updates.status, {})).toMatchObject({ off: true, offByEnv: false, newer: [], needsAction: false });

  vi.useFakeTimers();
  await asOwner.mutation(api.updates.setCheck, { on: true });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  expect(asked).toHaveLength(2);
  expect((await asOwner.query(api.updates.status, {}))?.newer.map((r) => r.version)).toEqual([NEXT_PATCH]);

  process.env.UPDATE_CHECK = "off";
  await t.action(internal.updates.check, {});
  expect(asked).toHaveLength(2);
  expect(await asOwner.query(api.updates.status, {})).toMatchObject({ off: true, offByEnv: true, newer: [] });
});

test("careerbot.dev and the demo never check", async () => {
  const { t } = await copyWithOwner();
  delete process.env.CAREERBOT_MODE;
  const asked = serve([entry(NEXT_PATCH)]);
  await t.action(internal.updates.check, {});
  expect(asked).toHaveLength(0);
});

test("What's new shows once for a newer version, never on someone's first visit or for an older one", async () => {
  const { asOwner } = await copyWithOwner();
  expect(await asOwner.mutation(api.updates.sawVersion, { version: "0.7.0" })).toBe(false);
  expect(await asOwner.mutation(api.updates.sawVersion, { version: "0.7.0" })).toBe(false);
  expect(await asOwner.mutation(api.updates.sawVersion, { version: "0.8.0" })).toBe(true);
  expect(await asOwner.mutation(api.updates.sawVersion, { version: "0.8.0" })).toBe(false);
  // An older build opened again (a tab left open before the update) doesn't wind it back.
  expect(await asOwner.mutation(api.updates.sawVersion, { version: "0.7.0" })).toBe(false);
  expect(await asOwner.mutation(api.updates.sawVersion, { version: "0.8.1" })).toBe(true);
});
