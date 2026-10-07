// A spinner, for work under a few seconds (longer work shows a Progress bar). 16px inside controls, 20px on its own.
// The arc takes the text colour around it; `on` picks the track for the fill it sits on. Turns linearly; with reduced
// motion it pulses instead of turning. `label` names the work for screen readers; leave it out when the words beside
// it already say so (a loading button's "Approving").
const tracks = {
  surface: "stroke-border",
  primary: "stroke-ink/22",
  destructive: "stroke-paper/35",
};

export function Spinner({ size = 16, on = "surface", label, className = "" }: { size?: 16 | 20; on?: keyof typeof tracks; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`shrink-0 animate-spin motion-reduce:animate-pulse ${className}`}
    >
      <circle cx="8" cy="8" r="6.25" strokeWidth="1.5" className={tracks[on]} />
      <path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
