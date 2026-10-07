"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { type Contact, type ResumeDoc, toHtml, toMarkdown, toPlain, toRtf } from "../../../convex/resumeDoc";
import { Button, type ButtonSize } from "@/components/Button";
import { Menu, type MenuEntry } from "@/components/Menu";
import { toast } from "@/components/Toast";
import { useDriveEntries } from "./Drive";
import { toDocx, toPdf } from "./exportFiles";

// Export: the resume as shown (`present` in resumeDoc.ts) as a PDF or Word file, formatted for pasting into Google Docs
// or Word, or as plain text, Markdown, HTML or RTF to copy or download. Every format is made from the same structure,
// with the contact block at the top. Files need a name at the top first. With `resumeId`, its Google Doc in the
// CareerBot folder too (Drive.tsx).

const TEXTS = [
  { key: "md", label: "Markdown", mime: "text/markdown", make: toMarkdown },
  { key: "html", label: "HTML", mime: "text/html", make: toHtml },
  { key: "rtf", label: "RTF", mime: "application/rtf", make: toRtf },
] as const;

function save(blob: Blob, file: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  URL.revokeObjectURL(url);
}

// Save a resume as a PDF named `stem`; a failure says why in a toast.
export async function downloadPdf(doc: ResumeDoc, contact: Contact, stem: string) {
  try {
    save(new Blob([new Uint8Array(await toPdf(doc, contact))], { type: "application/pdf" }), `${stem}.pdf`);
  } catch (e) {
    toast({ message: e instanceof Error ? e.message : "Couldn’t make the PDF.", icon: "failed" });
  }
}

// The export entries, for the Export button and ⌘K. `name` is the file name's stem ("Supply Chain Product resume").
export function useExport({ doc, contact, name, resumeId }: { doc: ResumeDoc | null; contact: Contact | null; name: string; resumeId?: Id<"resumes"> }) {
  const drive = useDriveEntries(resumeId);
  const stem = `${contact?.name ? `${contact.name} - ` : ""}${name}`;
  const copied = (what: string) => toast({ message: `Copied ${what}`, icon: "copy" });
  const failed = (what: string) => toast({ message: what, icon: "failed" });
  const noName = contact?.name ? undefined : "Add your name at the top of the resume first.";
  if (!doc) return [];
  const docx = async () => save(await toDocx(doc, contact!), `${stem}.docx`);
  const formatted = () =>
    void navigator.clipboard
      .write([new ClipboardItem({ "text/html": new Blob([toHtml(doc, contact)], { type: "text/html" }), "text/plain": new Blob([toPlain(doc, contact)], { type: "text/plain" }) })])
      .then(() => copied("with headings and bullets"), () => failed("Couldn’t copy."));
  const text = (make: (d: ResumeDoc, c?: Contact | null) => string, what: string) => () =>
    void navigator.clipboard.writeText(make(doc, contact)).then(() => copied(what), () => failed("Couldn’t copy."));
  const entries: MenuEntry[] = [
    { label: "Download PDF", icon: "export", hint: "US Letter", detail: "Saves this resume as shown, as a PDF.", note: "Free", onSelect: () => void downloadPdf(doc, contact!, stem), ...(noName ? { disabled: true, reason: noName } : {}) },
    { label: "Download Word", icon: "export", hint: ".docx", detail: "Saves this resume as shown, as a Word file.", note: "Free", onSelect: () => void docx(), ...(noName ? { disabled: true, reason: noName } : {}) },
    "separator",
    { label: "Copy for Google Docs", icon: "copy", hint: "Or Word", detail: "Copies the resume with its headings and bullets, to paste into Google Docs or Word.", note: "Free", onSelect: formatted },
    { label: "Copy plain text", icon: "copy", detail: "Copies the resume as plain text.", note: "Free", onSelect: text(toPlain, "as plain text") },
    {
      label: "Markdown, HTML or RTF",
      icon: "copy",
      items: [
        ...TEXTS.map((t) => ({ label: `Copy ${t.label}`, detail: `Copies the resume as ${t.label}.`, note: "Free", onSelect: text(t.make, `as ${t.label}`) })),
        "separator" as const,
        ...TEXTS.map((t) => ({ label: `Download ${t.label}`, detail: `Saves the resume to a file, as ${t.label}.`, note: "Free", onSelect: () => save(new Blob([t.make(doc, contact)], { type: t.mime }), `${stem}.${t.key}`) })),
        { label: "Download plain text", detail: "Saves the resume to a file, as plain text.", note: "Free", onSelect: () => save(new Blob([toPlain(doc, contact)], { type: "text/plain" }), `${stem}.txt`) },
      ],
    },
    ...(drive.length ? ["separator" as const, ...drive] : []),
  ];
  return entries;
}

// The Export button and its menu. `primary`: the pane's one Amber action.
export function ExportMenu({ doc, contact, name, resumeId, primary = false, size = "md", className = "" }: { doc: ResumeDoc | null; contact: Contact | null; name: string; resumeId?: Id<"resumes">; primary?: boolean; size?: ButtonSize; className?: string }) {
  const items = useExport({ doc, contact, name, resumeId });
  return (
    <Menu
      label="Export"
      align="start"
      items={items}
      trigger={
        <Button variant={primary ? "primary" : "secondary"} size={size} icon="export" iconEnd="expand" disabled={!doc} className={className}>
          Export
        </Button>
      }
    />
  );
}
