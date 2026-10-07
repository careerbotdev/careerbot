// Initials in a square. You on the text colour (ink in light mode, paper in dark); a company or person you found on
// `subtle` inside a border, in muted initials. One letter for a company, two for a person (first and last name).
const sizes = {
  40: "size-10 text-body-md leading-body-md font-semibold",
  32: "size-8 text-label leading-label font-semibold",
  28: "size-7 text-label leading-label font-semibold",
  24: "size-6 text-label leading-label font-medium",
  20: "size-5 text-label leading-label font-medium",
};

export function Avatar({ name, you = false, company = false, size = 32, className = "" }: { name: string; you?: boolean; company?: boolean; size?: keyof typeof sizes; className?: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (company || words.length < 2 ? words[0]?.[0] ?? "" : `${words[0][0]}${words[words.length - 1][0]}`).toUpperCase();
  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-sm ${sizes[size]} ${you ? "bg-text text-surface" : "border bg-subtle text-muted"} ${className}`}
    >
      {initials}
    </span>
  );
}
