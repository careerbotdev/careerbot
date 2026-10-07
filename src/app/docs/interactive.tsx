"use client";

import { Children, type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { TabPanel, Tabs } from "@/components/Tabs";

// Code as written, under its label (Terminal, .env, a file's name) with Copy. It wraps rather than scrolling sideways,
// so a long line stays readable on a phone.
export function CodeBlock({ title, children }: { title?: string; children: ReactNode }) {
  const code = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code.current?.textContent?.replace(/\n$/, "") ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col overflow-clip rounded-sm border border-border bg-subtle">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border pr-1 pl-3.5">
        <span className="min-w-0 truncate font-mono text-mono leading-mono font-medium text-muted">{title}</span>
        <Button variant="ghost" size="sm" icon={copied ? "approve" : "copy"} detail="Copies this code, to paste it where it goes." note="Free" onClick={copy} className="text-muted">
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre ref={code} className="px-4 py-3.5 font-mono text-docs-code leading-docs-code whitespace-pre-wrap text-text [font-variant-ligatures:none] [overflow-wrap:anywhere] [&>code]:bg-transparent [&>code]:p-0">
        {children}
      </pre>
    </div>
  );
}

// One panel per label (the ways to set something up), on the shared Tabs part. Every panel stays in the page, so
// search and Find in page reach them; only the chosen one shows.
export function DocsTabs({ labels, children }: { labels: string[]; children: ReactNode }) {
  const [value, setValue] = useState(labels[0]);
  const panels = Children.toArray(children);
  return (
    <div className="flex flex-col">
      <Tabs tabs={labels.map((label) => ({ value: label, label }))} value={value} onValueChange={setValue} label="Ways to set this up" inFlow className="border-b border-border">
        {labels.map((label, i) => (
          <TabPanel key={label} value={label} className="outline-none">
            {panels[i]}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
