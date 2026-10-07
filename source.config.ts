import { defineConfig } from "fumadocs-mdx/config";

// The few parts of the HTML tree (hast) this touches.
type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[]; data?: { meta?: string } };

// The docs' MDX options (content/docs, read through src/app/docs/source.ts). Code is shown as written, in our own code
// block (src/app/docs/mdx.tsx), so there's no syntax highlighter: a fence's label (```bash title="Terminal") goes to
// the block as data-title instead.
function codeTitles() {
  return (tree: Node) => {
    const visit = (node: Node) => {
      for (const child of node.children ?? []) {
        if (child.type !== "element") continue;
        const code = child.tagName === "pre" ? child.children?.find((c) => c.type === "element" && c.tagName === "code") : undefined;
        const title = code?.data?.meta?.match(/title="([^"]*)"/)?.[1];
        if (title) child.properties = { ...child.properties, dataTitle: title };
        visit(child);
      }
    };
    visit(tree);
  };
}

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: false,
    rehypePlugins: (plugins) => [...plugins, codeTitles],
  },
});
