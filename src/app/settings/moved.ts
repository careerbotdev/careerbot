// Settings sections that moved (cb-e5a.79) and where their old addresses go now. Keys and Google Drive are in
// Connections (Drive's ?drive= return from Google comes along, so connecting still finishes there); Contact and GitHub's
// contact details are in Account; Companies' search settings are Companies' Search settings; Reminders are in Pursuits ⋯.
const MOVED: Record<string, { to: string; keep: boolean }> = {
  keys: { to: "/settings?section=connections", keep: true },
  drive: { to: "/settings?section=connections", keep: true },
  contact: { to: "/settings?section=account", keep: true },
  companies: { to: "/companies?settings=search", keep: false },
  reminders: { to: "/pursuits", keep: false },
};

// The new address for an old section's, or null when the section hasn't moved.
export function movedTo(params: URLSearchParams): string | null {
  const moved = MOVED[params.get("section") ?? ""];
  if (!moved) return null;
  if (!moved.keep) return moved.to;
  const rest = new URLSearchParams(params);
  rest.delete("section");
  return rest.size ? `${moved.to}&${rest}` : moved.to;
}
