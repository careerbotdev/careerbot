#!/bin/sh
# Starts the web app in the Docker image (Dockerfile). Next.js fixes NEXT_PUBLIC_CONVEX_URL and SITE_URL into the
# build, so the image is built with stand-ins and this swaps them for the container's own values before the server
# starts: one image serves any copy. The swap happens once per container; Docker makes a new container when the
# settings change (`docker compose up` does it on its own).
#
#   NEXT_PUBLIC_CONVEX_URL  the Convex deployment's URL, as the browser reaches it (https://…convex.cloud, or
#                           http://localhost:3210 for self-hosted Convex on this computer)
#   SITE_URL                this site's address, as the browser reaches it (default http://localhost:3000)
set -eu

CONVEX_STAND_IN=http://careerbot-convex-url.invalid
SITE_STAND_IN=http://careerbot-site-url.invalid

convex_url=${NEXT_PUBLIC_CONVEX_URL:?Set NEXT_PUBLIC_CONVEX_URL to your Convex deployment URL (see .env.example).}
site_url=${SITE_URL:-http://localhost:3000}
convex_url=${convex_url%/}
site_url=${site_url%/}

case "$convex_url$site_url" in
  *"|"* | *"\\"* | *"&"*)
    echo "NEXT_PUBLIC_CONVEX_URL and SITE_URL can't contain |, \\ or &." >&2
    exit 1
    ;;
esac

swapped=.next/careerbot-urls
if [ -f "$swapped" ]; then
  if [ "$(cat "$swapped")" != "$convex_url $site_url" ]; then
    echo "This container already serves $(cat "$swapped"). Recreate it to change the URLs (docker compose up does)." >&2
    exit 1
  fi
else
  grep -rlF -e "$CONVEX_STAND_IN" -e "$SITE_STAND_IN" .next server.js |
    xargs -r sed -i -e "s|$CONVEX_STAND_IN|$convex_url|g" -e "s|$SITE_STAND_IN|$site_url|g"
  echo "$convex_url $site_url" >"$swapped"
fi

exec node server.js
