import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Whether an operator suspended someone (adminPeople.ts): they can't sign in (invites.admit) until restored.
export async function suspended(ctx: QueryCtx, userId: Id<"users">) {
  return !!(await ctx.db.query("suspensions").withIndex("by_user", (q) => q.eq("userId", userId)).first());
}
