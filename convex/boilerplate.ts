// Text a company repeats across its postings (who they are, benefits, equal-opportunity wording) says nothing about the
// job, and made judging slow. It's found by counting, per company: a line that appears (ignoring case, spacing and
// punctuation) in postings under at least 3 different titles, or under over 30% of the company's titles, is left out.
// Titles are counted rather than postings so one role listed in several places keeps its own text. Everything else
// stays, in order. The raw text is always kept as well; this only decides what the AI reads.

const MIN_TITLES = 3;
const SHARE = 0.3;
// So little left means the posting is a near copy of others at the company; then it's read whole.
const MIN_LEFT = 300;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// A 53-bit hash of a line (cyrb53), so a company with thousands of long postings is counted in little memory.
function hash(s: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Counts which lines a company repeats, a page of its postings at a time (a large company's descriptions don't fit in
// one read), then takes them out of each posting. Every posting is counted before any is cleaned.
export class Boilerplate {
  private titles = new Set<number>();
  // Per line: the titles it was seen under, kept only up to the count that decides it.
  private titlesWith = new Map<number, number[]>();

  count(postings: { title: string; text: string }[]) {
    for (const p of postings) {
      const title = hash(norm(p.title));
      this.titles.add(title);
      for (const line of new Set(p.text.split("\n").map(norm).filter(Boolean).map(hash))) {
        const seen = this.titlesWith.get(line);
        if (!seen) this.titlesWith.set(line, [title]);
        else if (seen.length < MIN_TITLES && !seen.includes(title)) seen.push(title);
      }
    }
  }

  private repeated(line: string) {
    const n = this.titlesWith.get(hash(norm(line)))?.length ?? 0;
    return n >= 2 && (n >= MIN_TITLES || n / this.titles.size > SHARE);
  }

  // One posting's text without the company's repeated lines.
  clean(text: string) {
    const lines = text.split("\n");
    const drop = lines.map((l) => !!norm(l) && this.repeated(l));
    const kept = lines.filter((l, i) => {
      if (!drop[i]) return true;
      // A shared heading ("What you'll do") stays when the line under it stays.
      const heading = l.trim().length <= 60 && !/^[-•*]/.test(l.trim()) && !/[.!?;]$/.test(l.trim());
      const next = lines.findIndex((x, j) => j > i && !!norm(x));
      return heading && next >= 0 && !drop[next];
    });
    const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return out.length >= MIN_LEFT ? out : text;
  }
}

// Every one of a company's postings, in; each posting's text without the company's repeated lines, out (same order).
export function withoutBoilerplate(postings: { title: string; text: string }[]): string[] {
  const b = new Boilerplate();
  b.count(postings);
  return postings.map((p) => b.clean(p.text));
}
