import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { mutation } from "./functions";

// The waitlist on the public website (careerbot.dev): anyone, signed out, can leave an email to hear when CareerBot
// opens up. Nothing is sent; the list is only stored, for the operator to read (waitlist:list) and to remove someone
// who asks (waitlist:remove), as the privacy page promises.

const MAX_EMAIL = 254;
const MAX_SOURCE = 64;
// A flood guard for the whole site: at most this many joins in any ten minutes.
const FLOOD_LIMIT = 200;
const FLOOD_WINDOW_MS = 10 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const join = mutation({
  args: { email: v.string(), source: v.optional(v.string()), website: v.optional(v.string()) },
  handler: async (ctx, { email, source, website }) => {
    // A hidden field people never see: a bot fills it in, and is told it worked.
    if (website?.trim()) return { ok: true as const };
    const address = email.trim().toLowerCase();
    if (address.length > MAX_EMAIL || !EMAIL.test(address)) throw new ConvexError("That doesn't look like an email address.");
    const now = Date.now();
    const recent = await ctx.db.query("waitlist").withIndex("by_at", (q) => q.gt("at", now - FLOOD_WINDOW_MS)).take(FLOOD_LIMIT);
    if (recent.length >= FLOOD_LIMIT) throw new ConvexError("Too many sign-ups right now. Try again in a few minutes.");
    // Already on the list: the same answer, so the form never says who has joined.
    if (await ctx.db.query("waitlist").withIndex("by_email", (q) => q.eq("email", address)).first()) return { ok: true as const };
    const from = source?.trim().slice(0, MAX_SOURCE);
    await ctx.db.insert("waitlist", { email: address, at: now, ...(from ? { source: from } : {}) });
    return { ok: true as const };
  },
});

// Everyone on the waitlist, newest first, for the operator (npx convex run waitlist:list).
export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("waitlist").withIndex("by_at").order("desc").collect();
    return rows.map((r) => ({ email: r.email, at: r.at, source: r.source ?? null }));
  },
});

// Takes an address off the list, however it was typed. For the operator: npx convex run waitlist:remove.
export const remove = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const row = await ctx.db.query("waitlist").withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase())).first();
    if (row) await ctx.db.delete(row._id);
    return { removed: !!row };
  },
});
