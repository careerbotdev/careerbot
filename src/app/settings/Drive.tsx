"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/Button";
import { Menu, type MenuEntry } from "@/components/Menu";
import type { ScreenSize } from "@/components/Panes";
import { Text } from "@/components/Text";
import { toast, type Toast } from "@/components/Toast";
import { DRIVE_EXPLAINER } from "../resumes/Drive";
import { useConfirm } from "../shell/ShellContext";
import { pickFolder } from "./drivePicker";
import { DRIVE_TOUR } from "../tours/drive";
import { useConnectionReturn } from "../shell/useConnectionReturn";
import { useTour } from "../shell/useTour";
import { monthDay, saved, SettingRow } from "./ui";

// Google Drive, one row of Settings, Connections: connect (Google's own consent screen, for the files CareerBot makes
// and nothing else); once connected, the account, where the CareerBot folder is and how syncing went, with Sync now
// (Try again after a failure) and ⋯ Open folder, Choose a folder (Google's Picker, once its key is set up) and
// Disconnect (asks first; the files stay in Drive).
// Coming back from Google (?drive=connected|failed|denied) finishes connecting and says how it went, once (here, or on
// Getting started's step).

export const DRIVE_RETURNED: Record<string, Toast> = {
  connected: { message: "Google Drive is connected. Your resumes are on their way to your CareerBot folder.", icon: "done" },
  failed: { message: "Google Drive didn’t connect. Try again.", icon: "failed" },
  denied: { message: "Google Drive isn’t connected: CareerBot needs access to the files it makes.", icon: "failed" },
};
const fail = (e: unknown, fallback: string) => toast({ message: e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : fallback, icon: "failed" });
const time = (at: number) => `${monthDay(at)}, ${new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

export function Drive({ size }: { size: ScreenSize }) {
  const status = useQuery(api.drive.status);
  const connect = useMutation(api.drive.connect);
  const disconnect = useAction(api.drive.disconnect);
  const syncNow = useMutation(api.drive.syncNow);
  const setFolder = useMutation(api.drive.setFolder);
  const unsetFolder = useMutation(api.drive.unsetFolder);
  const ask = useConfirm();
  const [choosing, setChoosing] = useState(false);
  const router = useRouter();
  const small = size === "small";
  const btn = small ? "lg" : "sm";
  useTour(DRIVE_TOUR, status !== undefined);

  useConnectionReturn("drive", DRIVE_RETURNED, () => router.replace("/settings?section=connections", { scroll: false }));

  const start = () => void connect({}).then((url) => window.location.assign(url), (e: unknown) => fail(e, "Couldn’t start connecting. Try again."));
  const connectButton = (again: boolean) => (
    <Button
      variant="primary"
      size={small ? "lg" : "md"}
      icon="google"
      reason={status?.ready ? undefined : "Not available yet"}
      detail="Opens Google to let CareerBot keep Google Docs of your resumes in your Drive. CareerBot can only see the files it makes and the folder you choose."
      note="Free"
      onClick={start}
    >
      {again ? "Connect again" : "Connect Google Drive"}
    </Button>
  );

  if (status === undefined) return <div className="h-24 border-t" />;
  const c = status.connected;
  if (!c)
    return (
      <div data-tour="drive.connect" className="flex flex-col">
        <SettingRow title="Google Drive" line={DRIVE_EXPLAINER} control={connectButton(false)} />
      </div>
    );

  const letGo = async () => {
    if (!(await ask({ title: "Disconnect Google Drive?", body: "Syncing stops and CareerBot’s access to your Drive ends. Your CareerBot folder and its Docs stay in your Drive.", confirmLabel: "Disconnect" }))) return;
    await disconnect().then(() => toast({ message: "Google Drive is disconnected. Your files stay in Drive.", icon: "link" }), (e: unknown) => fail(e, "Google Drive didn’t let go. Try again."));
  };
  const sync = () => void syncNow().then(() => toast({ message: "Syncing Google Drive", icon: "tryAgain" }), (e: unknown) => fail(e, "Couldn’t sync. Try again."));
  const choose = async () => {
    if (!status.picker) return;
    setChoosing(true);
    try {
      const folder = await pickFolder(status.picker, c.account);
      if (!folder) return;
      const before = await setFolder({ parentId: folder.id, parentName: folder.name });
      saved(`CareerBot folder moving to ${folder.name}`, () => void unsetFolder(before).catch((e: unknown) => fail(e, "Couldn’t move it back. Try again.")));
    } catch (e) {
      fail(e, "Couldn’t choose a folder. Try again.");
    } finally {
      setChoosing(false);
    }
  };

  const syncLine = c.broken
    ? c.broken
    : c.syncing
      ? "Syncing now"
      : c.failed
        ? `${c.failed} ${c.failed === 1 ? "file" : "files"} didn’t sync. ${c.error ?? ""}`.trim()
        : c.files
          ? `${c.files} ${c.files === 1 ? "Doc" : "Docs"}${c.syncedAt ? `, last synced ${time(c.syncedAt)}` : ""}`
          : "No Docs yet. Each resume, cover letter and set of answers is added once it’s written.";

  const more: MenuEntry[] = [
    ...(c.folderUrl ? [{ label: "Open folder", icon: "openElsewhere" as const, detail: "Opens your CareerBot folder in Google Drive.", note: "Free", onSelect: () => window.open(c.folderUrl!, "_blank", "noreferrer") }] : []),
    ...(status.picker
      ? [{ label: "Choose a folder", icon: "onward" as const, detail: "Opens Google’s folder picker to choose where the CareerBot folder lives. It moves there with everything in it.", note: "Free · Undo with U", disabled: choosing, reason: "Choosing", onSelect: () => void choose() }]
      : []),
    "separator",
    { label: "Disconnect", icon: "link" as const, detail: "Stops syncing and ends CareerBot’s access to your Drive. Your CareerBot folder and its Docs stay in Drive.", note: "Free · Asks first · Connect again any time", onSelect: () => void letGo() },
  ];

  return (
    <div data-tour="drive.row" className="flex flex-col">
      <SettingRow
        title="Google Drive"
        line={DRIVE_EXPLAINER}
        control={
          <>
            {c.broken ? (
              connectButton(true)
            ) : (
              <Button size={btn} icon="tryAgain" loading={c.syncing} loadingLabel="Syncing" detail="Syncs your CareerBot folder now: what changed is written, and files deleted in Drive are made again." note="Free" onClick={sync}>
                {c.failed ? "Try again" : "Sync now"}
              </Button>
            )}
            <Menu label="More for Google Drive" title="Google Drive" items={more} trigger={<Button size={btn} variant="ghost" iconOnly icon="more" aria-label="More for Google Drive" />} />
          </>
        }
      >
        <Text size="sm" className="break-words">
          Connected as {c.account || "your Google account"} · {c.folderUrl ? `folder in ${c.place}` : "folder made at the first sync"}
        </Text>
        <Text size="sm" muted>
          {syncLine}
        </Text>
      </SettingRow>
    </div>
  );
}
