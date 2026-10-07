"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { buttonLook } from "@/components/Button";
import { Icons } from "@/components/icons";
import type { ScreenSize } from "@/components/Panes";
import { Text } from "@/components/Text";
import { Rows, SettingRow, SettingsPane } from "./ui";

// Where the contact line and GitHub are kept, with what they hold now: the contact line at the top of the base resume,
// GitHub in Record, Projects. The way there sits beside the name in a wide pane, under what they hold in a narrow one.
export function Contact({ size }: { size: ScreenSize }) {
  const profile = useQuery(api.profile.get);
  const github = useQuery(api.github.status);
  const go = (href: string, label: string, className: string) => (
    <Link href={href} className={buttonLook("secondary", className, size === "small" ? "lg" : "sm")}>
      <Icons.openElsewhere aria-hidden="true" />
      {label}
    </Link>
  );
  const line = profile ? [profile.name, profile.location, profile.email, profile.phone, ...profile.links].filter(Boolean).join(" · ") : null;
  const connected = github?.connected;
  return (
    <SettingsPane title="Contact and GitHub" size={size}>
      <Rows>
        <SettingRow title="Contact details" line="At the top of your base resume. Every resume and letter uses them." control={go("/resumes?resume=base", "Edit in base resume", "hidden @lg:inline-flex")}>
          {profile !== undefined && (
            <Text size="sm" className="break-words">
              {line ?? "Not added yet."}
            </Text>
          )}
          {go("/resumes?resume=base", "Edit in base resume", "self-start @lg:hidden")}
        </SettingRow>
        <SettingRow title="GitHub" line="Connected in Projects, where you choose which repositories CareerBot reads." control={go("/record/projects?github=1", "Open Projects", "hidden @lg:inline-flex")}>
          {github !== undefined && (
            <Text size="sm">{connected ? `Connected as ${connected.account} · ${connected.selection === "all" ? "all repositories" : "repositories you chose"}` : "Not connected."}</Text>
          )}
          {go("/record/projects?github=1", "Open Projects", "self-start @lg:hidden")}
        </SettingRow>
      </Rows>
    </SettingsPane>
  );
}
