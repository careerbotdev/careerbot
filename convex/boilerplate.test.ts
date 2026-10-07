import { expect, test } from "vitest";
import { withoutBoilerplate } from "./boilerplate";

const PITCH = "Acme builds the rockets that power tomorrow's satellites, and we're growing fast.";
const EEO = "Acme is an equal opportunity employer. All qualified applicants will receive consideration.";
const BENEFITS = ["Benefits", "- Medical, dental and vision", "- Unlimited paid time off"];
// Enough job-specific text that what's left is worth reading on its own.
const job = (what: string) => [
  `- ${what} for our enterprise accounts, from the first call to a signed contract and the first reorder after it.`,
  `- Own a ${what.toLowerCase()} target and report forecasts weekly to the head of the team.`,
  `- Work with product and engineering on what ${what.toLowerCase()} customers ask for next, and why.`,
  `- Three or more years of ${what.toLowerCase()} experience at a company selling to large businesses.`,
];
const posting = (title: string, what: string, extra: string[] = []) => ({ title, text: ["About Acme", PITCH, "", "What you'll do", ...job(what), ...extra, "", ...BENEFITS, "", EEO].join("\n") });

test("a company's pitch, benefits and equal-opportunity text go; each role's own lines and their headings stay", () => {
  const out = withoutBoilerplate([posting("Account Executive", "Selling"), posting("Solutions Engineer", "Demos"), posting("Sales Manager", "Coaching"), posting("Recruiter", "Hiring")]);
  expect(out[0]).toBe(["What you'll do", ...job("Selling")].join("\n"));
  expect(out[1]).toBe(["What you'll do", ...job("Demos")].join("\n"));
  for (const text of out) for (const gone of [PITCH, EEO, "About Acme", "Benefits", "- Medical, dental and vision"]) expect(text).not.toContain(gone);
});

test("a line counts as repeated by titles: at least 3, or over 30% of them; spacing, case and punctuation don't matter", () => {
  const shout = { title: "Account Executive", text: posting("Account Executive", "Selling").text.replace(PITCH, `  ${PITCH.toUpperCase().replace(/,/g, "")}  `) };
  // Two titles out of ten share a line: 20%, and under 3, so it stays.
  const pair = ["Quota carrying since day one.", ...job("Pair")].join("\n");
  const ten = [shout, ...["B", "C", "D", "E", "F", "G", "H", "I", "J"].map((t) => posting(t, `Work ${t}`))];
  ten[1] = { ...ten[1], text: `${ten[1].text}\n${pair}` };
  ten[2] = { ...ten[2], text: `${ten[2].text}\n${pair}` };
  const out = withoutBoilerplate(ten);
  expect(out[0]).not.toContain(PITCH.toUpperCase().replace(/,/g, "").trim());
  expect(out[1]).toContain("Quota carrying since day one.");
  // Of five titles, two sharing a line is 40%: it goes.
  const five = withoutBoilerplate(ten.slice(0, 5));
  expect(five[1]).not.toContain("Quota carrying since day one.");
});

test("one role listed in several places keeps its text, and a near copy with almost nothing left is read whole", () => {
  const same = [posting("Account Executive", "Selling", ["Location: Austin"]), posting("Account Executive", "Selling", ["Location: Columbus"]), posting("Account Executive", "Selling", ["Location: Boston"])];
  expect(withoutBoilerplate(same)).toEqual(same.map((p) => p.text));
  // Different titles, same text apart from one line: stripping would leave only that line.
  const copies = [posting("AE East", "Selling"), posting("AE West", "Selling"), posting("AE Central", "Selling")];
  expect(withoutBoilerplate(copies)).toEqual(copies.map((p) => p.text));
  expect(withoutBoilerplate([posting("Account Executive", "Selling")])).toEqual([posting("Account Executive", "Selling").text]);
});
