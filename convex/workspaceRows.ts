import type { Id, TableNames } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import schema from "./schema";
import { WORKSPACE_TABLES } from "./workspaceCopy";

// Reading a workspace's rows whole, a page at a time, for a copy of it: the app's export (yourData.ts) and the demo
// script (demoSeed.ts). Writing them is each one's own (workspaceCopy.copyRows).

const PAGE = 200;
// Well under a function's read limit, so a page of large rows (resumes, role texts) still fits.
const PAGE_BYTES = 4 * 1024 * 1024;

// A workspace table and the index that reads only one workspace's rows. Every workspace table has one
// (workspaceCopy.test.ts), so reading a workspace never reads anyone else's rows.
export function workspaceTable(table: string) {
  const t = WORKSPACE_TABLES[table];
  if (!t) throw new Error(`${table} isn't a workspace table.`);
  if (!t.index) throw new Error(`${table} has no index that starts with workspaceId.`);
  return { index: t.index };
}

type Row = { _id: string; workspaceId?: string } & Record<string, unknown>;
// The index is picked at run time, so its name and fields can't be typed; it's one that starts with workspaceId.
type WorkspaceRange = (q: { eq: (field: "workspaceId", value: Id<"workspaces">) => unknown }) => unknown;

// A workspace's rows in a table, through its workspace index.
export function inWorkspace(ctx: QueryCtx, table: string, workspaceId: Id<"workspaces">) {
  const { index } = workspaceTable(table);
  const range: WorkspaceRange = (q) => q.eq("workspaceId", workspaceId);
  return ctx.db.query(table as TableNames).withIndex(index as never, range as never);
}

// One page of a workspace's rows in a table, and where the next page starts.
export async function pageOf(ctx: QueryCtx, table: string, workspaceId: Id<"workspaces">, cursor: string | null) {
  const result = await inWorkspace(ctx, table, workspaceId).paginate({ numItems: PAGE, cursor, maximumBytesRead: PAGE_BYTES });
  const rows: Row[] = result.page;
  return { rows, cursor: result.continueCursor, done: result.isDone };
}

// Which table each id belongs to on this deployment (null: not an id here), so a copy can name the ids its rows point
// to that it doesn't carry (a job still running, a user).
export function tablesOf(ctx: QueryCtx, ids: string[]) {
  const names = Object.keys(schema.tables) as TableNames[];
  return Object.fromEntries(ids.map((id) => [id, names.find((t) => ctx.db.normalizeId(t, id) !== null) ?? null]));
}
