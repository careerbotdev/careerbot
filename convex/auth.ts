import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { passwords } from "./account";
import { assertAllowed, selfHosted } from "./allowlist";
import { ensureWorkspace } from "./workspaces";

// Where sign-in may send someone back to: a path on the site (SITE_URL), the site itself, or another origin listed in
// AUTH_REDIRECT_ORIGINS (comma-separated, e.g. http://localhost:3000, so local work can share the dev deployment that
// dev.careerbot.dev uses). Anything else is refused, as Convex Auth's own check does.
export function redirectBack(redirectTo: string) {
  const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) return `${site}${redirectTo}`;
  const allowed = [site, ...(process.env.AUTH_REDIRECT_ORIGINS ?? "").split(",")].map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  for (const origin of allowed) {
    const after = redirectTo.startsWith(origin) ? redirectTo[origin.length] : null;
    if (after === undefined || after === "?" || after === "/") return redirectTo;
  }
  throw new Error(`Invalid redirectTo ${redirectTo}`);
}

// The ways to sign in. Google and GitHub are each on when their keys are in the Convex deployment's environment
// (AUTH_GITHUB_ID and AUTH_GITHUB_SECRET; AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET), so a copy someone runs themselves
// offers only what they set up. Username and password is on for a self-hosted copy (CAREERBOT_MODE=self-hosted;
// account.ts), and never on careerbot.dev.
export type SignInMethod = "password" | "google" | "github";
const METHOD_KEYS: Record<"google" | "github", string[]> = {
  google: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
  github: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"],
};

// The demo (demo.ts): signs a visitor in at once as the demo's shared, made-up person, with no account and nothing to
// type. It works only where a workspace is marked demo, so production, which has none, refuses it. Not offered on the
// sign-in screen (signInMethods): the demo's own page calls it.
const demo = ConvexCredentials<DataModel>({
  id: "demo",
  authorize: async (_params, ctx) => {
    const found = await ctx.runQuery(internal.demo.signInUser, {});
    if ("kind" in found) throw new ConvexError(found);
    return { userId: found.userId };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, Google, passwords, demo],
  callbacks: {
    redirect: async ({ redirectTo }) => redirectBack(redirectTo),
    beforeSessionCreation: async (ctx, { userId }) => {
      await assertAllowed(ctx, userId);
      await ensureWorkspace(ctx, userId);
      await ctx.db.patch(userId, { lastSignInAt: Date.now() });
    },
  },
});

// The sign-in screen's ways in: the methods this deployment has set up, read when asked so a changed key counts at once.
export const signInMethods = query({
  args: {},
  handler: async (): Promise<SignInMethod[]> => [
    ...(selfHosted() ? (["password"] as const) : []),
    ...(Object.keys(METHOD_KEYS) as (keyof typeof METHOD_KEYS)[]).filter((m) => METHOD_KEYS[m].every((key) => !!process.env[key]?.trim())),
  ],
});
