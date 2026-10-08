import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Budgets reset on the 1st; paused work picks up where it left off.
crons.monthly("resume paused work", { day: 1, hourUTC: 0, minuteUTC: 5 }, internal.jobs.resumePaused, {});

// Runs cut off by a deploy or crash are picked up again, so nobody sees a job stuck on "Reading…".
crons.interval("pick up interrupted work", { minutes: 5 }, internal.jobs.recoverStuck, {});

// Every 5 minutes, the reports' counts written since are folded into one row per count and day (tallies.fold), so a
// report keeps reading a few rows.
crons.interval("fold report counts", { minutes: 5 }, internal.tallies.fold, {});

// Every morning, the job boards of every workspace with Targets are read again for new and closed roles.
crons.daily("check roles at targets", { hourUTC: 9, minuteUTC: 0 }, internal.roles.startAll, {});

// Every night, paid calls that may have cost more than they could tell are settled from OpenRouter's and Apollo's own
// figures (metering.reconcile), so spending adds up.
crons.daily("settle unsure spending", { hourUTC: 4, minuteUTC: 0 }, internal.metering.reconcile, {});

// Every hour, the kept price of each model calls have used is read again from OpenRouter (modelPrices.refresh), so
// what an AI call reserves against the budget follows the providers' prices.
crons.interval("keep model prices current", { hours: 1 }, internal.modelPrices.refresh, {});

// Google Drive follows what changes without a sync of its own (layout, contact details, renamed directions and
// companies): every ten minutes, each connected workspace is looked at and synced only when something differs.
crons.interval("keep Google Drive in step", { minutes: 10 }, internal.drive.checkAll, {});

// Every hour, demo visitors' sessions older than a day are deleted with their refresh tokens (demo.dropOldSessions),
// so the demo's shared person doesn't collect sessions forever. Does nothing where there's no demo.
crons.interval("clear old demo sessions", { hours: 1 }, internal.demo.dropOldSessions, {});

// Every morning, a self-hosted copy reads careerbot.dev/releases.json for a newer version (updates.check), unless its
// owner turned that off. Does nothing on careerbot.dev and the demo.
crons.daily("check for a new version", { hourUTC: 6, minuteUTC: 30 }, internal.updates.check, {});

export default crons;
