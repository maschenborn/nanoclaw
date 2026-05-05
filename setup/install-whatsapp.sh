#!/usr/bin/env bash
# Setup helper: install-whatsapp — bundles the preflight + install commands
# from the /add-whatsapp skill into one idempotent script so /new-setup can
# run them programmatically before continuing to QR/pairing-code auth.
#
# Copies the native Baileys WhatsApp adapter, its whatsapp-auth and groups
# setup steps in from the `channels` branch; appends the self-registration
# import; registers `groups` and `whatsapp-auth` entries in the setup STEPS
# map; installs the pinned @whiskeysockets/baileys + qrcode + pino packages;
# builds. All steps are safe to re-run. QR/pairing-code authentication
# stays in the skill — this script only handles the deterministic install.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Resolve which remote carries the `channels` branch. In this fork
# `origin` points at maschenborn/nanoclaw and `upstream` at qwibitai/nanoclaw,
# so the upstream-default `origin/channels` would fail.
# shellcheck source=lib/channels-remote.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/channels-remote.sh"
CHANNELS_REMOTE="$(resolve_channels_remote)"

echo "=== NANOCLAW SETUP: INSTALL_WHATSAPP ==="
echo "CHANNELS_REMOTE: $CHANNELS_REMOTE"

CHANNEL_FILES=(
  src/channels/whatsapp.ts
  setup/whatsapp-auth.ts
  setup/groups.ts
)

needs_install=false
for f in "${CHANNEL_FILES[@]}"; do
  [[ -f "$f" ]] || needs_install=true
done
grep -q "import './whatsapp.js';" src/channels/index.ts || needs_install=true
grep -q "groups: " setup/index.ts || needs_install=true
grep -q "'whatsapp-auth':" setup/index.ts || needs_install=true
grep -q '"@whiskeysockets/baileys"' package.json || needs_install=true
grep -q '"qrcode"' package.json || needs_install=true
grep -q '"pino"' package.json || needs_install=true
[[ -d node_modules/@whiskeysockets/baileys ]] || needs_install=true

if ! $needs_install; then
  echo "STATUS: already-installed"
  echo "=== END ==="
  exit 0
fi

echo "STEP: fetch-channels-branch"
git fetch "$CHANNELS_REMOTE" channels

echo "STEP: copy-files"
for f in "${CHANNEL_FILES[@]}"; do
  git show "$CHANNELS_REMOTE/channels:$f" > "$f"
done

echo "STEP: register-import"
if ! grep -q "import './whatsapp.js';" src/channels/index.ts; then
  printf "import './whatsapp.js';\n" >> src/channels/index.ts
fi

echo "STEP: register-setup-steps"
if ! grep -q "'whatsapp-auth':" setup/index.ts; then
  awk '
    { print }
    /register: \(\) => import/ && !inserted {
      print "  groups: () => import('\''./groups.js'\''),"
      print "  '\''whatsapp-auth'\'': () => import('\''./whatsapp-auth.js'\''),"
      inserted = 1
    }
  ' setup/index.ts > setup/index.ts.tmp && mv setup/index.ts.tmp setup/index.ts
fi

echo "STEP: pnpm-install"
# Baileys version must match upstream/channels' package.json — a downgrade
# breaks the build because the channels-branch whatsapp.ts uses 7.x APIs
# (notably the LID-mapping signal repository). Read the pin out of the
# branch we just copied from so we never drift.
BAILEYS_PIN="$(git show "$CHANNELS_REMOTE/channels:package.json" \
  | sed -n 's/.*"@whiskeysockets\/baileys"[[:space:]]*:[[:space:]]*"\^\?\([^"]*\)".*/\1/p' \
  | head -n1)"
: "${BAILEYS_PIN:=7.0.0-rc.9}"
echo "BAILEYS_PIN: $BAILEYS_PIN"
pnpm install "@whiskeysockets/baileys@$BAILEYS_PIN" qrcode@1.5.4 @types/qrcode@1.5.6 pino@9.6.0

echo "STEP: pnpm-build"
pnpm run build

echo "STATUS: installed"
echo "=== END ==="
