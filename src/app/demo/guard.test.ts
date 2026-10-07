import { type FunctionReference, getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { expect, test, vi } from "vitest";
import { api } from "../../../convex/_generated/api";
import { DemoRefused, guardDemo } from "./guard";

// A client with the two methods the guard wraps; each records the name of what reached it.
function client(answer: (name: string) => Promise<unknown> = async () => "done") {
  const sent: string[] = [];
  const call = (fn: FunctionReference<"mutation" | "action"> | string) => {
    const name = getFunctionName(fn as FunctionReference<"mutation" | "action">);
    sent.push(name);
    return answer(name);
  };
  return { sent, mutation: call, action: call };
}

test("in the demo, a mutation or action is refused without reaching the server, with one refusal shown", async () => {
  const c = client();
  const refuse = vi.fn();
  guardDemo(c, () => true, refuse);
  await expect(c.mutation(api.notes.add)).rejects.toBeInstanceOf(DemoRefused);
  await expect(c.action(api.people.find)).rejects.toBeInstanceOf(DemoRefused);
  expect(c.sent).toEqual([]);
  expect(refuse).toHaveBeenCalledTimes(2);
});

test("in the demo, signing in and out still reach the server", async () => {
  const c = client();
  const refuse = vi.fn();
  guardDemo(c, () => true, refuse);
  await expect(c.action("auth:signOut")).resolves.toBe("done");
  expect(c.sent).toEqual(["auth:signOut"]);
  expect(refuse).not.toHaveBeenCalled();
});

test("outside the demo, calls go through, and their own errors reach the caller unchanged", async () => {
  const failure = new ConvexError("Add your OpenRouter key first.");
  const c = client(async (name) => {
    if (name === "people:find") throw failure;
    return "done";
  });
  const refuse = vi.fn();
  guardDemo(c, () => false, refuse);
  await expect(c.mutation(api.notes.add)).resolves.toBe("done");
  await expect(c.action(api.people.find)).rejects.toBe(failure);
  expect(c.sent).toEqual(["notes:add", "people:find"]);
  expect(refuse).not.toHaveBeenCalled();
});

test("a refusal from the server, before the app knew it was the demo, is shown as the demo's refusal", async () => {
  const c = client(async () => {
    throw new ConvexError({ kind: "demo", message: "This is a demo, so nothing in it can be changed." });
  });
  const refuse = vi.fn();
  guardDemo(c, () => false, refuse);
  await expect(c.mutation(api.tours.markOffered)).rejects.toBeInstanceOf(DemoRefused);
  expect(refuse).toHaveBeenCalledTimes(1);
});
