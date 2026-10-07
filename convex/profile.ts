import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { requireWorkspace } from "./workspaces";

// Phones are shown the standard way however they were typed: (512) 555-0142 for US numbers, international format
// otherwise. Anything that isn't a valid number is kept as typed.
export function formatPhone(raw: string) {
  const t = raw.trim();
  if (!t) return undefined;
  const n = parsePhoneNumberFromString(t, "US");
  if (!n?.isValid()) return t;
  return n.country === "US" ? n.formatNational() : n.formatInternational();
}

// The person's name and contact line, shown at the top of exported resumes. Never read by an AI step.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const p = await ctx.db.query("profiles").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    return p ? { name: p.name, email: p.email, phone: p.phone, location: p.location, links: p.links } : null;
  },
});

export const save = mutation({
  args: { name: v.string(), email: v.string(), phone: v.string(), location: v.string(), links: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireWorkspace(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Add your name.");
    const opt = (x: string) => x.trim() || undefined;
    const fields = { name, email: opt(args.email), phone: formatPhone(args.phone), location: opt(args.location), links: args.links.map((l) => l.trim()).filter(Boolean) };
    const p = await ctx.db.query("profiles").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).unique();
    if (p) await ctx.db.patch(p._id, fields);
    else await ctx.db.insert("profiles", { workspaceId, ...fields });
  },
});
