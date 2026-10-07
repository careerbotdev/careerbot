import { DocsFrame } from "./DocsFrame";
import { DOCS_TREE } from "./tree";

// /docs and every page under it: public on careerbot.dev, the demo and a self-hosted copy (site/nav.ts, isPublic),
// built at build time, served as they are.
export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return <DocsFrame tree={DOCS_TREE}>{children}</DocsFrame>;
}
