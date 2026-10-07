# syntax=docker/dockerfile:1
# CareerBot in Docker: the web app on Next.js's own Node server (not the Cloudflare Worker), set up by env vars when
# it starts (docker/web-start.sh), and a one-shot step that sets up the Convex deployment it uses (docker/convex-setup.sh).
#
#   docker build -t careerbot .                                            the web app (target `web`, the default)
#   docker build --target convex-setup -t careerbot-convex-setup .         the Convex step
#
# Each release publishes both images, for amd64 and arm64, to ghcr.io/careerbotdev/careerbot-web and careerbot-setup,
# and compose.yaml runs them; compose.build.yaml builds them from a checkout instead.
# .env.example lists the settings.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS pnpm
WORKDIR /app
ENV PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm
COPY --chmod=644 package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Every dependency, for the build.
FROM pnpm AS deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

# The standalone build, of a self-hosted copy (CAREERBOT_MODE: the app at /, no careerbot.dev website; src/app/mode.ts).
# NEXT_PUBLIC_CONVEX_URL and SITE_URL are stand-ins, swapped for the container's own values when it starts. The share
# card (src/app/opengraph-image.png) is committed, so this runs `next build` without `pnpm share:card`.
FROM deps AS build
COPY . .
ENV BUILD_STANDALONE=1 \
    CAREERBOT_MODE=self-hosted \
    NEXT_PUBLIC_CONVEX_URL=http://careerbot-convex-url.invalid \
    SITE_URL=http://careerbot-site-url.invalid
RUN pnpm exec next build

# Sets up the Convex deployment and deploys CareerBot's functions to it, then exits. The Convex CLI bundles convex/ with
# the app's own dependencies, not the tools it's built and checked with.
FROM pnpm AS convex-setup
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --prod
COPY --chown=node:node convex ./convex
# Readable and runnable by the node user whatever the clone's file modes (a checkout made with umask 077 has none).
COPY --chmod=755 scripts/sync-convex-env.sh ./scripts/
COPY --chmod=755 docker/convex-setup.sh docker/convex-keys.mjs ./docker/
# No "Convex AI files are not installed" notice: they're for editing code, and this image only deploys it.
RUN echo '{ "aiFiles": { "enabled": false } }' >convex.json
USER node
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# `docker compose run --rm convex-setup new-setup-code` (or reset-password <username>) runs the script's other commands.
ENTRYPOINT ["docker/convex-setup.sh"]
CMD ["setup"]

# The web app.
FROM ${NODE_IMAGE} AS web
WORKDIR /app
# The start script rewrites the build's stand-in URLs in place, as the node user.
RUN chown node:node /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chmod=755 docker/web-start.sh /usr/local/bin/careerbot-web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["careerbot-web"]
