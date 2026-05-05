#!/usr/bin/env bash
# start-openclaw-gateway.sh
# Starts the OpenClaw-compatible gateway server for Paperclip integration.
# Run this from the alfred directory.
#
# The gateway listens on port 18789 and bridges Paperclip wake payloads to
# NanoClaw via the `claw` CLI.
#
# Token is stored at ~/.openclaw/openclaw.json (auto-created if missing).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALFRED_DIR="$(dirname "$SCRIPT_DIR")"
GATEWAY_SCRIPT="$SCRIPT_DIR/openclaw-gateway.js"
CONFIG_DIR="${HOME}/.openclaw"
CONFIG_FILE="${CONFIG_DIR}/openclaw.json"
PORT="${OPENCLAW_GATEWAY_PORT:-18789}"

# Create token if not exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Creating gateway token at $CONFIG_FILE..."
  mkdir -p "$CONFIG_DIR/workspace"
  TOKEN="ocg_$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cat > "$CONFIG_FILE" << EOF
{
  "gateway": {
    "auth": {
      "token": "$TOKEN"
    }
  }
}
EOF
  chmod 600 "$CONFIG_FILE"
  echo "Token created: ${TOKEN:0:8}..."
else
  echo "Using existing token at $CONFIG_FILE"
fi

echo "Starting OpenClaw gateway on port $PORT..."
cd "$ALFRED_DIR"
exec node "${SCRIPT_DIR}/openclaw-gateway.cjs"
