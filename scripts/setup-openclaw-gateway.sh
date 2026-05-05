#!/usr/bin/env bash
# setup-openclaw-gateway.sh
# One-time setup: installs the openclaw-gateway as a systemd user service.
# Run this on the host (not inside a container) as the maschenborn user.
#
# After setup, the gateway will start automatically on login and restart on failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALFRED_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="openclaw-gateway"
SERVICE_SRC="$SCRIPT_DIR/openclaw-gateway.service"
SERVICE_DST="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
CONFIG_DIR="${HOME}/.openclaw"
CONFIG_FILE="${CONFIG_DIR}/openclaw.json"
ALFRED_CONFIG="${ALFRED_DIR}/.openclaw/openclaw.json"
NODE_BIN="$(which node 2>/dev/null || echo /usr/local/bin/node)"

echo "=== OpenClaw Gateway Setup ==="
echo "Alfred dir: $ALFRED_DIR"
echo "Node: $NODE_BIN"

# Ensure token exists
if [ ! -f "$CONFIG_FILE" ] && [ -f "$ALFRED_CONFIG" ]; then
  echo "Copying token from $ALFRED_CONFIG to $CONFIG_FILE..."
  mkdir -p "$CONFIG_DIR/workspace"
  cp "$ALFRED_CONFIG" "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
elif [ ! -f "$CONFIG_FILE" ]; then
  echo "Creating new gateway token at $CONFIG_FILE..."
  mkdir -p "$CONFIG_DIR/workspace"
  TOKEN="ocg_$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cat > "$CONFIG_FILE" << JSONEOF
{
  "gateway": {
    "auth": {
      "token": "$TOKEN"
    }
  }
}
JSONEOF
  chmod 600 "$CONFIG_FILE"
  # Also save to alfred dir so containers can read it
  mkdir -p "${ALFRED_DIR}/.openclaw"
  cp "$CONFIG_FILE" "$ALFRED_CONFIG"
  echo "Token created: ${TOKEN:0:8}..."
else
  echo "Existing token found at $CONFIG_FILE"
fi

# Generate service file with correct paths
mkdir -p "$(dirname "$SERVICE_DST")"
cat > "$SERVICE_DST" << EOF
[Unit]
Description=OpenClaw Gateway for NanoClaw/Alfred (Paperclip integration)
After=network.target

[Service]
Type=simple
WorkingDirectory=${ALFRED_DIR}
ExecStart=${NODE_BIN} ${SCRIPT_DIR}/openclaw-gateway.cjs
Restart=always
RestartSec=5
StandardOutput=append:${ALFRED_DIR}/logs/openclaw-gateway.log
StandardError=append:${ALFRED_DIR}/logs/openclaw-gateway.log
Environment=OPENCLAW_GATEWAY_PORT=18789

[Install]
WantedBy=default.target
EOF

echo "Service file written to $SERVICE_DST"

# Reload and enable
systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user start "$SERVICE_NAME"

echo ""
echo "=== Gateway Status ==="
systemctl --user status "$SERVICE_NAME" --no-pager || true

echo ""
echo "=== Health Check ==="
sleep 1
curl -sf http://localhost:18789/ && echo "Gateway is healthy!"

TOKEN_PREVIEW=$(node -e "
try {
  const t = JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8')).gateway.auth.token;
  console.log(t.slice(0,8)+'...');
} catch(e) { console.log('error reading token'); }" 2>/dev/null)

echo ""
echo "Gateway token: $TOKEN_PREVIEW (full token in $CONFIG_FILE)"
echo ""
echo "=== Done! ==="
echo "The gateway is now running on ws://127.0.0.1:18789"
echo "Use this URL when creating a Paperclip invite for Alfred."
