import { createFromSource } from "fumadocs-core/search/server";
import { source } from "../../docs/source";

// The docs' search index (DocsSearch downloads it once and searches in the browser), built with the site: a static
// file, so searching never runs anything on the server.
export const revalidate = false;
export const { staticGET: GET } = createFromSource(source);
