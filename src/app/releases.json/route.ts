import { RELEASES } from "../changelog/releases";

// /releases.json: every release's notes, newest first, as /changelog shows them. careerbot.dev's is the list a
// self-hosted copy reads once a day to see whether there's a newer version (convex/updates.ts). Built with the site.
export const dynamic = "force-static";

export function GET() {
  return Response.json(RELEASES, { headers: { "access-control-allow-origin": "*" } });
}
