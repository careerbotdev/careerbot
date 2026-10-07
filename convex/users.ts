import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

// Who's signed in, and how (the provider of their sign-in account: "google", "github" or "password"); on a self-hosted
// copy, their username and whether they're its owner (account.ts).
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .first();
    return (
      user && {
        name: user.name ?? null,
        email: user.email ?? null,
        provider: account?.provider ?? null,
        username: user.username ?? null,
        owner: !!user.owner,
      }
    );
  },
});
