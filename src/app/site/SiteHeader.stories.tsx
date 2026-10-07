import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { within } from "storybook/test";
import { Section } from "./Section";
import { type HeaderState, SiteHeader } from "./SiteHeader";
import { HEADLINE, HERO } from "./words";

// The public pages' header over the top of a page. On a large screen: Home at the top (Home marked, no Get notified
// while the hero's form is in view) and scrolled (Get notified in the bar), How it works (its own page marked, Get
// notified always there), after joining, and with the focus on a link. On a phone: at the top, scrolled, the menu open
// on Home and on How it works (the page you're on marked), and with the focus on the menu button. It spans the page, so
// it sits in the frame the way the page holds it.

const on = (pathname: string) => ({ nextjs: { appDirectory: true, navigation: { pathname } } });

const meta = {
  title: "Site/Parts/Header",
  parameters: { layout: "fullscreen", ...on("/") },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const TOP: HeaderState = { scrolled: false, notify: false };
const SCROLLED: HeaderState = { scrolled: true, notify: true };
const phone = { viewport: { value: "mobile2" } };

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="-m-6 h-120 overflow-hidden">
      {children}
      <Section className="pt-10 md:pt-18">
        <p className="max-w-260 text-site-hero-sm leading-site-hero-sm tracking-site-hero-sm font-semibold lg:text-site-hero lg:leading-site-hero lg:tracking-site-hero">{HEADLINE}</p>
        <p className="max-w-175 pt-5 text-site-lead-sm leading-site-lead-sm text-muted md:pt-6 lg:text-site-lead lg:leading-site-lead">{HERO.subline}</p>
      </Section>
    </div>
  );
}

// Puts the focus on the first control with this name, as Tab would (so it shows its ring).
const focus = (role: "link" | "button", name: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const [control] = await within(canvasElement).findAllByRole(role, { name });
  control.focus();
};

export const Top: Story = {
  render: () => (
    <Page>
      <SiteHeader form="hero" state={TOP} />
    </Page>
  ),
};

export const Scrolled: Story = {
  render: () => (
    <Page>
      <SiteHeader form="hero" state={SCROLLED} />
    </Page>
  ),
};

export const OtherPage: Story = {
  name: "On How it works",
  parameters: on("/how-it-works"),
  render: () => (
    <Page>
      <SiteHeader form="closing" state={{ scrolled: false, notify: true }} />
    </Page>
  ),
};

export const Joined: Story = {
  name: "Scrolled, joined",
  render: () => (
    <Page>
      <SiteHeader form="hero" joined state={SCROLLED} />
    </Page>
  ),
};

export const Focus: Story = {
  render: () => (
    <Page>
      <SiteHeader form="hero" state={TOP} />
    </Page>
  ),
  play: focus("link", "Open source"),
};

export const PhoneTop: Story = {
  name: "Phone, top",
  globals: phone,
  render: () => (
    <Page>
      <SiteHeader form="hero" state={TOP} />
    </Page>
  ),
};

export const PhoneScrolled: Story = {
  name: "Phone, scrolled",
  globals: phone,
  render: () => (
    <Page>
      <SiteHeader form="hero" state={SCROLLED} />
    </Page>
  ),
};

export const MenuOpen: Story = {
  name: "Phone, menu open",
  globals: phone,
  render: () => (
    <Page>
      <SiteHeader form="hero" state={TOP} defaultOpen />
    </Page>
  ),
};

export const MenuOpenOtherPage: Story = {
  name: "Phone, menu open on How it works",
  globals: phone,
  parameters: on("/how-it-works"),
  render: () => (
    <Page>
      <SiteHeader form="closing" state={TOP} defaultOpen />
    </Page>
  ),
};

export const PhoneFocus: Story = {
  name: "Phone, focus",
  globals: phone,
  render: () => (
    <Page>
      <SiteHeader form="hero" state={TOP} />
    </Page>
  ),
  play: focus("button", "Menu"),
};
