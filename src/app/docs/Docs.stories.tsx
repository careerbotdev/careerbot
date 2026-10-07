import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createFromSource } from "fumadocs-core/search/server";
import { userEvent, within } from "storybook/test";
import { DocsArticle } from "./DocsArticle";
import { DocsFrame } from "./DocsFrame";
import { source } from "./source";
import { DOCS_TREE } from "./tree";

// The docs (/docs and every page under it) as the site serves them: the docs home, a guide (Your story), a reference
// page with generated parts (How the AI works), each large (resize for medium) and on a phone; search open with a
// question typed; and the phone's contents sheet open. Search's index (/api/search, a static file in the site's build)
// is answered here from the same pages.

const search = createFromSource(source);
const answerSearch = () => {
  const fetch = window.fetch;
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, location.href).pathname === "/api/search" ? search.staticGET() : fetch(input, init);
  };
  return () => {
    window.fetch = fetch;
  };
};

const at = (url: string) => ({ nextjs: { appDirectory: true, navigation: { pathname: url } } });
const phone = { viewport: { value: "mobile2" } };

function Docs({ url }: { url: string }) {
  const page = source.getPageByHref(url)?.page;
  if (!page) throw new Error(`No docs page at ${url}`);
  return (
    <div className="-m-6">
      <DocsFrame tree={DOCS_TREE}>
        <DocsArticle page={page} />
      </DocsFrame>
    </div>
  );
}

const meta = {
  title: "Screens/Docs",
  parameters: { layout: "fullscreen", ...at("/docs") },
  beforeEach: answerSearch,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const HOME = "/docs";
const GUIDE = "/docs/best-practices/your-story";
const AI = "/docs/ai";

export const Home: Story = { render: () => <Docs url={HOME} /> };
export const HomeSmall: Story = { name: "Home, small", globals: phone, render: () => <Docs url={HOME} /> };

export const Guide: Story = { parameters: at(GUIDE), render: () => <Docs url={GUIDE} /> };
export const GuideSmall: Story = { name: "Guide, small", parameters: at(GUIDE), globals: phone, render: () => <Docs url={GUIDE} /> };

export const HowTheAiWorks: Story = { name: "How the AI works", parameters: at(AI), render: () => <Docs url={AI} /> };
export const HowTheAiWorksSmall: Story = { name: "How the AI works, small", parameters: at(AI), globals: phone, render: () => <Docs url={AI} /> };

export const SearchOpen: Story = {
  name: "Search open",
  parameters: at(GUIDE),
  render: () => <Docs url={GUIDE} />,
  play: async () => {
    const body = within(document.body);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await userEvent.type(await body.findByRole("combobox"), "what does the AI read");
    await body.findAllByRole("option");
  },
};

export const NavOpen: Story = {
  name: "Contents open, small",
  parameters: at(GUIDE),
  globals: phone,
  render: () => <Docs url={GUIDE} />,
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("button", { name: /Best practices/ }));
    await body.findByRole("dialog");
  },
};
