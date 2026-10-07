import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { CatalogModel, Reasoning } from "../../../convex/aiSettings";
import { AI_TASKS, type AiTask, DECISION_TASKS } from "../../../convex/aiTasks";
import type { Lens } from "../../../convex/lens";
import type { ReminderRule } from "../../../convex/pursuitSteps";
import { answer, type Answers } from "../storyConvex";

// Fixture data for the Settings stories: Wren's workspace with all three keys, a $25 AI budget with $6.40 spent,
// DeepSeek v4.1 Flash for every task but Reading projects (Claude Sonnet 5.5, high reasoning), Jev sorting roles, and
// the recommended models priced against 30 days of use, and Google Drive connected with 14 Docs synced. Mutations and
// actions change the fixtures as the real ones do. `fresh`: a new workspace (no keys, no budget, no model, no Drive), for
// Getting started; `drive: false`: Drive not connected.

type Choice = { model: string; reasoning?: Reasoning };
type TestCall = FunctionReturnType<typeof api.jobs.latestTestCall>;

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso).getTime();

export const CATALOG: CatalogModel[] = [
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek: DeepSeek V4.1 Flash", inPerM: 0.1, outPerM: 0.4, contextLength: 262144, reasoning: true, json: true },
  { id: "openai/gpt-6-luna", name: "OpenAI: GPT-6 Luna", inPerM: 0.05, outPerM: 0.4, contextLength: 400000, reasoning: true, json: true },
  { id: "google/gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", inPerM: 0.3, outPerM: 2.5, contextLength: 1048576, reasoning: true, json: true },
  { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5", inPerM: 2, outPerM: 10, contextLength: 1000000, reasoning: true, json: true },
  { id: "mistralai/mistral-medium-4", name: "Mistral: Mistral Medium 4", inPerM: 0.4, outPerM: 2, contextLength: 131072, reasoning: false, json: true },
  { id: "typesafe/jev-1.13", name: "TypeSafe: Jev 1.13", inPerM: 0.2, outPerM: 0.2, contextLength: 32768, reasoning: false, json: false },
];

const DESCRIPTIONS: Record<string, string> = {
  "deepseek/deepseek-v4.1-flash": "Low cost and quick. Handles everyday reading, sorting and screening well.",
  "openai/gpt-6-luna": "The lowest cost here. Fine for most tasks.",
  "google/gemini-3.8-flash": "In between: more careful than the low-cost models, still quick.",
  "anthropic/claude-sonnet-5.5": "The strongest writer here, for resumes, letters and outreach. Costs several times more.",
};

export function settingsFixtures({ fresh = false, drive: driveOn = !fresh }: { fresh?: boolean; drive?: boolean } = {}): Answers {
  const usage = fresh ? { days: 30, inputTokens: 0, outputTokens: 0 } : { days: 30, inputTokens: 21_400_000, outputTokens: 2_150_000 };
  let main: Choice | null = fresh ? null : { model: "deepseek/deepseek-v4.1-flash", reasoning: "high" };
  const own = new Map<AiTask, Choice>(fresh ? [] : [["projects", { model: "anthropic/claude-sonnet-5.5", reasoning: "high" }], ["roleSortJev", { model: "typesafe/jev-1.13" }]]);
  let sortMethod: "model" | "jev" = "jev";
  const keys: Record<"openrouter" | "apollo" | "brave", { last4: string; setAt: number } | null> = fresh
    ? { openrouter: null, apollo: null, brave: null }
    : { openrouter: { last4: "4f2a", setAt: at("2026-09-14T15:00:00") }, apollo: { last4: "9c1e", setAt: at("2026-09-16T15:00:00") }, brave: { last4: "b07d", setAt: at("2026-09-20T15:00:00") } };
  let budget = fresh ? { aiMonthlyUsd: 0, apolloMonthlyCredits: 0, apolloMode: "paused" as const } : { aiMonthlyUsd: 25, apolloMonthlyCredits: 400, apolloMode: "on" as "on" | "onRequest" | "paused" };
  let lens: Lens = { industries: "steer", judge: "hide" };
  let apolloJobs = true;
  let learn = true;
  const rules: Record<ReminderRule, boolean> = { followUp: true, prepare: true, stale: true };
  let drive: { parentName?: string; syncing: boolean } | null = driveOn ? { syncing: false } : null;
  let test: TestCall = fresh
    ? null
    : {
        status: "done",
        result: { text: "A great career coach helps you see what you’re already good at, then turns it into a plan you can act on this week.", model: "deepseek/deepseek-v4.1-flash-20260901", costUsd: 0.0003, ms: 1200 },
        error: undefined,
        pausedFor: undefined,
      };

  const status = (k: keyof typeof keys) => () => (keys[k] ? { set: true as const, ...keys[k] } : { set: false as const });
  const saveKey = (k: keyof typeof keys) => ({ key }: { key: string }) => {
    if (!key.trim().startsWith(k === "openrouter" ? "sk-or-" : "")) return { ok: false as const, message: "OpenRouter didn't accept that key." };
    keys[k] = { last4: key.trim().slice(-4), setAt: Date.now() };
    return { ok: true as const };
  };
  const removeKey = (k: keyof typeof keys) => () => {
    keys[k] = null;
  };

  return {
    ...answer(api.users.me, () => ({ name: "Wren Castellano", email: "wren@example.com", provider: "google", username: null, owner: false })),
    ...answer(api.workspaces.current, () => ({ id: "ws" as never, name: "Wren Castellano", demo: false, asOf: null })),
    ...answer(api.aiSettings.defaultChoice, () => main),
    ...answer(api.aiSettings.list, () =>
      (Object.keys(AI_TASKS) as AiTask[]).map((task) => {
        const decision = !!DECISION_TASKS[task];
        const mine = own.get(task);
        return { task, label: AI_TASKS[task], decision, own: !!mine, choice: mine ?? (decision ? null : main) };
      }),
    ),
    ...answer(api.aiSettings.setDefault, (c) => {
      main = { model: c.model, reasoning: c.reasoning };
    }),
    ...answer(api.aiSettings.set, ({ task, model, reasoning }) => {
      own.set(task, { model, reasoning });
    }),
    ...answer(api.aiSettings.clearTask, ({ task }) => {
      own.delete(task);
    }),
    ...answer(api.aiSettings.catalog, () => CATALOG),
    ...answer(api.aiSettings.recommended, () => ({
      usage,
      models: Object.keys(DESCRIPTIONS).map((id) => {
        const m = CATALOG.find((c) => c.id === id)!;
        return { id, name: m.name, description: DESCRIPTIONS[id], price: { inPerM: m.inPerM, outPerM: m.outPerM, reasoning: m.reasoning }, monthlyUsd: (usage.inputTokens * m.inPerM + usage.outputTokens * m.outPerM) / 1e6 };
      }),
    })),
    ...answer(api.roles.sortMethodChoice, () => sortMethod),
    ...answer(api.roles.setSortMethod, ({ method }) => {
      sortMethod = method;
    }),
    ...answer(api.jobs.latestTestCall, () => test),
    ...answer(api.jobs.start, () => {
      test = { status: "done", result: { text: "Someone who helps you name what you’re good at and aim it at work worth doing.", model: main?.model, costUsd: 0.0002, ms: 900 }, error: undefined, pausedFor: undefined };
      return "job" as never;
    }),
    ...answer(api.budgets.status, () => ({ ...budget, aiSpentUsd: fresh ? 0 : 6.4, apolloSpentCredits: fresh ? 0 : 212 })),
    ...answer(api.budgets.set, (next) => {
      budget = next;
    }),
    ...answer(api.openrouterKey.status, status("openrouter")),
    ...answer(api.apolloKey.status, status("apollo")),
    ...answer(api.braveKey.status, status("brave")),
    ...answer(api.openrouterKey.save, saveKey("openrouter")),
    ...answer(api.apolloKey.save, saveKey("apollo")),
    ...answer(api.braveKey.save, saveKey("brave")),
    ...answer(api.openrouterKey.remove, removeKey("openrouter")),
    ...answer(api.apolloKey.remove, removeKey("apollo")),
    ...answer(api.braveKey.remove, removeKey("brave")),
    ...answer(api.apolloKey.balance, () => (keys.apollo ? { left: 788, limit: 1000, consumed: 212, cycleStart: at("2026-09-14T00:00:00"), cycleEnd: at("2026-10-14T00:00:00") } : null)),
    ...answer(api.discovery.companySettings, () => ({ lens, apolloJobs, learn, filledIn: 112 })),
    ...answer(api.discovery.setLearn, ({ on }) => {
      learn = on;
    }),
    ...answer(api.discovery.setLens, (next) => {
      lens = next;
    }),
    ...answer(api.enrich.setApolloJobs, ({ on }) => {
      apolloJobs = on;
    }),
    ...answer(api.enrich.rejudge, () => undefined),
    ...answer(api.pursuits.reminderRules, () => ({ ...rules })),
    ...answer(api.pursuits.setReminderRule, ({ rule, on }) => {
      rules[rule] = on;
    }),
    ...answer(api.profile.get, () => ({ name: "Wren Castellano", email: "wren@example.com", phone: "(412) 555-0137", location: "Pittsburgh, Pennsylvania", links: [] })),
    ...answer(api.github.status, () => ({ ready: true, connected: { account: "wrencastellano", selection: "selected" as const, settingsUrl: "https://github.com/settings/installations/1", at: Date.now() - 12 * DAY } })),
    ...answer(api.drive.status, () =>
      drive
        ? {
            ready: true,
            picker: { clientId: "1-story.apps.googleusercontent.com", apiKey: "story", appId: "1" },
            connected: {
              account: "wren@example.com",
              place: drive.parentName ?? "My Drive",
              chosen: drive.parentName !== undefined,
              folderUrl: "https://drive.google.com/drive/folders/story",
              broken: null,
              files: 14,
              failed: 0,
              error: null,
              syncing: drive.syncing,
              syncedAt: Date.now() - 40 * 60 * 1000,
              at: Date.now() - 3 * DAY,
            },
          }
        : { ready: true, picker: null, connected: null },
    ),
    ...answer(api.drive.connect, () => {
      drive = { syncing: true };
      return "#";
    }),
    ...answer(api.drive.syncNow, () => {
      if (drive) drive = { ...drive, syncing: true };
      return "job" as never;
    }),
    ...answer(api.drive.disconnect, () => {
      drive = null;
    }),
  };
}
