"use client";

import type { ComponentProps } from "react";
import { type IconName, Icons } from "@/components/icons";

// An icon from the icon map, by name, for the docs' server-rendered parts (a server component can't reach into the
// client-side map itself).
export function Icon({ name, ...props }: { name: IconName } & ComponentProps<(typeof Icons)[IconName]>) {
  const Glyph = Icons[name];
  return <Glyph {...props} />;
}
