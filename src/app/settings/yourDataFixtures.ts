import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { newer, TOO_LARGE, WRONG_FILE } from "../../../convex/exportRules";
import { answer, type Answers } from "../storyConvex";

// Settings, Your data in each state of its Paper boards, for its stories (and Getting started's offer). Wren's workspace
// for the export, reset and delete states; a new, empty workspace for the import states. Export, Import, Continue,
// Reset my account and Delete my account move the fixture on as the deployment would.

type Status = FunctionReturnType<typeof api.yourData.status>;
type AccountStatus = NonNullable<FunctionReturnType<typeof api.accountDelete.status>>;
type ResetStatus = NonNullable<FunctionReturnType<typeof api.accountReset.status>>;
export type YourDataState =
  | "ready"
  | "exporting"
  | "exported"
  | "notEmpty"
  | "empty"
  | "preview"
  | "importing"
  | "imported"
  | "stopped"
  | "newer"
  | "wrongFile"
  | "tooLarge"
  | "deleting"
  | "deleteStopped"
  | "ownerBlocked"
  | "resetting"
  | "reset";

const NAME = "careerbot-export-2026-10-06.zip";
const BYTES = 4.2 * 1024 * 1024;
const importId = "imp-1" as Id<"imports">;
const COUNTS = [
  { kind: "Stories", n: 12 },
  { kind: "Record items", n: 340 },
  { kind: "Companies", n: 120 },
  { kind: "Roles", n: 900 },
  { kind: "Pursuits", n: 4 },
  { kind: "People", n: 6 },
  { kind: "Resumes", n: 8 },
  { kind: "Cover letters", n: 3 },
  { kind: "Notes", n: 2 },
];

export function yourDataFixtures(start: YourDataState, now = Date.now()): Answers {
  let state = start;
  const imp = (rest: Partial<NonNullable<Status["import"]>>): Status["import"] => ({
    id: importId,
    status: "ready",
    beat: now,
    name: NAME,
    bytes: BYTES,
    preview: null,
    step: null,
    done: 0,
    total: 1402,
    error: null,
    result: null,
    ...rest,
  });
  const exp = (rest: Partial<NonNullable<Status["export"]>>): Status["export"] => ({
    status: "running",
    beat: now,
    step: null,
    done: 0,
    total: 31,
    name: null,
    bytes: null,
    url: null,
    expiresAt: null,
    error: null,
    ...rest,
  });
  const refused = (error: string) => imp({ status: "refused", error });
  const status = (): Status => {
    const empty = !["ready", "exporting", "exported", "notEmpty", "imported", "deleting", "deleteStopped", "ownerBlocked", "resetting"].includes(state);
    const preview = { format: 1, version: "0.8.0", exportedAt: "2026-10-06T09:00:00.000Z", counts: COUNTS, omitted: [] };
    return {
      version: "0.8.0",
      uploadTo: "https://example.invalid/your-data/import",
      empty,
      export:
        state === "exporting"
          ? exp({ step: "Companies", done: 7 })
          : state === "exported"
            ? exp({ status: "done", name: NAME, bytes: BYTES, url: "data:application/zip;base64,", expiresAt: now + 60 * 60_000, done: 31 })
            : null,
      import:
        state === "preview"
          ? imp({ preview })
          : state === "importing"
            ? imp({ status: "importing", preview, step: "Roles", done: 300 })
            : state === "stopped"
              ? imp({ status: "importing", preview, step: "Roles", done: 300, beat: now - 10 * 60_000 })
              : state === "imported"
                ? imp({ status: "done", preview, done: 1402, result: { rows: 1402, files: 0, left: 0, omitted: [] } })
                : state === "newer"
                  ? refused(newer("0.10.0", "0.8.0"))
                  : state === "wrongFile"
                    ? refused(WRONG_FILE)
                    : state === "tooLarge"
                      ? refused(TOO_LARGE)
                      : null,
    };
  };
  // Delete account: Wren's own, deleting partway through her workspace's tables (stopped ten minutes ago in
  // deleteStopped), or held back because she owns a self-hosted copy others use.
  const account = (): AccountStatus => ({
    name: "wren@example.com",
    blocked: state === "ownerBlocked" ? "You’re this copy’s owner, so remove the other people in Account first." : null,
    deletion:
      state === "deleting" || state === "deleteStopped"
        ? { step: "deleting", deleted: 1240, tables: 39, table: 18, beat: state === "deleteStopped" ? now - 10 * 60_000 : now }
        : null,
  });
  // Reset account: Wren's workspace partway through clearing, or just cleared.
  const reset = (): ResetStatus => ({
    name: "wren@example.com",
    reset: state === "resetting" ? { step: "clearing", cleared: 92, total: 199, beat: now } : state === "reset" ? { step: "done", cleared: 199, total: 199, beat: now } : null,
  });
  const groups = { stories: 6, record: 45, review: 10, goals: 11, companies: 6, seeds: 4, pursuits: 2, resumes: 7, notes: 1, activity: 32, exports: 1 };
  return {
    ...answer(api.yourData.status, status),
    ...answer(api.accountDelete.status, account),
    ...answer(api.accountDelete.start, () => {
      state = "deleting";
    }),
    ...answer(api.accountReset.status, reset),
    ...answer(api.accountReset.counts, () => ({ groups, capped: false })),
    ...answer(api.accountReset.start, () => {
      state = "resetting";
    }),
    ...answer(api.yourData.startExport, () => {
      state = "exporting";
      return "exp-1" as Id<"exports">;
    }),
    ...answer(api.yourData.startImport, () => {
      state = "importing";
    }),
    ...answer(api.yourData.clearImport, () => {
      state = "empty";
    }),
  };
}
