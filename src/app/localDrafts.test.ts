import { beforeEach, expect, test } from "vitest";
import { draftKey, forgetDrafts } from "./localDrafts";

// A stand-in for the browser's localStorage: the parts localDrafts uses, over a plain map.
beforeEach(() => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  globalThis.localStorage = new Proxy(storage, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: (_, k) => (store.has(String(k)) ? { enumerable: true, configurable: true, value: store.get(String(k)) } : undefined) }) as unknown as Storage;
});

test("a draft kept for one workspace isn't found under another's key, and signing out clears drafts but nothing else", () => {
  localStorage.setItem(draftKey("wsA", "firstStory"), JSON.stringify({ title: "Ironbridge Logistics", body: "private" }));
  localStorage.setItem("careerbot.sidebar", "rail");
  expect(localStorage.getItem(draftKey("wsB", "firstStory"))).toBeNull();
  forgetDrafts();
  expect(localStorage.getItem(draftKey("wsA", "firstStory"))).toBeNull();
  expect(localStorage.getItem("careerbot.sidebar")).toBe("rail");
});
