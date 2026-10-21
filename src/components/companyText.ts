// Companies as people type or paste them (CompanyPicker, PasteList): a name or a website, and a pasted list of either.

// Looks like a website (acme.com, https://www.acme.com/about), not a name.
export const looksLikeWebsite = (s: string) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(s.trim());

// A website as its bare domain: https://www.Acme.com/about -> acme.com.
export const domainOf = (site: string) =>
  site
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

// The most companies one pasted list takes (companyLookup.PASTE_MAX on the server).
export const PASTE_MAX = 100;
// A company's legal ending, which a comma before it doesn't split off ("Acme, Inc.").
const SUFFIX = /^(inc|llc|ltd|limited|co|corp|corporation|gmbh|plc|ag|sa|s\.a|bv|pty|lp|llp)\.?$/i;

// A pasted list as the lines to look up: names or websites, one per line or separated by commas. Blank lines, bullets
// and numbering go; a legal ending after a comma stays with its name; the same company twice (by website, else by its
// name) is kept once, in its first place. At most PASTE_MAX lines; `over` is how many more there were.
export function parseList(text: string): { lines: string[]; over: number } {
  const parts: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    for (const piece of raw.split(",")) {
      const part = piece.trim().replace(/^([-*•·]|\d+[.)])\s+/, "").trim();
      if (!part) continue;
      if (SUFFIX.test(part) && parts.length && !looksLikeWebsite(parts[parts.length - 1])) parts[parts.length - 1] += `, ${part}`;
      else parts.push(part);
    }
  }
  const seen = new Set<string>();
  const lines = parts.filter((p) => {
    const key = looksLikeWebsite(p) ? domainOf(p) : p.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { lines: lines.slice(0, PASTE_MAX), over: Math.max(0, lines.length - PASTE_MAX) };
}

// Several lines at once: what pasted into the search box opens Paste a list.
export const isList = (text: string) => /\n/.test(text.trim()) && parseList(text).lines.length > 1;

// Copy list: the websites, one per line.
export const listText = (domains: string[]) => domains.join("\n");
