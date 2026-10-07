// Read a JSON object out of a model's reply. Models asked for JSON sometimes wrap it in a ```json fence or add a
// sentence before or after it; the object itself is what we want.
export class UnreadableReply extends Error {
  constructor(public raw: string) {
    super("The model's reply wasn't readable. Try again.");
  }
}

// A reply that stopped at its max_tokens: its JSON is unfinished, so none of it is used, even a part that would read.
export class CutOffReply extends UnreadableReply {
  constructor(raw: string) {
    super(raw);
    this.message = "The model's reply was too long and got cut off. Try again.";
  }
}

// A reply's JSON Schema, for structured output (metering.chat). Strict, as providers want it: every object lists all
// its properties as required and allows no others. Each step's schema is the shape its own reading of the reply takes:
// a field it reads as missing when empty is an empty string or list; one where null means something, or a number or
// yes/no the reply may not have, can be null. Values the step checks against its own lists (kinds, levels, industries)
// stay plain strings, so the step decides what counts, as it does without a schema. Claude takes at most 16 fields that
// can be null in one schema, and fewer in a large one (metering.chatJson).
export type ReplySchema = { name: string; schema: Record<string, unknown> };
export const strictObject = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
// A list of objects of these properties.
export const listOf = (properties: Record<string, unknown>) => ({ type: "array", items: strictObject(properties) });
export const string = { type: "string" };
export const strings = { type: "array", items: string };
export const number = { type: "number" };
export const boolean = { type: "boolean" };
export const orNull = (type: "string" | "number" | "boolean") => ({ type: [type, "null"] });
// A reply that is one list of objects under one key, e.g. {"insights": [...]}.
export const replyOf = (name: string, key: string, properties: Record<string, unknown>): ReplySchema => ({ name, schema: strictObject({ [key]: listOf(properties) }) });

export function parseReplyJson<T>(text: string): T {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object") return parsed as T;
    } catch {
      // try the next candidate
    }
  }
  throw new UnreadableReply(text);
}
