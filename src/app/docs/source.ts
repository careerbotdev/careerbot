import { type InferPageType, loader } from "fumadocs-core/source";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";

// The docs' pages: content/docs, compiled at build time by fumadocs-mdx (next.config.ts, source.config.ts). Each page's
// frontmatter: its title and description, a shorter `nav` label for the sidebar, the repo paths it's true to
// (`sources`, which the docs check, scripts/docs-check.ts, requires and resolves), and on a Using page the screen it
// describes (`screen`). Each folder's meta.json orders its pages.
const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema.extend({
      description: z.string(),
      nav: z.string().optional(),
      sources: z.array(z.string()).min(1),
      screen: z.string().optional(),
    }),
  },
});

export const source = loader({ baseUrl: "/docs", source: docs.toFumadocsSource() });
export type DocsPage = InferPageType<typeof source>;
