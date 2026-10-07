"use client";

import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Icons, type IconName } from "./icons";
import { Kbd } from "./Kbd";

// Text fields (DESIGN.md, Components; the Text fields board in Paper). 32px tall (44 on phones), 10px sides, body-md.
// The border darkens under the pointer, turns steel with a 1px steel ring on focus, and stays red while the field is wrong.
const plainLook = (invalid: boolean, disabled: boolean | undefined) =>
  [
    "rounded-sm border bg-surface text-body-md leading-body-md text-text outline-none transition-colors duration-100 placeholder:text-muted",
    invalid ? "border-red focus:ring-1 focus:ring-red" : "border-border focus:border-steel focus:ring-1 focus:ring-steel [&:not(:focus)]:hover:border-muted/60",
    disabled ? "cursor-not-allowed bg-subtle text-muted opacity-70" : "",
  ].join(" ");

// The same look on a box that holds the input and its extras (icon, prefix, suffix, key hint, clear).
const boxLook = (invalid: boolean, disabled: boolean | undefined) =>
  [
    "rounded-sm border bg-surface text-body-md leading-body-md text-text transition-colors duration-100",
    invalid
      ? "border-red focus-within:ring-1 focus-within:ring-red"
      : "border-border focus-within:border-steel focus-within:ring-1 focus-within:ring-steel [&:not(:focus-within)]:hover:border-muted/60",
    disabled ? "cursor-not-allowed bg-subtle text-muted opacity-70" : "",
  ].join(" ");

// A click anywhere in the box (the icon, the padding) lands in the input.
function focusInput(e: MouseEvent<HTMLDivElement>) {
  if ((e.target as Element).closest("input, button")) return;
  e.preventDefault();
  e.currentTarget.querySelector("input")?.focus();
}

export type InputProps = Omit<ComponentProps<"input">, "prefix"> & {
  // A muted icon at the start: `search` for a search field, `filter` for a filter.
  icon?: IconName;
  // A control in the icon's place, such as the calendar button of a date field (16px wide in the layout).
  start?: ReactNode;
  // Words or a symbol before and after the typed text ("$", "credits", "3 matches").
  prefix?: ReactNode;
  suffix?: ReactNode;
  // A key hint at the right edge ("⌘K", "/"). Shown, not bound: the screen binds it.
  keys?: string;
  // Shows a clear button while there's text, and Esc clears too.
  onClear?: () => void;
};

// A one-line text field. With no extras it's a bare <input>; `className` goes on the outer element either way.
export function Input({ className = "", icon, start, prefix, suffix, keys, onClear, ...props }: InputProps) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  const Icon = icon && Icons[icon];
  if (!Icon && start == null && prefix == null && suffix == null && !keys && !onClear) {
    return <input className={`h-11 w-full px-2.5 md:h-8 ${plainLook(invalid, props.disabled)} ${className}`} {...props} />;
  }
  const filled = String(props.value ?? "") !== "";
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    props.onKeyDown?.(e);
    if (e.key === "Escape" && onClear && filled && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      onClear();
    }
  };
  return (
    <div onMouseDown={focusInput} className={`flex h-11 w-full items-center gap-2 px-2.5 md:h-8 ${boxLook(invalid, props.disabled)} ${className}`}>
      {(Icon || start != null) && (
        <span className="flex shrink-0 pr-1.5 text-muted">{Icon ? <Icon aria-hidden /> : start}</span>
      )}
      {prefix != null && <span className="shrink-0 text-muted">{prefix}</span>}
      <input
        {...props}
        onKeyDown={onKeyDown}
        className="h-full min-w-0 flex-1 bg-transparent text-inherit outline-none placeholder:text-muted disabled:cursor-not-allowed"
      />
      {(suffix != null || (onClear && filled) || keys) && (
        <span className="flex shrink-0 items-center gap-2 pl-1.5">
          {suffix != null && <span className="text-body-sm leading-body-sm text-muted tabular-nums">{suffix}</span>}
          {onClear && filled && (
            <button
              type="button"
              aria-label="Clear"
              onClick={onClear}
              className="-my-1 -mr-2 flex size-8 items-center justify-center rounded-sm text-muted transition-colors duration-100 hover:text-text max-md:-mr-1.5 max-md:size-11"
            >
              <Icons.close aria-hidden />
            </button>
          )}
          {keys && !(onClear && filled) && <Kbd>{keys}</Kbd>}
        </span>
      )}
    </div>
  );
}

export type TextareaProps = ComponentProps<"textarea"> & {
  // Grows with its text from `rows` up; off for a fixed box.
  grow?: boolean;
  // A quiet line inside the box, under the text: saving state at the left ("Saved"), a count at the right. `start`
  // puts a control before the saving state (Talk).
  status?: ReactNode;
  count?: ReactNode;
  start?: ReactNode;
  // Inside the box, under the text: words still arriving (while talking). `footer` takes the quiet line's place.
  live?: ReactNode;
  footer?: ReactNode;
};

// Several lines of text. Grows as you write, and can carry its saving state and a count inside the box.
export function Textarea({ className = "", rows = 6, grow = true, status, count, start, live, footer, ...props }: TextareaProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const { ref, ...rest } = props;
  useImperativeHandle(ref, () => own.current as HTMLTextAreaElement);
  const fit = () => {
    const el = own.current;
    if (!el) return;
    if (!grow) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };
  useLayoutEffect(fit);
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  const onInput: TextareaProps["onInput"] = (e) => {
    props.onInput?.(e);
    fit();
  };
  const area = "block w-full resize-none py-2 px-2.5 text-body-md leading-body-md";
  if (status == null && count == null && start == null && footer == null) {
    return <textarea ref={own} rows={rows} className={`${area} ${plainLook(invalid, props.disabled)} ${className}`} {...rest} onInput={onInput} />;
  }
  return (
    <div className={`flex flex-col gap-2 py-2 px-2.5 ${boxLook(invalid, props.disabled)} ${className}`}>
      <textarea
        ref={own}
        rows={rows}
        {...rest}
        onInput={onInput}
        className="block w-full resize-none bg-transparent text-inherit outline-none placeholder:text-muted disabled:cursor-not-allowed"
      />
      {live}
      {footer ?? (
        <div className="flex items-center justify-between gap-3 text-label leading-label text-muted">
          <span className="flex items-center gap-3">
            {start}
            <span aria-live="polite">{status}</span>
          </span>
          <span className="tabular-nums">{count}</span>
        </div>
      )}
    </div>
  );
}

// "412 words", for a Textarea's count.
export const words = (text: string) => {
  const n = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `${n.toLocaleString("en-US")} ${n === 1 ? "word" : "words"}`;
};

// What went wrong, in our words, when the browser's own check fails (instead of its bubble).
function nativeProblem(el: HTMLInputElement | HTMLTextAreaElement) {
  const v = el.validity;
  if (v.valueMissing) return "Fill this in first.";
  if (v.typeMismatch && el.type === "email") return "Enter an email address, like name@example.com.";
  if (v.typeMismatch && el.type === "url") return "Enter a web address, like example.com.";
  if (v.tooShort) return `Use at least ${el.getAttribute("minlength")} characters.`;
  return el.validationMessage;
}

// An error under a control: red words in light mode; in dark mode the words keep the text colour and a red icon carries it.
export function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-body-sm leading-body-sm text-red dark:text-text">
      <Icons.failed aria-hidden className="mt-px shrink-0 text-red" />
      <span>{children}</span>
    </p>
  );
}

// A labelled control with a hint or an error below it. The error takes the hint's place, so nothing moves. hideLabel:
// the label is only read out, for a field whose row already names it (a settings row).
export function Field({
  label,
  hint,
  error,
  hideLabel = false,
  className = "",
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  hideLabel?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const box = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState<string>();
  // The browser's check (required, type="email") shows our error line, not its bubble.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onInvalid = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target.id !== id) return;
      e.preventDefault();
      setNative(nativeProblem(target));
      if (!document.activeElement?.matches(":invalid")) target.focus();
    };
    el.addEventListener("invalid", onInvalid, true);
    return () => el.removeEventListener("invalid", onInvalid, true);
  }, [id]);
  const problem = error ?? native;
  const note = problem ?? hint;
  return (
    <div ref={box} className={`flex flex-col gap-1.5 ${className}`} onInput={native ? () => setNative(undefined) : undefined}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "self-start text-label leading-label font-medium text-text"}>
        {label}
      </label>
      {children({ id, "aria-describedby": note ? noteId : undefined, "aria-invalid": problem ? true : undefined })}
      {problem ? (
        <ErrorLine id={noteId}>{problem}</ErrorLine>
      ) : (
        hint && (
          <p id={noteId} className="text-body-sm leading-body-sm text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
