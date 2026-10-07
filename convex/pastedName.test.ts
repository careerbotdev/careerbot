import { expect, test } from "vitest";
import { pastedName } from "./resume";

test("a pasted posting is named by its role, not by the section heading it opens with", () => {
  expect(pastedName("Who we are\nAcme builds tools for teams.\n\nSenior Supply Planning Manager\nWhat you'll do")).toEqual({ title: "Senior Supply Planning Manager", company: null });
  expect(pastedName("Demand Planner at Acme · Remote\nAbout the role")).toEqual({ title: "Demand Planner", company: "Acme" });
  expect(pastedName("## About the job\nTitle: Solutions Engineer\nCompany: Globex\nWe build things.")).toEqual({ title: "Solutions Engineer", company: "Globex" });
  expect(pastedName("About Loadstar Systems\nLoadstar Systems builds transportation management software.\nProduct Manager, Load Planning\nWhat you’ll do")).toEqual({ title: "Product Manager, Load Planning", company: null });
  expect(pastedName("Who we are\nWe are a company that does many things across many markets and more.")).toEqual({ title: "Pasted role", company: null });
});
