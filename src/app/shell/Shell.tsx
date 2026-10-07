"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import { BottomBar, type BottomBarMode } from "@/components/BottomBar";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { ConfirmDialog } from "@/components/Dialog";
import type { MenuEntry } from "@/components/Menu";
import { useScreenSize } from "@/components/Panes";
import { AREAS, MoreSheet, Sidebar } from "@/components/Sidebar";
import { useDemo } from "../demo/demo";
import { useSignOut } from "../localDrafts";
import { DEMO } from "../mode";
import { useToday } from "../today/data";
import { DemoBanner } from "./DemoBanner";
import { GO, Shortcuts, useGoKeys } from "./Shortcuts";
import { ShellProvider, useShellState } from "./ShellContext";
import { useActivity } from "./useActivity";
import { TourOffers } from "./useTour";
import { WhatsNew } from "./WhatsNew";
import { SignIn } from "../SignIn";
import { isPublic } from "../site/nav";
import { CAREERBOT_URL } from "../site/words";

// The frame every signed-in screen sits in: the sidebar on large screens (collapsible to the rail, remembered on this
// device), the rail on medium ones, the bottom bar with More on a phone; ⌘K, G then a letter, and ? everywhere; the
// activity indicator; and in the read-only demo, its banner over all of it. Signed out, there's no frame: the home page
// shows the website, and any other address shows the sign-in (then comes back to that address), never an empty page.
// The website's other pages (How it works, Open source, Questions) and the privacy page are public: they show as they
// are to everyone, signed in or not, with no frame. So are the docs (/docs and everything under it), on careerbot.dev,
// the demo and a self-hosted copy alike.
export function Shell({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const path = usePathname();
  // On the demo's build, the demo is seeded again whole at each release, so a visitor there at that moment is signed in
  // as a person that's gone (no workspace): they go back to the way in instead of screens that can't load. The frame
  // waits until the workspace is known.
  const current = useQuery(api.workspaces.current, DEMO && isAuthenticated ? {} : "skip");
  const gone = DEMO && isAuthenticated && current === null;
  const signOut = useSignOut();
  useEffect(() => {
    if (gone) void signOut();
  }, [gone, signOut]);
  if (isPublic(path)) return children;
  const signedOut = !isAuthenticated && !isLoading && path !== "/";
  const ready = !DEMO || !!current;
  return <ShellProvider>{isAuthenticated ? ready && <Frame><TourOffers>{children}</TourOffers></Frame> : signedOut ? <SignIn /> : children}</ShellProvider>;
}

const RAIL_KEY = "careerbot.sidebar";
const subscribeStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

// The sidebar collapsed to the rail on this device.
function useCollapsed() {
  const collapsed = useSyncExternalStore(subscribeStorage, () => localStorage.getItem(RAIL_KEY) === "rail", () => false);
  const toggle = useCallback(() => {
    localStorage.setItem(RAIL_KEY, collapsed ? "open" : "rail");
    window.dispatchEvent(new StorageEvent("storage", { key: RAIL_KEY }));
  }, [collapsed]);
  return [collapsed, toggle] as const;
}

// The section of the page shown ("#tools"): Next moves between sections without a hashchange, so this listens to the
// browser's navigations too.
const subscribeHash = (onChange: () => void) => {
  const nav = "navigation" in window && window.navigation instanceof EventTarget ? window.navigation : null;
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  nav?.addEventListener("navigatesuccess", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    nav?.removeEventListener("navigatesuccess", onChange);
  };
};

// Going to a section of a page that's still loading: scroll to it once it appears (for up to a few seconds).
function useScrollToSection(path: string, hash: string) {
  useEffect(() => {
    if (!hash) return;
    const find = () => document.getElementById(decodeURIComponent(hash.slice(1)));
    const found = find();
    if (found) return void found.scrollIntoView({ block: "start" });
    const watch = new MutationObserver(() => {
      const el = find();
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      watch.disconnect();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    const stop = window.setTimeout(() => watch.disconnect(), 5000);
    return () => {
      watch.disconnect();
      window.clearTimeout(stop);
    };
  }, [path, hash]);
}

// The item of the bottom bar a page belongs to.
function barItem(path: string) {
  if (path === "/") return "Today";
  if (path.startsWith("/review")) return "Review";
  if (path.startsWith("/pursuits") || path.startsWith("/roles")) return "Pursuits";
  return "More";
}

// Leave the demo, on the demo's build: back to careerbot.dev once signed out.
const toCareerBot = () => window.location.assign(CAREERBOT_URL);

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const router = useRouter();
  const size = useScreenSize();
  const [collapsed, toggle] = useCollapsed();
  const [searching, setSearching] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [more, setMore] = useState(false);
  const { bar, commands: screenCommands, asked } = useShellState();
  const signOut = useSignOut();
  const demo = useDemo();
  // The demo workspace is named for its made-up person, whom the banner names.
  const workspace = useQuery(api.workspaces.current, demo ? {} : "skip");
  const leave = useSignOut(DEMO ? toCareerBot : undefined);
  const me = useQuery(api.users.me);
  const today = useToday();
  const { jobs, spend } = useActivity();
  useScrollToSection(path, hash);
  const push = useCallback((href: string) => router.push(href), [router]);
  const showShortcuts = useCallback(() => setShortcuts(true), []);
  useGoKeys(push, showShortcuts);

  const reviewTotal = today?.review[0]?.kind === "review" ? today.review[0].summary.total : undefined;
  const counts = { today: today?.lines.length || undefined, review: reviewTotal, pursuits: today?.due || undefined };
  const activity = { jobs: jobs ?? [], spend };
  const user = { name: me?.name ?? me?.email ?? "You" };
  const account: MenuEntry[] = useMemo(
    () => [
      { label: "Settings", icon: "settings", onSelect: () => router.push("/settings") },
      { label: "Sign out", icon: "signOut", onSelect: signOut },
    ],
    [router, signOut],
  );

  const commands = useMemo((): Command[] => {
    const go = (href: string) => () => router.push(href);
    return [
      ...screenCommands,
      ...AREAS.flat().flatMap((a): Command[] => [
        { id: `go-${a.key}`, group: "Go to", label: a.label, icon: a.icon, keys: a.keys, onSelect: go(a.href) },
        ...(a.items ?? [])
          .filter((s) => s.href !== a.href)
          .map((s): Command => ({ id: `go-${a.key}-${s.key}`, group: "Go to", label: s.label, detail: a.label, icon: a.icon, onSelect: go(s.href) })),
      ]),
      { id: "go-settings", group: "Go to", label: "Settings", icon: "settings", keys: GO.s.keys, onSelect: go("/settings") },
      { id: "shortcuts", group: "Help", label: "All shortcuts", icon: "shortcuts", keys: "?", onSelect: () => setShortcuts(true) },
      ...(size === "large" ? [{ id: "sidebar", group: "Help", label: collapsed ? "Expand sidebar" : "Collapse sidebar", icon: "sidebar" as const, onSelect: toggle }] : []),
      { id: "sign-out", group: "Account", label: "Sign out", icon: "signOut", onSelect: signOut },
    ];
  }, [screenCommands, router, size, collapsed, toggle, signOut]);

  const small = size === "small";
  const nav: BottomBarMode = {
    kind: "nav",
    current: barItem(path),
    items: [
      { label: "Today", icon: "today", href: "/" },
      { label: "Review", icon: "review", href: "/review", count: reviewTotal },
      { label: "Pursuits", icon: "pursuits", href: "/pursuits", count: today?.due || undefined },
      { label: "More", icon: "more", onSelect: () => setMore(true) },
    ],
  };
  const question: BottomBarMode | null =
    asked && small ? { kind: "confirm", message: asked.title, detail: typeof asked.body === "string" ? asked.body : undefined, confirmLabel: asked.confirmLabel, onConfirm: () => asked.answer(true), onCancel: () => asked.answer(false) } : null;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface">
      {demo && <DemoBanner person={workspace?.name ?? ""} onLeave={leave} />}
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {!small && (
          <Sidebar
            current={`${path}${hash}`}
            counts={counts}
            activity={activity}
            user={user}
            account={account}
            onSearch={() => setSearching(true)}
            rail={size === "medium" || collapsed}
            onToggle={size === "large" ? toggle : undefined}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Screens scroll inside their own panes; this frame never scrolls, so nothing can move past the shell. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          {small && (
            <>
              <BottomBar mode={question ?? bar ?? nav} />
              <MoreSheet open={more} onOpenChange={setMore} current={`${path}${hash}`} counts={counts} activity={activity} user={user} account={account} />
            </>
          )}
        </div>
      </div>
      <CommandPalette open={searching} onOpenChange={setSearching} commands={commands} />
      <Shortcuts open={shortcuts} onOpenChange={setShortcuts} />
      {!DEMO && !demo && <WhatsNew />}
      {!small && (
        <ConfirmDialog
          open={!!asked}
          onOpenChange={(open) => !open && asked?.answer(false)}
          title={asked?.title ?? ""}
          body={asked?.body}
          confirmLabel={asked?.confirmLabel ?? ""}
          onConfirm={() => asked?.answer(true)}
        />
      )}
    </div>
  );
}
