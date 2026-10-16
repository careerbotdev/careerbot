// A skill's name in Title Case, the way resumes and postings write it ("Radio Advertising", "Go-to-Market Strategy").
// Applied to names the model writes for kind "skill" (gathering, a story's read roles); never to a name the person
// typed or edited, and never to tools or certifications, which keep their official names. Only the case changes, so
// skillKey (case-insensitive) reads a name the same before and after.

// Lowercase inside a name, capitalized only as its first word.
const SMALL: Record<string, true> = { and: true, of: true, for: true, to: true, in: true, on: true, the: true, a: true, an: true, with: true };

// One word with no hyphen or slash. A word that already has a capital (SEO, iOS, JavaScript, SaaS, HubSpot, Google) is
// kept as written. Lowercase ones read as letters become capitals ("3d" → "3D", "b2b" → "B2B", "p&l" → "P&L"); the
// rest take a capital first letter. One that doesn't start with a letter (".net", "&") is left alone.
function word(w: string): string {
  if (/[A-Z]/.test(w)) return w;
  if ((/^\d+[a-z]{1,2}$/.test(w) && !/^\d+(st|nd|rd|th)$/.test(w)) || /^[a-z]\d[a-z]$/.test(w) || /^[a-z]&[a-z]$/.test(w)) return w.toUpperCase();
  return /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w;
}

// A hyphenated word: each part capitalized, small words inside lowercase ("Go-to-Market", "Cross-Functional"). After a
// one-letter prefix the rest stays as written ("E-commerce", "X-ray").
function hyphened(w: string): string {
  const parts = w.split("-");
  return parts
    .map((p, i) => (i === 0 ? word(p) : parts[0].length === 1 ? p : Object.hasOwn(SMALL, p.toLowerCase()) && /^[A-Za-z][a-z]*$/.test(p) ? p.toLowerCase() : word(p)))
    .join("-");
}

export function titleCaseSkill(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      // A small word inside a name, lowercase or capitalized ("And" → "and"); all capitals and a lone capital letter
      // ("Series A") are kept.
      if (i > 0 && Object.hasOwn(SMALL, w.toLowerCase()) && (w === w.toLowerCase() || (w.length > 1 && w === w[0] + w.slice(1).toLowerCase()))) return w.toLowerCase();
      return w.split("/").map(hyphened).join("/");
    })
    .join(" ");
}
