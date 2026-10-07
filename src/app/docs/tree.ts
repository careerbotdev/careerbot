import type * as PageTree from "fumadocs-core/page-tree";
import { source } from "./source";

// The docs' page tree as the sidebar, the phone's contents sheet, the breadcrumb and Previous/Next use it: plain data,
// so it crosses to the browser. A folder's own page (its index.mdx) comes first among its pages, under its `nav` label
// ("The order" for How the AI works), and the folder's row opens and closes it. Pages are in each folder's meta.json
// order.

export type DocsLink = { title: string; url: string };
export type DocsNode = DocsLink & { children?: DocsNode[] };

const label = (item: PageTree.Item) => {
  const data = source.getNodePage(item)?.data;
  return data?.nav ?? data?.title ?? String(item.name);
};

function nodes(children: PageTree.Node[]): DocsNode[] {
  return children.flatMap((node): DocsNode[] => {
    if (node.type === "page") return [{ title: label(node), url: node.url }];
    if (node.type !== "folder") return [];
    const index = node.index ? [{ title: label(node.index), url: node.index.url }] : [];
    const pages = [...index, ...nodes(node.children).filter((page) => page.url !== node.index?.url)];
    return [{ title: String(node.name), url: pages[0]?.url ?? "", children: pages }];
  });
}

export const DOCS_TREE: DocsNode[] = nodes(source.pageTree.children);

// Every page in reading order, for Previous and Next.
const flat: DocsLink[] = DOCS_TREE.flatMap((node) => node.children ?? [node]);

export function neighbours(url: string): { previous?: DocsLink; next?: DocsLink } {
  const i = flat.findIndex((page) => page.url === url);
  return i < 0 ? {} : { previous: flat[i - 1], next: flat[i + 1] };
}

// The folder a page sits in, for the breadcrumb (Docs › How the AI works) and the phone's docs bar.
export const groupOf = (url: string) => DOCS_TREE.find((node) => node.children?.some((page) => page.url === url));
