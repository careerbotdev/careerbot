import type { GenericMutationCtx } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";

// A copy someone runs themselves (CAREERBOT_MODE=self-hosted in the deployment's environment; the Docker copy sets it):
// its people sign in with a username and password the owner gave them (account.ts). Unset: careerbot.dev, invite-only
// (invites.ts).
export const selfHosted = () => process.env.CAREERBOT_MODE === "self-hosted";

// On a self-hosted copy, the people listed in SIGNUP_ALLOWLIST (comma-separated emails) are who may sign in with
// Google or GitHub; password accounts are the owner's to add and don't need it. careerbot.dev uses invites instead.
export function allowedEmails(): Set<string> {
  return new Set(
    (process.env.SIGNUP_ALLOWLIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// What the sign-in screen is told when an account is refused: why, and the account used, so it can say which one.
// reason: on careerbot.dev (invites.admit), not invited, an invite that expired, was withdrawn or was used by another
// account, or a suspended account; on a self-hosted copy, notInvited.
export type NotAllowed = {
  kind: "notAllowed";
  reason: "notInvited" | "expired" | "revoked" | "used" | "suspended";
  message: string;
  email: string | null;
  provider: string | null;
};

// Who may sign in to a self-hosted copy: password accounts, and Google or GitHub accounts on the allowlist.
export async function assertAllowed(ctx: GenericMutationCtx<DataModel>, userId: Id<"users">) {
  // The demo's shared, made-up person (demo.ts) has no email or account: it's signed in only by the demo sign-in.
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (membership && (await ctx.db.get(membership.workspaceId))?.demo) return;
  const password = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
    .first();
  if (password) return;
  const user = await ctx.db.get(userId);
  const email = user?.email?.toLowerCase();
  if (!email || !allowedEmails().has(email)) {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .first();
    const refused: NotAllowed = {
      kind: "notAllowed",
      reason: "notInvited",
      message: "This account can’t sign in to this copy. Ask its owner to add you.",
      email: user?.email ?? null,
      provider: account?.provider ?? null,
    };
    throw new ConvexError(refused);
  }
}
