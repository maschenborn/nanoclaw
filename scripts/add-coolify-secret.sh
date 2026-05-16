#!/usr/bin/env bash
# Add the local Coolify (egert) API token to the OneCLI vault.
# Wires it as Authorization: Bearer {value} so any agent in `secretMode: all`
# (or any agent with this secret explicitly assigned) can call the Coolify API.
set -euo pipefail

NAME="${COOLIFY_SECRET_NAME:-Coolify (egert)}"
HOST_PATTERN="${COOLIFY_HOST_PATTERN:-}"
TOKEN="${COOLIFY_TOKEN:-}"

if [[ -z "$HOST_PATTERN" ]]; then
  read -r -p "Coolify host (e.g. coolify.aschenborn.dev or localhost:8000): " HOST_PATTERN
fi

if [[ -z "$TOKEN" ]]; then
  read -r -s -p "Coolify API token (from Keys & Tokens → API Tokens): " TOKEN
  echo
fi

if [[ -z "$HOST_PATTERN" || -z "$TOKEN" ]]; then
  echo "host pattern and token are required" >&2
  exit 1
fi

onecli secrets create \
  --name "$NAME" \
  --type generic \
  --value "$TOKEN" \
  --host-pattern "$HOST_PATTERN" \
  --header-name "Authorization" \
  --value-format "Bearer {value}"

echo
echo "Done. To verify:"
echo "  onecli secrets list | grep -i coolify"
echo
echo "If the target agent is still in selective secret mode, either flip it to all:"
echo "  onecli agents set-secret-mode --id <agent-id> --mode all"
echo "or assign this secret explicitly:"
echo "  onecli secrets list                 # find the new secret id"
echo "  onecli agents set-secrets --id <agent-id> --secret-ids <secret-id>"
