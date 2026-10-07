"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { PATHS } from "../../../../convex/directionPaths";
import { STAGE_LIST } from "../../../../convex/directionVocab";
import { cap, INDUSTRIES, SIZES } from "../../../../convex/limitBuckets";
import { Button } from "@/components/Button";
import { ErrorLine, Field, Input, Textarea } from "@/components/Field";
import { MultiSelect } from "@/components/MultiSelect";
import { useScreenSize } from "@/components/Panes";
import { SegmentedControl } from "@/components/SegmentedControl";
import { toast } from "@/components/Toast";
import { useBar } from "../../shell/ShellContext";
import { Notice } from "../ui";
import { SeniorityNotices } from "./Parts";
import { type Direction, type Path, PATH_ORDER, sizeLabel, stageLabel } from "./words";

// The three corrections a direction takes, each saved and approved as given: the direction itself (goals.edit), its
// criteria and its positioning. ⌘↵ saves, Esc cancels; on a phone the bar holds Cancel and Save.

const options = (xs: readonly string[], label: (x: string) => string = (x) => x) => xs.map((x) => ({ value: x, label: label(x) }));
const tidy = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const SAVE_DETAIL = "Saves these as you wrote them and approves them.";

function Form({ save, saveLabel, onCancel, children }: { save: () => Promise<unknown>; saveLabel: string; onCancel: () => void; children: ReactNode }) {
  const small = useScreenSize() === "small";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    void save()
      .then(onCancel, (e: unknown) => setError(e instanceof ConvexError ? String(e.data) : "Couldn’t save that."))
      .finally(() => setSaving(false));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
    } else if (e.key === "Escape" && !e.defaultPrevented && !(e.target instanceof Element && e.target.closest("[role=listbox], [role=dialog], [aria-expanded=true]"))) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  useBar(
    small
      ? {
          kind: "actions",
          actions: (
            <>
              <Button size="lg" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="lg" variant="primary" className="flex-1" loading={saving} loadingLabel="Saving" detail={SAVE_DETAIL} note="Free" onClick={run}>
                {saveLabel}
              </Button>
            </>
          ),
        }
      : null,
  );
  return (
    <form
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
      className="flex flex-col gap-4"
    >
      {children}
      {error && <ErrorLine>{error}</ErrorLine>}
      {!small && (
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" variant="primary" keys="⌘↵" loading={saving} loadingLabel="Saving" detail={SAVE_DETAIL} note="Free">
            {saveLabel}
          </Button>
          <Button keys="Esc" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}

// The direction: its title, what it includes, how it fits their record, and what it is. Saving approves it.
export function DirectionForm({ d, onDone }: { d: Direction; onDone: () => void }) {
  const edit = useMutation(api.goals.edit);
  const [name, setName] = useState(d.data.name);
  const [includes, setIncludes] = useState<string[]>(d.data.includes ?? []);
  const [path, setPath] = useState<Path>(d.data.path ?? "adjacent");
  const [summary, setSummary] = useState(d.data.summary ?? "");
  const save = () => {
    if (!name.trim()) return Promise.reject(new ConvexError("Give the direction a title."));
    return edit({ id: d.id, fields: { name: name.trim(), includes: tidy(includes), path, summary: summary.trim() } }).then(() =>
      toast({ message: d.status === "approved" ? `Saved ${name.trim()}` : `Approved ${name.trim()}`, icon: "approve" }),
    );
  };
  return (
    <Form save={save} saveLabel={d.status === "approved" ? "Save" : "Save and approve"} onCancel={onDone}>
      <Field label="Title">{(p) => <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} {...p} />}</Field>
      <MultiSelect label="Includes" custom value={includes} onChange={setIncludes} options={options(d.data.includes ?? [])} empty="Nothing else" />
      <SegmentedControl label="Fit with your record" value={path} onChange={setPath} options={PATH_ORDER.map((p) => ({ value: p, label: PATHS[p] }))} />
      <Field label="What it is">{(p) => <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} {...p} />}</Field>
    </Form>
  );
}

// What search looks for: titles and keywords as typed, industries, sizes and stages from the shared lists, and their
// own seed companies (websites, one per line; empty uses their defaults).
export function CriteriaForm({ d, onDone }: { d: Direction; onDone: () => void }) {
  const edit = useMutation(api.directions.editCriteria);
  const c = d.data.criteria;
  const [titles, setTitles] = useState<string[]>(c?.titles ?? []);
  const [industries, setIndustries] = useState<string[]>(c?.industries ?? []);
  const [sizes, setSizes] = useState<string[]>(c?.sizes ?? []);
  const [stages, setStages] = useState<string[]>(c?.stages ?? []);
  const [keywords, setKeywords] = useState<string[]>(c?.keywords ?? []);
  const [seeds, setSeeds] = useState((c?.seeds ?? []).join("\n"));
  const avoided = industries.filter((i) => d.avoided.includes(i));
  const save = () =>
    edit({ id: d.id, titles: tidy(titles), industries, sizes, stages, keywords: tidy(keywords), seeds: tidy(seeds.split("\n")) }).then(() =>
      toast({ message: `Saved the criteria of ${d.data.name}`, icon: "approve" }),
    );
  return (
    <Form save={save} saveLabel="Save and approve" onCancel={onDone}>
      <MultiSelect label="Titles" custom value={titles} onChange={setTitles} options={options(c?.titles ?? [])} empty="Any" />
      <SeniorityNotices name={d.data.name} titles={titles} />
      <MultiSelect label="Industries" value={industries} onChange={setIndustries} options={options(INDUSTRIES, cap)} empty="Any" />
      {avoided.length > 0 && <Notice tone="problem" title={`Your limits avoid ${avoided.map(cap).join(", ")}`}>Take it out, or search won’t look there.</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        <MultiSelect label="Company sizes" value={sizes} onChange={setSizes} options={options(SIZES, sizeLabel)} empty="Any" />
        <MultiSelect label="Stages" value={stages} onChange={setStages} options={options(STAGE_LIST, stageLabel)} empty="Any" />
      </div>
      <MultiSelect label="Keywords" custom value={keywords} onChange={setKeywords} options={options(c?.keywords ?? [])} empty="None" />
      <Field label="Own seed companies">
        {(p) => <Textarea rows={2} value={seeds} placeholder="Websites, one per line. Empty uses your defaults." onChange={(e) => setSeeds(e.target.value)} {...p} />}
      </Field>
    </Form>
  );
}

// How to position the record: the positioning in words, the titles to aim at and the market's vocabulary.
export function DetailForm({ d, onDone }: { d: Direction; onDone: () => void }) {
  const edit = useMutation(api.directions.editDetail);
  const t = d.data.detail;
  const [positioning, setPositioning] = useState(t?.positioning ?? "");
  const [titles, setTitles] = useState<string[]>(t?.targetTitles ?? []);
  const [vocabulary, setVocabulary] = useState<string[]>(t?.vocabulary ?? []);
  const save = () =>
    edit({ id: d.id, positioning, targetTitles: tidy(titles), vocabulary: tidy(vocabulary) }).then(() => toast({ message: `Saved the positioning of ${d.data.name}`, icon: "approve" }));
  return (
    <Form save={save} saveLabel="Save and approve" onCancel={onDone}>
      <Field label="Positioning">{(p) => <Textarea autoFocus rows={4} value={positioning} onChange={(e) => setPositioning(e.target.value)} {...p} />}</Field>
      <MultiSelect label="Target titles" custom value={titles} onChange={setTitles} options={options(t?.targetTitles ?? [])} empty="None" />
      <MultiSelect label="Market vocabulary" custom value={vocabulary} onChange={setVocabulary} options={options(t?.vocabulary ?? [])} empty="None" />
    </Form>
  );
}
