import { jsonToConvex, type JSONValue, type Value, type ValidatorJSON } from "convex/values";

// Every public query, mutation and action the deployment registers, for the tests that call them all (demo.test.ts,
// isolation.test.ts), and values that pass their validators. (Two dots in the name: Convex doesn't deploy it.)

export type Kind = "query" | "mutation" | "action";
export type PublicFunction = { path: string; kind: Kind; args: ValidatorJSON };

// Convex Auth's own: signIn and signOut act on the caller's session, not on a workspace, isAuthenticated says only
// whether there is one, and store is internal. They're the only public functions not defined in CareerBot's own modules.
const AUTH_OWN: Record<string, true> = { "auth:signIn": true, "auth:signOut": true, "auth:isAuthenticated": true };

// careerbot.dev's operators' functions (operators.requireOperator): they reach every workspace by design, so everyone
// else must be refused (isolation.test.ts). workspaceGuard.test.ts checks this is every function behind that guard alone.
export const OPERATOR_ONLY: Record<string, true> = {
  "adminPeople:people": true,
  "adminPeople:costByStep": true,
  "adminPeople:log": true,
  "adminPeople:invite": true,
  "adminPeople:resendInvite": true,
  "adminPeople:revokeInvite": true,
  "adminPeople:setAllowance": true,
  "adminPeople:suspend": true,
  "adminPeople:restore": true,
};

// The public functions of the modules `import.meta.glob("./**/*.ts")` found, of the given kinds, sorted by path.
export async function publicFunctions(modules: Record<string, () => Promise<unknown>>, kinds: readonly Kind[]): Promise<PublicFunction[]> {
  const found: PublicFunction[] = [];
  for (const [file, load] of Object.entries(modules)) {
    if (file.startsWith("./_generated/") || file.endsWith(".test.ts")) continue;
    const exported = (await load()) as Record<string, unknown>;
    for (const [name, fn] of Object.entries(exported)) {
      if (typeof fn !== "function" || !("isPublic" in fn) || !fn.isPublic || !("exportArgs" in fn) || typeof fn.exportArgs !== "function") continue;
      const kind = "isQuery" in fn && fn.isQuery ? "query" : "isMutation" in fn && fn.isMutation ? "mutation" : "isAction" in fn && fn.isAction ? "action" : null;
      const path = `${file.slice(2, -3)}:${name}`;
      if (!kind || !kinds.includes(kind) || AUTH_OWN[path]) continue;
      found.push({ path, kind, args: JSON.parse(fn.exportArgs() as string) as ValidatorJSON });
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

// The same count read from the source (`export const x = query(`, `mutation(` or `action(`), so a module the glob
// misses, or a registered function the check above doesn't recognize, fails a test instead of passing with fewer calls.
export function functionsInSource(sources: Record<string, string>, kinds: readonly Kind[]) {
  const pattern = new RegExp(`^export const \\w+ = (${kinds.join("|")})\\(`, "gm");
  let n = 0;
  for (const [file, text] of Object.entries(sources)) if (!file.endsWith(".test.ts")) n += text.match(pattern)?.length ?? 0;
  return n;
}

// How valueFor fills a validator. text: every string. pick: which choice of a union (the pick-th, wrapping), so calling
// with pick 0, 1, 2… tries each. full: optional fields too, and one element in each list, so ids in them are filled.
// idOf: a real row of a table.
export type Fill = { text: string; pick: number; full: boolean; idOf: (table: string) => Promise<string> };

// A value that passes a validator: by default required fields only, the first choice of a union, empty lists and records.
export async function valueFor(json: ValidatorJSON, fill: Fill): Promise<Value> {
  switch (json.type) {
    case "null":
      return null;
    case "number":
      return 1;
    case "bigint":
      return BigInt(1);
    case "boolean":
      return false;
    case "string":
      return fill.text;
    case "bytes":
      return new ArrayBuffer(1);
    case "any":
      return fill.text;
    case "literal":
      return jsonToConvex(json.value as JSONValue);
    case "id":
      return fill.idOf(json.tableName);
    case "array":
      return fill.full ? [await valueFor(json.value, fill)] : [];
    case "record":
      return {};
    case "union":
      return valueFor(json.value[fill.pick % json.value.length], fill);
    case "object": {
      const out: Record<string, Value> = {};
      for (const [field, { fieldType, optional }] of Object.entries(json.value)) if (!optional || fill.full) out[field] = await valueFor(fieldType, fill);
      return out;
    }
    default:
      throw new Error(`No value for validator ${json.type}`);
  }
}

// The most choices any union in a validator has: how many picks reach every choice.
export function choicesIn(json: ValidatorJSON): number {
  switch (json.type) {
    case "union":
      return Math.max(json.value.length, ...json.value.map(choicesIn));
    case "array":
      return choicesIn(json.value);
    case "record":
      return choicesIn(json.values.fieldType);
    case "object":
      return Math.max(1, ...Object.values(json.value).map(({ fieldType }) => choicesIn(fieldType)));
    default:
      return 1;
  }
}

// Convex leaves a validator's JSON form off its public type; every validator has it at run time.
export function jsonOf(validator: object): ValidatorJSON {
  if (!("json" in validator)) throw new Error("A validator without its JSON form");
  return validator.json as ValidatorJSON;
}
