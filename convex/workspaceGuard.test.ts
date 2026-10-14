// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";
import { OPERATOR_ONLY } from "./publicFunctions.testing";

// Every public query, mutation and action goes through a guard: its handler calls it, or calls a function of
// CareerBot's own (a helper, or an internal function it runs) that does. The workspace guard (workspaces.ts,
// requireWorkspace) keeps a call to the caller's own workspace; the operator guard (operators.ts, requireOperator) lets
// only careerbot.dev's operators in, who reach every workspace by design, and its functions are listed (OPERATOR_ONLY)
// so isolation.test.ts can check that everyone else is refused. The few that need neither say why below.
// isolation.test.ts checks the same thing by calling them.

const WORKSPACE_GUARD = "workspaces:requireWorkspace";
const OPERATOR_GUARD = "operators:requireOperator";

// Public functions that don't go through a guard, and why they needn't.
const WITHOUT_A_WORKSPACE: Record<string, string> = {
  "workspaces:current": "the caller's own workspace's name, found from their own membership",
  "users:me": "the caller's own user row",
  "updates:sawVersion": "the caller's own user row",
  "accountDelete:status": "the caller's own account and its deletion, found from their own user",
  "accountDelete:start": "deletes the caller's own account and workspace, found from their own user",
  "updates:status": "copy-wide update check, for a self-hosted copy's owner only (ownerOfThisCopy)",
  "updates:setCheck": "copy-wide update check, for a self-hosted copy's owner only (ownerOfThisCopy)",
  "account:ownerNeeded": "whether a self-hosted copy has its owner yet: a yes or no, for the sign-in screen",
  "account:people": "a self-hosted copy's people, for its owner only (requireOwner)",
  "account:addPerson": "a self-hosted copy's people, for its owner only (requireOwner, through ownerId)",
  "account:resetPersonPassword": "a self-hosted copy's people, for its owner only (requireOwner, through personToChange)",
  "account:removePerson": "a self-hosted copy's people, for its owner only (requireOwner, through personToChange)",
  "waitlist:join": "careerbot.dev's waitlist form, signed out: adds a row and reads nothing back",
  "auth:signInMethods": "which sign-ins this copy offers, from its settings: for the sign-in screen, signed out",
  "invites:lookup":
    "the invite page, signed out, by the link's token (48 random hex digits): where that invite stands, the email it was sent to (which whoever has the link was sent), its expiry and the default allowance; nothing of a workspace",
  "operators:isOperator": "whether the caller is an operator, from their own user, so the app can offer Admin",
};

const DIR = __dirname;
const BUILDERS = ["query", "mutation", "action", "internalQuery", "internalMutation", "internalAction", "httpAction"];
const PUBLIC = ["query", "mutation", "action"];

type Unit = { body: ts.Node; isPublic: boolean };

// Every top-level function of every module ("module:name"), with what it refers to: functions it calls by name (its
// own module's, or imported from another), and functions it runs through `internal.module.name` or `api.module.name`.
function modules() {
  const units = new Map<string, Unit>();
  const refs = new Map<string, Set<string>>();
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.includes(".test.") && !f.includes(".testing.") && !f.endsWith(".d.ts"))) {
    const mod = file.slice(0, -3);
    const source = ts.createSourceFile(file, readFileSync(join(DIR, file), "utf8"), ts.ScriptTarget.Latest, true);
    const imported = new Map<string, string>();
    for (const s of source.statements) {
      if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier) || !s.moduleSpecifier.text.startsWith("./")) continue;
      const from = s.moduleSpecifier.text.slice(2);
      const named = s.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) for (const el of named.elements) imported.set(el.name.text, `${from}:${(el.propertyName ?? el.name).text}`);
    }
    const own = new Map<string, Unit>();
    for (const s of source.statements) {
      if (ts.isFunctionDeclaration(s) && s.name && s.body) own.set(s.name.text, { body: s.body, isPublic: false });
      if (!ts.isVariableStatement(s)) continue;
      const exported = s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const init = d.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) own.set(d.name.text, { body: init.body, isPublic: false });
        else if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && BUILDERS.includes(init.expression.text))
          own.set(d.name.text, { body: init, isPublic: exported && PUBLIC.includes(init.expression.text) });
      }
    }
    for (const [name, unit] of own) {
      const key = `${mod}:${name}`;
      units.set(key, unit);
      const found = new Set<string>();
      const visit = (node: ts.Node) => {
        // A name, not a property's (ctx.db.get) or an object key's.
        const isName = !!node.parent && (ts.isPropertyAccessExpression(node.parent) || ts.isPropertyAssignment(node.parent)) && node.parent.name === node;
        if (ts.isIdentifier(node) && !isName) {
          if (own.has(node.text) && node.text !== name) found.add(`${mod}:${node.text}`);
          const from = imported.get(node.text);
          if (from) found.add(from);
        }
        // internal.module.name / api.module.name
        if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
          if (["internal", "api"].includes(node.expression.expression.text)) found.add(`${node.expression.name.text}:${node.name.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(unit.body);
      refs.set(key, found);
    }
  }
  return { units, refs };
}

// The functions that go through a guard: the guard, and every function that refers to one that does.
function guarded(refs: Map<string, Set<string>>, guard: string) {
  const through = new Set([guard]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [key, to] of refs) {
      if (through.has(key) || ![...to].some((r) => through.has(r))) continue;
      through.add(key);
      grew = true;
    }
  }
  return through;
}

function check() {
  const { units, refs } = modules();
  const workspace = guarded(refs, WORKSPACE_GUARD);
  const operator = guarded(refs, OPERATOR_GUARD);
  const pub = [...units].filter(([, u]) => u.isPublic).map(([key]) => key);
  return { units, pub, workspace, operator, through: (key: string) => workspace.has(key) || operator.has(key) };
}

test("every public query, mutation and action goes through the workspace or operator guard, or says why it needn't", () => {
  const { pub, through } = check();
  // A broken parse would find none.
  expect(pub.length).toBeGreaterThan(250);
  expect(pub.filter((key) => !through(key) && !WITHOUT_A_WORKSPACE[key])).toEqual([]);
});

test("the functions behind the operator guard alone are the ones listed as operators' only", () => {
  const { pub, workspace, operator } = check();
  expect(pub.filter((key) => operator.has(key) && !workspace.has(key)).sort()).toEqual(Object.keys(OPERATOR_ONLY).sort());
});

test("each exception names a public function that is still there and still has no guard", () => {
  const { units, through } = check();
  const stale = Object.keys(WITHOUT_A_WORKSPACE).filter((key) => !units.get(key)?.isPublic || through(key));
  expect(stale).toEqual([]);
});
