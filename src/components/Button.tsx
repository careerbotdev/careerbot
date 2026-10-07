"use client";

import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Icons, type IconName } from "./icons";
import { Keys } from "./Kbd";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

// Primary is the one Amber action per pane. Secondary and ghost are the quiet ones (ghost has no fill until hovered).
// Destructive is red and only appears inside the choice that asks first. Outline is a trigger that opens a menu.
// Each look is split into its resting colours and its hover and press shades, which a disabled or loading button drops.
const variants = {
  primary: ["border-transparent bg-primary text-ink", "hover:bg-primary-hover active:bg-primary-active"],
  secondary: ["border-transparent bg-subtle text-text", "hover:bg-border active:bg-subtle-active"],
  ghost: ["border-transparent bg-transparent text-text", "hover:bg-subtle active:bg-border"],
  destructive: ["border-transparent bg-red text-paper", "hover:bg-red-hover active:bg-red-active"],
  outline: ["border-border bg-surface text-text", "hover:bg-subtle active:bg-border"],
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = "sm" | "md" | "lg";

// Small (28) sits in rows and toolbars, medium (32) is the default, large (44) is for touch. The ::after box stretches
// the hit area to 32px on desktop and 44px on phones without changing the look.
const sizes: Record<ButtonSize, { label: string; icon: string }> = {
  sm: { label: "h-7 px-2.5 text-label leading-label after:inset-x-0 after:-inset-y-2 md:after:-inset-y-0.5", icon: "size-7 after:-inset-2 md:after:-inset-0.5" },
  md: { label: "h-8 px-3 text-label leading-label after:inset-x-0 after:-inset-y-1.5 md:after:inset-y-0", icon: "size-8 after:-inset-1.5 md:after:inset-0" },
  lg: { label: "h-11 px-4 text-body-md leading-body-md after:inset-0", icon: "size-11 after:inset-0" },
};

const base =
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border font-medium whitespace-nowrap transition-colors duration-100 ease-out select-none after:absolute";

// "live" answers hover and press; "busy" (loading) holds still at full strength; "off" (disabled) holds still at half.
function look(variant: ButtonVariant, size: ButtonSize, iconOnly: boolean, state: "live" | "busy" | "off", className: string) {
  const [rest, hover] = variants[variant];
  return `${base} ${iconOnly ? sizes[size].icon : sizes[size].label} ${rest} ${state === "live" ? hover : state === "off" ? "opacity-50" : ""} ${className}`;
}

// A button's look, for a link that acts as one (it goes somewhere rather than doing something).
export const buttonLook = (variant: ButtonVariant = "secondary", className = "", size: ButtonSize = "md") => look(variant, size, false, "live", className);

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Leading icon; `iconEnd` trails the label (a menu's chevron, an "opens elsewhere" arrow).
  icon?: IconName;
  iconEnd?: IconName;
  // Square, icon only. Needs an aria-label, which its tooltip shows.
  iconOnly?: boolean;
  // The shortcut, shown at the right edge (and in the tooltip). The screen binds it.
  keys?: string;
  // Busy: a spinner and a present-tense label ("Approving"); clicks wait.
  loading?: boolean;
  loadingLabel?: string;
  // Why it's disabled right now. Setting it disables the button, which stays focusable so its tooltip can say why.
  reason?: string;
  // The explainer tooltip: what it does, then what it costs and whether it can be undone.
  detail?: ReactNode;
  note?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  iconOnly = false,
  keys,
  loading = false,
  loadingLabel,
  reason,
  detail,
  note,
  type = "button",
  disabled,
  className = "",
  children,
  onClick,
  ...props
}: ButtonProps) {
  const blocked = Boolean(disabled || reason);
  const Icon = icon && Icons[icon];
  const End = iconEnd && Icons[iconEnd];
  const spinner = <Spinner on={variant === "primary" ? "primary" : variant === "destructive" ? "destructive" : "surface"} />;
  const button = (
    <button
      type={type}
      // With a reason the button stays focusable and hoverable (aria-disabled), so the tooltip can explain.
      disabled={reason ? undefined : disabled}
      aria-disabled={reason || loading ? true : undefined}
      aria-busy={loading || undefined}
      aria-keyshortcuts={keys && !keys.includes(" then ") ? keys.replace("⌘+", "Meta+").replace("⌘", "Meta+") : undefined}
      className={look(variant, size, iconOnly, blocked ? "off" : loading ? "busy" : "live", className)}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (blocked || loading) return e.preventDefault();
        onClick?.(e);
      }}
      {...props}
    >
      {loading ? spinner : Icon && <Icon aria-hidden="true" />}
      {!iconOnly && (loading && loadingLabel ? loadingLabel : children)}
      {!iconOnly && End && <End aria-hidden="true" />}
      {!iconOnly && keys && (
        <span aria-hidden="true" className="ml-auto hidden md:inline-flex">
          <Keys keys={keys} on={variant === "primary" ? "primary" : variant === "destructive" ? "inverse" : "surface"} />
        </span>
      )}
    </button>
  );
  const name = props["aria-label"] ?? (typeof children === "string" ? children : undefined);
  const explained = detail !== undefined || note !== undefined || (blocked && reason);
  if (!name || !(iconOnly || explained)) return button;
  return (
    <Tooltip content={name} keys={keys} detail={blocked && reason ? reason : detail} note={blocked && reason ? undefined : note}>
      {button}
    </Tooltip>
  );
}
