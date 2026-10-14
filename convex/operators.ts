import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { selfHosted } from "./allowlist";

// careerbot.dev's operators: the people who run it, with the admin screen (/admin) and its functions (admin*.ts). Only
// on careerbot.dev: a self-hosted copy has its owner (account.ts) instead. Granted and taken away from the Convex CLI
// only, never from the app.

export const NOT_OPERATOR = "Only CareerBot’s operators can do that.";

async function operatorRow(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db.query("operators").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
}

// The signed-in operator, or a refusal. Every admin function starts with it.
export async function requireOperator(ctx: QueryCtx): Promise<{ userId: Id<"users">; role: "owner" }> {
  const userId = await getAuthUserId(ctx);
  const row = !selfHosted() && userId ? await operatorRow(ctx, userId) : null;
  if (!userId || !row) throw new ConvexError(NOT_OPERATOR);
  return { userId, role: row.role };
}

// Whether the signed-in person is an operator, so the app can offer Admin.
export const isOperator = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return !selfHosted() && !!userId && !!(await operatorRow(ctx, userId));
  },
});

async function userByEmail(ctx: MutationCtx, email: string) {
  const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email.trim().toLowerCase())).first();
  if (!user) throw new Error(`No one has signed in as ${email}.`);
  return user;
}

// npx convex run operators:grant '{"email":"…"}': makes someone who has signed in an operator.
export const grant = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await userByEmail(ctx, email);
    if (!(await operatorRow(ctx, user._id))) await ctx.db.insert("operators", { userId: user._id, role: "owner" });
  },
});

// npx convex run operators:revoke '{"email":"…"}': takes it away.
export const revoke = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const row = await operatorRow(ctx, (await userByEmail(ctx, email))._id);
    if (row) await ctx.db.delete(row._id);
  },
});
