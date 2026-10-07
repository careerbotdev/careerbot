import { clockNow } from "../clock";

const DAY_MS = 86400000;
const daysSince = (ms: number) => Math.round((new Date(new Date(clockNow()).toDateString()).getTime() - new Date(new Date(ms).toDateString()).getTime()) / DAY_MS);

// "today", "yesterday", "Sep 22" (with the year when it isn't this one).
export function day(ms: number) {
  const days = daysSince(ms);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date(clockNow()).getFullYear() ? { year: "numeric" } : {}) });
}

// "today", "yesterday", "3 days ago", "2 weeks ago", "1 month ago".
export function ago(ms: number) {
  const days = daysSince(ms);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}
