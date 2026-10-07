import type { GenericMutationCtx } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";

// A copy someone runs themselves (CAREERBOT_MODE=self-hosted in the deployment's environment; the Docker copy sets it):
// its people sign in with a username and password the owner gave them (account.ts). Unset: careerbot.dev, invite-only.
export const selfHosted = () => process.env.CAREERBOT_MODE === "self-hosted";

// Until "Open it up", only the people listed in SIGNUP_ALLOWLIST (comma-separated emails) can sign in. On a self-hosted
// copy it's who may sign in with Google or GitHub; password accounts are the owner's to add and don't need it.
export function allowedEmails(): Set<string> {
  return new Set(
    (process.env.SIGNUP_ALLOWLIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// What the sign-in screen is told when an account is refused: the account used, so it can say which one.
export type NotAllowed = { kind: "notAllowed"; message: string; email: string | null; provider: string | null };

export async function assertAllowed(ctx: GenericMutationCtx<DataModel>, userId: Id<"users">) {
  // The demo's shared, made-up person (demo.ts) has no email or account: it's signed in only by the demo sign-in.
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (membership && (await ctx.db.get(membership.workspaceId))?.demo) return;
  const own = selfHosted();
  if (own) {
    const password = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
      .first();
    if (password) return;
  }
  const user = await ctx.db.get(userId);
  const email = user?.email?.toLowerCase();
  if (!email || !allowedEmails().has(email)) {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .first();
    const message = own ? "This account can’t sign in to this copy. Ask its owner to add you." : "This account isn't allowed to sign in.";
    const refused: NotAllowed = { kind: "notAllowed", message, email: user?.email ?? null, provider: account?.provider ?? null };
    throw new ConvexError(refused);
  }
}
