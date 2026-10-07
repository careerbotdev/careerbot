import type { ReactNode } from "react";
import { Icons, type IconName } from "@/components/icons";

// An empty pane says what it's for and offers the one next step: a 20px icon in a 40px square, a title, one line, and
// one action (a Button, or key hints when the step is a key). No illustrations. Fills its pane and centres itself.
export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = Icons[icon];
  return (
    <div className="flex size-full min-w-0 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-subtle text-muted">
        <Icon size={20} aria-hidden />
      </span>
      <div className="flex max-w-60 flex-col items-center gap-1">
        <p className="text-body-md leading-body-md font-semibold text-text">{title}</p>
        {children && <p className="text-body-sm leading-body-sm text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
