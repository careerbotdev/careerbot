#!/usr/bin/env bash
# Sets up the Convex deployment a Docker copy of CareerBot uses: its settings, then CareerBot's functions, then, until
# the copy has its owner account, a setup code to create it with. Compose's convex-setup service runs it on every
# `docker compose up` (the image is the Dockerfile's convex-setup target); running it again is safe. Which Convex:
#
#   Convex's cloud            CONVEX_DEPLOY_KEY, a production deploy key from the project's settings in the dashboard
#   self-hosted Convex        CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY; in compose's self-hosted
#                             profile the key comes from the convex-admin-key service, through /convex-admin/admin_key
#
# The settings come from this container's environment (the keys listed in scripts/sync-convex-env.sh). Sign-in keys
# (JWT_PRIVATE_KEY and JWKS) and the key that encrypts each workspace's saved API keys (MASTER_KEY_V1) are made here the
# first time, when neither the environment nor the deployment has them, and then kept in the deployment.
#
# Two more commands, for whoever runs the copy (convex/account.ts):
#
#   docker compose run --rm convex-setup new-setup-code          a new setup code (the old one stops working)
#   docker compose run --rm convex-setup reset-password <name>   a temporary password for that username
set -euo pipefail
cd "$(dirname "$0")/.."

command=${1:-setup}
site=${SITE_URL:-http://localhost:3000}

if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  unset CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
  where="the cloud deployment of this deploy key"
elif [ -n "${CONVEX_SELF_HOSTED_URL:-}" ]; then
  if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ] && [ -s /convex-admin/admin_key ]; then
    CONVEX_SELF_HOSTED_ADMIN_KEY=$(cat /convex-admin/admin_key)
    export CONVEX_SELF_HOSTED_ADMIN_KEY
  fi
  : "${CONVEX_SELF_HOSTED_ADMIN_KEY:?Set CONVEX_SELF_HOSTED_ADMIN_KEY (docker compose exec convex-backend ./generate_admin_key.sh)}"
  where="self-hosted at $CONVEX_SELF_HOSTED_URL"
else
  echo "Set CONVEX_DEPLOY_KEY (Convex's cloud) or CONVEX_SELF_HOSTED_URL (self-hosted Convex); see .env.example." >&2
  exit 1
fi

# Reads one field of a function's JSON answer (npx convex run prints it).
field() { node -e 'const v = JSON.parse(process.argv[1])[process.argv[2]]; if (v !== undefined) console.log(v)' "$1" "$2"; }

# Makes a setup code and prints it, or says whose copy it is when it has its owner. `quiet`: say nothing then.
setup_code() {
  local answer code owner
  answer=$(npx convex run account:newSetupCode)
  code=$(field "$answer" code)
  owner=$(field "$answer" owner)
  if [ -n "$code" ]; then
    cat <<EOF

────────────────────────────────────────────────────────────────────────────────
  Setup code: $code

  Open $site and create the owner account with it. It works once, and only
  until the owner account exists; an earlier code no longer works.
  Lost it? Deploy again (Redeploy in Coolify or Dokploy, or docker compose up -d)
  to get a new one, or: docker compose run --rm convex-setup new-setup-code
────────────────────────────────────────────────────────────────────────────────

EOF
  elif [ "${1:-}" != quiet ]; then
    echo "This copy already has its owner account ($owner), so it needs no setup code."
    echo "To get back in as $owner: docker compose run --rm convex-setup reset-password $owner"
  fi
}

case "$command" in
  setup)
    echo "Convex: $where"
    # The settings the deployment already has (names only); a key set there or in the environment isn't made again.
    existing=$(npx convex env list --names-only)
    if [ -z "${JWT_PRIVATE_KEY:-}" ] && ! grep -qx JWT_PRIVATE_KEY <<<"$existing"; then
      echo "Making the sign-in keys (JWT_PRIVATE_KEY, JWKS)"
      eval "$(node docker/convex-keys.mjs jwt)"
      export JWT_PRIVATE_KEY JWKS
    fi
    if [ -z "${MASTER_KEY_V1:-}" ] && ! grep -qx MASTER_KEY_V1 <<<"$existing"; then
      echo "Making the key that encrypts saved API keys (MASTER_KEY_V1); it stays in the deployment's settings"
      eval "$(node docker/convex-keys.mjs master)"
      export MASTER_KEY_V1
    fi
    scripts/sync-convex-env.sh env
    npx convex deploy -y --typecheck disable
    echo "Convex is set up."
    setup_code quiet
    ;;
  new-setup-code)
    setup_code
    ;;
  reset-password)
    username=${2:?usage: reset-password <username>}
    answer=$(npx convex run account:resetPassword "$(node -e 'console.log(JSON.stringify({ username: process.argv[1] }))' "$username")")
    cat <<EOF

Temporary password for $(field "$answer" username): $(field "$answer" temporaryPassword)

Sign in with it at $site. It works once: CareerBot then asks for a password of your own.
Your old password no longer works, and you're signed out everywhere.

EOF
    ;;
  *)
    echo "usage: convex-setup.sh [setup | new-setup-code | reset-password <username>]" >&2
    exit 1
    ;;
esac
