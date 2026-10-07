import type { Contact, ResumeDoc } from "./resumeDoc";

// What CareerBot keeps in a Google Drive, worked out from the workspace's resumes, letters and answers. Pure: drive.ts
// reads the database and writes to Drive.
//
//   CareerBot/
//     Base resume
//     Directions/<Direction>/Resume
//     Tailored/<Company>/<Role>/Resume, Cover letter, Answers
//
// Every place has a key that stays the same when names change (a direction, company or role by its id), so a renamed
// direction or company renames its folder, and a new version of a resume lands in the same Doc.

export const ROOT = "root";
export const ROOT_NAME = "CareerBot";

// A folder, or a Google Doc with what goes in it (drive.ts writes it as a Word document, docxFiles.ts, which Drive
// converts). parent: the key of the folder it's in. frozen: a tailored file whose pursuit left Preparing: written once
// as sent, then never again.
export type Folder = { key: string; name: string; parent: string; folder: true };
export type DocContent =
  | { kind: "resume"; doc: ResumeDoc; contact: Contact | null }
  | { kind: "letter"; text: string; contact: Contact | null }
  | { kind: "answers"; items: { question: string; answer: string }[] };
export type DocFile = { key: string; name: string; parent: string; folder: false; content: DocContent; hash: string; sourceId: string; frozen: boolean };
export type DriveNode = Folder | DocFile;

// One role's files: its tailored resume, cover letter and answers, whichever it has. roleKey and companyKey are
// stable ids (a posting and a company, or the pasted posting's words).
export type TailoredInput = {
  roleKey: string;
  role: string;
  companyKey: string;
  company: string | null;
  frozen: boolean;
  resume?: { id: string; doc: ResumeDoc };
  letter?: { id: string; text: string };
  answers?: { id: string; items: { question: string; answer: string }[] };
};
export type PlanInput = {
  contact: Contact | null;
  base: { id: string; doc: ResumeDoc } | null;
  directions: { id: string; name: string; resume: { id: string; doc: ResumeDoc } }[];
  tailored: TailoredInput[];
};

// A tailored file is frozen once its pursuit reaches Applied, Interviewing, Offer or Closed, like the app keeps what
// was sent. No pursuit, Preparing, Contacted or In conversation: kept in step.
export const isFrozen = (status: string | null | undefined) => !!status && status !== "preparing" && status !== "contacted" && status !== "inConversation";

// Drive takes any name; one with nothing in it gets a plain one.
export const cleanName = (name: string | null | undefined, fallback: string) => (name ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || fallback;

// A short, stable mark of some text (cyrb53), to tell whether a file's content changed since it was written.
export function hashOf(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// A mark of a Doc's content and of how it's laid out: changing LAYOUT writes every Doc again (frozen ones excepted).
const LAYOUT = "docx-2";
const docFile = (key: string, name: string, parent: string, content: DocContent, sourceId: string, frozen = false): DocFile => ({
  key,
  name,
  parent,
  folder: false,
  content,
  hash: hashOf(`${LAYOUT}\n${JSON.stringify(content)}`),
  sourceId,
  frozen,
});
const resume = (doc: ResumeDoc, contact: Contact | null): DocContent => ({ kind: "resume", doc, contact });

// Every folder and Doc, each folder before what's in it. Folders exist only for files that do. Two roles at one
// company with the same name get " (2)", " (3)" in the order they're given, so each has its own folder you can tell apart.
export function planNodes(input: PlanInput): DriveNode[] {
  const out: DriveNode[] = [];
  const folders = new Set<string>();
  const folder = (key: string, name: string, parent: string) => {
    if (folders.has(key)) return;
    folders.add(key);
    out.push({ key, name, parent, folder: true });
  };
  if (input.base) out.push(docFile("base", "Base resume", ROOT, resume(input.base.doc, input.contact), input.base.id));
  for (const d of input.directions) {
    folder("folder:directions", "Directions", ROOT);
    const at = `folder:direction:${d.id}`;
    folder(at, cleanName(d.name, "Direction"), "folder:directions");
    out.push(docFile(`direction:${d.id}`, "Resume", at, resume(d.resume.doc, input.contact), d.resume.id));
  }
  const taken = new Map<string, Set<string>>();
  for (const t of input.tailored) {
    if (!t.resume && !t.letter && !t.answers?.items.length) continue;
    folder("folder:tailored", "Tailored", ROOT);
    const company = `folder:company:${t.companyKey}`;
    folder(company, cleanName(t.company, "Other companies"), "folder:tailored");
    const names = taken.get(company) ?? new Set<string>();
    taken.set(company, names);
    const base = cleanName(t.role, "Role");
    let name = base;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    names.add(name.toLowerCase());
    const role = `folder:role:${t.roleKey}`;
    folder(role, name, company);
    if (t.resume) out.push(docFile(`resume:${t.roleKey}`, "Resume", role, resume(t.resume.doc, input.contact), t.resume.id, t.frozen));
    if (t.letter) out.push(docFile(`letter:${t.roleKey}`, "Cover letter", role, { kind: "letter", text: t.letter.text, contact: input.contact }, t.letter.id, t.frozen));
    if (t.answers?.items.length) out.push(docFile(`answers:${t.roleKey}`, "Answers", role, { kind: "answers", items: t.answers.items }, t.answers.id, t.frozen));
  }
  return out;
}

// The folder names from the CareerBot folder down to a node, for showing where it is ("CareerBot / Tailored / Acme").
export function pathOf(nodes: DriveNode[], key: string): string[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const names: string[] = [];
  for (let n = byKey.get(key); n; n = byKey.get(n.parent)) names.unshift(n.name);
  return [ROOT_NAME, ...names];
}

// What was last written to a place (driveFiles), as far as deciding goes.
export type Written = { fileId?: string; name: string; parentKey?: string; hash?: string; frozen?: boolean };

// What a sync does with one place: make it (nothing there yet), write it (content, name or folder changed), only
// rename or move a folder, mark a frozen file as frozen (it already reads as sent), or leave it. A frozen file that's
// been written as sent is never touched again; back in Preparing it's kept in step once more.
export type Step = "create" | "update" | "move" | "mark" | "skip";
export function stepFor(node: DriveNode, row: Written | null | undefined): Step {
  if (!row?.fileId) return "create";
  if (node.folder) return row.name !== node.name || row.parentKey !== node.parent ? "move" : "skip";
  if (row.frozen && node.frozen) return "skip";
  if (row.hash !== node.hash || row.name !== node.name || row.parentKey !== node.parent) return "update";
  return !!row.frozen !== node.frozen ? "mark" : "skip";
}

// A tailored place's key for a pasted posting (no role on the Roles page): the posting's words, so writing it again
// lands in the same folder.
export const pastedKey = (posting: string) => `pasted-${hashOf(posting.trim())}`;
