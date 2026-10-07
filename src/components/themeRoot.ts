"use client";

import { useCallback, useState } from "react";

// Where an overlay portals to. Overlays render at the end of the page, outside the element they open from; when that
// element sits inside a themed area (Storybook shows light and dark side by side, each pane with its own data-theme),
// the overlay has to land inside the same area to take its colours. An element marked `data-overlay-root` (a framed
// demo, a phone preview) also holds its overlays. Anything else portals to <body>.
export function themeRoot(el: Element | null): HTMLElement | undefined {
  const root = el?.closest<HTMLElement>("[data-overlay-root], [data-theme]");
  return root && root !== document.documentElement ? root : undefined;
}

// The same as a hook: put `ref` on the trigger (or any element rendered in place) and pass `container` to the Portal.
export function useThemeRoot() {
  const [container, setContainer] = useState<HTMLElement>();
  const ref = useCallback((el: Element | null) => {
    if (el) setContainer(themeRoot(el));
  }, []);
  return [ref, container] as const;
}
