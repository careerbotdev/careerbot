import { type FunctionReference, type FunctionReturnType, getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import type { api } from "../../../convex/_generated/api";
import { isDemoRefusal } from "../../../convex/demoRefusal";
import { DEMO } from "../mode";
import { DEMO_REFUSAL } from "../site/words";

// The read-only demo (convex/demo.ts) in the app: nothing a visitor does there reaches the server. Every mutation and
// action the app makes goes through the Convex client (useMutation, useAction and useConvex all call its `mutation` and
// `action`), so guarding those two covers every screen without any of them knowing. In the demo a call is refused
// before it's sent, with the one toast that says why (demo.ts, REFUSAL), and the caller gets a DemoRefused error at
// once: its own failure toast is held back by the refusal's (Toast, `keep`), an error it shows inline says the same
// words, and nothing waits on an answer that won't come. A refusal from the server (a call made before the app knew it
// was the demo) is shown the same way. Convex Auth's own actions always go through: Open the demo signs in and Leave
// the demo signs out with them. Writes the app makes on its own, with no click (a tour offered, a story saved on
// leaving it, a balance or model list read), check useDemo() and aren't made, so browsing never toasts.

// What the caller gets instead of an answer: a ConvexError whose data is the refusal's words, so a caller that shows
// the server's words inline (`String(e.data)`) shows these.
export class DemoRefused extends ConvexError<string> {
  constructor() {
    super(DEMO_REFUSAL.message);
  }
}

export type Current = FunctionReturnType<typeof api.workspaces.current>;

// Whether the signed-in workspace is the demo, from workspaces.current. Until that's known, and signed out, the build
// says: the demo's build runs only against the demo's deployment (mode.ts), so a write made the moment Today opens,
// before the answer is in, is still held back there.
export const demoOf = (current: Current | undefined) => (current ? current.demo : DEMO);

type Ref = FunctionReference<"mutation" | "action">;
type Method = (fn: Ref, ...rest: unknown[]) => Promise<unknown>;

// Guards a client's mutation and action: refused at once while `inDemo()`, and a server refusal is shown the same way.
export function guardDemo<C extends { mutation: unknown; action: unknown }>(client: C, inDemo: () => boolean, refuse: () => void): C {
  const guard =
    (call: Method): Method =>
    (fn, ...rest) => {
      // Convex Auth's own actions are called by name ("auth:signIn", "auth:signOut").
      if (getFunctionName(fn).startsWith("auth:")) return call(fn, ...rest);
      if (inDemo()) {
        refuse();
        return Promise.reject(new DemoRefused());
      }
      return call(fn, ...rest).catch((e: unknown) => {
        if (!isDemoRefusal(e)) throw e;
        refuse();
        throw new DemoRefused();
      });
    };
  const methods = client as unknown as { mutation: Method; action: Method };
  methods.mutation = guard(methods.mutation.bind(client));
  methods.action = guard(methods.action.bind(client));
  return client;
}
