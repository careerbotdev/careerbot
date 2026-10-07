"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CHUNK_BYTES, MAX_IMPORT_BYTES, STALLED_MS, TOO_LARGE } from "../../../convex/exportRules";
import { Button, type ButtonSize } from "@/components/Button";
import { ExternalLink } from "@/components/ExternalLink";
import { ErrorLine } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { Icons } from "@/components/icons";
import type { ScreenSize } from "@/components/Panes";
import { Progress } from "@/components/Progress";
import { toast } from "@/components/Toast";
import { useBar } from "../shell/ShellContext";
import { Rows, SettingRow, SettingsPane } from "./ui";

// Settings, Your data (the Your data boards in Paper): Export makes one ZIP of everything in this workspace, to keep or
// to bring into another copy; Import brings such a ZIP into an empty workspace, checked first and shown as a preview
// (convex/yourData.ts). Both run in the background with their progress here; an import that stopped partway can be
// continued. On a phone the pane's actions sit in the bottom bar.

export const DOCS = "/docs/using/your-data";
type Status = FunctionReturnType<typeof api.yourData.status>;
type ImportState = NonNullable<Status["import"]>;

// "4.2 MB", "212 KB".
const megabytes = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const count = (n: number) => n.toLocaleString("en-US");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const failed = (e: unknown, fallback: string) => toast({ message: e instanceof Error && e.message ? e.message.replace(/^.*Uncaught ConvexError: /, "").split("\n")[0] : fallback, icon: "failed" });

// Whether background work has gone quiet for so long it was cut off. Re-checked every half minute.
function useStalled(row: { beat: number } | null | undefined, busy: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [busy]);
  return busy && !!row && now - row.beat > STALLED_MS;
}

// An import counts as under way from its first row in until it's done.
const underWay = (im: ImportState | null) => !!im && (im.status === "importing" || (im.status === "failed" && im.done > 0));

const IN_IT =
  "Stories and their versions, your record and goals, companies and roles, pursuits with their people, messages, letters, follow-ups and answers, resumes, notes, settings and spending history";
const FILES = "careerbot-export.json, which another copy imports, plus readable copies: Markdown of your record, stories, goals and pursuits, and Word files of resumes and cover letters";
const NOT_IN_IT = "Keys for OpenRouter, Apollo and Brave, the Google Drive and GitHub connections, your password and sign-ins, and work still running. Add them again after an import.";

function Details() {
  const pair = (label: string, value: string) => (
    <div className="flex flex-col gap-0.5 @lg:flex-row @lg:gap-3">
      <dt className="shrink-0 text-body-sm leading-body-sm text-muted @lg:w-21">{label}</dt>
      <dd className="text-body-sm leading-body-sm text-text">{value}</dd>
    </div>
  );
  return (
    <dl className="flex flex-col gap-2">
      {pair("In it", IN_IT)}
      {pair("Files", FILES)}
      {pair("Not in it", NOT_IN_IT)}
    </dl>
  );
}

// The ZIP is on another origin (file storage), where a link's download name is ignored and the browser would save it
// under the storage id: fetched first, it's saved under its own name (or, if that fails, opened as it is).
async function save(url: string, name: string) {
  const a = document.createElement("a");
  a.download = name;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    a.href = URL.createObjectURL(await res.blob());
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  } catch {
    a.href = url;
  }
  a.click();
}

// Sends one piece of a chosen file to the site's upload address (convex/yourData.ts importUpload), signed in with this
// person's token, reporting how far along it is. Answers with the import it went into; a refusal comes back in words.
function sendPart(url: string, token: string | null, body: Blob, onProgress: (p: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let reply: unknown = null;
      try {
        reply = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status < 300 && reply && typeof reply === "object" && "importId" in reply && typeof reply.importId === "string") return resolve(reply.importId);
      reject(new Error(reply && typeof reply === "object" && "error" in reply && typeof reply.error === "string" ? reply.error : "The file didn’t upload. Try again."));
    };
    xhr.onerror = () => reject(new Error("The file didn’t upload. Try again."));
    xhr.send(body);
  });
}

// The whole file, a piece of CHUNK_BYTES at a time (an HTTP request to Convex carries at most 20 MB), each recorded on
// this person's import as it arrives.
async function upload(url: string, token: string | null, file: File, onProgress: (p: number) => void) {
  const parts = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
  let importId = "";
  for (let part = 0; part < parts; part++) {
    const q = new URLSearchParams({ name: file.name, part: String(part), parts: String(parts), ...(importId ? { import: importId } : {}) });
    const piece = file.slice(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES);
    importId = await sendPart(`${url}?${q}`, token, piece, (p) => onProgress((part * CHUNK_BYTES + p * piece.size) / file.size));
  }
}

export function YourData({ size }: { size: ScreenSize }) {
  const status = useQuery(api.yourData.status);
  if (!status) return null;
  return <YourDataView status={status} size={size} />;
}

function YourDataView({ status, size }: { status: Status; size: ScreenSize }) {
  const small = size === "small";
  const router = useRouter();
  const startExport = useMutation(api.yourData.startExport);
  const token = useAuthToken();
  const clearImport = useMutation(api.yourData.clearImport);
  const startImport = useMutation(api.yourData.startImport);
  const [chosen, setChosen] = useState<{ name: string; size: number; progress: number } | null>(null);
  const [tooLarge, setTooLarge] = useState(false);

  const ex = status.export;
  const im = status.import;
  const exportStalled = useStalled(ex, ex?.status === "running");
  const importStalled = useStalled(im, im?.status === "importing" || im?.status === "checking");
  const busyImport = underWay(im);
  const exportRunning = ex?.status === "running" && !exportStalled;
  const exportDone = ex?.status === "done" && !!ex.url;
  const importRunning = im?.status === "importing" && !importStalled;
  const importStopped = (im?.status === "importing" && importStalled) || (im?.status === "failed" && im.done > 0);
  const preview = im?.status === "ready" ? im : null;
  const btn: ButtonSize = small ? "lg" : "sm";

  const run = (p: Promise<unknown>, fallback: string) => void p.catch((e: unknown) => failed(e, fallback));
  const exportAll = () => run(startExport({}), "Couldn’t start the export.");
  const choose = async (file: File) => {
    setTooLarge(false);
    if (file.size > MAX_IMPORT_BYTES) return setTooLarge(true);
    setChosen({ name: file.name, size: file.size, progress: 0 });
    try {
      await upload(status.uploadTo, token, file, (progress) => setChosen({ name: file.name, size: file.size, progress }));
    } catch (e) {
      failed(e, "Couldn’t read that file.");
    } finally {
      setChosen(null);
    }
  };
  // The checked file goes, and the place to choose one comes back.
  const another = () => im && run(clearImport({ importId: im.id }), "Couldn’t do that.");
  const go = () => im && run(startImport({ importId: im.id, leaveOut: true }), "Couldn’t start the import.");

  // ---- Export ----
  const docs = (
    <ExternalLink href={DOCS} label="What’s in an export, in the docs">
      Docs
    </ExternalLink>
  );
  const exportButton = (
    <Button variant="primary" size={btn} className={small ? "flex-1" : ""} detail="Makes one .zip of everything in this workspace, ready to download. Nothing here changes." note="Free" onClick={exportAll}>
      Export
    </Button>
  );
  const downloadButton = ex?.url ? (
    <Button variant="primary" size={btn} icon="export" className={small ? "flex-1" : ""} detail="Saves the .zip to this device." note="Free" onClick={() => save(ex.url!, ex.name ?? "careerbot-export.zip")}>
      Download
    </Button>
  ) : null;
  const againButton = (
    <Button variant="secondary" size={btn} detail="Makes a new .zip of everything as it is now." note="Free" onClick={exportAll}>
      Export again
    </Button>
  );
  const nothingYet = status.empty && !ex;
  const exportState = busyImport ? "blocked" : nothingYet ? "empty" : exportRunning ? "running" : exportDone ? "done" : "ready";
  const exportLine =
    exportState === "blocked" ? "Available once the import is done." : exportState === "empty" ? "Nothing to export yet." : "One .zip of this workspace, to keep or to bring into another copy.";
  const exportControls = (
    <>
      {docs}
      {!small && exportState === "ready" && exportButton}
      {!small && exportState === "done" && (
        <>
          {againButton}
          {downloadButton}
        </>
      )}
    </>
  );

  // ---- Import ----
  const importLine = importRunning || importStopped ? im!.name : im?.status === "done" ? `From ${im.name}` : status.empty || preview ? "Brings an export from another copy into this workspace." : "Works only in an empty workspace, like a new account or a fresh copy.";
  const leavesOut = !!preview?.preview?.omitted.length;
  const importButton = (
    <Button variant="primary" size={btn} className={small ? "flex-1" : ""} detail={leavesOut ? "Adds everything else in this file to this workspace, without the rows listed as left out, and replaces its settings with the file’s." : "Adds everything in this file to this workspace and replaces its settings with the file’s."} note="Free · Can’t be undone" onClick={go}>
      {leavesOut ? "Import without them" : "Import"}
    </Button>
  );
  const anotherButton = (
    <Button variant="secondary" size={btn} detail="Puts this file aside, to choose a different export." note="Free" onClick={another}>
      Choose another file
    </Button>
  );
  const continueButton = (
    <Button variant="primary" size={btn} className={small ? "flex-1" : ""} detail="Picks the import up where it stopped." note="Free" onClick={go}>
      Continue
    </Button>
  );
  const importControls = !small && (preview ? (
    <>
      {anotherButton}
      {importButton}
    </>
  ) : importStopped ? (
    continueButton
  ) : null);

  useBar(
    small
      ? preview
        ? { kind: "actions", actions: (<>{anotherButton}{importButton}</>) }
        : importStopped
          ? { kind: "actions", actions: continueButton }
          : exportState === "ready"
            ? { kind: "actions", actions: exportButton }
            : exportState === "done"
              ? { kind: "actions", actions: (<>{againButton}{downloadButton}</>) }
              : null
      : null,
  );

  // Every row the file holds, the same count the import goes through and reports.
  const total = preview?.total ?? 0;
  const canChoose = status.empty && !busyImport && !preview && im?.status !== "done" && im?.status !== "checking";
  const checking = im?.status === "checking" && !importStalled;
  const refusal = tooLarge ? TOO_LARGE : im?.status === "refused" ? im.error ?? undefined : undefined;

  return (
    <SettingsPane title="Your data" size={size}>
      <Rows>
        <SettingRow title="Export" line={exportLine} control={exportControls}>
          {(exportState === "ready" || exportState === "running") && <Details />}
          {exportState === "ready" && ex?.status === "failed" && ex.error && <ErrorLine>{ex.error}</ErrorLine>}
          {exportState === "running" && <Progress className="max-w-120" label={ex?.step ?? "Starting"} value={ex?.done ?? 0} max={ex?.total ?? 1} detail={`${ex?.done ?? 0} of ${ex?.total ?? 0}`} />}
          {exportState === "done" && ex && (
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 text-body-sm leading-body-sm">
                <Icons.done aria-hidden className="shrink-0 text-good" />
                <span className="min-w-0 truncate font-medium text-text">{ex.name}</span>
                {ex.bytes !== null && <span className="shrink-0 text-muted tabular-nums">· {megabytes(ex.bytes)}</span>}
              </p>
              <p className="pl-6 text-body-sm leading-body-sm text-muted">The link works for an hour.</p>
            </div>
          )}
        </SettingRow>
        <SettingRow title="Import" line={importLine} control={importControls || undefined}>
          {(canChoose || checking || chosen) && (
            <FileDrop
              action="Choose a CareerBot export (.zip)"
              hint={`or drop it here, up to ${MAX_IMPORT_BYTES / 1024 / 1024} MB`}
              accept=".zip"
              wrongType="Choose a .zip that CareerBot exported."
              file={chosen ?? (checking && im ? { name: im.name, size: im.bytes, progress: 0.99 } : null)}
              onFile={(f) => void choose(f)}
              onRemove={() => im && run(clearImport({ importId: im.id }), "Couldn’t do that.")}
              error={refusal}
            />
          )}
          {preview?.preview && (
            <div className="flex flex-col gap-4">
              <div className="flex min-h-11 items-center gap-2.5 rounded-sm border border-border px-3 py-2">
                <Icons.resumes aria-hidden className="shrink-0 text-muted" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm leading-body-sm font-medium text-text">{preview.name}</span>
                  <span className="text-body-sm leading-body-sm text-muted">
                    From CareerBot {preview.preview.version} · exported {day(preview.preview.exportedAt)} · {count(total)} items
                  </span>
                </div>
                <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{megabytes(preview.bytes)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 @lg:grid-cols-3">
                {preview.preview.counts.map((c) => (
                  <div key={c.kind} className="flex h-7 items-center justify-between gap-3 border-b text-body-sm leading-body-sm">
                    <dt className="text-text">{c.kind}</dt>
                    <dd className="text-muted tabular-nums">{count(c.n)}</dd>
                  </div>
                ))}
              </dl>
              {leavesOut && (
                <ErrorLine>
                  Left out if you import: {preview.preview.omitted.map((o) => `${o.kind} (${count(o.n)})`).join(", ")}. They point to something that isn’t in the file, such as work that hadn’t finished when it was exported.
                </ErrorLine>
              )}
              <p className="text-body-sm leading-body-sm text-muted">Keys and connections aren’t in it. Add them again after the import.</p>
            </div>
          )}
          {(importRunning || importStopped) && im && (
            <div className="flex flex-col gap-2">
              <Progress className="max-w-120" label={im.step ?? "Starting"} value={im.done} max={im.total || 1} status={importStopped ? "stopped" : "running"} detail={`${count(im.done)} of ${count(im.total)}`} />
              {importStopped && <ErrorLine>The import stopped partway. Continue picks it up where it stopped.</ErrorLine>}
            </div>
          )}
          {im?.status === "done" && im.result && (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-body-md leading-body-md font-medium text-text">
                <Icons.done aria-hidden className="shrink-0 text-good" />
                Imported {count(im.result.rows)} items
              </p>
              {im.result.omitted.length > 0 && (
                <p className="text-body-sm leading-body-sm text-muted">Left out: {im.result.omitted.map((o) => `${o.kind} (${count(o.n)})`).join(", ")}, since they pointed to something that wasn’t in the file.</p>
              )}
              <div className="flex flex-col">
                {[
                  { title: "Add your keys again", line: "OpenRouter, and Apollo or Brave if you used them", label: "Open Keys", href: "/settings?section=keys", detail: "Opens Settings, Keys." },
                  { title: "Connect Google Drive again", line: "If you kept your resumes there", label: "Open Google Drive", href: "/settings?section=drive", detail: "Opens Settings, Google Drive." },
                  { title: "Connect GitHub again", line: "If you read your repositories in Projects", label: "Open Projects", href: "/record/projects?github=1", detail: "Opens Projects in your record, where GitHub is connected." },
                ].map((n) => (
                  <div key={n.title} className="flex flex-col gap-2 border-t py-3 @lg:flex-row @lg:items-center @lg:gap-6">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-sm leading-body-sm font-medium text-text">{n.title}</span>
                      <span className="text-body-sm leading-body-sm text-muted">{n.line}</span>
                    </div>
                    <Button variant="secondary" size={small ? "md" : "sm"} icon="openElsewhere" className="self-start" detail={n.detail} note="Free" onClick={() => router.push(n.href)}>
                      {n.label}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SettingRow>
      </Rows>
    </SettingsPane>
  );
}
