// Job boards CareerBot can read without the company's credentials. Each was checked against a real company's board.
export const BOARD_PROVIDERS = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "breezy",
  "personio",
  "rippling",
  "gem",
  "workable",
  "recruitee",
  "bamboohr",
  "pinpoint",
  "teamtailor",
  "jobvite",
  "icims",
  "oracle",
  "jazzhr",
  "dover",
  "apollo",
] as const;
export type BoardProvider = (typeof BOARD_PROVIDERS)[number];
