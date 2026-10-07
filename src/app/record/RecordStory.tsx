"use client";

import type { ReactNode } from "react";
import { BottomBar } from "@/components/BottomBar";
import { ConfirmDialog } from "@/components/Dialog";
import { useScreenSize } from "@/components/Panes";
import { ShellProvider, useShellState } from "../shell/ShellContext";
import { type Answers, StoryConvex, StoryRouter } from "../storyConvex";

// A Record screen in its stories: the shell's store (bar, ⌘K, confirm), Convex answered from fixtures, and the address
// (`path`, `query`) the screen starts at. On a phone the bottom bar shows what the screen gives it; a question before
// deleting shows as the shell shows it (the bar's confirm on a phone, the dialog on larger screens).
export function RecordStory({ path, query, answers, children }: { path: string; query?: string; answers: Answers; children: ReactNode }) {
  return (
    <ShellProvider>
      <StoryConvex answers={answers}>
        <StoryRouter path={path} query={query}>
          <div className="-m-6 flex h-screen flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            <Bar />
          </div>
        </StoryRouter>
      </StoryConvex>
    </ShellProvider>
  );
}

function Bar() {
  const small = useScreenSize() === "small";
  const { bar, asked } = useShellState();
  if (small) {
    const question = asked
      ? ({ kind: "confirm", message: asked.title, detail: typeof asked.body === "string" ? asked.body : undefined, confirmLabel: asked.confirmLabel, onConfirm: () => asked.answer(true), onCancel: () => asked.answer(false) } as const)
      : null;
    const mode = question ?? bar;
    return mode ? <BottomBar mode={mode} /> : null;
  }
  return (
    <ConfirmDialog
      open={!!asked}
      onOpenChange={(open) => !open && asked?.answer(false)}
      title={asked?.title ?? ""}
      body={asked?.body}
      confirmLabel={asked?.confirmLabel ?? ""}
      onConfirm={() => asked?.answer(true)}
    />
  );
}
