// The Pursuits screen's address: the tab (status), the role open (role, a posting id; with direction, the direction it's
// shown for) or the pursuit with no open role open (pursuit), and a company whose roles the list starts filtered to
// (company). A change sets or clears (null) a key and keeps the rest.
type Params = { get(key: string): string | null; toString(): string };
type Change = { status?: string | null; role?: string | null; pursuit?: string | null; direction?: string | null; company?: string | null };

export function pursuitsHref(params: Params, change: Change) {
  const next = new URLSearchParams(params.toString());
  next.delete("view");
  for (const [k, v] of Object.entries(change)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  const q = next.toString();
  return q ? `/pursuits?${q}` : "/pursuits";
}
