import { expect, test } from "vitest";
import { pathOf, type PursuitStatus, reachedOf, type ReminderFacts, remindersOf, suggestedStep } from "./pursuitSteps";

const at = (day: number, hour = 10) => new Date(2026, 8, day, hour).getTime();
const all = { followUp: true, prepare: true, stale: true };
const tags = (p: ReminderFacts, day: number, on = all) => remindersOf(p, at(day, 9), on).map((r) => r.tag);

test("follow up after 7 quiet days since applying, again at 14; Followed up starts the quiet over; two at most", () => {
  const p: ReminderFacts = { status: "applied", appliedAt: at(1), interviewAt: null, changedAt: at(1), timeline: [] };
  expect(tags(p, 7)).toEqual([]);
  expect(tags(p, 8)).toEqual(["Follow up"]);
  const once = { ...p, changedAt: at(8), timeline: [{ at: at(8), event: "followedUp" }] };
  expect(tags(once, 14)).toEqual([]);
  expect(tags(once, 15)).toEqual(["Follow up"]);
  const twice = { ...once, changedAt: at(15), timeline: [...once.timeline, { at: at(15), event: "followedUp" }] };
  expect(tags(twice, 30)).toEqual([]);
  // Any change quiets it; other statuses don't follow up.
  expect(tags({ ...p, changedAt: at(5) }, 8)).toEqual([]);
  expect(tags({ ...p, status: "interviewing" }, 8)).toEqual([]);
});

test("prepare shows the day before the interview and on the day, until marked Prepared", () => {
  const p: ReminderFacts = { status: "interviewing", appliedAt: at(1), interviewAt: "2026-09-10", changedAt: at(8), timeline: [] };
  expect(tags(p, 8)).toEqual([]);
  expect(remindersOf(p, at(9, 9), all)[0].text).toBe("Interview tomorrow, Sep 10");
  expect(remindersOf(p, at(10, 9), all)[0].text).toBe("Interview today");
  expect(tags(p, 11)).toEqual([]);
  expect(tags({ ...p, timeline: [{ at: at(9, 18), event: "prepared" }] }, 10)).toEqual([]);
});

test("check in after 3 weeks with no change on any open pursuit; closed ones never remind; switched-off rules don't", () => {
  const p: ReminderFacts = { status: "preparing", appliedAt: null, interviewAt: null, changedAt: at(1), timeline: [] };
  expect(tags(p, 21)).toEqual([]);
  expect(tags(p, 22)).toEqual(["Check in"]);
  expect(tags({ ...p, status: "closed" }, 30)).toEqual([]);
  expect(tags(p, 22, { ...all, stale: false })).toEqual([]);
  const applied: ReminderFacts = { ...p, status: "applied", appliedAt: at(1) };
  expect(tags(applied, 22, { ...all, followUp: false })).toEqual(["Check in"]);
  expect(tags(applied, 22)).toEqual(["Follow up", "Check in"]);
});

test("outreach: follow up 7 days after the message, the next contact 7 days after the follow-up, then apply or close after three", () => {
  const contact = (id: string, sentAt: number | null = null) => ({ id, name: id, sentAt, repliedAt: null });
  const p: ReminderFacts = { status: "contacted", appliedAt: null, interviewAt: null, changedAt: at(1), timeline: [], contacts: [contact("Ana", at(1)), contact("Ben"), contact("Cleo")] };
  const due = (q: ReminderFacts, day: number) => remindersOf(q, at(day, 9), all)[0];
  expect(due(p, 7)).toBeUndefined();
  expect(due(p, 8)).toEqual({ rule: "followUp", tag: "Follow up", text: "No reply from Ana for 7 days", contact: { id: "Ana", name: "Ana" } });
  const followed = { ...p, changedAt: at(8), timeline: [{ at: at(8), event: "followedUp" }] };
  expect(due(followed, 14)).toBeUndefined();
  expect(due(followed, 15)).toMatchObject({ step: "nextContact", tag: "Next contact", contact: { name: "Ben" } });
  // Writing to Ben starts over with him.
  const ben = { ...followed, contacts: [contact("Ana", at(1)), contact("Ben", at(15)), contact("Cleo")] };
  expect(due(ben, 21)).toBeUndefined();
  expect(due(ben, 22)).toMatchObject({ tag: "Follow up", contact: { name: "Ben" } });
  // Three written to, each followed up, no reply: apply or close.
  const three = { ...p, contacts: [contact("Ana", at(1)), contact("Ben", at(15)), contact("Cleo", at(29))], timeline: [{ at: at(8), event: "followedUp" }, { at: at(22), event: "followedUp" }, { at: at(36), event: "followedUp" }] };
  expect(due(three, 43)).toMatchObject({ step: "noReply", text: "No reply from 3 contacts" });
  expect(due({ ...three, status: "applied", appliedAt: at(40) }, 43)?.step).toBeUndefined();
  // No one left to write to: still the next contact, to find or add one.
  expect(due({ ...followed, contacts: [contact("Ana", at(1))] }, 15)).toMatchObject({ step: "nextContact", text: "No reply from Ana after a follow-up" });
  expect(due({ ...followed, contacts: [contact("Ana", at(1))] }, 15).contact).toBeUndefined();
});

test("outreach reminders stop once someone replies, and switch off with Follow up", () => {
  const p: ReminderFacts = { status: "contacted", appliedAt: null, interviewAt: null, changedAt: at(1), timeline: [], contacts: [{ id: "a", name: "Ana", sentAt: at(1), repliedAt: null }, { id: "b", name: "Ben", sentAt: null, repliedAt: at(3) }] };
  expect(tags(p, 9)).toEqual([]);
  expect(tags({ ...p, contacts: p.contacts!.slice(0, 1), repliedAt: at(3) }, 9)).toEqual([]);
  expect(tags({ ...p, contacts: p.contacts!.slice(0, 1) }, 9)).toEqual(["Follow up"]);
  expect(tags({ ...p, contacts: p.contacts!.slice(0, 1) }, 9, { ...all, followUp: false })).toEqual([]);
});

test("the suggested step follows the path: choose one once the resume is tailored, then each path's steps until both are done", () => {
  const p = { status: "preparing" as const, hasResume: true, hasLetter: true, path: null, contacted: false, applied: false, hasContacts: false };
  expect(suggestedStep({ ...p, hasResume: false })).toBe("Tailor your resume");
  expect(suggestedStep(p)).toBe("Choose a path");
  expect(suggestedStep({ ...p, path: "outreach" })).toBe("Find contacts");
  expect(suggestedStep({ ...p, path: "outreach", hasContacts: true, to: "Priya Nair" })).toBe("Send your outreach message to Priya Nair");
  expect(suggestedStep({ ...p, path: "apply", hasLetter: false })).toBe("Write your cover letter");
  expect(suggestedStep({ ...p, path: "apply" })).toBe("Apply, then mark it Applied");
  // Both: once the message is sent, applying is what's left; once both are done, a reply.
  expect(suggestedStep({ ...p, status: "contacted", path: "both", contacted: true, hasContacts: true })).toBe("Apply, then mark it Applied");
  expect(suggestedStep({ ...p, status: "applied", path: "both", applied: true, hasContacts: true, to: "Owen Marsh" })).toBe("Send your outreach message to Owen Marsh");
  expect(suggestedStep({ ...p, status: "applied", path: "both", applied: true, contacted: true })).toBe("Wait for a reply");
  expect(pathOf({ path: "outreach", appliedAt: 1 })).toBe("both");
  expect(pathOf({ contactedAt: 1 })).toBe("outreach");
  expect(pathOf({})).toBeNull();
});

test("how far a pursuit got is the furthest stage it was set to, Contacted before Applied", () => {
  const set = (...s: PursuitStatus[]) => s.map((status) => ({ event: "status", status }));
  expect(reachedOf(set("contacted"))).toBe("contacted");
  expect(reachedOf(set("applied", "contacted"))).toBe("applied");
  expect(reachedOf(set("contacted", "inConversation", "closed"))).toBe("inConversation");
  expect(reachedOf(set("preparing"))).toBeNull();
});
