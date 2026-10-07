// How goals shape the company search. Pure module, shared with the browser.
export type Lens = { industries: "steer" | "only" | "ignore"; judge: "off" | "rank" | "hide" };
export const DEFAULT_LENS: Lens = { industries: "steer", judge: "rank" };
