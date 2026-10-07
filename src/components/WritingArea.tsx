"use client";

import { type ComponentProps, useImperativeHandle, useLayoutEffect, useRef } from "react";

// Long-form writing on the page itself (a story, a note): no box, the words in the reading type, growing with what's
// written so the pane scrolls rather than the field. `title` is the heading above it, in the item title's type; it
// grows onto a second line when it's long. Focus shows as the caret; the pane around it says what it is.
const looks = {
  body: "text-body-md leading-body-md text-text",
  title: "text-title-lg leading-title-lg font-semibold tracking-title-lg text-text",
};

export function WritingArea({ variant = "body", rows, className = "", ...props }: ComponentProps<"textarea"> & { variant?: keyof typeof looks }) {
  const own = useRef<HTMLTextAreaElement>(null);
  const { ref, ...rest } = props;
  useImperativeHandle(ref, () => own.current as HTMLTextAreaElement);
  const fit = () => {
    const el = own.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit);
  return (
    <textarea
      ref={own}
      rows={rows ?? 1}
      {...rest}
      onInput={(e) => {
        props.onInput?.(e);
        fit();
      }}
      className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-muted ${looks[variant]} ${className}`}
    />
  );
}
