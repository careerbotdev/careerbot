// Word documents for a resume, a cover letter and a pursuit's answers: what Download Word saves and what Google Drive
// turns into a Google Doc, so both read like the PDF (exportFiles.ts). Layout follows the Paper sketch "Resume export —
// page", built for applicant tracking systems: one column of real text (no tables, images, text boxes, headers or
// footers); contact details in the body; standard section names; title and dates on one line (dates on a right tab
// stop); real list bullets; Arial. US Letter, 0.75in margins. Sizes are the sketch's px at 96dpi.
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, Tab, TabStopType, TextRun } from "docx";
import type { DocContent } from "./drivePaths";
import { type Contact, contactLine, dateLabel, type Entry, shortUrl, type ResumeDoc } from "./resumeDoc";

// A Doc's content as the Word document Drive turns into a Google Doc (the same one Download Word saves, and the one an
// export carries).
export const docxOf = (c: DocContent) => Packer.toArrayBuffer(c.kind === "resume" ? resumeDocx(c.doc, c.contact) : c.kind === "letter" ? letterDocx(c.text, c.contact) : answersDocx(c.items));

const PT = 0.75;
const FONT = "Arial";
const INK = "15171A";
const MUTED = "5E6164";
const hp = (px: number) => Math.round(px * PT * 2); // half-points
const tw = (px: number) => Math.round(px * PT * 20); // twentieths of a point
const RIGHT = 12240 - 2 * 1080; // content width at 0.75in margins, in twips

const range = (e: { start?: string; end?: string }) => [dateLabel(e.start), e.end ? dateLabel(e.end) : e.start ? "Present" : ""].filter(Boolean).join(" – ");
const entryTitle = (e: Entry) => (e.break ? [e.title, e.reason].filter(Boolean).join(" · ") : e.title);
// Bullets hang 14px in, as in the PDF (Word's default list sits half an inch in).
const bullet = (t: string) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: tw(3) }, children: [run(t, { size: 13 })] });
const BULLETS = { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: tw(14), hanging: tw(14) } } } }] };
const run = (t: string, o: { bold?: boolean; size: number; color?: string }) => new TextRun({ text: t, font: FONT, bold: o.bold, size: hp(o.size), color: o.color ?? INK });
const heading = (t: string) =>
  new Paragraph({
    spacing: { before: tw(22), after: tw(10) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "8C8E90", space: 4 } },
    children: [run(t.toUpperCase(), { bold: true, size: 12 })],
  });
// A bold line with dates at the right margin.
const titled = (title: string, dates: string, spacing: { before?: number; after?: number }) =>
  new Paragraph({
    spacing,
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
    children: [run(title, { bold: true, size: 13 }), new TextRun({ children: [new Tab(), dates], font: FONT, size: hp(13), color: INK })],
  });
// Their name, then the contact line, muted.
const top = (contact: Contact | null) =>
  contact
    ? [
        new Paragraph({ spacing: { after: tw(6) }, children: [run(contact.name, { bold: true, size: 28 })] }),
        ...(contactLine(contact) ? [new Paragraph({ children: [run(contactLine(contact), { size: 12, color: MUTED })] })] : []),
      ]
    : [];
const file = (title: string, contact: Contact | null, children: Paragraph[]) =>
  new Document({
    ...(contact ? { creator: contact.name } : {}),
    title,
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children }],
    numbering: { config: [BULLETS] },
    styles: { default: { document: { run: { font: FONT, size: hp(13), color: INK } } } },
  });
// Text split into paragraphs at blank lines; a single line break stays inside its paragraph.
const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new Paragraph({ spacing: { after: tw(10) }, children: p.split("\n").map((line, i) => new TextRun({ text: line, font: FONT, size: hp(13), color: INK, break: i > 0 ? 1 : 0 })) }));

export function resumeDocx(doc: ResumeDoc, contact: Contact | null) {
  const body: Paragraph[] = [...top(contact)];
  if (doc.summary) body.push(heading("Summary"), new Paragraph({ children: [run(doc.summary, { size: 13 })] }));
  body.push(heading("Experience"));
  let prev = "";
  doc.experience.forEach((e, i) => {
    const employer = !e.break && e.employer !== prev;
    if (employer) body.push(new Paragraph({ spacing: { before: i > 0 ? tw(16) : 0, after: tw(2) }, children: [run(e.employer, { bold: true, size: 14 })] }));
    prev = e.break ? "" : e.employer;
    body.push(
      titled(entryTitle(e), range(e), { before: employer || i === 0 ? 0 : e.break ? tw(16) : tw(10), after: tw(6) }),
      ...e.bullets.map((b) => bullet(b.text)),
      ...(e.projects ?? []).flatMap((p) => [
        new Paragraph({
          spacing: { before: tw(6), after: tw(3) },
          children: [
            run(`Project: ${p.name}${p.url ? " · " : ""}`, { bold: true, size: 13 }),
            ...(p.url ? [new ExternalHyperlink({ link: p.url, children: [run(shortUrl(p.url), { bold: true, size: 13 })] })] : []),
          ],
        }),
        ...p.bullets.map((b) => bullet(b.text)),
      ]),
    );
  });
  if (doc.projects?.length) {
    body.push(heading("Projects"));
    doc.projects.forEach((p, i) =>
      body.push(
        titled(p.name, range(p), { before: i > 0 ? tw(16) : 0, after: p.url ? 0 : tw(6) }),
        ...(p.url ? [new Paragraph({ spacing: { after: tw(6) }, children: [new ExternalHyperlink({ link: p.url, children: [run(shortUrl(p.url), { size: 12, color: MUTED })] })] })] : []),
        ...p.bullets.map((b) => bullet(b.text)),
      ),
    );
  }
  if (doc.skills.length) {
    body.push(heading("Skills"));
    for (const g of doc.skills) body.push(new Paragraph({ spacing: { after: tw(3) }, children: [run(`${g.group}: `, { bold: true, size: 13 }), run(g.items.join(", "), { size: 13 })] }));
  }
  return file(contact ? `${contact.name} resume` : "Resume", contact, body);
}

export function letterDocx(text: string, contact: Contact | null) {
  const body = [...top(contact)];
  if (contact) body.push(new Paragraph({ spacing: { after: tw(16) }, children: [] }));
  return file(contact ? `${contact.name} cover letter` : "Cover letter", contact, [...body, ...paragraphs(text)]);
}

export function answersDocx(items: { question: string; answer: string }[]) {
  return file(
    "Answers",
    null,
    items.flatMap((a, i) => [new Paragraph({ spacing: { before: i > 0 ? tw(16) : 0, after: tw(6) }, keepNext: true, children: [run(a.question, { bold: true, size: 14 })] }), ...paragraphs(a.answer)]),
  );
}
