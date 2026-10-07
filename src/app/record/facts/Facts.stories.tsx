import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { List, ListRow } from "@/components/ListRow";
import { PaneHeader, PaneLayout } from "@/components/Panes";
import { Heading, Text } from "@/components/Text";
import { IDS, itemId, PROJECT, recordFixture, ROLE } from "../fixtures";
import { RecordStory } from "../RecordStory";
import { Facts, useFactPane } from "./Facts";
import { isOwnedBy, type Owner, roleDates, roleName, useRecord } from "./shared";

// The facts of a role or project inside a plain list and item (the Roles and Projects screens give them their real
// panes), with the fact open beside them: a rewrite to approve, the same work told by Palletwise and Brightwater, two
// Ironbridge facts that say the same thing (Keep both asking why), a fact being edited, a fact's ⋯, a rewrite being
// written and a fact its story no longer says, and the fact pane large, as a drawer and on a phone. Clicks and keys
// work as in the app.

// A role's or project's facts as the item of a plain list, with the fact open beside it (?fact=).
function Host({ owner, size }: { owner: Owner; size?: "medium" | "small" }) {
  const r = useRecord();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const open = params.get("fact");
  const go = (fact: string | null) => {
    const q = new URLSearchParams(params);
    if (fact) q.set("fact", fact);
    else q.delete("fact");
    router.replace(`${path}?${q}`);
  };
  const third = useFactPane(open, () => go(null));
  const onRole = "roleKey" in owner;
  const role = onRole ? r?.roles.find((x) => x.roleKey === owner.roleKey) : undefined;
  const project = onRole ? undefined : r?.projects.find((x) => x.projectKey === owner.projectKey);
  const title = role ? (role.data.break ? "Career break" : (role.data.title ?? "")) : (project?.data.name ?? "");
  const line = role ? [role.data.break ? role.data.reason : role.data.employer, roleDates(role)].filter(Boolean).join(" · ") : (project?.data.repo ?? "");
  const rows = onRole ? (r?.roles ?? []).filter((x) => x.status === "approved").map((x) => ({ id: x.id, key: x.roleKey!, title: x.data.break ? "Career break" : roleName(x), n: r!.facts.filter(isOwnedBy({ roleKey: x.roleKey! })).length })) : (r?.projects ?? []).filter((x) => x.status === "approved").map((x) => ({ id: x.id, key: x.projectKey!, title: x.data.name, n: r!.facts.filter(isOwnedBy({ projectKey: x.projectKey! })).length }));
  const current = onRole ? owner.roleKey : owner.projectKey;
  return (
    <PaneLayout
      size={size}
      list={
        <>
          <PaneHeader title={onRole ? "Roles" : "Projects"} />
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <List label={onRole ? "Roles" : "Projects"}>
              {rows.map((x) => (
                <ListRow key={x.id} title={x.title} meta={`${x.n} ${x.n === 1 ? "fact" : "facts"}`} selected={x.key === current} onOpen={() => {}} />
              ))}
            </List>
          </div>
        </>
      }
      item={
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="flex flex-col gap-1 px-4 pt-5 md:px-8">
            <Heading>{title}</Heading>
            <Text size="sm" muted>
              {line}
            </Text>
          </div>
          <div className="px-4 py-5 md:px-8">
            <Facts owner={owner} open={open} onOpen={go} />
          </div>
        </div>
      }
      third={third}
      back={{ label: onRole ? "Roles" : "Projects", onBack: () => {} }}
    />
  );
}

function Screen({ owner, fact, size }: { owner: Owner; fact?: string; size?: "medium" | "small" }) {
  const [fx] = useState(() => recordFixture());
  const [path, key] = "roleKey" in owner ? ["/record/roles", `role=${owner.roleKey}`] : ["/record/projects", `project=${itemId("p-palletwise")}`];
  return (
    <RecordStory path={path} query={fact ? `${key}&fact=${fact}` : key} answers={fx.answers}>
      <Host owner={owner} size={size} />
    </RecordStory>
  );
}

const meta = { title: "Screens/Roles/Facts", parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta;
export default meta;
type S = StoryObj<typeof meta>;

const page = () => within(document.body);
const bw = { roleKey: ROLE.bw };
const ib = { roleKey: ROLE.ib };
const kcLine = { roleKey: ROLE.kcLine };
const palletwise = { projectKey: PROJECT.palletwise };
const hidden = userEvent.setup({ pointerEventsCheck: 0 });
const row = async (text: string) => (await page().findByText(text, { exact: false })).closest("li")!;

export const Rewrite: S = { name: "Rewrite card", render: () => <Screen owner={bw} /> };

export const SameWork: S = { name: "Same work card", render: () => <Screen owner={palletwise} /> };

export const SameWorkOnRole: S = {
  name: "Same work card, on the role",
  render: () => <Screen owner={bw} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: "Next" }));
    await userEvent.click(await page().findByRole("button", { name: "Next" }));
  },
};

export const Duplicates: S = {
  name: "Duplicates card, Keep both",
  render: () => <Screen owner={ib} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: /^Keep both/ }));
  },
};

export const NeedsALook: S = { name: "Writing a rewrite, needs a look", render: () => <Screen owner={kcLine} /> };

export const Editing: S = {
  name: "Editing a fact",
  render: () => <Screen owner={kcLine} />,
  play: async () => {
    const li = await row("Raised canning line efficiency");
    await hidden.click(within(li).getByRole("button", { name: /^Edit/ }));
  },
};

export const FactMenu: S = {
  name: "Fact ⋯ open",
  render: () => <Screen owner={kcLine} />,
  play: async () => {
    const li = await row("Raised canning line efficiency");
    await hidden.click(within(li).getByRole("button", { name: "More for this fact" }));
  },
};

export const AddFact: S = {
  name: "Add a fact",
  render: () => <Screen owner={bw} />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: /^Add a fact/ }));
  },
};

export const FactPane: S = { name: "Fact pane", render: () => <Screen owner={bw} fact={IDS.sameWorkRole} /> };

export const FactPaneRewritten: S = { name: "Fact pane, rewritten fact", render: () => <Screen owner={bw} fact={itemId("f-bw-recall")} /> };

export const ProjectFactPane: S = { name: "Fact pane, project fact", render: () => <Screen owner={palletwise} fact={IDS.sameWork} /> };

export const Drawer: S = { name: "Drawer (medium)", globals: { viewport: { value: "tablet" } }, render: () => <Screen owner={bw} fact={IDS.sameWorkRole} size="medium" /> };

export const PhoneRole: S = { name: "Phone, role", globals: { viewport: { value: "mobile2" } }, render: () => <Screen owner={bw} size="small" /> };

export const PhoneFact: S = { name: "Phone, fact", globals: { viewport: { value: "mobile2" } }, render: () => <Screen owner={bw} fact={IDS.sameWorkRole} size="small" /> };

export const KeptSeparate: S = {
  name: "Phone, keep separate",
  globals: { viewport: { value: "mobile2" } },
  render: () => <Screen owner={palletwise} size="small" />,
  play: async () => {
    await userEvent.click(await page().findByRole("button", { name: /^Keep separate/ }));
  },
};
