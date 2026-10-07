#!/bin/sh
# Runs a command with the secrets of one environment, for deploy steps. From Infisical (the maintainer's CI):
#   INFISICAL_TOKEN=… INFISICAL_PROJECT_ID=… INFISICAL_ENV=dev scripts/with-secrets.sh npx convex deploy -y
# The command gets that environment's secrets but not the Infisical login, which can read more than it needs.
# Or, with no Infisical, from a plain env file, read as Docker Compose reads .env (KEY=value lines, # comments, a value
# optionally in quotes; nothing in it is run):
#   SECRETS_FILE=.env scripts/with-secrets.sh npx convex deploy -y
set -eu
if [ -n "${SECRETS_FILE:-}" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line#export }
    case "$line" in '' | '#'*) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    case "$key" in '' | *[!A-Za-z0-9_]*) continue ;; esac
    case "$value" in
      \"*\") value=${value#\"} value=${value%\"} ;;
      \'*\') value=${value#\'} value=${value%\'} ;;
    esac
    export "$key=$value"
  done <"$SECRETS_FILE"
  exec "$@"
fi
token="$INFISICAL_TOKEN"
unset INFISICAL_TOKEN
exec infisical run --token "$token" --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" --silent -- "$@"
