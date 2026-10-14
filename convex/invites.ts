import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import type { NotAllowed } from "./allowlist";
import { defaultAllowance, platformAi } from "./plan";
import { suspended } from "./suspensions";

// careerbot.dev's invites. An operator invites an email (adminPeople.ts); the link (/invite/<token>) says what the beta
// is and offers Google and GitHub. Sign-in is accepted for someone who already has a workspace, or whose account's
// email has an open invite that hasn't expired: the first such sign-in uses it up (accepted). Sent again, an invite
// gets a new link and 14 more days; withdrawn (revoked), it no longer lets anyone in. A self-hosted copy doesn't use
// invites (allowlist.ts).

export const INVITE_DAYS = 14;
const INVITE_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const normalEmail = (email: string) => email.trim().toLowerCase();

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

// Where an invite stands now: an open one past its date has expired.
export type InviteState = "open" | "expired" | "accepted" | "revoked";
export const stateOf = (invite: Doc<"invites">, now = Date.now()): InviteState => (invite.status === "open" && invite.expiresAt <= now ? "expired" : invite.status);

export const inviteFor = (ctx: QueryCtx, email: string) => ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", normalEmail(email))).unique();

// Invites an email, or invites it again (a new link and 14 more days) when it was invited before and isn't used yet.
// Refused for an email already used to sign up.
export async function openInvite(ctx: MutationCtx, email: string, invitedBy: Id<"users"> | undefined) {
  const address = normalEmail(email);
  if (!EMAIL.test(address)) throw new ConvexError("That doesn’t look like an email address.");
  const existing = await inviteFor(ctx, address);
  if (existing?.status === "accepted") throw new ConvexError(`${address} already has an account.`);
  const fields = { token: newToken(), status: "open" as const, expiresAt: Date.now() + INVITE_MS };
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { id: existing._id, token: fields.token, again: true };
  }
  const id = await ctx.db.insert("invites", { email: address, invitedBy, ...fields });
  return { id, token: fields.token, again: false };
}

// Who may sign in on careerbot.dev: someone not suspended who already has a workspace, or whose email has an open
// invite, which this sign-in uses up. Anyone else is refused with why (NotAllowed).
export async function admit(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  const account = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).first();
  const refuse = (reason: NotAllowed["reason"], message: string): never => {
    throw new ConvexError<NotAllowed>({ kind: "notAllowed", reason, message, email: user?.email ?? null, provider: account?.provider ?? null });
  };
  if (await suspended(ctx, userId)) refuse("suspended", "This account is suspended.");
  if (await ctx.db.query("memberships").withIndex("by_user", (q) => q.eq("userId", userId)).first()) return;
  const invite = user?.email ? await inviteFor(ctx, user.email) : null;
  const state = invite && stateOf(invite);
  if (!invite || !state) return refuse("notInvited", "This account isn't invited.");
  if (state === "open") {
    await ctx.db.patch(invite._id, { status: "accepted", acceptedUserId: userId, acceptedAt: Date.now() });
    return;
  }
  if (state === "accepted" && invite.acceptedUserId === userId) return;
  if (state === "expired") refuse("expired", "This account's invite has expired.");
  if (state === "revoked") refuse("revoked", "This account's invite was withdrawn.");
  refuse("used", "This account's invite was already used by another account.");
}

// The invite page (/invite/<token>): where its invite stands, the email it's for and the monthly AI included. A token
// that's no invite's, or was replaced by a newer link, reads as unknown.
export const lookup = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = token ? await ctx.db.query("invites").withIndex("by_token", (q) => q.eq("token", token)).unique() : null;
    // The AI allowance only when this deployment has CareerBot's AI set up: without it the page promises none.
    const allowanceUsd = platformAi() ? defaultAllowance() : null;
    if (!invite) return { state: "unknown" as const, email: null, expiresAt: null, allowanceUsd };
    // The email only while the invite is open, for the page's greeting: a link that leaks later shows no address.
    const state = stateOf(invite);
    return { state, email: state === "open" ? invite.email : null, expiresAt: invite.expiresAt, allowanceUsd };
  },
});

// npx convex run invites:fromAllowlist: carries SIGNUP_ALLOWLIST over to invites, once, when careerbot.dev moves to
// invites. An email someone already signed in with becomes a used invite of theirs; any other, an open invite (its link
// printed, to send). Emails already invited are left as they are. Each is logged (adminLog).
export const fromAllowlist = internalMutation({
  args: {},
  handler: async (ctx) => {
    const emails = [...new Set((process.env.SIGNUP_ALLOWLIST ?? "").split(",").map(normalEmail).filter(Boolean))];
    const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    const carried: { email: string; state: "accepted" | "open" | "already invited"; link?: string }[] = [];
    for (const email of emails) {
      if (await inviteFor(ctx, email)) {
        carried.push({ email, state: "already invited" });
        continue;
      }
      const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first();
      const now = Date.now();
      if (user) {
        await ctx.db.insert("invites", { email, token: newToken(), status: "accepted", expiresAt: now, acceptedUserId: user._id, acceptedAt: now });
        carried.push({ email, state: "accepted" });
      } else {
        const { token } = await openInvite(ctx, email, undefined);
        carried.push({ email, state: "open", link: `${site}/invite/${token}` });
      }
      await ctx.db.insert("adminLog", { at: now, action: "allowlistCarried", email, ...(user ? { userId: user._id } : {}) });
    }
    return carried;
  },
});
