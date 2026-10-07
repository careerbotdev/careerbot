import type { ReactNode } from "react";
import { buttonLook } from "./Button";
import { Icons } from "./icons";

// Opens a page elsewhere (a job posting, a careers site) in a new tab, marked with the arrow that means "opens
// elsewhere". With words, it's a ghost button with the arrow after them ("Loadstar Systems careers ↗"). Without, it's the
// bare arrow right after the text it belongs to (a role's title), read out as `label`.
export function ExternalLink({ href, label, children }: { href: string; label: string; children?: ReactNode }) {
  if (children)
    return (
      <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={buttonLook("ghost")}>
        {children}
        <Icons.openElsewhere aria-hidden="true" />
      </a>
    );
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-sm align-middle text-muted transition-colors duration-100 ease-out after:absolute after:-inset-3 hover:bg-subtle hover:text-text md:after:-inset-1.5"
    >
      <Icons.openElsewhere aria-hidden="true" />
    </a>
  );
}
