#!/usr/bin/env bash
# Copy the Convex backend's secrets to a Convex deployment. The secrets' home is Infisical for the maintainer's
# deployments, or this shell's environment (or a plain env file) for anyone else's copy; Convex env vars are a copy.
#
#   scripts/sync-convex-env.sh dev    the dev deployment (behind dev.careerbot.dev, and what local work uses), Infisical env
#                                     "dev"; with CONVEX_DEPLOY_KEY in CI, else the deployment in .env.local
#   scripts/sync-convex-env.sh prod   the deployment behind careerbot.dev, env "prod" (needs CONVEX_DEPLOY_KEY)
#   scripts/sync-convex-env.sh env    no Infisical: the keys below as set in this shell's environment, to the
#                                     deployment the Convex CLI points at (CONVEX_DEPLOY_KEY, CONVEX_SELF_HOSTED_URL
#                                     and CONVEX_SELF_HOSTED_ADMIN_KEY, or .env.local). From a plain env file:
#                                     SECRETS_FILE=.env scripts/with-secrets.sh scripts/sync-convex-env.sh env
#
# In CI, set INFISICAL_TOKEN (machine identity). Locally, `infisical login` is enough.
# INFISICAL_PROJECT_ID names the Infisical project (a self-hoster's own); without it, .infisical.json's is used.
# A key that isn't set (in Infisical or the environment) is left as it is on the deployment.
set -euo pipefail

# Every secret the Convex backend reads. Add a key here when backend code starts using it, and to compose.yaml's
# convex-setup service and .env.example, which hand it to the Docker copy. CAREERBOT_MODE=self-hosted makes a copy
# someone runs themselves (convex/allowlist.ts); careerbot.dev's deployments leave it unset.
KEYS=(SITE_URL CAREERBOT_MODE JWT_PRIVATE_KEY JWKS AUTH_GITHUB_ID AUTH_GITHUB_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET SIGNUP_ALLOWLIST MASTER_KEY_V1 GOOGLE_PICKER_KEY LIQUIDAI_API_KEY AUTH_REDIRECT_ORIGINS UPDATE_CHECK)

target=${1:?usage: sync-convex-env.sh dev|prod|env}

tmp=$(mktemp)
trap 'rm -f "$tmp" "$tmp.all"' EXIT

if [ "$target" = env ]; then
  for key in "${KEYS[@]}"; do
    value=${!key:-}
    value=$(printf '%s' "$value" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
    [ -n "$value" ] || continue
    case "$value" in
      *"'"* | *$'\n'*)
        echo "$key contains a quote or newline" >&2
        exit 1
        ;;
    esac
    printf "%s='%s'\n" "$key" "$value" >>"$tmp"
  done
  [ -s "$tmp" ] || { echo "None of ${KEYS[*]} is set." >&2; exit 1; }
  npx convex env set --force --from-file "$tmp"
  exit 0
fi

infisical_json="$(dirname "$0")/../.infisical.json"
if [ -n "${INFISICAL_PROJECT_ID:-}" ]; then
  project_id=$INFISICAL_PROJECT_ID
elif [ -f "$infisical_json" ]; then
  project_id=$(jq -r .workspaceId "$infisical_json")
else
  echo "No Infisical project: set INFISICAL_PROJECT_ID, or use \`sync-convex-env.sh env\` to copy from this shell's environment." >&2
  exit 1
fi
env=$([ "$target" = prod ] && echo prod || echo dev)

# Build the env file from JSON so stray whitespace in a stored value can't break the quoting.
infisical export --projectId "$project_id" --env "$env" --format json --silent \
  ${INFISICAL_TOKEN:+--token "$INFISICAL_TOKEN"} >"$tmp.all"

keys_json=$(printf '%s\n' "${KEYS[@]}" | jq -R . | jq -s .)
jq -r --argjson keys "$keys_json" \
  '.[] | select(.key as $k | $keys | index($k)) | (.value | gsub("^\\s+|\\s+$"; "")) as $v
   | if ($v | test("[\u0027\n]")) then error("\(.key) contains a quote or newline") else "\(.key)=\u0027\($v)\u0027" end' \
  "$tmp.all" >"$tmp"

case "$target" in
  dev)
    # One deployment serves dev.careerbot.dev and local work; sign-in may also return to localhost (AUTH_REDIRECT_ORIGINS).
    npx convex env set --force --from-file "$tmp"
    ;;
  prod)
    : "${CONVEX_DEPLOY_KEY:?CONVEX_DEPLOY_KEY must be set for $target}"
    npx convex env set --force --from-file "$tmp"
    ;;
  *)
    echo "unknown target: $target" >&2
    exit 1
    ;;
esac
