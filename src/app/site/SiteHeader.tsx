"use client";

import { usePathname } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button, buttonLook } from "@/components/Button";
import { Icons } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { WEBSITE } from "../mode";
import { goToWaitlist, WAITLIST_ID } from "./Waitlist";
import { HERO, MENU, PAGES, SIGN_IN_LINK } from "./words";

// The public pages' header (the Website v4 — Pages boards in Paper), sticky at the top of the page. At the top it has
// no surface; once the page moves, a solid surface and a hairline fade in (instantly with reduced motion). Its height
// never changes, so nothing reflows.
// Large screens: the wordmark, then on the right the pages (Home, How it works, Open source, Questions; the one you're
// on marked in steel-subtle), Sign in as an outlined pill and Get notified in amber, which takes you to the page's
// waitlist form with the cursor in its field.
// Phones and medium screens: the wordmark, Sign in and a Menu button. The menu drops a solid panel under the bar, over a
// dimmed page: the pages as rows (the one you're on marked), then Get notified across the panel. It's a disclosure:
// Escape closes it and puts the focus back on the button, Tab stays inside the header while it's open, the page behind
// doesn't scroll, and it closes when the window grows to a large screen.
// The pages are plain links: each loads the whole page (nav.ts). Once joined (`joined`), Get notified leaves the bar and
// the menu. `form`: where the page's waitlist form is. "hero": at the top (Home), so the bar's Get notified waits until
// it's out of view; "closing": at the end, so it's always there; none (the privacy page): Get notified goes to Home's.

export type SiteForm = "hero" | "closing";

export type HeaderState = {
  // The page has moved from the top: the bar takes its surface and hairline.
  scrolled: boolean;
  // Get notified shows in the bar on a large screen.
  notify: boolean;
};

const LARGE = "(min-width: 80rem)";
// The large bar's height: the hero's form counts as out of view once it's under the bar.
const BAR = 72;

// The header's state from the page itself: how far it has moved, and whether the hero's form is still in view.
function usePageState(form: SiteForm | undefined): HeaderState {
  const [scrolled, setScrolled] = useState(false);
  const [notify, setNotify] = useState(form !== "hero");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const box = form === "hero" && document.getElementById(WAITLIST_ID);
    if (!box) return;
    const hero = new IntersectionObserver(([e]) => setNotify(!e.isIntersecting), { rootMargin: `-${BAR}px 0px 0px 0px` });
    hero.observe(box);
    return () => hero.disconnect();
  }, [form]);

  return { scrolled, notify };
}

// Get notified in the menu and the bar: 52px across the panel, a 36px pill in the bar.
const menuNotify = "h-13! w-full rounded-site-field! text-site-control! leading-site-control! font-semibold!";
const barNotify = "h-9! rounded-site-pill! px-4! text-site-nav! leading-site-nav! font-semibold!";

function GetNotified({ form, className, onGo }: { form: SiteForm | undefined; className: string; onGo?: () => void }) {
  if (!form)
    return (
      <a href={`/#${WAITLIST_ID}`} className={buttonLook("primary", className, "lg")}>
        {HERO.cta}
      </a>
    );
  return (
    <Button
      variant="primary"
      size="lg"
      className={className}
      detail={form === "hero" ? "Takes you to the waitlist at the top of the page." : "Takes you to the waitlist at the end of the page."}
      note="Free"
      onClick={() => {
        onGo?.();
        goToWaitlist();
      }}
    >
      {HERO.cta}
    </Button>
  );
}

// `state`: held still for a specimen (Storybook) instead of read from the page. `defaultOpen`: the menu starts open.
// `solid`: the surface and hairline from the start (the docs, whose sidebar sits right under it). A page's link is
// current on the page and anywhere under it (Docs on every docs page). A self-hosted copy and the demo have no
// waitlist (mode.ts).
export function SiteHeader({
  form,
  joined = false,
  state,
  defaultOpen = false,
  solid: alwaysSolid = false,
}: {
  form?: SiteForm;
  joined?: boolean;
  state?: HeaderState;
  defaultOpen?: boolean;
  solid?: boolean;
}) {
  const page = usePageState(form);
  const { scrolled, notify } = state ?? page;
  const pathname = usePathname();
  const current = PAGES.findIndex((p) => p.href === pathname || (p.href !== "/" && pathname.startsWith(`${p.href}/`)));
  const waitlist = !joined && WEBSITE;
  const [open, setOpen] = useState(defaultOpen);
  const menuId = useId();
  const header = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Escape closes the menu and puts the focus back on its button; growing to a large screen closes it.
  useEffect(() => {
    if (!open) return;
    const large = matchMedia(LARGE);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onLarge = () => {
      if (large.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    large.addEventListener("change", onLarge);
    return () => {
      document.removeEventListener("keydown", onKey);
      large.removeEventListener("change", onLarge);
    };
  }, [open]);

  // The page behind the open menu holds still. A layout effect, so closing (in flushSync) frees it before Get notified
  // scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open]);

  // While the menu is open, Tab and Shift+Tab go round the header's visible controls.
  const contain = (e: KeyboardEvent<HTMLElement>) => {
    if (!open || e.key !== "Tab" || !header.current) return;
    const controls = [...header.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((el) => el.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const solid = alwaysSolid || scrolled || open;
  const MenuIcon = open ? Icons.close : Icons.menu;

  return (
    <header ref={header} onKeyDown={contain} className="sticky top-0 z-30 w-full shrink-0">
      <nav aria-label="Site" className="relative">
        <div
          className={`h-16 border-b pr-2 pl-5 transition-colors duration-200 ease-out motion-reduce:transition-none min-[360px]:pr-3 md:pr-8 md:pl-10 lg:h-18 lg:px-16 ${solid ? "border-border bg-surface" : "border-transparent bg-transparent"}`}
        >
          <div className="mx-auto flex h-full w-full max-w-300 items-center justify-between gap-2">
            {/* A plain link on purpose: it loads the whole page, which the analytics count (nav.ts). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="inline-flex shrink-0 rounded-sm">
              <span className="inline-flex min-[360px]:hidden">
                <Logo height={18} />
              </span>
              <span className="hidden min-[360px]:inline-flex lg:hidden">
                <Logo height={21} />
              </span>
              <span className="hidden lg:inline-flex">
                <Logo height={26} />
              </span>
            </a>
            <div className="flex items-center gap-1 lg:gap-2.5">
              <ul className="hidden items-center gap-0.5 pr-1.5 lg:flex">
                {PAGES.map((p, i) => (
                  <li key={p.href} className="flex">
                    <a
                      href={p.href}
                      aria-current={i === current ? "page" : undefined}
                      className={`inline-flex h-9 items-center rounded-site-pill px-3.5 text-site-nav leading-site-nav font-medium whitespace-nowrap transition-colors duration-100 motion-reduce:transition-none ${i === current ? "bg-steel-subtle text-text" : "text-muted hover:text-text"}`}
                    >
                      {p.label}
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href={SIGN_IN_LINK.href}
                className="inline-flex h-11 items-center rounded-site-pill border border-border px-3.5 text-site-nav leading-site-nav font-medium whitespace-nowrap text-text transition-colors duration-100 hover:bg-subtle min-[360px]:px-4.5 lg:h-9 lg:px-4"
              >
                {SIGN_IN_LINK.label}
              </a>
              {notify && waitlist && (
                <span className="hidden transition-opacity duration-200 ease-out motion-reduce:transition-none starting:opacity-0 lg:flex">
                  <GetNotified form={form} className={barNotify} />
                </span>
              )}
              <button
                ref={button}
                type="button"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((o) => !o)}
                className={`inline-flex h-11 items-center gap-2 rounded-site-pill pr-3 pl-2.5 text-site-nav leading-site-nav font-medium text-text transition-colors duration-100 hover:bg-subtle min-[360px]:pr-4 min-[360px]:pl-3.5 lg:hidden ${open ? "bg-subtle" : ""}`}
              >
                <MenuIcon size={20} aria-hidden="true" />
                {open ? MENU.close : MENU.open}
              </button>
            </div>
          </div>
        </div>
        {open && <div aria-hidden="true" onClick={() => setOpen(false)} className="absolute inset-x-0 top-full h-dvh bg-backdrop lg:hidden" />}
        <div id={menuId} hidden={!open} className="absolute inset-x-0 top-full flex flex-col gap-5 border-b border-border bg-surface px-5 pt-2 pb-6 md:px-10 lg:hidden">
          <ul className="flex flex-col">
            {PAGES.map((p, i) => (
              <li key={p.href} className="flex">
                {/* A hairline between rows, except around the page you're on, whose pill stands on its own. */}
                <a
                  href={p.href}
                  aria-current={i === current ? "page" : undefined}
                  className={`flex h-14 w-full items-center px-3.5 text-title-lg leading-title-lg tracking-title-lg font-medium ${i === current ? "rounded-site-pill bg-steel-subtle text-text" : "rounded-sm text-muted"} ${i < PAGES.length - 1 && i !== current && i + 1 !== current ? "border-b border-border" : ""}`}
                >
                  {p.label}
                </a>
              </li>
            ))}
          </ul>
          {waitlist && <GetNotified form={form} className={menuNotify} onGo={() => flushSync(() => setOpen(false))} />}
        </div>
      </nav>
    </header>
  );
}
