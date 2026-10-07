"use client";

import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { NavigationPromisesContext, PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { type ReactNode, useMemo, useState } from "react";
import { watchClock } from "./clock";
import { installDemoGuard } from "./demo/demo";

// Convex for a screen's stories: the screen calls its real queries, mutations and actions, and each is answered from
// fixtures instead of a deployment. A query's answer is `(args) => value` (undefined while it "loads"); a mutation or
// action's is `(args) => result`, which may change the fixtures: after each one every query shown is asked again, as
// live data would be. Anything not answered loads forever (queries) or resolves with null. Guarded as the app's client
// is (demo/demo.ts): answer workspaces.current with `demo: true` and every action shows the demo's refusal instead.

type Answer = (args: never) => unknown;
export type Answers = Record<string, Answer>;

// One answer, keyed by the function it answers, typed by it.
export function answer<F extends FunctionReference<"query" | "mutation" | "action">>(fn: F, run: (args: F["_args"]) => F["_returnType"] | undefined | void): Answers {
  return { [getFunctionName(fn)]: run as Answer };
}

class FakeClient {
  private listeners = new Set<() => void>();
  private cache = new Map<string, unknown>();
  logger = { log: () => {}, warn: () => {}, error: console.error, logVerbose: () => {} };
  constructor(private answers: Answers) {}

  changed = () => {
    this.cache.clear();
    for (const l of [...this.listeners]) l();
  };

  private ask(name: string, args: Record<string, unknown>) {
    const key = `${name}:${JSON.stringify(args)}`;
    if (!this.cache.has(key)) this.cache.set(key, this.answers[name]?.(args as never));
    return this.cache.get(key);
  }

  watchQuery(query: FunctionReference<"query">, args: Record<string, unknown> = {}) {
    const name = getFunctionName(query);
    return {
      onUpdate: (callback: () => void) => {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
      },
      localQueryResult: () => this.ask(name, args),
      localQueryLogs: () => undefined,
      journal: () => undefined,
    };
  }

  private async run(fn: FunctionReference<"mutation" | "action">, args: Record<string, unknown> = {}) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 80);
    await promise;
    const out = this.answers[getFunctionName(fn)]?.(args as never);
    this.changed();
    return out ?? null;
  }

  mutation = (fn: FunctionReference<"mutation">, args?: Record<string, unknown>) => this.run(fn, args);
  action = (fn: FunctionReference<"action">, args?: Record<string, unknown>) => this.run(fn, args);
}

// Wraps a story: its screen reads the answers given (read once; the fixtures behind them may change).
export function StoryConvex({ answers, children }: { answers: Answers; children: ReactNode }) {
  const [client] = useState(() => {
    const fake = installDemoGuard(new FakeClient(answers));
    watchClock(fake);
    return fake;
  });
  return <ConvexProvider client={client as unknown as ConvexReactClient}>{children}</ConvexProvider>;
}

// The address for a screen's stories: `query` to start from, and push or replace change it as the app's router
// would, so a story's clicks and keys move between items. Another page's address is left alone.
export function StoryRouter({ path, query, children }: { path: string; query?: string; children: ReactNode }) {
  const [params, setParams] = useState(() => new URLSearchParams(query));
  const router = useMemo(() => {
    const go = (href: string) => {
      const url = new URL(href, "http://story");
      if (url.pathname === path) setParams(url.searchParams);
    };
    return { push: go, replace: go, back: () => {}, forward: () => {}, refresh: () => {}, prefetch: () => {}, hmrRefresh: () => {} } as unknown as AppRouterInstance;
  }, [path]);
  return (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={path}>
        <NavigationPromisesContext.Provider value={null}>
          <SearchParamsContext.Provider value={params}>{children}</SearchParamsContext.Provider>
        </NavigationPromisesContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}
