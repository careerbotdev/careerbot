// The upgrade check (`pnpm upgrade:check`): a self-hosted copy of the previous release, with a fictional person's data
// in it, is updated to this checkout's release images the way the docs tell self-hosters to (the new compose.yaml,
// then `docker compose up -d`), and the check proves that nothing was lost and everyone can still sign in.
//
//   1. The previous release (--from, default the newest v* tag before this commit) runs from its own compose.yaml in a
//      compose project of its own (careerbot-upgrade-check), with self-hosted Convex. Its images are pulled from GHCR,
//      or built from that release's files when it predates the release images or they can't be pulled.
//   2. The owner account is made with the setup code, then filled through the app's own functions with a test
//      persona (testdata/personas/renata-alvarez: profile, goals and stories), and a second person is added and
//      chooses their password. Convex exports every table.
//   3. This checkout's compose.yaml starts the release images at its CAREERBOT_VERSION default (built from this
//      checkout first when they aren't on this machine), on the same data volume. Its setup step must deploy the new
//      functions onto the old data, and the web app must come up.
//   4. The owner's session from before still refreshes, the owner and the second person sign in with their passwords,
//      a wrong password is still refused, everything seeded reads back the same, and every row in the first export
//      is still there.
//
// Everything runs in local Docker, on ports from UPGRADE_CHECK_PORT (default 3390, and the three after it); no cloud
// deployment is touched. The project and its volume are removed at the end, unless --keep is given.
//
// Flags: --from <tag>, --keep.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference, type FunctionReference } from "convex/server";

const PROJECT = "careerbot-upgrade-check";
const PERSONA = join("testdata", "personas", "renata-alvarez");
const TARGETS = { web: "web", "convex-setup": "convex-setup" } as const;
const WAIT_MS = 5 * 60_000;
// Release images this run built from the checkout, removed at the end.
const built: string[] = [];

type Tokens = { token: string; refreshToken: string };
type Narrative = { id: string; title: string };

const root = process.cwd();
const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const keep = argv.includes("--keep");

function fail(message: string): never {
  console.error(`\nUpgrade check failed: ${message}`);
  process.exit(1);
}

function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
  console.log(`  ok  ${message}`);
}

const out = (cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();

// ---- What runs where ----

const from =
  flag("from") ??
  (() => {
    try {
      return out("git", ["describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD^"]);
    } catch {
      // A history with no earlier release (the public repository's first one) has nothing to update from.
      console.log("Upgrade check: no earlier version tag in this history, so there's no release to update from.");
      process.exit(0);
    }
  })();
const compose = readFileSync(join(root, "compose.yaml"), "utf8");
// The release images and version this checkout's compose.yaml runs (their registry follows the repository's owner).
const image = (name: string) =>
  new RegExp(`^\\s*image:\\s*(\\S+/${name}):\\$\\{CAREERBOT_VERSION:-([^}]+)\\}`, "m").exec(compose) ??
  fail(`compose.yaml doesn't run <registry>/${name}:\${CAREERBOT_VERSION:-<version>}.`);
const [, webImage, to] = image("careerbot-web");
const IMAGES = { web: webImage, "convex-setup": image("careerbot-setup")[1] } as const;

const base = Number(process.env.UPGRADE_CHECK_PORT ?? 3390);
const ports = { web: base, api: base + 1, site: base + 2, dashboard: base + 3 };
const convexUrl = `http://localhost:${ports.api}`;

const work = mkdtempSync(join(tmpdir(), "careerbot-upgrade-"));
const fromDir = join(work, "from");
const envFile = join(work, "check.env");
// CONVEX_SITE_ORIGIN is the backend's own name in the compose network, so it checks sign-ins against itself on any
// published port (a localhost origin would need port 3211 on this machine).
const settings: Record<string, string> = {
  COMPOSE_PROFILES: "self-hosted",
  SITE_URL: `http://localhost:${ports.web}`,
  NEXT_PUBLIC_CONVEX_URL: convexUrl,
  CONVEX_SITE_ORIGIN: "http://convex-backend:3211",
  CONVEX_SELF_HOSTED_URL: "http://convex-backend:3210",
  WEB_PORT: String(ports.web),
  CONVEX_PORT: String(ports.api),
  CONVEX_SITE_PORT: String(ports.site),
  CONVEX_DASHBOARD_PORT: String(ports.dashboard),
};
writeFileSync(envFile, Object.entries(settings).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
// The Convex CLI runs only in a folder whose package.json names convex; the work folder has no .env.local to steer it.
writeFileSync(join(work, "package.json"), JSON.stringify({ private: true, dependencies: { convex: "*" } }));

// The shell's own settings would win over the env file, so compose gets none of them, and the Convex CLI sees only the
// check's backend.
const SHELL_KEYS = new Set([...Object.keys(settings), "CAREERBOT_VERSION", "CONVEX_RELEASE", "BIND_ADDRESS", "CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT", "CONVEX_SELF_HOSTED_ADMIN_KEY"]);
function dockerEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (SHELL_KEYS.has(k) || k.startsWith("COMPOSE_")) delete env[k];
  return { ...env, ...extra };
}

// `docker compose` for one side of the upgrade: its compose files, the check's settings and project.
function dc(files: string[], args: string[], opts: { env?: Record<string, string>; quiet?: boolean; allowFail?: boolean } = {}) {
  const full = ["compose", "-p", PROJECT, "--env-file", envFile, ...files.flatMap((f) => ["-f", f]), ...args];
  if (opts.quiet) return out("docker", full, { env: dockerEnv(opts.env) });
  const r = spawnSync("docker", full, { stdio: "inherit", env: dockerEnv(opts.env) });
  if (r.status !== 0 && !opts.allowFail) throw new Error(`docker ${full.join(" ")} exited with ${r.status}`);
  return r.status === 0 ? "" : null;
}

type Service = { Service: string; State: string; Health: string; ExitCode: number; Image: string };
const services = (files: string[]): Service[] =>
  dc(files, ["ps", "-a", "--format", "json"], { quiet: true })!
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => JSON.parse(line) as Service | Service[]);

async function running(files: string[], label: string) {
  const until = Date.now() + WAIT_MS;
  for (;;) {
    const all = services(files);
    const setup = all.find((s) => s.Service === "convex-setup");
    const web = all.find((s) => s.Service === "web");
    if (setup?.State === "exited" && setup.ExitCode !== 0) throw new Error(`${label}: convex-setup exited with ${setup.ExitCode}`);
    if (setup?.State === "exited" && web?.Health === "healthy") return all;
    if (Date.now() > until) throw new Error(`${label}: web wasn't healthy within ${WAIT_MS / 60_000} minutes`);
    await sleep(3000);
  }
}

// ---- Convex: sign-in and the app's functions, as a person in the browser calls them ----

const ref = <T extends "query" | "mutation" | "action">(type: T, name: string) =>
  makeFunctionReference(name) as unknown as FunctionReference<T, "public", Record<string, unknown>, unknown>;
const signIn = ref("action", "auth:signIn");

async function auth(args: Record<string, unknown>): Promise<Tokens> {
  const r = (await new ConvexHttpClient(convexUrl).action(signIn, args)) as { tokens?: Tokens | null };
  if (!r.tokens) throw new Error("sign-in returned no session");
  return r.tokens;
}
const withPassword = (params: Record<string, string>) => auth({ provider: "password", params });

function as(tokens: Tokens) {
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(tokens.token);
  return {
    query: (name: string, args: Record<string, unknown> = {}) => client.query(ref("query", name), args),
    mutation: (name: string, args: Record<string, unknown> = {}) => client.mutation(ref("mutation", name), args),
    action: (name: string, args: Record<string, unknown> = {}) => client.action(ref("action", name), args),
  };
}

// Every row of every table, by id, from a `convex export` of the check's backend.
function exportRows(files: string[], name: string) {
  const key = dc(files, ["exec", "-T", "convex-backend", "./generate_admin_key.sh"], { quiet: true })!.split("\n").filter(Boolean).at(-1)!;
  const zip = join(work, `${name}.zip`);
  out(join(root, "node_modules", ".bin", "convex"), ["export", "--path", zip], {
    cwd: work,
    env: dockerEnv({ CONVEX_SELF_HOSTED_URL: convexUrl, CONVEX_SELF_HOSTED_ADMIN_KEY: key }),
  });
  const rows = new Map<string, Set<string>>();
  for (const entry of out("unzip", ["-Z1", zip]).split("\n")) {
    const m = /^([^/_][^/]*)\/documents\.jsonl$/.exec(entry);
    if (!m) continue;
    const ids = out("unzip", ["-p", zip, entry]).split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { _id: string })._id);
    rows.set(m[1], new Set(ids));
  }
  return rows;
}

// ---- The check ----

async function main() {
  console.log(`Upgrade check: ${from} -> ${to}, in compose project ${PROJECT} (ports ${ports.web}-${ports.dashboard})`);
  const persona = JSON.parse(readFileSync(join(root, PERSONA, "persona.json"), "utf8")) as {
    profile: { name: string; email: string; phone: string; location: string; links: string[] };
    stories: { file: string; title: string }[];
  };
  const text = (file: string) => readFileSync(join(root, PERSONA, file), "utf8");
  const owner = { username: "renata", password: randomBytes(12).toString("base64url") };
  const second = { username: "sam", password: randomBytes(12).toString("base64url") };

  // 1. The previous release.
  out("git", ["archive", "-o", join(work, "from.tar"), from]);
  mkdirSync(fromDir);
  out("tar", ["-xf", join(work, "from.tar"), "-C", fromDir]);
  const oldFiles = [join(fromDir, "compose.yaml")];
  const oldCompose = readFileSync(oldFiles[0], "utf8");
  console.log(`\n== ${from}: starting it`);
  if (!/careerbot-web:\$\{CAREERBOT_VERSION:-/.test(oldCompose)) dc(oldFiles, ["up", "-d", "--build"]);
  else if (dc(oldFiles, ["pull", "web", "convex-setup"], { allowFail: true }) !== null) dc(oldFiles, ["up", "-d"]);
  else dc([...oldFiles, join(fromDir, "compose.build.yaml")], ["up", "-d", "--build"]);
  await running(oldFiles, from);

  // 2. Its data.
  console.log(`\n== ${from}: the owner account and a test persona's data`);
  const logs = dc(oldFiles, ["logs", "--no-color", "convex-setup"], { quiet: true })!;
  const setupCode = [...logs.matchAll(/Setup code: ([0-9A-Z]{4}-[0-9A-Z]{4})/g)].at(-1)?.[1];
  check(setupCode, "the setup step printed a setup code");
  const before = await withPassword({ flow: "signUp", setupCode: setupCode!, ...owner });
  check(before.token, `the owner account (${owner.username}) was made with it`);
  const ownerApi = as(before);
  await ownerApi.mutation("profile:save", persona.profile);
  await ownerApi.mutation("narratives:create", { kind: "goals", title: "Goals", body: text("goals.md") });
  for (const s of persona.stories) await ownerApi.mutation("narratives:create", { kind: "career", title: s.title, body: text(s.file) });
  const { temporaryPassword } = (await ownerApi.action("account:addPerson", { username: second.username })) as { temporaryPassword: string };
  const secondTokens = await withPassword({ flow: "newPassword", username: second.username, password: temporaryPassword, newPassword: second.password });
  await as(secondTokens).mutation("narratives:create", { kind: "career", title: "Line cook at Juniper Table", body: "Two years on the line, then sous chef." });

  const read = async (tokens: Tokens) => {
    const api = as(tokens);
    const list = (await api.query("narratives:list")) as Narrative[];
    const bodies = await Promise.all(list.map(async (n) => ((await api.query("narratives:get", { id: n.id })) as { body: string }).body));
    return JSON.stringify({ profile: await api.query("profile:get"), narratives: list.map((n, i) => ({ id: n.id, title: n.title, body: bodies[i] })) });
  };
  const ownerData = await read(before);
  const secondData = await read(secondTokens);
  check(JSON.parse(ownerData).narratives.length === persona.stories.length + 1, `${persona.stories.length} stories and the goals saved`);
  const rowsBefore = exportRows(oldFiles, "before");
  const total = (rows: Map<string, Set<string>>) => [...rows.values()].reduce((n, s) => n + s.size, 0);
  console.log(`  exported ${total(rowsBefore)} rows in ${rowsBefore.size} tables`);

  // 3. The update, as the docs say: the new compose.yaml, then up.
  const newFiles = [join(root, "compose.yaml")];
  for (const [service, image] of Object.entries(IMAGES) as [keyof typeof IMAGES, string][]) {
    const tag = `${image}:${to}`;
    if (spawnSync("docker", ["image", "inspect", tag], { stdio: "ignore" }).status === 0) continue;
    console.log(`\n== building ${tag} from this checkout`);
    built.push(tag);
    const r = spawnSync("docker", ["build", "--target", TARGETS[service], "-t", tag, root], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`building ${tag} failed`);
  }
  console.log(`\n== updating to ${to}`);
  dc(newFiles, ["up", "-d"]);
  const after = await running(newFiles, to);
  for (const [service, image] of Object.entries(IMAGES)) check(after.find((s) => s.Service === service)?.Image === `${image}:${to}`, `${service} runs ${image}:${to}`);
  console.log(`  ok  the setup step deployed ${to}'s functions onto ${from}'s data`);
  const page = await fetch(`http://localhost:${ports.web}/`);
  check(page.ok, `the web app answers (${page.status})`);

  // 4. Sign-in and data survived.
  console.log(`\n== ${to}: sign-in and data`);
  const refreshed = await auth({ refreshToken: before.refreshToken });
  check(refreshed.token, "the owner's session from before the update still refreshes");
  check((await read(refreshed)) === ownerData, "the owner's profile, goals and stories read back the same");
  const ownerAgain = await withPassword({ flow: "signIn", ...owner });
  check(ownerAgain.token, "the owner signs in with their password");
  const secondAgain = await withPassword({ flow: "signIn", ...second });
  check((await read(secondAgain)) === secondData, "the second person signs in with their password and sees their story");
  const wrong = await withPassword({ flow: "signIn", username: owner.username, password: "not-the-password" }).then(() => false, () => true);
  check(wrong, "a wrong password is still refused");
  const rowsAfter = exportRows(newFiles, "after");
  const lost = [...rowsBefore].flatMap(([table, ids]) => [...ids].filter((id) => !rowsAfter.get(table)?.has(id)).map((id) => `${table}/${id}`));
  check(lost.length === 0, `all ${total(rowsBefore)} rows from before are still there${lost.length ? `; missing: ${lost.slice(0, 10).join(", ")}` : ""}`);
  console.log(`\nUpgrade check passed: ${from} -> ${to}.`);
}

void main().then(
  () => cleanUp(0),
  (e: unknown) => {
    console.error(`\nUpgrade check failed: ${e instanceof Error ? e.message : String(e)}`);
    // The setup step's log says why a deploy onto the old data failed.
    dc([join(root, "compose.yaml")], ["logs", "--no-color", "--tail", "60", "convex-setup", "web"], { allowFail: true });
    cleanUp(1);
  },
);

function cleanUp(code: number) {
  if (keep) console.log(`\nKept: docker compose -p ${PROJECT} --env-file ${envFile} -f compose.yaml ps`);
  else {
    // The old compose file names the images it built; the release images built here go too, so a build never stands
    // in for a published release on this machine.
    dc([join(fromDir, "compose.yaml")], ["down", "-v", "--rmi", "local", "--remove-orphans"], { allowFail: true });
    if (built.length) spawnSync("docker", ["image", "rm", ...built], { stdio: "inherit" });
    rmSync(work, { recursive: true, force: true });
  }
  process.exit(code);
}
