import { Fragment, type ReactNode } from "react";

// The little Markdown a release note uses for a self-hoster's steps: paragraphs, - and 1. lists, ``` code blocks, and
// in a line `code`, **bold** and [links](https://…). Anything else shows as written. `code` styles a code block.

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code key={i} className="font-mono">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link && /^(https:\/\/|\/)/.test(link[2]))
      return (
        <a key={i} href={link[2]} className="rounded-sm underline decoration-border underline-offset-3 transition-colors duration-100 hover:decoration-text">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] } | { kind: "code"; lines: string[] };

function blocks(markdown: string): Block[] {
  const out: Block[] = [];
  let fence: string[] | null = null;
  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    if (fence) {
      if (line.trim().startsWith("```")) {
        out.push({ kind: "code", lines: fence });
        fence = null;
      } else fence.push(line);
      continue;
    }
    const last = out.at(-1);
    const item = /^\s*(?:([-*])|\d+\.)\s+(.*)$/.exec(line);
    if (line.trim().startsWith("```")) fence = [];
    else if (!line.trim()) out.push({ kind: "p", lines: [] });
    else if (item) {
      const kind = item[1] ? "ul" : "ol";
      if (last?.kind === kind) last.items.push(item[2]);
      else out.push({ kind, items: [item[2]] });
    } else if (/^\s+/.test(line) && (last?.kind === "ul" || last?.kind === "ol")) last.items[last.items.length - 1] += ` ${line.trim()}`;
    else if (last?.kind === "p") last.lines.push(line.trim());
    else out.push({ kind: "p", lines: [line.trim()] });
  }
  if (fence) out.push({ kind: "code", lines: fence });
  return out.filter((b) => b.kind !== "p" || b.lines.length > 0);
}

function List({ kind, items }: { kind: "ul" | "ol"; items: string[] }) {
  const Tag = kind;
  return (
    <Tag className={`flex flex-col gap-1 pl-5 ${kind === "ul" ? "list-disc" : "list-decimal"}`}>
      {items.map((item, j) => (
        <li key={j}>{inline(item)}</li>
      ))}
    </Tag>
  );
}

export function Markdown({ text, code = "rounded-sm bg-subtle px-3 py-2.5" }: { text: string; code?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {blocks(text).map((b, i) =>
        b.kind === "code" ? (
          <pre key={i} className={`overflow-x-auto font-mono ${code}`}>
            {b.lines.join("\n")}
          </pre>
        ) : b.kind === "p" ? (
          <p key={i}>{inline(b.lines.join(" "))}</p>
        ) : (
          <List key={i} kind={b.kind} items={b.items} />
        ),
      )}
    </div>
  );
}
