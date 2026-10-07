import { expect, test } from "vitest";
import { FORMAT, MIGRATIONS, readExport } from "./exportFormat";
import { newer, NEWER_FORMAT, WRONG_FILE } from "./exportRules";
import { VERSION } from "./version";

const file = (format: number, careerbotVersion = "0.8.0", rest: Record<string, unknown> = {}) =>
  JSON.stringify({ format, careerbotVersion, exportedAt: "2026-10-06T00:00:00.000Z", workspace: { _id: "a".repeat(32), name: "A", began: 1 }, outside: {}, files: {}, tables: {}, ...rest });

test("this copy's own format reads as it is, and every older format has its migration", () => {
  const { file: f, from } = readExport(file(FORMAT, VERSION));
  expect(from).toBe(FORMAT);
  expect(f.format).toBe(FORMAT);
  for (let n = 1; n < FORMAT; n++) expect(MIGRATIONS[n], `a migration from format ${n}`).toBeTypeOf("function");
});

test("an older format is brought forward one step at a time; one no migration reaches is refused", () => {
  const here = { format: 3, version: "1.0.0" };
  const steps = {
    1: (f: Record<string, unknown>) => ({ ...f, workspace: { ...(f.workspace as object), name: "renamed" } }),
    2: (f: Record<string, unknown>) => ({ ...f, files: { moved: true } }),
  };
  const { file: f, from } = readExport(file(1), here, steps);
  expect(from).toBe(1);
  expect(f).toMatchObject({ format: 3, workspace: { name: "renamed" }, files: { moved: true } });
  expect(() => readExport(file(1), here, { 2: steps[2] })).toThrow(/too old/);
});

test("a newer format or CareerBot, and anything that isn't an export, are refused in plain words", () => {
  expect(() => readExport(file(FORMAT + 1, VERSION))).toThrow(NEWER_FORMAT);
  expect(() => readExport(file(FORMAT, "999.0.0"))).toThrow(newer("999.0.0", VERSION));
  expect(() => readExport("{ not json")).toThrow(WRONG_FILE);
  expect(() => readExport(file(FORMAT, VERSION, { tables: { apiKeys: [] } }))).toThrow(WRONG_FILE);
  expect(() => readExport(file(FORMAT, VERSION, { tables: { notes: [{ _id: "x" }] } }))).toThrow(WRONG_FILE);
});
