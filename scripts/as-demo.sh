#!/bin/sh
# Runs a deploy step for the demo (demo.careerbot.dev) with production's secrets, from Infisical prod through
# with-secrets.sh, pointed at the demo instead:
#   INFISICAL_TOKEN=… INFISICAL_PROJECT_ID=… INFISICAL_ENV=prod scripts/with-secrets.sh scripts/as-demo.sh pnpm cf:build
# The demo's own Convex deployment (DEMO_CONVEX_DEPLOY_KEY, DEMO_CONVEX_URL) takes production's place, its address
# (DEMO_URL) is the site's, and the build is the demo's (CAREERBOT_MODE=demo, src/app/mode.ts). The demo's deployment
# holds nothing but the demo and only its sign-in keys; its settings are never copied from Infisical.
set -eu
: "${DEMO_CONVEX_DEPLOY_KEY:?DEMO_CONVEX_DEPLOY_KEY must be set}" "${DEMO_CONVEX_URL:?DEMO_CONVEX_URL must be set}" "${DEMO_URL:?DEMO_URL must be set}"
CONVEX_DEPLOY_KEY=$DEMO_CONVEX_DEPLOY_KEY
NEXT_PUBLIC_CONVEX_URL=$DEMO_CONVEX_URL
NEXT_PUBLIC_CONVEX_SITE_URL=$(printf '%s' "$DEMO_CONVEX_URL" | sed 's/\.convex\.cloud$/.convex.site/')
SITE_URL=$DEMO_URL
CAREERBOT_MODE=demo
export CONVEX_DEPLOY_KEY NEXT_PUBLIC_CONVEX_URL NEXT_PUBLIC_CONVEX_SITE_URL SITE_URL CAREERBOT_MODE
unset DEMO_CONVEX_DEPLOY_KEY DEMO_URL
exec "$@"
