// Placeholders that hold a list's or pane's shape while it loads, in `subtle`. Size a bar with classes (`h-3 w-2/3`).
// No shimmer: motion confirms what happened, it never decorates.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`shrink-0 rounded-xs bg-subtle ${className}`} />;
}

// A loading list row at the height of the real one: a 28px badge, two lines and a trailing value.
export function SkeletonRow() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-7" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3 w-[70%]" />
        <Skeleton className="h-2.5 w-[45%]" />
      </div>
      <Skeleton className="h-[18px] w-14" />
    </div>
  );
}

// Where a document is being written: a steel block at the end of the last words.
export function WritingCaret() {
  return <span aria-hidden="true" className="ml-2 inline-block h-3.5 w-[7px] shrink-0 bg-steel align-[-2px]" />;
}
