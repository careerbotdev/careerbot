// PDF and Word files for a structured resume, built in the browser from the same structure as every other format.
// Layout follows the Paper sketches "Resume export — page" and "Resume export — project in role", built for applicant
// tracking systems: one column of real, selectable text (no tables, images, text boxes, headers or footers); contact
// details in the body; standard section names (Summary, Experience, Projects, Skills); title, employer and dates on
// predictable lines; common fonts (Noto Sans in PDF, Arial in Word). US Letter, 0.75in margins. Callers pass the resume
// as shown (`present` in resumeDoc.ts), so files match the page. A career break is one line: "Career break" (and the
// reason when they chose to show it) with its dates. A project linked to a role is inside it, after its bullets:
// "Project: Name · link", then the project's bullets. A project's link is a real link in both. Word is built by
// docxFiles.ts, the same document Google Drive turns into a Google Doc.
import { Packer } from "docx";
import { PDFArray, type PDFFont, PDFDocument, PDFName, PDFString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { type Contact, contactLine, dateLabel, type Entry, projectLine, type ResumeDoc, shortUrl } from "../../../convex/resumeDoc";
import { resumeDocx } from "../../../convex/docxFiles";

export type { Contact };
const range = (e: { start?: string; end?: string }) => [dateLabel(e.start), e.end ? dateLabel(e.end) : e.start ? "Present" : ""].filter(Boolean).join(" – ");
const entryTitle = (e: Entry) => (e.break ? [e.title, e.reason].filter(Boolean).join(" · ") : e.title);

// ---- PDF ----

// Symbols with a plain equivalent are written plainly (ATS parsers and the embedded font both prefer it).
const plain = (t: string) => t.replace(/\u2192/g, "->").replace(/\u2190/g, "<-").replace(/[\u2022\u25cf]/g, "-");

const PT = 0.75; // the sketch is in px at 96dpi
const INK = rgb(0x15 / 255, 0x17 / 255, 0x1a / 255);
const MUTED = rgb(0.4, 0.41, 0.42);

export async function toPdf(doc: ResumeDoc, contact: Contact): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${contact.name} resume`);
  pdf.setAuthor(contact.name);
  // Noto Sans covers Latin, Greek and Cyrillic, embedded as a subset so names and employers print as written.
  pdf.registerFontkit(fontkit);
  const load = async (w: string) => new Uint8Array(await (await fetch(`/fonts/NotoSans-${w}.ttf`)).arrayBuffer());
  const regularBytes = await load("Regular");
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const face = fontkit.create(regularBytes);
  const bold = await pdf.embedFont(await load("Bold"), { subset: true });
  // Refuse rather than drop characters the font can't show: a resume must never lose part of a name or a claim.
  const all = [
    contact.name,
    contactLine(contact),
    doc.summary,
    ...doc.experience.flatMap((e) => [e.employer, e.title, e.location ?? "", e.reason ?? "", ...e.bullets.map((b) => b.text), ...(e.projects ?? []).flatMap((p) => [projectLine(p), ...p.bullets.map((b) => b.text)])]),
    ...(doc.projects ?? []).flatMap((p) => [p.name, shortUrl(p.url), ...p.bullets.map((b) => b.text)]),
    ...doc.skills.flatMap((g) => [g.group, ...g.items]),
  ].join("");
  const missing = [...new Set([...plain(all)].filter((ch) => ch.trim() && !face.hasGlyphForCodePoint(ch.codePointAt(0)!)))];
  if (missing.length) throw new Error(`The PDF font can't show ${missing.join(" ")}. Download Word instead, which uses your computer's fonts.`);
  const W = 612;
  const H = 792;
  const M = 54;
  const width = W - 2 * M;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const room = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, font: PDFFont, size: number, max: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of plain(text).split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  // Draws wrapped text. `keep` keeps the whole block on one page (titles, bullets); a marker is drawn with the first line.
  const text = (t: string, opts: { font?: PDFFont; size: number; lead: number; x?: number; max?: number; color?: typeof INK; gapAfter?: number; keep?: boolean; marker?: string }) => {
    const font = opts.font ?? regular;
    const lines = wrap(t, font, opts.size, opts.max ?? width);
    if (opts.keep) room(lines.length * opts.lead);
    lines.forEach((line, n) => {
      if (!opts.keep) room(opts.lead);
      y -= opts.lead;
      const base = y + (opts.lead - opts.size) / 2;
      if (n === 0 && opts.marker) page.drawText(opts.marker, { x: M, y: base, size: opts.size, font: regular, color: INK });
      page.drawText(line, { x: opts.x ?? M, y: base, size: opts.size, font, color: opts.color ?? INK });
    });
    y -= opts.gapAfter ?? 0;
  };
  // Makes a box on the current page open `url` (the project link just drawn there).
  const link = (url: string, x: number, bottom: number, w: number, h: number) => {
    const annot = pdf.context.register(
      pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, bottom, x + w, bottom + h], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(url) } }),
    );
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (annots instanceof PDFArray) annots.push(annot);
    else page.node.set(PDFName.of("Annots"), pdf.context.obj([annot]));
  };
  const heading = (t: string) => {
    room(22 * PT + 16 * PT + 14 * PT + 19 * PT * 2);
    y -= 22 * PT;
    text(t.toUpperCase(), { font: bold, size: 12 * PT, lead: 16 * PT });
    y -= 4 * PT;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.55, 0.56, 0.57) });
    y -= 10 * PT;
  };

  text(contact.name, { font: bold, size: 28 * PT, lead: 34 * PT, gapAfter: 6 * PT });
  const c = contactLine(contact);
  if (c) text(c, { size: 12 * PT, lead: 16 * PT, color: MUTED });

  if (doc.summary) {
    heading("Summary");
    text(doc.summary, { size: 13 * PT, lead: 19 * PT });
  }
  heading("Experience");
  let prev = "";
  doc.experience.forEach((e, i) => {
    if (i > 0) y -= 16 * PT;
    const dates = plain(range(e));
    const dw = regular.widthOfTextAtSize(dates, 13 * PT);
    const title = entryTitle(e);
    const titleLines = wrap(title, bold, 13 * PT, width - dw - 16 * PT).length;
    const employer = !e.break && e.employer !== prev;
    // Employer, title and the first bullet stay together.
    room((employer ? 22 * PT : 0) + titleLines * 19 * PT + 6 * PT + (e.bullets.length ? 19 * PT : 0));
    if (employer) text(e.employer, { font: bold, size: 14 * PT, lead: 20 * PT, gapAfter: 2 * PT });
    prev = e.break ? "" : e.employer;
    page.drawText(dates, { x: W - M - dw, y: y - 19 * PT + (19 * PT - 13 * PT) / 2, size: 13 * PT, font: regular, color: INK });
    text(title, { font: bold, size: 13 * PT, lead: 19 * PT, max: width - dw - 16 * PT, keep: true, gapAfter: 6 * PT });
    for (const b of e.bullets) text(b.text, { size: 13 * PT, lead: 19 * PT, x: M + 14 * PT, max: width - 14 * PT, gapAfter: 3 * PT, keep: true, marker: "•" });
    for (const p of e.projects ?? []) {
      // The project line and its first bullet stay together.
      y -= 6 * PT;
      const lines = wrap(projectLine(p), bold, 13 * PT, width);
      room(lines.length * 19 * PT + 3 * PT + (p.bullets.length ? 19 * PT : 0));
      const top = y;
      text(projectLine(p), { font: bold, size: 13 * PT, lead: 19 * PT, keep: true, gapAfter: 3 * PT });
      // The link is the last word of the line.
      if (p.url) {
        const uw = bold.widthOfTextAtSize(shortUrl(p.url), 13 * PT);
        link(p.url, M + bold.widthOfTextAtSize(lines.at(-1)!, 13 * PT) - uw, top - lines.length * 19 * PT, uw, 19 * PT);
      }
      for (const b of p.bullets) text(b.text, { size: 13 * PT, lead: 19 * PT, x: M + 14 * PT, max: width - 14 * PT, gapAfter: 3 * PT, keep: true, marker: "•" });
    }
  });
  // A project reads like a role: its name and dates on one line, its link below, then its bullets.
  if (doc.projects?.length) {
    heading("Projects");
    doc.projects.forEach((p, i) => {
      if (i > 0) y -= 16 * PT;
      const dates = plain(range(p));
      const dw = regular.widthOfTextAtSize(dates, 13 * PT);
      const nameLines = wrap(p.name, bold, 13 * PT, width - dw - 16 * PT).length;
      room(nameLines * 19 * PT + (p.url ? 17 * PT : 0) + 6 * PT + (p.bullets.length ? 19 * PT : 0));
      page.drawText(dates, { x: W - M - dw, y: y - 19 * PT + (19 * PT - 13 * PT) / 2, size: 13 * PT, font: regular, color: INK });
      text(p.name, { font: bold, size: 13 * PT, lead: 19 * PT, max: width - dw - 16 * PT, keep: true, gapAfter: p.url ? 0 : 6 * PT });
      if (p.url) {
        room(17 * PT);
        const top = y;
        text(shortUrl(p.url), { size: 12 * PT, lead: 17 * PT, color: MUTED, gapAfter: 6 * PT });
        link(p.url, M, top - 17 * PT, regular.widthOfTextAtSize(shortUrl(p.url), 12 * PT), 17 * PT);
      }
      for (const b of p.bullets) text(b.text, { size: 13 * PT, lead: 19 * PT, x: M + 14 * PT, max: width - 14 * PT, gapAfter: 3 * PT, keep: true, marker: "•" });
    });
  }
  if (doc.skills.length) {
    heading("Skills");
    for (const g of doc.skills) {
      const label = `${g.group}: `;
      const lw = bold.widthOfTextAtSize(label, 13 * PT);
      room(19 * PT);
      page.drawText(label, { x: M, y: y - 19 * PT + (19 * PT - 13 * PT) / 2, size: 13 * PT, font: bold, color: INK });
      const lines = wrap(g.items.join(", "), regular, 13 * PT, width - lw);
      lines.forEach((line, n) => {
        if (n > 0) room(19 * PT);
        y -= 19 * PT;
        page.drawText(line, { x: n === 0 ? M + lw : M, y: y + (19 * PT - 13 * PT) / 2, size: 13 * PT, font: regular, color: INK });
      });
      y -= 3 * PT;
    }
  }
  return pdf.save();
}

// ---- Word ----

export const toDocx = (doc: ResumeDoc, contact: Contact): Promise<Blob> => Packer.toBlob(resumeDocx(doc, contact));
