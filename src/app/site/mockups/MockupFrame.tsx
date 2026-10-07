import type { ReactNode } from "react";

// Where a mock-up's stories show it: at the width it has on the page (the Calm v3 — large board), narrower when the
// window is.
export function MockupFrame({ width, children }: { width: "hero" | "lead" | "compact" | "pain"; children: ReactNode }) {
  const max = { hero: "max-w-300", lead: "max-w-160", compact: "max-w-142", pain: "max-w-94" }[width];
  return <div className={`mx-auto w-full ${max}`}>{children}</div>;
}
