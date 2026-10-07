import { Icons } from "@/components/icons";

// A small outlined tag above a page's heading, saying what the page is about before the heading does: the website's
// Open source (a steel dot), the sign-in page's Invite only (a lock) and the demo's No sign-up (an eye).
export function Tag({ icon, children }: { icon?: "inviteOnly" | "noSignUp"; children: string }) {
  const Icon = icon && Icons[icon];
  return (
    <p className={`flex h-7.5 items-center rounded-site-pill border border-border bg-surface pr-3 pl-2.5 text-site-tag leading-site-tag font-medium ${Icon ? "gap-1.75" : "gap-2"}`}>
      {Icon ? (
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <span aria-hidden="true" className="size-2 shrink-0 rounded-site-pill bg-steel ring-3 ring-steel-subtle" />
      )}
      {children}
    </p>
  );
}
