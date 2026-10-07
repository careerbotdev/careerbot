import type { ReactNode } from "react";

type On = "surface" | "primary" | "inverse";

// A key hint: a key or chord shown beside the action it runs ("A", "⌘K"). Mono 12/16 in a 20px cap.
// `on`: the fill it sits on. "primary" inside an Amber button, "inverse" in a tooltip, toast or red button, otherwise
// the page or a quiet button.
const looks: Record<On, string> = {
  surface: "border-border bg-surface text-muted",
  primary: "border-transparent bg-ink/10 text-ink",
  inverse: "border-transparent bg-inverse-text/14 text-inverse-text dark:bg-inverse-text/12",
};

export function Kbd({ children, on = "surface" }: { children: ReactNode; on?: On }) {
  return (
    <kbd className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border px-[5px] font-mono text-mono leading-mono font-medium ${looks[on]}`}>
      {children}
    </kbd>
  );
}

// A shortcut written as one string. "A" or "⌘K" is one cap; "⌘+K" is a chord in joined caps; "G then T" is a
// sequence, which says "then" between its steps.
export function Keys({ keys, on = "surface", className = "" }: { keys: string; on?: On; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {keys.split(" then ").map((step, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className={`text-label leading-label ${on === "surface" ? "text-muted" : on === "primary" ? "text-ink" : "text-inverse-muted"}`}>then</span>}
          <span className="inline-flex gap-0.5">
            {(step.length > 1 ? step.split("+") : [step]).map((key, j) => (
              <Kbd key={j} on={on}>
                {key}
              </Kbd>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

// A key and what it does, inside a field ("↵ Save", "Esc Skip"). The key is the way in from a keyboard, so the button
// stays out of the tab order; it's there for a pointer or a finger (44px to a finger).
export function KeyHint({ keys, onClick, children }: { keys: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className="relative flex items-center gap-1.5 rounded-sm text-label leading-label text-muted transition-colors duration-100 after:absolute after:-inset-3 hover:text-text md:after:inset-0"
    >
      <Kbd>{keys}</Kbd>
      {children}
    </button>
  );
}
