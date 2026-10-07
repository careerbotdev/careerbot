"use client";

import { useRef, useState, type DragEvent } from "react";
import { Button } from "./Button";
import { ErrorLine } from "./Field";
import { Icons } from "./icons";
import { ProgressBar } from "./Progress";
import { useSmall } from "./useSmall";

export type ChosenFile = { name: string; size: number; progress?: number };

// "212 KB", "1.4 MB".
const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} bytes` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Whether a file fits an `accept` list such as ".pdf,.docx,application/pdf".
function fits(file: File, accept: string) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept.split(",").some((a) => {
    const rule = a.trim().toLowerCase();
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return file.type.startsWith(rule.slice(0, -1));
    return file.type === rule;
  });
}

// A place to add one file: a button that opens the file picker (the native input stays hidden underneath), or a drop.
// The chosen file shows below as a row with its size, how far it has uploaded (`progress`, 0 to 1) and a remove button.
export function FileDrop({
  action = "Add a resume file",
  hint = "or drop a PDF or Word file here",
  accept = ".pdf,.doc,.docx",
  wrongType = "Add a PDF or Word file.",
  file,
  onFile,
  onRemove,
  error,
  name,
}: {
  action?: string;
  hint?: string;
  accept?: string;
  // What to say when a dropped file isn't one of `accept`.
  wrongType?: string;
  file?: ChosenFile | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  error?: string;
  name?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [wrong, setWrong] = useState(false);
  const small = useSmall();
  const take = (f: File | undefined) => {
    if (!f) return;
    const ok = fits(f, accept);
    setWrong(!ok);
    if (ok) onFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };
  const problem = error ?? (wrong ? wrongType : undefined);
  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={onDrop}
        className={`flex h-[132px] flex-col items-center justify-center gap-2.5 rounded-sm border border-dashed transition-colors duration-100 max-md:h-auto max-md:border-none ${over ? "border-steel bg-steel-subtle" : "border-control-border"}`}
      >
        <input
          ref={input}
          type="file"
          name={name}
          accept={accept}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button icon="add" size={small ? "lg" : "md"} className="max-md:w-full" detail="Opens your files to choose one." note="Free" onClick={() => input.current?.click()}>
          {action}
        </Button>
        {!small && <p className="text-body-sm leading-body-sm text-muted">{hint}</p>}
      </div>
      {problem && <ErrorLine>{problem}</ErrorLine>}
      {file && (
        <div className="flex h-11 items-center gap-2.5 rounded-sm border border-border pr-2 pl-3 max-md:h-14">
          <Icons.resumes aria-hidden className="shrink-0 text-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-body-sm leading-body-sm font-medium text-text">{file.name}</span>
            {file.progress !== undefined && file.progress < 1 && (
              <ProgressBar label={`Uploading ${file.name}`} value={file.progress} valueText={`${Math.round(file.progress * 100)}%`} className="h-[3px] max-w-40" />
            )}
          </div>
          <span className="shrink-0 text-body-sm leading-body-sm text-muted tabular-nums">{size(file.size)}</span>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={`Remove ${file.name}`} detail="Takes this file out, so you can choose another." note="Free" onClick={onRemove} />
        </div>
      )}
    </div>
  );
}
