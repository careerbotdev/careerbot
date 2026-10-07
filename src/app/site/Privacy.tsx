import type { ReactNode } from "react";
import { ProseEmail, ProsePage, ProseSection } from "./Prose";
import { SiteFrame } from "./SiteFrame";

// The privacy page (the Privacy board in Paper), public to everyone, signed in or not: what CareerBot keeps, who else
// sees it, and how to get a copy or have it deleted. When it changes, UPDATED changes with it.

const UPDATED = "October 6, 2026";

const email = <ProseEmail address="privacy@careerbot.dev" />;

const SECTIONS: { title: string; paragraphs: ReactNode[] }[] = [
  {
    title: "What CareerBot keeps",
    paragraphs: [
      "Your name and email from Google or GitHub when you sign in. What you write and decide in CareerBot: your stories, the record built from them, your goals, directions and limits, the companies you rate, the roles you look at and pursue, resumes, cover letters, notes, and the people you choose to contact. The cost of each paid step, so your budgets and reports work. Keys you add for OpenRouter, Apollo or Brave are stored encrypted and only used to make calls for you.",
    ],
  },
  {
    title: "Who else sees it",
    paragraphs: [
      "AI models: to write and rank for you, CareerBot sends the needed parts of your stories, record, goals and job postings to the AI models you choose, through OpenRouter. OpenRouter and the model provider handle it under their own terms.",
      "Apollo and Brave: to find companies, job postings and people, CareerBot sends search terms such as company names, industries and titles. Your stories and record aren’t sent to them.",
      "Hosting: the app runs on Cloudflare and its data is stored with Convex, in the United States.",
      "Cloudflare Web Analytics: when you’re signed out, the public pages of the website (the ones you can see without signing in) tell Cloudflare the page you viewed, without anything after a ? or #, the site you came from, your browser, operating system, type of device and country, and how fast the page loaded. Cloudflare doesn’t keep your IP address, keeps this detail for 7 days and then only a sample, and uses it only in aggregate, without identifying anyone. The signed-in app isn’t measured. To opt out, turn on Global Privacy Control or Do Not Track in your browser, and your visits aren’t counted.",
    ],
  },
  {
    title: "Google Drive and GitHub",
    paragraphs: [
      "If you connect Google Drive, CareerBot can see only the files it creates and the folder you pick for them. It can’t read anything else in your Drive. If you connect GitHub, it reads the repositories you choose, read-only, to describe your projects; keys and passwords found in them are removed before anything is sent to an AI model. You can disconnect either at any time in Settings.",
    ],
  },
  {
    title: "In your browser",
    paragraphs: [
      "CareerBot keeps you signed in, and saves a story you haven’t submitted yet and how you like the sidebar. The public pages of the website count visits with Cloudflare Web Analytics, which uses no cookies, stores nothing in your browser and doesn’t follow you to other sites. The signed-in app isn’t measured, and there’s no advertising tracking. Signing out clears unsent drafts.",
      "Talk, for telling a story out loud, uses your browser’s own speech recognition: Chrome and Edge send what you say to Google or Microsoft to turn it into text (Safari to Apple, or it stays on your device), and CareerBot keeps no recordings.",
    ],
  },
  {
    title: "The waitlist",
    paragraphs: ["If you join the waitlist, CareerBot keeps your email, when you joined, and which sign-up form on the site you used. Your email is used only to tell you when the hosted version opens. The form is used only to see which parts of the site bring people to the list. Ask and it’s all removed."],
  },
  {
    title: "The demo",
    paragraphs: [
      "The demo at demo.careerbot.dev shows a made-up person’s search. It needs no account, and nothing you type or change in it is kept. Opening it signs your browser in to the demo, and that sign-in is deleted from the server after a day. Nothing is measured inside the demo.",
    ],
  },
  {
    title: "Copies you run yourself",
    paragraphs: [
      "A copy of CareerBot someone runs themselves asks careerbot.dev once a day for the list of releases, to show its owner when a newer version is out. The request carries no account, key, personal data or anything about the copy or its people, but like any request on the web it shows careerbot.dev the IP address of the server the copy runs on. Its owner can turn this off in Settings, Updates, or with UPDATE_CHECK=off.",
    ],
  },
  {
    title: "Getting a copy or deleting it",
    paragraphs: [
      "Settings, Your data exports everything in your workspace as one file you can download: your stories, record, goals, companies and roles, pursuits, people and messages, resumes, cover letters, notes, settings and spending. It holds readable copies and a file another copy of CareerBot can import, here or on a copy you run yourself, and the other way round. Your keys, connections and password aren’t in it. The file is kept for an hour after it’s made, then deleted.",
      <>Email {email} to have your account and everything in it deleted, including your keys and your Drive connection, or for a copy of your data if you can’t sign in.</>,
    ],
  },
  {
    title: "Changes",
    paragraphs: [<>When this page changes, the date at the top changes. Questions go to {email}.</>],
  },
];

export function Privacy() {
  return (
    <SiteFrame>
      <ProsePage
        title="Privacy"
        updated={UPDATED}
        intro="CareerBot helps you with your own job search, and what you give it is used only for that. It isn’t sold, used for advertising, or shared with employers. This page covers careerbot.dev. A copy you run yourself keeps its data in your own accounts."
      >
        {SECTIONS.map((s) => (
          <ProseSection key={s.title} {...s} />
        ))}
      </ProsePage>
    </SiteFrame>
  );
}
