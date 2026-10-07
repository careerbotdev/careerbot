import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { ensureWorkspace } from "./workspaces";

const modules = import.meta.glob("./**/*.ts");

test("a run cut off mid-way is started again, and one interrupted three times fails with a plain message", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const now = Date.now();
  const [stuck, fresh, tired] = await t.run(async (ctx) => {
    const w = await ensureWorkspace(ctx, await ctx.db.insert("users", { email: "a@example.com" }));
    const job = (startedAt: number, attempts: number) => ctx.db.insert("jobs", { workspaceId: w, kind: "resume", args: {}, status: "running", startedAt, attempts });
    return [await job(now - 20 * 60_000, 1), await job(now - 60_000, 1), await job(now - 20 * 60_000, 3)];
  });
  await t.mutation(internal.jobs.recoverStuck, {});
  const get = (id: typeof stuck) => t.run((ctx) => ctx.db.get(id));
  expect((await get(stuck))!.status).toBe("queued");
  expect((await get(fresh))!.status).toBe("running");
  expect(await get(tired)).toMatchObject({ status: "failed", error: "This kept getting interrupted. Try again." });
  vi.useRealTimers();
});
