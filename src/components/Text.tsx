import type { ComponentProps } from "react";

// The type scale (DESIGN.md, Typography). Weight and colour carry hierarchy before size does.
// Heading: `display` once per screen and never inside a pane (sign-in, getting started, an empty area); `lg` heads an
// item pane; `md` heads a pane, a section or a group.
const headings = {
  display: "text-display leading-display tracking-display font-semibold",
  lg: "text-title-lg leading-title-lg tracking-title-lg font-semibold",
  md: "text-title-md leading-title-md font-semibold",
};

export function Heading({
  size = "lg",
  as: Tag = size === "md" ? "h2" : "h1",
  className = "",
  ...props
}: ComponentProps<"h1"> & { size?: keyof typeof headings; as?: "h1" | "h2" | "h3" | "h4" }) {
  return <Tag className={`[:where(&)]:text-text ${headings[size]} ${className}`} {...props} />;
}

// Text: `md` for everything people read, `sm` for meta lines and secondary text, `row-title` for the first line of a
// list row, `label` for field labels and counts, `label-caps` only for group labels inside a list or menu, `mono` for
// keys, codes and IDs. `muted` supports; it's never for what you need to act on. `tabular` lines numbers up in
// columns. `measure` keeps reading text (a posting, a resume, a story) to 640px. The default colour carries no
// specificity, so a colour in `className` always wins over it.
const texts = {
  md: "text-body-md leading-body-md",
  sm: "text-body-sm leading-body-sm",
  "row-title": "text-row-title leading-row-title font-medium",
  label: "text-label leading-label font-medium",
  "label-caps": "text-label-caps leading-label-caps tracking-label-caps font-medium uppercase",
  mono: "font-mono text-mono leading-mono font-medium",
};

export function Text({
  size = "md",
  muted = false,
  tabular = false,
  measure = false,
  as: Tag = "p",
  className = "",
  ...props
}: ComponentProps<"p"> & { size?: keyof typeof texts; muted?: boolean; tabular?: boolean; measure?: boolean; as?: "p" | "span" | "div" }) {
  return (
    <Tag
      className={`${texts[size]} ${muted ? "[:where(&)]:text-muted" : "[:where(&)]:text-text"} ${tabular ? "tabular-nums" : ""} ${measure ? "max-w-[640px]" : ""} ${className}`}
      {...props}
    />
  );
}
