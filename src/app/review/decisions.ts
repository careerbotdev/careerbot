"use client";

import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ReviewKind } from "../../../convex/reviewKinds";
import type { IconName } from "@/components/icons";
import { readMonth } from "../record/roles/words";

export type Items = FunctionReturnType<typeof api.review.items>;
export type Card = Items["cards"][number];
export type Declined = Items["declined"][number];

// One way to decide a card. The first is the Amber one; `keys` is the key the screen binds; `detail` and `note` are the
// explainer. `why`: a negative decision, which asks why before anything is sent (decision and reason go in one call).
// `field`: asks for words first (an edit, an answer). `href`: goes where it's done instead. `undo` takes it back.
// `bulk`: several cards can be decided this way at once.
export type Decision = {
  label: string;
  keys?: string;
  intent?: "approve" | "reject";
  icon: IconName;
  detail: string;
  note: string;
  why?: { decision: string; picks: string[] };
  field?: { label: string; initial: string; placeholder?: string; save: string };
  href?: string;
  run: (input: { reason?: string; text?: string }) => Promise<unknown>;
  done: string;
  undo?: () => Promise<unknown>;
  bulk?: boolean;
};

// Quick reasons per kind, most common first.
const PICKS = {
  direction: ["Not what I want", "Too close to another", "Not now"],
  limit: ["Not a limit", "Too strict", "Wrong value"],
  company: ["Not the work", "Company", "Size", "Location", "Industry"],
  role: ["Not my role", "Wrong dates", "Said twice"],
  project: ["Not career work", "Too small", "Private"],
  fact: ["Overstates my part", "Wrong role", "Not true"],
  rewrite: ["Changes the meaning", "Overstates it", "I prefer mine"],
  conflict: ["The story is off", "Rounded", "An old story"],
  followup: ["Don’t remember", "Doesn’t matter", "Private"],
  insight: ["Not true", "Too vague", "Overstates it"],
  skill: ["Too vague", "Not mine", "Out of date"],
  apart: ["Different things", "Different work", "Different results"],
  resume: ["Worse than before", "Too long", "Wrong emphasis"],
};

const FREE_UNDO = "Free · Undo with U";
const WHY = "Free · Undo with U · Why is optional and steers what’s proposed next";

// Every mutation Review decides with (and the searches it starts), by name.
export const MUTATIONS = {
  review: api.extract.review,
  edit: api.extract.edit,
  rework: api.extract.rework,
  accept: api.extract.acceptSuggestion,
  dismiss: api.extract.dismissSuggestion,
  revertWording: api.extract.revertWording,
  keepOrphan: api.extract.keepOrphan,
  flagOrphan: api.extract.flagOrphan,
  goalsMerge: api.goals.merge,
  goalsUnmerge: api.goals.unmerge,
  approvePart: api.directions.approvePart,
  unapprovePart: api.directions.unapprovePart,
  rate: api.enrich.rate,
  keepAnyway: api.enrich.keepAnyway,
  answerConflict: api.conflicts.answer,
  reopenConflict: api.conflicts.reopen,
  answerFollowup: api.followups.answer,
  notNow: api.followups.notNow,
  reopenFollowup: api.followups.reopen,
  mergeFacts: api.duplicates.merge,
  unmergeFacts: api.duplicates.unmerge,
  keepBoth: api.duplicates.keepBoth,
  reopenDuplicate: api.duplicates.reopen,
  connect: api.sameWork.connect,
  keepSeparate: api.sameWork.keepSeparate,
  reopenSameWork: api.sameWork.reopen,
  mergeSkills: api.skills.merge,
  unmergeSkills: api.skills.unmerge,
  keepApart: api.skills.keepApart,
  reopenSkills: api.skills.reopenPair,
  keepResume: api.resume.keep,
  discardResume: api.resume.discard,
  reopenResume: api.resume.reopen,
  suggestQuestions: api.followups.start,
  findConflicts: api.conflicts.start,
  findDuplicates: api.duplicates.start,
} as const;
type Mutations = typeof MUTATIONS;

// Review's mutations, each called with its own arguments.
export type Decide = { [K in keyof Mutations]: (args: FunctionArgs<Mutations[K]>) => Promise<FunctionReturnType<Mutations[K]>> };

// The name on the card's header for each type.
export const TYPE_LABEL: Record<Card["type"], string> = {
  direction: "Direction",
  limit: "Limit",
  criteria: "Direction criteria",
  positioning: "Positioning",
  company: "Company to rate",
  role: "New role",
  project: "New project",
  fact: "New fact",
  rewrite: "Rewrite",
  conflict: "Question",
  followup: "Follow-up question",
  insight: "Insight",
  skill: "Skill",
  skillPair: "Same thing?",
  duplicate: "Said twice",
  sameWork: "Same work?",
  resume: "Resume update",
};

// What approving a card unlocks, said above it.
export function unlocks(card: Card) {
  switch (card.type) {
    case "direction":
      return card.into ? `Adding it widens ${card.into.name}` : `Approving adds ${card.name} to your goals`;
    case "limit":
      return "Approving filters roles and companies by it";
    case "criteria":
      return `Approving opens company search for ${card.name}`;
    case "positioning":
      return `Approving lets resumes for ${card.name} use it`;
    default:
      return null;
  }
}

// The ways to decide a card, in the order they show. The review mutations' statuses go back as they were on Undo.
export function decisionsFor(card: Card, m: Decide): Decision[] {
  // Only for cards that are items (the review mutation's kinds).
  const id = card.id as Id<"items">;
  const approve = (label: string, detail: string): Decision => ({
    label,
    keys: "A",
    intent: "approve",
    icon: "approve",
    detail,
    note: FREE_UNDO,
    run: () => m.review({ id, status: "approved" }),
    done: `Approved: ${card.title}`,
    undo: () => m.review({ id, status: "proposed" }),
    bulk: true,
  });
  const reject = (picks: string[], detail: string): Decision => ({
    label: "Reject",
    keys: "R",
    intent: "reject",
    icon: "reject",
    detail,
    note: WHY,
    why: { decision: "Reject", picks },
    run: ({ reason }) => m.review({ id, status: "rejected", note: reason }),
    done: `Rejected: ${card.title}`,
    undo: () => m.review({ id, status: "proposed" }),
    bulk: true,
  });
  const goTo = (label: string, href: string, detail: string): Decision => ({ label, keys: "E", icon: "edit", detail, note: "Free", href, run: async () => {}, done: "" });

  switch (card.type) {
    case "direction":
      return [
        card.into
          ? {
              label: `Add to ${card.into.name}`,
              keys: "A",
              intent: "approve",
              icon: "approve",
              detail: `${card.into.name} takes this in as part of what it includes, approved.`,
              note: FREE_UNDO,
              run: () => m.goalsMerge({ id: card.id, into: card.into!.id }),
              done: `Added to ${card.into.name}: ${card.name}`,
              undo: () => m.goalsUnmerge({ id: card.id }),
            }
          : approve("Approve", "Adds it to your goals. Its positioning and search criteria are proposed next."),
        goTo("Edit", `/goals/directions?direction=${card.id}`, "Opens it in Directions to change its name, summary or what it includes."),
        { ...reject(PICKS.direction, "Leaves it out of your goals. It isn’t proposed again."), bulk: !card.into },
      ];
    case "limit":
      return [
        approve("Approve", "Roles and companies are checked against it from now on."),
        goTo("Edit", `/goals/limits?limit=${card.id}&edit=1`, "Opens it in Limits to change its wording, how firm it is or what it applies to."),
        reject(PICKS.limit, "Leaves it out. Nothing is filtered by it."),
      ];
    case "criteria":
      return [
        {
          label: "Approve criteria",
          keys: "A",
          intent: "approve",
          icon: "approve",
          detail: `Company search for ${card.name} uses these from its next run.`,
          note: FREE_UNDO,
          run: () => m.approvePart({ id: card.id, part: "criteria" }),
          done: `Approved criteria for ${card.name}`,
          undo: () => m.unapprovePart({ id: card.id, part: "criteria" }),
        },
        goTo("Edit", `/goals/directions?direction=${card.id}&tab=criteria`, "Opens the direction to change its titles, industries, sizes and seeds."),
      ];
    case "positioning":
      return [
        {
          label: "Approve positioning",
          keys: "A",
          intent: "approve",
          icon: "approve",
          detail: `Resumes and ranking for ${card.name} use it from now on.`,
          note: FREE_UNDO,
          run: () => m.approvePart({ id: card.id, part: "detail" }),
          done: `Approved positioning for ${card.name}`,
          undo: () => m.unapprovePart({ id: card.id, part: "detail" }),
        },
        goTo("Edit", `/goals/directions?direction=${card.id}`, "Opens the direction to change how you’re positioned for it."),
      ];
    case "company": {
      const back = () => m.rate({ id: card.id, value: card.rating });
      const notForMe: Decision = {
        label: "Not for me",
        keys: "R",
        intent: "reject",
        icon: "reject",
        detail: "Passes on it: its roles aren’t read, and it isn’t proposed again.",
        note: WHY,
        why: { decision: "Not for me", picks: PICKS.company },
        run: ({ reason }) => m.rate({ id: card.id, value: "no", reason }),
        done: `Not for me: ${card.name}`,
        undo: back,
      };
      if (card.misfit)
        return [
          {
            label: "Keep anyway",
            keys: "A",
            intent: "approve",
            icon: "approve",
            detail: "Keeps it with the companies you’re weighing, though your goals say it doesn’t fit.",
            note: FREE_UNDO,
            run: () => m.keepAnyway({ id: card.id, keep: true }),
            done: `Kept anyway: ${card.name}`,
            undo: () => m.keepAnyway({ id: card.id, keep: false }),
          },
          notForMe,
        ];
      return [
        {
          label: "Target",
          keys: "A",
          intent: "approve",
          icon: "approve",
          detail: "Makes it a target: its open roles are read and ranked for you.",
          note: FREE_UNDO,
          run: () => m.rate({ id: card.id, value: "excited" }),
          done: `Target: ${card.name}`,
          undo: back,
        },
        {
          label: "Maybe",
          keys: "M",
          icon: "time",
          detail: "Keeps it in view: its open roles are read too, ranked after your targets’.",
          note: FREE_UNDO,
          run: () => m.rate({ id: card.id, value: "maybe" }),
          done: `Maybe: ${card.name}`,
          undo: back,
        },
        notForMe,
      ];
    }
    case "role":
      return [
        approve("Approve", "Adds the role to your record; its facts can then count."),
        goTo("Edit", `/record/roles?role=${card.id}`, "Opens it in Record to correct the title, employer or dates."),
        reject(PICKS.role, "Leaves it out of your record. It isn’t proposed again."),
      ];
    case "project":
      return [
        approve("Approve", "Adds the project to your record, with its facts to review."),
        goTo("Edit", `/record/projects?project=${card.id}`, "Opens it in Record to change its name, summary or dates."),
        reject(PICKS.project, "Leaves it out, with the facts read from it."),
      ];
    case "fact": {
      if (card.orphan) {
        const was = card.status as "approved" | "proposed";
        return [
          {
            label: "Keep it",
            keys: "A",
            intent: "approve",
            icon: "approve",
            detail: "Keeps the fact as it reads, though its story no longer says it.",
            note: FREE_UNDO,
            run: () => m.keepOrphan({ id: card.id }),
            done: `Kept: ${card.title}`,
            undo: () => m.flagOrphan({ id: card.id, noLongerSaid: card.orphan!.noLongerSaid, sourceDeleted: card.orphan!.sourceDeleted }),
          },
          {
            label: "Reject it",
            keys: "R",
            intent: "reject",
            icon: "reject",
            detail: "Takes it out of your record. Resumes stop using it.",
            note: WHY,
            why: { decision: "Reject", picks: PICKS.fact },
            run: ({ reason }) => m.review({ id: card.id, status: "rejected", note: reason }),
            done: `Rejected: ${card.title}`,
            undo: () => m.review({ id: card.id, status: was }),
          },
        ];
      }
      return [
        approve("Approve", "Adds it to your record, where resumes, letters and ranking can use it."),
        {
          label: "Edit",
          keys: "E",
          icon: "edit",
          detail: "Your wording, approved as you write it.",
          note: FREE_UNDO,
          field: { label: "The fact", initial: card.text, save: "Save and approve" },
          run: ({ text }) => m.edit({ id: card.id, text: text ?? card.text }),
          done: `Approved in your words: ${card.title}`,
          undo: () => m.revertWording({ id: card.id }),
        },
        reject(PICKS.fact, "Leaves it out of your record. What you say why steers later reads."),
      ];
    }
    case "rewrite":
      return [
        {
          label: "Use this",
          keys: "A",
          intent: "approve",
          icon: "approve",
          detail: "The fact takes the new wording and is approved. The old wording stays in its history.",
          note: FREE_UNDO,
          run: () => m.accept({ id: card.id }),
          done: `Rewritten: ${card.proposed}`,
          undo: () => m.revertWording({ id: card.id }),
        },
        {
          label: "Edit",
          keys: "E",
          icon: "edit",
          detail: "Your wording instead, approved as you write it.",
          note: FREE_UNDO,
          field: { label: "The fact", initial: card.proposed, save: "Save and approve" },
          run: ({ text }) => m.edit({ id: card.id, text: text ?? card.proposed }),
          done: `Approved in your words: ${card.now}`,
          undo: () => m.revertWording({ id: card.id }),
        },
        {
          label: "Keep current",
          keys: "R",
          intent: "reject",
          icon: "reject",
          detail: "Keeps the wording it has. The rewrite stays in its history.",
          note: WHY,
          why: { decision: "Keep current", picks: PICKS.rewrite },
          run: ({ reason }) => m.dismiss({ id: card.id, reason }),
          done: `Kept the current wording: ${card.now}`,
          undo: () => m.revertWording({ id: card.id }),
        },
      ];
    case "conflict": {
      const undo = () => m.reopenConflict({ id: card.id });
      // Two jobs that overlap: they held both, or one of the two dates is wrong.
      if (card.overlap) {
        const { ends, starts } = card.overlap;
        const fix = (field: "start" | "end") => async ({ text }: { text?: string }) => {
          const month = readMonth(text ?? "");
          if ("problem" in month || !month.value) throw new Error("problem" in month ? month.problem : "Write a month and year, like May 2021.");
          return m.answerConflict({ id: card.id, pick: "other", field, value: month.value });
        };
        return [
          {
            label: "Both are right",
            keys: "A",
            intent: "approve",
            icon: "approve",
            detail: "You held both jobs at once. Neither changes, and this isn’t asked again.",
            note: FREE_UNDO,
            run: () => m.answerConflict({ id: card.id, pick: "both" }),
            done: `Kept both: ${ends.employer} and ${starts.employer}`,
            undo,
          },
          {
            label: "Fix end date",
            keys: "E",
            icon: "edit",
            detail: `Give the month your ${ends.employer} job ended; your record takes it.`,
            note: FREE_UNDO,
            field: { label: `When your ${ends.employer} job ended`, initial: "", placeholder: "May 2021", save: "Save" },
            run: fix("end"),
            done: `Record updated: ${ends.employer} end date`,
            undo,
          },
          {
            label: "Fix start date",
            keys: "S",
            icon: "edit",
            detail: `Give the month your ${starts.employer} job started; your record takes it.`,
            note: FREE_UNDO,
            field: { label: `When your ${starts.employer} job started`, initial: "", placeholder: "May 2021", save: "Save" },
            run: fix("start"),
            done: `Record updated: ${starts.employer} start date`,
            undo,
          },
        ];
      }
      return [
        ...(card.narrativeValue
          ? [
              {
                label: "Story is right",
                keys: "A",
                intent: "approve" as const,
                icon: "approve" as const,
                detail: `Your record takes what the story says: ${card.narrativeSays}.`,
                note: FREE_UNDO,
                run: () => m.answerConflict({ id: card.id, pick: "narrative" }),
                done: `Record updated: ${card.narrativeSays}`,
                undo,
              },
            ]
          : []),
        {
          label: "Neither",
          keys: "E",
          icon: "edit",
          detail: "Give the right value; your record takes it.",
          note: FREE_UNDO,
          field: { label: "What’s right", initial: "", placeholder: card.field === "start" || card.field === "end" ? "2021-09" : "", save: "Save" },
          run: ({ text }) => m.answerConflict({ id: card.id, pick: "other", value: text }),
          done: "Record updated",
          undo,
        },
        {
          label: "Record is right",
          keys: "R",
          intent: "reject",
          icon: "reject",
          detail: `Keeps your record as it is: ${card.recordSays}.`,
          note: WHY,
          why: { decision: "Record is right", picks: PICKS.conflict },
          run: ({ reason }) => m.answerConflict({ id: card.id, pick: "record", reason }),
          done: `Kept: ${card.recordSays}`,
          undo,
        },
      ];
    }
    case "followup": {
      const undo = () => m.reopenFollowup({ id: card.id });
      return [
        {
          label: "Answer",
          keys: "A",
          intent: "approve",
          icon: "ask",
          detail: "Your answer becomes a rewrite to review for its fact, or a note read into your record.",
          note: "About $0.01 of your AI budget · Undo with U",
          field: { label: "Your answer", initial: "", save: "Save answer" },
          run: ({ text }) => m.answerFollowup({ id: card.id, answer: text ?? "" }),
          done: "Answered",
          undo,
        },
        {
          label: "Not now",
          keys: "R",
          intent: "reject",
          icon: "reject",
          detail: "Sets the question aside. It isn’t asked again.",
          note: WHY,
          why: { decision: "Not now", picks: PICKS.followup },
          run: ({ reason }) => m.notNow({ id: card.id, reason }),
          done: `Not now: ${card.question}`,
          undo,
        },
      ];
    }
    case "insight":
      return [
        approve("Approve", "Adds it to your record; resumes and letters can draw on it."),
        {
          label: "Edit",
          keys: "E",
          icon: "edit",
          detail: "Your wording, approved as you write it.",
          note: FREE_UNDO,
          field: { label: "The insight", initial: card.text, save: "Save and approve" },
          run: ({ text }) => m.edit({ id: card.id, text: text ?? card.text }),
          done: `Approved in your words: ${card.title}`,
          undo: () => m.revertWording({ id: card.id }),
        },
        reject(PICKS.insight, "Leaves it out. Later insights learn from why."),
      ];
    case "skill":
      return [
        approve("Approve", "Adds it to your skills, for resumes and matching roles."),
        goTo("Edit", `/record/skills?item=${card.id}`, "Opens it in Record to change its name, group or kind."),
        reject(PICKS.skill, "Leaves it out of your skills. It isn’t proposed again."),
      ];
    case "skillPair":
      return [
        {
          label: `Keep “${card.name}”`,
          keys: "A",
          intent: "approve",
          icon: "approve",
          detail: `One item named ${card.name}, with where both were found. ${card.otherName} is merged into it.`,
          note: FREE_UNDO,
          run: () => m.mergeSkills({ id: card.id, keep: "this" }),
          done: `Merged into ${card.name}`,
          undo: () => m.unmergeSkills({ id: card.other }),
        },
        {
          label: `Keep “${card.otherName}”`,
          keys: "O",
          icon: "approve",
          detail: `One item named ${card.otherName}, with where both were found. ${card.name} is merged into it.`,
          note: FREE_UNDO,
          run: () => m.mergeSkills({ id: card.id, keep: "other" }),
          done: `Merged into ${card.otherName}`,
          undo: () => m.unmergeSkills({ id: card.id }),
        },
        {
          label: "Keep both",
          keys: "R",
          intent: "reject",
          icon: "reject",
          detail: "They’re different; the pair isn’t offered again.",
          note: WHY,
          why: { decision: "Keep both", picks: PICKS.apart },
          run: ({ reason }) => m.keepApart({ id: card.id, reason }),
          done: `Kept both: ${card.name} and ${card.otherName}`,
          undo: () => m.reopenSkills({ id: card.id, other: card.other }),
        },
      ];
    case "duplicate":
      return [
        {
          label: "Keep this wording",
          keys: "A",
          intent: "approve",
          icon: "approve",
          detail: "One fact in this wording, approved, with both facts’ sources and history.",
          note: FREE_UNDO,
          run: () => m.mergeFacts({ id: card.id, keep: "this" }),
          done: `Merged: ${card.text}`,
          undo: () => m.unmergeFacts({ id: card.other }),
        },
        {
          label: "Keep the other",
          keys: "O",
          icon: "approve",
          detail: "One fact in the other wording, approved, with both facts’ sources and history.",
          note: FREE_UNDO,
          run: () => m.mergeFacts({ id: card.id, keep: "other" }),
          done: `Merged: ${card.otherText}`,
          undo: () => m.unmergeFacts({ id: card.id }),
        },
        {
          label: "Keep both",
          keys: "R",
          intent: "reject",
          icon: "reject",
          detail: "They say different things; the pair isn’t flagged again.",
          note: WHY,
          why: { decision: "Keep both", picks: PICKS.apart },
          run: ({ reason }) => m.keepBoth({ id: card.id, reason }),
          done: "Kept both",
          undo: () => m.reopenDuplicate({ id: card.id, other: card.other }),
        },
      ];
    case "sameWork": {
      const undo = () => m.reopenSameWork({ id: card.id, other: card.other, lead: card.lead });
      return [
        {
          label: "Connect",
          keys: "A",
          intent: "approve",
          icon: "link",
          detail: "Resumes write one line for the two, from the richer; neither fact’s wording changes.",
          note: FREE_UNDO,
          run: () => m.connect({ id: card.id }),
          done: "Connected as the same work",
          undo,
        },
        {
          label: "Keep separate",
          keys: "R",
          intent: "reject",
          icon: "reject",
          detail: "They’re different work; the pair isn’t suggested again.",
          note: WHY,
          why: { decision: "Keep separate", picks: PICKS.apart },
          run: ({ reason }) => m.keepSeparate({ id: card.id, reason }),
          done: "Kept separate",
          undo,
        },
      ];
    }
    case "resume":
      return [
        {
          label: "Keep",
          keys: "A",
          intent: "approve",
          icon: "approve",
          detail: `This version becomes your ${card.name}. The one before it is kept.`,
          note: FREE_UNDO,
          run: () => m.keepResume({ id: card.id }),
          done: `Kept the new ${card.name}`,
          undo: () => m.reopenResume({ id: card.id }),
        },
        goTo("Open", card.href, "Opens the resume, to read this version in full first."),
        {
          label: "Discard",
          keys: "R",
          intent: "reject",
          icon: "reject",
          detail: "Sets this version aside; your current resume stays as it is.",
          note: WHY,
          why: { decision: "Discard", picks: PICKS.resume },
          run: ({ reason }) => m.discardResume({ id: card.id, reason }),
          done: `Discarded the new ${card.name}`,
          undo: () => m.reopenResume({ id: card.id }),
        },
      ];
  }
}

// Where a card's item lives, for the ⋯ menu.
function homeOf(card: Card): [label: string, href: string] | null {
  switch (card.type) {
    case "direction":
      return ["Open in Directions", `/goals/directions?direction=${card.id}`];
    case "limit":
      return ["Open in Limits", `/goals/limits?limit=${card.id}`];
    case "criteria":
      return ["Open the direction", `/goals/directions?direction=${card.id}&tab=criteria`];
    case "positioning":
      return ["Open the direction", `/goals/directions?direction=${card.id}`];
    case "company":
      return ["Open in Companies", `/companies?company=${card.id}`];
    case "role":
      return ["Open in Record", `/record/roles?role=${card.id}`];
    case "project":
      return ["Open in Record", `/record/projects?project=${card.id}`];
    case "fact":
    case "rewrite":
    case "duplicate":
    case "sameWork":
      return ["Open in Record", `/record/roles?fact=${card.id}`];
    case "conflict":
    case "followup":
      return ["Open in Record", "/record/roles"];
    case "insight":
      return ["Open in Insights", `/record/insights?insight=${card.id}`];
    case "skill":
    case "skillPair":
      return ["Open in Record", `/record/skills?item=${card.id}`];
    case "resume":
      return null;
  }
}

// What the ⋯ menu adds to a card's decisions: asking for a rewrite of a fact, and where the item lives.
export function extrasFor(card: Card, m: Decide): Decision[] {
  const home = homeOf(card);
  const rewrite: Decision[] =
    card.type === "fact" && !card.orphan
      ? [
          {
            label: "Ask for a rewrite",
            icon: "tryAgain",
            detail: "Say what to change or add; a rewrite comes back here to use or not.",
            note: "About $0.01 of your AI budget",
            field: { label: "What to change or add", initial: "", placeholder: "It was a team of three and I led it", save: "Ask for a rewrite" },
            run: ({ text }) => m.rework({ id: card.id, note: text ?? "" }),
            done: "Asked for a rewrite. It comes back under Rewrites.",
          },
        ]
      : [];
  const site: Decision[] = card.type === "company" && card.website ? [{ label: "Open the website", icon: "openElsewhere", detail: "Opens the company’s own site in a new tab.", note: "Free", href: card.website, run: async () => {}, done: "" }] : [];
  const open: Decision[] = home ? [{ label: home[0], icon: "goIn", detail: "Opens it where it lives, with everything else about it.", note: "Free", href: home[1], run: async () => {}, done: "" }] : [];
  return [...rewrite, ...site, ...open];
}

// Taking back a decision listed as turned down.
export function restore(d: Declined, m: Decide) {
  const r = d.restore;
  switch (r.via) {
    case "review":
      return m.review({ id: r.id, status: "proposed" });
    case "rate":
      return m.rate({ id: r.id, value: null });
    case "followup":
      return m.reopenFollowup({ id: r.id });
    case "duplicate":
      return m.reopenDuplicate({ id: r.id, other: r.other });
    case "sameWork":
      return m.reopenSameWork({ id: r.id, other: r.other, lead: r.other });
    case "skillPair":
      return m.reopenSkills({ id: r.id, other: r.other });
    case "resume":
      return m.reopenResume({ id: r.id });
  }
}

// The groups' marks, as on the sidebar's Review.
export const GROUP_ICON: Record<ReviewKind, IconName> = {
  directions: "directions",
  limits: "limits",
  criteria: "filter",
  positioning: "goals",
  companies: "companies",
  facts: "roles",
  rewrites: "tryAgain",
  questions: "ask",
  insights: "insights",
  skills: "skills",
  sameWork: "builtOn",
  resume: "resumes",
};
