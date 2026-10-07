// Fails when an action has no explainer (BUILD.md, "Explained"): every Button, CostAction, menu item, row action, bulk
// action and review action on a screen or in a part says what it does (`detail`) and what it costs and whether it can
// be undone (`note`), directly or through a Tooltip around it; an icon-only Button has a name. Exempt, because their
// label says it all: triggers that only open a menu or popover, choices (a menu item with `checked`, a submenu),
// controls that close or step back (Close, Cancel, Done, Back, a picker's Today and Clear, Show more), and the two
// buttons of a question that asks first, whose words are the explainer.
// Reads the code with the TypeScript checker, so a menu item is known by its type, not its spelling.
// Run with `node scripts/explainer-audit.mjs` (`--list` prints every action with its words; `--json` prints every action
// as {file, line, kind, label, detail, note}, each word null when it isn't a literal, for the docs); part of `pnpm lint`.
import { relative } from "node:path";
import ts from "typescript";

const list = process.argv.includes("--list");
const json = process.argv.includes("--json");
const config = ts.getParsedCommandLineOfConfigFile("tsconfig.json", {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const screens = config.fileNames.filter((f) => /\/src\/(app|components)\/.*\.tsx?$/.test(f) && !/\.(stories|test)\.tsx?$/.test(f));
const program = ts.createProgram(screens, { ...config.options, incremental: false, noEmit: true });
const checker = program.getTypeChecker();

// Parts whose JSX is an action, and what each needs (CostAction brings its cost as the note).
const parts = { Button: ["detail", "note"], CostAction: ["detail"] };
// Object types that are actions.
const actionTypes = new Set(["MenuItem", "RowAction", "BulkAction", "ReviewAction", "ReviewAside"]);
// Controls, by label.
const control = /^(Close|Cancel|Done|Back|Today|Clear|Show\b.*\bmore|\{confirmLabel\})$/;
// Words that say what something costs.
const cost = /\bFree\b|\bAbout\b|\$|credit|budget|No cost/i;

const problems = [];
const seen = [];
const actions = [];
let total = 0;

const where = (node) => {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
  return `${relative(".", sf.fileName)}:${line + 1}`;
};
const attrs = (opening) => new Map(opening.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(), a]));
const hasSpread = (opening) => opening.attributes.properties.some(ts.isJsxSpreadAttribute);
const literal = (init) => {
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  const e = ts.isJsxExpression(init) ? init.expression : init;
  if (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) return e.text;
  return undefined;
};
const tagName = (el) => (ts.isJsxElement(el) ? el.openingElement : el).tagName.getText();
const opening = (el) => (ts.isJsxElement(el) ? el.openingElement : el);

// A Tooltip around the action (the nearest one) that carries an explainer.
function tooltipAbove(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && tagName(p) === "Tooltip") {
      const a = attrs(p.openingElement);
      return a.has("detail") || a.has("note") ? a : undefined;
    }
    if (ts.isArrowFunction(p) || ts.isFunctionDeclaration(p)) return undefined;
  }
  return undefined;
}

// The element is the value of a `trigger` prop (a Menu's, a Popover's), or a ⋯ button: it opens choices, it isn't an
// action.
function isTrigger(node, a) {
  const p = node.parent;
  if (literal(a.get("icon")?.initializer) === "more") return true;
  return (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) && /^trigger$/.test(p.parent.name.getText())) || false;
}

// The literal text of an explainer: a JSX attribute's, or an object property's initializer; null when computed.
const literalOf = (v) => (v === undefined || v === true ? null : (literal(ts.isJsxAttribute(v) ? v.initializer : v) ?? null));

function checkWords(kind, label, a, at, needs, labelText = null) {
  total++;
  const [file, line] = [at.slice(0, at.lastIndexOf(":")), Number(at.slice(at.lastIndexOf(":") + 1))];
  actions.push({ file, line, kind, label: labelText, detail: literalOf(a.get("detail")), note: literalOf(a.get("note")) });
  const missing = needs.filter((n) => !a.has(n));
  const note = a.get("note");
  const noteText = note && literal(note.initializer ?? note);
  const words = [a.has("detail") ? "detail" : "", noteText ?? (a.has("note") ? "note" : "")].filter(Boolean).join(" | ");
  seen.push(`${at}  ${kind} ${label}  ${words || "-"}`);
  if (missing.length) return problems.push(`${at}  ${kind} “${label}” has no ${missing.join(" or ")}`);
  if (noteText !== undefined && !cost.test(noteText)) problems.push(`${at}  ${kind} “${label}” note doesn't say what it costs: “${noteText}”`);
}

function visitJsx(el) {
  const name = tagName(el);
  if (!(name in parts)) return;
  const o = opening(el);
  const a = attrs(o);
  const plain = ts.isJsxElement(el) && el.children.length > 0 && el.children.every(ts.isJsxText);
  const text = ts.isJsxElement(el) ? el.children.map((c) => c.getText()).join("").replace(/\s+/g, " ").trim() : "";
  const ariaLabel = literal(a.get("aria-label")?.initializer);
  const label = ariaLabel ?? (text.slice(0, 40) || "?");
  const iconOnly = a.has("iconOnly");
  if (iconOnly && !a.has("aria-label") && !hasSpread(o)) problems.push(`${where(el)}  icon-only ${name} has no aria-label`);
  if (isTrigger(el, a) || control.test(label)) return;
  if (hasSpread(o) && !a.has("detail")) return; // explained by whoever passes the props
  const tip = tooltipAbove(el);
  const merged = new Map([...(tip ?? []), ...a]);
  checkWords(name, label, merged, where(el), parts[name], ariaLabel ?? (a.has("aria-label") ? null : plain && text ? text : null));
}

function typeNames(type) {
  const names = [];
  const walk = (t) => {
    if (t.aliasSymbol) names.push(t.aliasSymbol.name);
    if (t.isUnion() || t.isIntersection()) t.types.forEach(walk);
  };
  if (type) walk(type);
  return names;
}

// Whether every shape the object can take has the property, so a conditional spread without it counts as missing.
function always(type, name) {
  const shapes = type.isUnion() ? type.types : [type];
  return shapes.every((t) => checker.getPropertyOfType(t, name));
}

// The type the object is meant to be. The checker gives none inside `...(cond ? [item] : [])`, so it's taken from
// the element type of the nearest array around it that has one.
function contextOf(obj) {
  const direct = checker.getContextualType(obj);
  if (direct) return direct;
  for (let n = obj.parent; n && (ts.isArrayLiteralExpression(n) || ts.isConditionalExpression(n) || ts.isParenthesizedExpression(n) || ts.isSpreadElement(n) || ts.isBinaryExpression(n)); n = n.parent) {
    const array = ts.isArrayLiteralExpression(n) && checker.getContextualType(n);
    const element = array && checker.getIndexTypeOfType(checker.getNonNullableType(array), ts.IndexKind.Number);
    if (element) return element;
  }
  return undefined;
}

function visitObject(obj) {
  const own = new Map(obj.properties.filter((p) => ts.isPropertyAssignment(p) && p.name).map((p) => [p.name.getText(), p.initializer]));
  const type = checker.getTypeAtLocation(obj);
  if (!always(type, "label") || !always(type, "onSelect")) return;
  const kinds = typeNames(contextOf(obj)).filter((n) => actionTypes.has(n));
  // BottomBarItem, CommandPalette's commands and the like are places to go, not actions.
  if (!kinds.length) return;
  if (checker.getPropertyOfType(type, "checked") || checker.getPropertyOfType(type, "items")) return;
  const label = literal(own.get("label")) ?? (own.get("label")?.getText() ?? "…").slice(0, 40);
  if (control.test(label)) return;
  const a = new Map(["detail", "note"].filter((k) => always(type, k)).map((k) => [k, own.get(k) ?? true]));
  checkWords(kinds[0], label, a, where(obj), ["detail", "note"], literal(own.get("label")) ?? null);
}

for (const sf of program.getSourceFiles()) {
  if (!screens.includes(sf.fileName)) continue;
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) visitJsx(node);
    if (ts.isObjectLiteralExpression(node)) visitObject(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (json) console.log(JSON.stringify(actions, null, 2));
else {
  if (list) console.log(seen.join("\n"));
  if (problems.length) {
    console.error(`Explainer audit: ${problems.length} of ${total} actions need an explainer\n\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`Explainer audit: all ${total} actions are explained.`);
}
