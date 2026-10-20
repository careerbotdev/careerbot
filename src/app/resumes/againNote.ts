import { useSyncExternalStore } from "react";

// Write again's note and whether it's open, for the resume that's open (its key: "base" or a direction's id). Held
// here rather than in the item, so History's Use again can put an earlier note back and open it.
type Again = { key: string; note: string; open: boolean };

const EMPTY: Again = { key: "", note: "", open: false };
let state = EMPTY;
const listeners = new Set<() => void>();

// A change to the resume's own note and open state; another resume's are dropped.
function update(key: string, change: Partial<Again>) {
  state = { ...(state.key === key ? state : { ...EMPTY, key }), ...change };
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAgainNote(key: string) {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const mine = s.key === key ? s : EMPTY;
  return {
    note: mine.note,
    open: mine.open,
    setNote: (note: string) => update(key, { note }),
    setOpen: (open: boolean) => update(key, { open }),
    // History's Use again: the note back in the field, and the field open.
    putBack: (note: string) => update(key, { note, open: true }),
  };
}
