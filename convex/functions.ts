import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { action as rawAction, mutation as rawMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { callerInDemo } from "./demo";
import { DEMO_REFUSAL, type DemoRefusal } from "./demoRefusal";

export { DEMO_REFUSAL };

// Every public mutation and action is defined with these instead of Convex's own (a lint rule enforces it), so nothing
// in the demo workspace can be changed: when the caller's workspace is the demo, the call is refused before its handler
// runs. That covers every write and every paid or outside call (AI, Apollo, Drive, GitHub, email), since each one starts
// from a public mutation or action. Signed-out callers go through unchanged: the handlers refuse them on their own.
// Internal functions aren't wrapped: only the server's own code (crons, scheduled work, auth) can call them.

const refusal: DemoRefusal = { kind: "demo", message: DEMO_REFUSAL };

// Convex accepts a definition object ({ args, handler, ... }) or a bare handler; keep whichever was given.
type Handler<Ctx> = (ctx: Ctx, ...rest: unknown[]) => unknown;
function guarded<Ctx>(definition: Handler<Ctx> | { handler: Handler<Ctx> }, inDemo: (ctx: Ctx) => Promise<boolean>) {
  const handler = typeof definition === "function" ? definition : definition.handler;
  const checked = async (ctx: Ctx, ...rest: unknown[]) => {
    if (await inDemo(ctx)) throw new ConvexError(refusal);
    return handler(ctx, ...rest);
  };
  return typeof definition === "function" ? checked : { ...definition, handler: checked };
}

// The wrappers keep Convex's own types; only the handler changes, so the casts below are safe.
type Builder = (definition: never) => unknown;
const wrap = <B extends Builder, Ctx>(raw: B, inDemo: (ctx: Ctx) => Promise<boolean>): B =>
  ((definition: Handler<Ctx> | { handler: Handler<Ctx> }) => (raw as unknown as (d: unknown) => unknown)(guarded(definition, inDemo))) as unknown as B;

// Typed as Convex's own builders up front, so a module's types never wait on the internal API (which lists them all).
export const mutation: typeof rawMutation = wrap(rawMutation, (ctx: MutationCtx) => callerInDemo(ctx));
// An action can't read the database, so it asks through an internal query.
export const action: typeof rawAction = wrap(rawAction, (ctx: ActionCtx): Promise<boolean> => ctx.runQuery(internal.demo.callerIsDemo, {}));
