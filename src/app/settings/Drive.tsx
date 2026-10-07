"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button, buttonLook } from "@/components/Button";
import { Icons } from "@/components/icons";
import type { ScreenSize } from "@/components/Panes";
import { toast, type Toast } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { DRIVE_EXPLAINER } from "../resumes/Drive";
import { useConfirm } from "../shell/ShellContext";
import { pickFolder } from "./drivePicker";
import { DRIVE_TOUR } from "../tours/drive";
import { useTour } from "../shell/useTour";
import { monthDay, Rows, saved, SettingRow, SettingsPane } from "./ui";

// Google Drive: connect (Google's own consent screen, for the files CareerBot makes and nothing else), then the
// account, the CareerBot folder (open it; choose where it lives with Google's Picker once the Picker key is set up)
// and how syncing went (Sync now, or Try again after a failure). Disconnect asks first; the files stay in Drive.
// Coming back from Google (?drive=connected|failed|denied) says how it went, once (here, or on Getting started's step).

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
  const params = useSearchParams();
  const router = useRouter();
  const small = size === "small";
  const btn = small ? "lg" : "sm";
  useTour(DRIVE_TOUR, status !== undefined);

  const outcome = params.get("drive");
  const said = useRef(false);
  useEffect(() => {
    if (said.current || !outcome || !DRIVE_RETURNED[outcome]) return;
    said.current = true;
    toast(DRIVE_RETURNED[outcome]);
    router.replace("/settings?section=drive", { scroll: false });
  }, [outcome, router]);

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

  if (status === undefined) return <SettingsPane title="Google Drive" size={size}>{null}</SettingsPane>;
  const c = status.connected;
  if (!c)
    return (
      <SettingsPane title="Google Drive" size={size}>
        <Rows>
          <div data-tour="drive.connect" className="flex flex-col">
            <SettingRow title="Google Drive" line={DRIVE_EXPLAINER} control={connectButton(false)} />
          </div>
        </Rows>
      </SettingsPane>
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

  return (
    <SettingsPane title="Google Drive" size={size}>
      <Rows>
        <div data-tour="drive.account" className="flex flex-col">
        <SettingRow
          title="Account"
          line={`Connected as ${c.account || "your Google account"}`}
          control={
            <Button size={btn} variant="ghost" detail="Stops syncing and ends CareerBot’s access to your Drive. Your CareerBot folder and its Docs stay in Drive." note="Free · Asks first · Connect again any time" onClick={() => void letGo()}>
              Disconnect
            </Button>
          }
        />
        </div>
        <div data-tour="drive.folder" className="flex flex-col">
        <SettingRow
          title="CareerBot folder"
          line={c.folderUrl ? `In ${c.place}` : "Made at the first sync"}
          control={
            <>
              {c.folderUrl && (
                <Tooltip content="Open folder" detail="Opens your CareerBot folder in Google Drive." note="Free">
                  <a href={c.folderUrl} target="_blank" rel="noreferrer" className={buttonLook("secondary", "", btn)}>
                    <Icons.openElsewhere aria-hidden="true" />
                    Open folder
                  </a>
                </Tooltip>
              )}
              {status.picker && (
                <Button
                  size={btn}
                  loading={choosing}
                  loadingLabel="Choosing"
                  detail="Opens Google’s folder picker to choose where the CareerBot folder lives. It moves there with everything in it."
                  note="Free · Undo with U"
                  onClick={() => void choose()}
                >
                  Choose a folder
                </Button>
              )}
            </>
          }
        />
        </div>
        <div data-tour="drive.sync" className="flex flex-col">
        <SettingRow
          title="Sync"
          line={syncLine}
          control={
            c.broken ? (
              connectButton(true)
            ) : (
              <Button size={btn} icon="tryAgain" loading={c.syncing} loadingLabel="Syncing" detail="Syncs your CareerBot folder now: what changed is written, and files deleted in Drive are made again." note="Free" onClick={sync}>
                {c.failed ? "Try again" : "Sync now"}
              </Button>
            )
          }
        />
        </div>
      </Rows>
    </SettingsPane>
  );
}
