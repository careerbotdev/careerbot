// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { hardened, inflated } from "./personas";

// The answer key's guard on a guess: any sentence CareerBot wrote that states the number without saying it's an
// estimate is a hit; one that keeps the hedge, or leaves the number out, isn't.
const guess = {
  match: [["\\b(an|one|1)[ -]hours?\\b"], ["staffing|sheet|grid|huddle|prep"]],
  hedge: ["estimat", "guess", "(she|manager) (said|says|reported)"],
};

test("a guess written as a measured result is caught, sentence by sentence, wherever it was written", () => {
  const written = [
    { where: "fact (approved)", text: "Built a Google Sheets staffing grid, cutting daily staffing preparation time by roughly one hour." },
    { where: "base resume", text: "Ran 12-hour shifts. Built a staffing grid her manager estimates saves about an hour a day; it flags shortfalls." },
    { where: "cover letter", text: "I built it in my own time. My staffing grid saves my manager an hour each morning!\nIt's red, yellow and green." },
    { where: "insight (proposed)", text: "Builds tools that make staffing easier for charge nurses." },
  ];
  expect(hardened(guess, written)).toEqual([
    { where: "fact (approved)", snippet: "Built a Google Sheets staffing grid, cutting daily staffing preparation time by roughly one hour." },
    { where: "cover letter", snippet: "My staffing grid saves my manager an hour each morning!" },
  ]);
});

// Renata's sheet runs her own unit's huddle; saying the hospital took it up is the inflation. Work of hers that really
// did spread (her drip titration cheat sheets went round the other ICUs) isn't that claim.
test("the staffing sheet's inflation is caught only where the staffing sheet is the subject", () => {
  const key = JSON.parse(readFileSync("testdata/personas/renata-alvarez/answer-key.json", "utf8")) as { noInflation: { id: string; forbidden: string[] }[] };
  const sheet = key.noInflation.find((n) => n.id === "n3")!;
  const written = [
    { where: "fact (approved)", text: "Served as an Epic super-user before go-live, designing drip titration documentation guides adopted across hospital intensive care units." },
    { where: "base resume", text: "Designed drip titration cheat sheets adopted across the hospital's intensive care units." },
    { where: "resume: Clinical operations", text: "Built a Google Sheets staffing grid adopted across the entire hospital for daily huddles." },
    { where: "cover letter", text: "My staffing tool became hospital-wide staffing practice." },
    { where: "tailored: posting.md", text: "Built a staffing grid her manager uses for the unit's morning huddle." },
  ];
  expect(inflated(sheet, written).map((x) => x.where)).toEqual(["cover letter", "resume: Clinical operations"]);
});
