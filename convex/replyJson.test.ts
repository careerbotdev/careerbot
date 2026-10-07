import { expect, test } from "vitest";
import { parseReplyJson, UnreadableReply } from "./replyJson";

test("reads plain JSON, fenced JSON, and JSON with a sentence around it", () => {
  expect(parseReplyJson('{"a":1}')).toEqual({ a: 1 });
  expect(parseReplyJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseReplyJson('Here is the record:\n{"a":{"b":[1,2]}}\nLet me know if you need more.')).toEqual({ a: { b: [1, 2] } });
});

test("an unreadable reply keeps its raw text for inspection", () => {
  try {
    parseReplyJson("I can't do that.");
    throw new Error("should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(UnreadableReply);
    expect((e as UnreadableReply).raw).toBe("I can't do that.");
  }
});
