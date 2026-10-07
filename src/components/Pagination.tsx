"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";

type PaginationProps = {
  /** How many are showing now. */
  shown: number;
  total: number;
  /** How many the next page adds (forty by default). */
  step?: number;
  loading?: boolean;
  onMore: () => void;
};

// The foot of a long list: how many are showing and a button for the next page, a spinner while it loads, and the total
// once everything is in.
export function Pagination({ shown, total, step = 40, loading, onMore }: PaginationProps) {
  if (loading)
    return (
      <div role="status" className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-border text-body-sm leading-body-sm text-muted">
        <Spinner className="text-text" />
        Loading more
      </div>
    );
  if (shown >= total)
    return <div className="flex h-10 shrink-0 items-center justify-center text-body-sm leading-body-sm text-muted tabular-nums">That’s all {total.toLocaleString("en-US")}</div>;
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-t border-border px-3">
      <span className="text-body-sm leading-body-sm text-muted tabular-nums">
        {shown.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      <Button variant="ghost" size="sm" onClick={onMore}>
        Show {Math.min(step, total - shown)} more
      </Button>
    </div>
  );
}

// Pagination that loads the next page by itself as the end of the list scrolls into view, keeping the button for
// keyboards.
export function LoadMore(props: PaginationProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { shown, total, loading, onMore } = props;
  const more = useRef(onMore);
  useEffect(() => {
    more.current = onMore;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || loading || shown >= total) return;
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) more.current();
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [shown, total, loading]);
  return (
    <div ref={ref}>
      <Pagination {...props} />
    </div>
  );
}
