import { expect, test } from "vitest";
import { skillKey } from "./resumeDoc";
import { titleCaseSkill } from "./skillNames";

const CASES: [string, string][] = [
  ["radio advertising", "Radio Advertising"],
  ["Customer onboarding", "Customer Onboarding"],
  ["contract negotiation", "Contract Negotiation"],
  ["  media   buying ", "Media Buying"],
  // Small words lowercase inside a name, capitalized first.
  ["mergers and acquisitions", "Mergers and Acquisitions"],
  ["Research And Development", "Research and Development"],
  ["sales and operations planning", "Sales and Operations Planning"],
  ["the art of negotiation", "The Art of Negotiation"],
  ["training for new hires with a playbook", "Training for New Hires with a Playbook"],
  // Acronyms and brands keep their own casing.
  ["SEO", "SEO"],
  ["CRM strategy", "CRM Strategy"],
  ["iOS development", "iOS Development"],
  ["JavaScript", "JavaScript"],
  ["HubSpot workflows", "HubSpot Workflows"],
  ["Google Ads campaigns", "Google Ads Campaigns"],
  ["B2B SaaS sales", "B2B SaaS Sales"],
  ["b2b sales", "B2B Sales"],
  ["P&L ownership", "P&L Ownership"],
  ["p&l ownership", "P&L Ownership"],
  ["profit and loss (P&L)", "Profit and Loss (P&L)"],
  ["Series A fundraising", "Series A Fundraising"],
  ["IN-HOUSE counsel", "IN-HOUSE Counsel"],
  // Hyphens: each part capitalized, small words inside lowercase, a one-letter prefix keeps the rest as written.
  ["go-to-market strategy", "Go-to-Market Strategy"],
  ["Go-To-Market", "Go-to-Market"],
  ["cross-functional leadership", "Cross-Functional Leadership"],
  ["e-commerce", "E-commerce"],
  ["E-commerce merchandising", "E-commerce Merchandising"],
  ["end-to-end testing", "End-to-End Testing"],
  // Numbers and slashes.
  ["3d modeling", "3D Modeling"],
  ["3D modeling", "3D Modeling"],
  ["30-60-90 day plans", "30-60-90 Day Plans"],
  ["2nd-line support", "2nd-Line Support"],
  ["a/b testing", "A/B Testing"],
  ["A/B testing", "A/B Testing"],
  ["web3 development", "Web3 Development"],
];

test("skill names are Title Case, keeping acronyms, brands, hyphenated forms and numbers right", () => {
  for (const [given, cased] of CASES) expect([given, titleCaseSkill(given)]).toEqual([given, cased]);
});

test("Title Case is stable on its own output and changes only the case", () => {
  for (const [given, cased] of CASES) {
    expect(titleCaseSkill(cased)).toBe(cased);
    expect(skillKey(cased)).toBe(skillKey(given));
  }
});
