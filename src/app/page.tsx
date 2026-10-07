import type { Metadata } from "next";
import { Home } from "./Home";
import { WEBSITE } from "./mode";
import { pageMetadata, structuredData } from "./site/meta";
import { DESCRIPTION, SHARE_DESCRIPTION } from "./site/words";

export const metadata: Metadata = pageMetadata("/", { description: DESCRIPTION, share: SHARE_DESCRIPTION });

// The home page, with its structured data for search engines (JSON-LD; `<` escaped so the text can't close the tag);
// a self-hosted copy or the demo, which aren't indexed and have no website, have none.
export default function HomePage() {
  return (
    <>
      {WEBSITE && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }} />}
      <Home />
    </>
  );
}
