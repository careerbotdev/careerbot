"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/Button";
import type { MenuEntry } from "@/components/Menu";
import { Property, PropertyLink } from "@/components/Properties";
import { Text } from "@/components/Text";
import { toast } from "@/components/Toast";
import { day, dayTime } from "./words";

// A resume's Google Doc in the CareerBot folder (convex/drive.ts), in its Export menu and its details: open it, when it
// last synced (or that it's kept as sent), Try again when it didn't sync, and the way to Settings when Drive isn't
// connected or needs connecting again.

type DriveFile = NonNullable<FunctionReturnType<typeof api.drive.fileFor>>;
const SETTINGS = "/settings?section=drive";
export const DRIVE_EXPLAINER = "Keeps a Google Doc of each resume in your CareerBot folder, updated when you keep a new version. CareerBot can only see the files it makes.";
const TRY_AGAIN = "Syncs your CareerBot folder now. Files deleted in Drive are made again.";

// Where the Doc stands: needs connecting again, didn't sync, in Drive, or on its way. `words` for its details, `short`
// for the Export menu's row.
function standing(f: DriveFile) {
  if (f.broken) return { state: "broken" as const, words: "Needs connecting again", short: undefined };
  if (f.error) return { state: "failed" as const, words: "Didn’t sync", short: "Didn’t sync" };
  if (f.url && (f.holdsThis || f.tailored)) {
    const [words, short] = !f.holdsThis ? ["The one this role uses", "This role’s"] : f.frozen ? ["Kept as sent", "As sent"] : f.syncedAt ? [`Synced ${dayTime(f.syncedAt)}`, `Synced ${day(f.syncedAt)}`] : ["In Drive", undefined];
    return { state: "in" as const, words, short, url: f.url };
  }
  return { state: "waiting" as const, words: f.url ? "Updating in Drive" : "Adding to Drive", short: f.url ? "Updating" : "Adding" };
}

function useTryAgain() {
  const syncNow = useMutation(api.drive.syncNow);
  return () =>
    void syncNow().then(
      () => toast({ message: "Syncing Google Drive", icon: "tryAgain" }),
      (e: unknown) => toast({ message: e instanceof ConvexError ? String(e.data) : "Couldn’t sync. Try again.", icon: "failed" }),
    );
}

// The Export menu's Drive entries for one resume. None while it loads.
export function useDriveEntries(resumeId: Id<"resumes"> | undefined): MenuEntry[] {
  const f = useQuery(api.drive.fileFor, resumeId ? { id: resumeId } : "skip");
  const router = useRouter();
  const tryAgain = useTryAgain();
  if (!resumeId || f === undefined) return [];
  const settings = () => router.push(SETTINGS);
  if (f === null) return [{ label: "Keep in Google Drive…", icon: "google", onSelect: settings, detail: `Opens Settings to connect Google Drive. ${DRIVE_EXPLAINER}`, note: "Free" }];
  const s = standing(f);
  if (s.state === "broken")
    return [{ label: "Connect Google Drive again", icon: "google", onSelect: settings, detail: "Google stopped accepting CareerBot, so this resume isn’t kept in Drive now. Opens Settings to connect it again.", note: "Free" }];
  if (s.state === "failed") return [{ label: "Try Google Drive again", icon: "tryAgain", hint: s.short, onSelect: tryAgain, detail: `${f.error} ${TRY_AGAIN}`, note: "Free" }];
  if (s.state === "waiting")
    return [{ label: "Open in Google Drive", icon: "google", disabled: true, reason: s.short, detail: "Opens its Google Doc in your CareerBot folder, once it’s there.", note: "Free" }];
  return [
    {
      label: "Open in Google Drive",
      icon: "google",
      hint: s.short,
      onSelect: () => window.open(s.url, "_blank", "noreferrer"),
      detail: f.frozen ? "Opens the Google Doc of this resume as it was sent. It no longer changes." : "Opens its Google Doc in your CareerBot folder. It’s updated in place when you keep a new version, so the link stays the same.",
      note: "Free",
    },
  ];
}

// The resume's Google Drive line in its details. Nothing when Drive isn't connected.
export function DriveProperty({ resumeId }: { resumeId: Id<"resumes"> }) {
  const f = useQuery(api.drive.fileFor, { id: resumeId });
  const tryAgain = useTryAgain();
  if (!f) return null;
  const s = standing(f);
  return (
    <Property label="Google Drive">
      {s.state === "in" ? (
        <>
          <PropertyLink href={s.url}>In Drive</PropertyLink>
          <span className="text-muted">{s.words}</span>
        </>
      ) : s.state === "broken" ? (
        <Link href={SETTINGS} className="w-fit underline decoration-border underline-offset-3 hover:decoration-text">
          {s.words}
        </Link>
      ) : s.state === "failed" ? (
        <span className="flex flex-col items-start gap-1">
          <Text size="sm">{f.error}</Text>
          <Button size="sm" variant="ghost" icon="tryAgain" detail={TRY_AGAIN} note="Free" onClick={tryAgain}>
            Try again
          </Button>
        </span>
      ) : (
        <span className="text-muted">{s.words}</span>
      )}
    </Property>
  );
}
