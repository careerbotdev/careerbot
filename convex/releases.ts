import { type Infer, v } from "convex/values";

// A release's notes, as src/app/changelog/releases.json keeps them (written by `pnpm release:prepare` from .changes/)
// and careerbot.dev/releases.json serves them: the version (0.7.0, no v), its date (YYYY-MM-DD), two sentences on it,
// what's new, better and fixed, what someone who runs their own copy has to do when updating (Markdown), whether that
// has to be read before updating, and docs screenshots of what changed (src/app/docs/shots.json). Shared with the
// browser: nothing here touches the server.
export const release = v.object({
  version: v.string(),
  date: v.string(),
  summary: v.string(),
  new: v.array(v.string()),
  better: v.array(v.string()),
  fixed: v.array(v.string()),
  selfHost: v.array(v.string()),
  needsAction: v.boolean(),
  shots: v.array(v.object({ id: v.string(), alt: v.string() })),
});
export type Release = Infer<typeof release>;

// 1 when a is newer than b, -1 when older, 0 when the same. Versions are X.Y.Z; a leading v is ignored.
export function compareVersions(a: string, b: string) {
  const parts = (version: string) => version.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  return 0;
}
