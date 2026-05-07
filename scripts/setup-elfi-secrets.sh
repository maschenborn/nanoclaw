#!/usr/bin/env bash
# setup-elfi-secrets.sh — Bootstrap LAZI/Elfi credentials from briefing.
#
# Reads credentials from elfi.md, then:
#   1. Creates OneCLI vault secrets (audit trail; some auto-inject for single-token APIs)
#   2. Mirrors values into nanoclaw/.env so skills can read them at runtime
#      (OneCLI vault is write-only — env is the runtime source)
#   3. Adds the org-wide lazi-maschenborn SSH key to elfi-ssh/ + ssh config alias
#   4. Refreshes data/env/env mirror so the Elfi container picks them up on next spawn
#
# Idempotent: re-running skips OneCLI secrets that already exist (matched by name)
# and overwrites .env entries in place rather than appending duplicates.
#
# Usage:
#   bash scripts/setup-elfi-secrets.sh              # uses default ./elfi.md
#   bash scripts/setup-elfi-secrets.sh /path/to/briefing.md
#
# After running, DELETE elfi.md — secrets are persisted elsewhere.

set -euo pipefail

NANOCLAW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIEFING="${1:-${NANOCLAW_DIR}/elfi.md}"
ENV_FILE="${NANOCLAW_DIR}/.env"
ENV_MIRROR="${NANOCLAW_DIR}/data/env/env"
SSH_DIR="${NANOCLAW_DIR}/data/elfi-ssh"

if [ ! -f "$BRIEFING" ]; then
  echo "ERROR: briefing not found at $BRIEFING" >&2
  exit 1
fi

if ! command -v onecli >/dev/null 2>&1; then
  echo "ERROR: onecli not found in PATH" >&2
  exit 1
fi

echo "── reading briefing: $BRIEFING"
echo "── nanoclaw dir:     $NANOCLAW_DIR"
echo

# ─── helpers ────────────────────────────────────────────────────────────────

# env_set KEY VALUE — set or replace in .env (escapes special chars)
env_set() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # Use a temp file to avoid sed delim issues with values containing /,&,etc.
    local tmp
    tmp=$(mktemp)
    awk -v k="$key" -v v="$value" -F= '
      $1==k { print k "=" v; next }
      { print }
    ' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
  echo "  env  $key (length=${#value})"
}

# onecli_secret_exists NAME — return 0 if exists, 1 else
onecli_secret_exists() {
  local name="$1"
  onecli secrets list 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if any(s.get('name')=='$name' for s in d.get('data',[])) else 1)"
}

# onecli_create NAME HOST_PATTERN HEADER_NAME VALUE
onecli_create() {
  local name="$1" host="$2" header="$3" value="$4"
  if onecli_secret_exists "$name"; then
    echo "  vault [skip — exists]  $name"
    return 0
  fi
  if onecli secrets create \
       --name "$name" \
       --type generic \
       --host-pattern "$host" \
       --header-name "$header" \
       --value "$value" >/dev/null 2>&1; then
    echo "  vault $name (host=$host, header=$header)"
  else
    echo "  vault [FAIL]  $name — onecli rejected (run manually to see error)" >&2
  fi
}

# ─── extract values from briefing via embedded Python ──────────────────────

# Single python pass: returns shell-eval'able assignments. Handles multi-line
# values (private keys, JSON blocks). Anything not present in briefing is
# emitted as an empty string — caller checks before use.
eval "$(python3 - "$BRIEFING" <<'PYEOF'
import re, sys, shlex
src = open(sys.argv[1]).read()

def grep_kv(key):
    """Match `KEY=VALUE` on a line (possibly inside a code fence)."""
    m = re.search(rf'(?m)^{re.escape(key)}=(.+)$', src)
    return m.group(1).rstrip() if m else ''

def grep_block(start_marker, end_marker):
    """Capture text between two markers, exclusive."""
    pat = re.escape(start_marker) + r'(.+?)' + re.escape(end_marker)
    m = re.search(pat, src, re.DOTALL)
    return m.group(1).strip() if m else ''

def emit(name, value):
    # shell-quote so multi-line / special chars survive eval
    sys.stdout.write(f'{name}={shlex.quote(value)}\n')

# Supabase (§12.1)
emit('SUPABASE_URL',                grep_kv('NEXT_PUBLIC_SUPABASE_URL'))
emit('SUPABASE_ANON_KEY',           grep_kv('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
emit('SUPABASE_SERVICE_ROLE_KEY',   grep_kv('SUPABASE_SERVICE_ROLE_KEY'))
emit('SUPABASE_DB_PASSWORD',        grep_kv('DB_PASSWORD'))
emit('SUPABASE_DATABASE_URL',       grep_kv('DATABASE_URL'))
emit('SUPABASE_DIRECT_URL',         grep_kv('DIRECT_URL'))

# Cloudinary (§12.2)
emit('CLOUDINARY_CLOUD_NAME',  re.search(r'Cloud Name:\s*(\S+)', src).group(1) if re.search(r'Cloud Name:\s*(\S+)', src) else '')
emit('CLOUDINARY_API_KEY',     re.search(r'API Key:\s*(\S+)', src).group(1) if re.search(r'API Key:\s*(\S+)', src) else '')
emit('CLOUDINARY_API_SECRET',  re.search(r'API Secret:\s*(\S+)', src).group(1) if re.search(r'API Secret:\s*(\S+)', src) else '')

# Vercel (§12.3)
emit('VERCEL_TOKEN', grep_kv('VERCEL_TOKEN'))

# Google OAuth (§12.4) — refresh token already in OneCLI from earlier session
# We don't re-create that here; we just keep the bundle as env mirror.
m = re.search(r'Hauptaccount \(token\.json\):\s*\n([0-9A-Za-z/_\-]+)', src)
emit('LAZI_GOOGLE_REFRESH_TOKEN_MAIN', m.group(1).strip() if m else '')
m = re.search(r'Lazi-Bot \(token-lazi-bot\.json\):\s*\n([0-9A-Za-z/_\-]+)', src)
emit('LAZI_GOOGLE_REFRESH_TOKEN_BOT',  m.group(1).strip() if m else '')
m = re.search(r'Client ID:\s*(\S+)', src)
emit('LAZI_GOOGLE_CLIENT_ID',     m.group(1) if m else '')
m = re.search(r'Client Secret:\s*(\S+)', src)
emit('LAZI_GOOGLE_CLIENT_SECRET', m.group(1) if m else '')

# AI keys (§12.5)
emit('LAZI_GEMINI_API_KEY',  grep_kv('GEMINI_API_KEY'))
emit('LAZI_OPENAI_API_KEY',  grep_kv('OPENAI_API_KEY'))

# Resend (§12.6) — Elfi-specific (claude@aschenborn.dev sender)
emit('RESEND_LAZI_API_KEY',  grep_kv('RESEND_API_KEY'))

# MOCO (§12.7)
emit('MOCO_URL_LAZI',     grep_kv('MOCO_URL'))
emit('MOCO_API_KEY_LAZI', grep_kv('MOCO_API_KEY'))

# Lazistation / DSM (§12.8)
m = re.search(r'DSM-Login-Pw:\s*(\S+)', src)
emit('LAZISTATION_DSM_PW', m.group(1) if m else '')

# SSH keys (§12.9) — extract the org-wide id_ed25519_lazi private + public
m = re.search(r'Public:\s*\n```\n(ssh-ed25519 [^\n]+)\n```', src)
emit('SSH_LAZI_PUB', m.group(1) if m else '')
m = re.search(r'Private:\s*\n```\n(-----BEGIN OPENSSH PRIVATE KEY-----.*?-----END OPENSSH PRIVATE KEY-----)\n```', src, re.DOTALL)
emit('SSH_LAZI_PRIV', m.group(1) if m else '')

# Hetzner (§12.10)
m = re.search(r'Customer-Number:\s*(\S+)', src)
emit('HETZNER_CUSTOMER',   m.group(1) if m else '')
m = re.search(r'Account-Pw:\s*(\S+)', src)
emit('HETZNER_PW',         m.group(1) if m else '')
m = re.search(r'TOTP-Secret:\s*(\S+)', src)
emit('HETZNER_TOTP_SECRET',m.group(1) if m else '')
m = re.search(r'Nuernberg root:\s*(\S+)', src)
emit('HETZNER_ROOT_NBG',   m.group(1) if m else '')
m = re.search(r'Miami root:\s*(\S+)', src)
emit('HETZNER_ROOT_MIA',   m.group(1) if m else '')

# Coolify (§12.11)
m = re.search(r'Direct URL:\s*(\S+)', src)
emit('COOLIFY_URL_INTERNAL', m.group(1) if m else '')
m = re.search(r'Public URL:\s*(\S+)', src)
emit('COOLIFY_URL_PUBLIC',   m.group(1) if m else '')
m = re.search(r'Coolify[^\n]*\nDirect URL:.*?Email:\s*(\S+)', src, re.DOTALL)
emit('COOLIFY_EMAIL',        m.group(1) if m else '')
m = re.search(r'Coolify[^\n]*\nDirect URL:.*?Password:\s*(\S+)', src, re.DOTALL)
emit('COOLIFY_PW',           m.group(1) if m else '')
PYEOF
)"

echo

# ─── 1. OneCLI vault — single-token APIs that auto-inject ─────────────────

echo "── OneCLI vault: auto-inject secrets"

[ -n "$VERCEL_TOKEN" ] && \
  onecli_create "Vercel (Elfi)" "api.vercel.com" "Authorization" "Bearer $VERCEL_TOKEN"

[ -n "$LAZI_GEMINI_API_KEY" ] && \
  onecli_create "Gemini API (LAZI)" "generativelanguage.googleapis.com" "x-goog-api-key" "$LAZI_GEMINI_API_KEY"

# OpenAI: Alfred has one already with same hostpattern. Skip — Elfi can use Alfred's
# (or we can swap to selective mode later). Storing duplicate would conflict.
echo "  vault [skip — host conflict with Alfred's]  OpenAI API"

# Resend: Alfred uses .env-based RESEND_API_KEY for chat-sdk. To avoid header
# conflict on api.resend.com, store Elfi's key as a vault-only bundle (no
# auto-inject, placeholder header).
[ -n "$RESEND_LAZI_API_KEY" ] && \
  onecli_create "Resend (Elfi, claude@aschenborn.dev)" "api.resend.com" "X-Stored-Only" "$RESEND_LAZI_API_KEY"

echo

# ─── 2. OneCLI vault — multi-value bundles (audit trail, env-mirrored) ────

echo "── OneCLI vault: bundle secrets (vault-only, runtime via env)"

# Supabase bundle: 6 values in one bundle keyed at the project host.
SUPABASE_BUNDLE=$(python3 -c "
import json, sys
d = {
    'url': '$SUPABASE_URL',
    'anon_key': '$SUPABASE_ANON_KEY',
    'service_role_key': '$SUPABASE_SERVICE_ROLE_KEY',
    'db_password': '$SUPABASE_DB_PASSWORD',
    'database_url': '$SUPABASE_DATABASE_URL',
    'direct_url': '$SUPABASE_DIRECT_URL',
    'project_id': 'yrhjahpxwyflwoaqtgrt',
}
import base64
print(base64.b64encode(json.dumps(d).encode()).decode())
")
[ -n "$SUPABASE_URL" ] && \
  onecli_create "Supabase (LAZI / DiME-Trainer / lazi.works)" \
    "yrhjahpxwyflwoaqtgrt.supabase.co" "X-Stored-Only" "$SUPABASE_BUNDLE"

# Cloudinary bundle
CLOUDINARY_BUNDLE=$(python3 -c "
import json, base64
print(base64.b64encode(json.dumps({
    'cloud_name': '$CLOUDINARY_CLOUD_NAME',
    'api_key':    '$CLOUDINARY_API_KEY',
    'api_secret': '$CLOUDINARY_API_SECRET',
}).encode()).decode())
")
[ -n "$CLOUDINARY_CLOUD_NAME" ] && \
  onecli_create "Cloudinary (lazi)" "api.cloudinary.com" "X-Stored-Only" "$CLOUDINARY_BUNDLE"

# Hetzner bundle
HETZNER_BUNDLE=$(python3 -c "
import json, base64
print(base64.b64encode(json.dumps({
    'customer':   '$HETZNER_CUSTOMER',
    'account_pw': '$HETZNER_PW',
    'totp_secret':'$HETZNER_TOTP_SECRET',
    'nbg_root':   '$HETZNER_ROOT_NBG',
    'mia_root':   '$HETZNER_ROOT_MIA',
}).encode()).decode())
")
[ -n "$HETZNER_CUSTOMER" ] && \
  onecli_create "Hetzner Account" "console.hetzner.cloud" "X-Stored-Only" "$HETZNER_BUNDLE"

# Coolify bundle
COOLIFY_BUNDLE=$(python3 -c "
import json, base64
print(base64.b64encode(json.dumps({
    'url_internal': '$COOLIFY_URL_INTERNAL',
    'url_public':   '$COOLIFY_URL_PUBLIC',
    'email':        '$COOLIFY_EMAIL',
    'password':     '$COOLIFY_PW',
}).encode()).decode())
")
[ -n "$COOLIFY_URL_PUBLIC" ] && \
  onecli_create "Coolify (Hetzner Yakutsk)" "coolify.teamorange.dev" "X-Stored-Only" "$COOLIFY_BUNDLE"

# Lazistation DSM password bundle (small but uniform pattern)
[ -n "$LAZISTATION_DSM_PW" ] && \
  onecli_create "Lazistation DSM admin" "lazistation.synology.me" "X-Stored-Only" "$LAZISTATION_DSM_PW"

# MOCO LAZI — Alfred already has 'MOCO API Key' in vault. Don't duplicate; the
# LAZI MOCO is the same agency (teamorange.mocoapp.com), same key — Alfred's
# entry serves both agents. No new vault secret here.
echo "  vault [skip — same as Alfred's existing 'MOCO API Key']  MOCO"

echo

# ─── 3. .env mirror for runtime ────────────────────────────────────────────

echo "── .env mirror (so skills can read at runtime — vault is write-only)"

env_set "SUPABASE_URL"               "$SUPABASE_URL"
env_set "SUPABASE_ANON_KEY"          "$SUPABASE_ANON_KEY"
env_set "SUPABASE_SERVICE_ROLE_KEY"  "$SUPABASE_SERVICE_ROLE_KEY"
env_set "SUPABASE_DB_PASSWORD"       "$SUPABASE_DB_PASSWORD"
env_set "SUPABASE_DATABASE_URL"      "$SUPABASE_DATABASE_URL"
env_set "SUPABASE_DIRECT_URL"        "$SUPABASE_DIRECT_URL"

env_set "CLOUDINARY_CLOUD_NAME" "$CLOUDINARY_CLOUD_NAME"
env_set "CLOUDINARY_API_KEY"    "$CLOUDINARY_API_KEY"
env_set "CLOUDINARY_API_SECRET" "$CLOUDINARY_API_SECRET"

env_set "VERCEL_TOKEN"           "$VERCEL_TOKEN"

env_set "LAZI_GEMINI_API_KEY"    "$LAZI_GEMINI_API_KEY"
env_set "LAZI_OPENAI_API_KEY"    "$LAZI_OPENAI_API_KEY"

env_set "RESEND_LAZI_API_KEY"    "$RESEND_LAZI_API_KEY"

env_set "LAZI_GOOGLE_CLIENT_ID"           "$LAZI_GOOGLE_CLIENT_ID"
env_set "LAZI_GOOGLE_CLIENT_SECRET"       "$LAZI_GOOGLE_CLIENT_SECRET"
env_set "LAZI_GOOGLE_REFRESH_TOKEN_MAIN"  "$LAZI_GOOGLE_REFRESH_TOKEN_MAIN"
env_set "LAZI_GOOGLE_REFRESH_TOKEN_BOT"   "$LAZI_GOOGLE_REFRESH_TOKEN_BOT"

env_set "MOCO_URL_LAZI"      "$MOCO_URL_LAZI"
env_set "MOCO_API_KEY_LAZI"  "$MOCO_API_KEY_LAZI"

env_set "LAZISTATION_DSM_PW"  "$LAZISTATION_DSM_PW"

env_set "HETZNER_CUSTOMER"     "$HETZNER_CUSTOMER"
env_set "HETZNER_PW"           "$HETZNER_PW"
env_set "HETZNER_TOTP_SECRET"  "$HETZNER_TOTP_SECRET"
env_set "HETZNER_ROOT_NBG"     "$HETZNER_ROOT_NBG"
env_set "HETZNER_ROOT_MIA"     "$HETZNER_ROOT_MIA"

env_set "COOLIFY_URL_INTERNAL"  "$COOLIFY_URL_INTERNAL"
env_set "COOLIFY_URL_PUBLIC"    "$COOLIFY_URL_PUBLIC"
env_set "COOLIFY_EMAIL"         "$COOLIFY_EMAIL"
env_set "COOLIFY_PW"            "$COOLIFY_PW"

# Sync to data/env/env mirror (which the agent containers read)
mkdir -p "$(dirname "$ENV_MIRROR")"
cp "$ENV_FILE" "$ENV_MIRROR"
echo "  copied .env → $ENV_MIRROR"

echo

# ─── 4. SSH keys — org-wide id_ed25519_lazi ───────────────────────────────

echo "── SSH: install id_ed25519_lazi (org-wide lazi-maschenborn access)"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ -n "$SSH_LAZI_PRIV" ]; then
  printf '%s\n' "$SSH_LAZI_PRIV" > "$SSH_DIR/id_ed25519_lazi"
  chmod 600 "$SSH_DIR/id_ed25519_lazi"
  echo "  $SSH_DIR/id_ed25519_lazi (chmod 600)"
fi
if [ -n "$SSH_LAZI_PUB" ]; then
  printf '%s\n' "$SSH_LAZI_PUB" > "$SSH_DIR/id_ed25519_lazi.pub"
  chmod 644 "$SSH_DIR/id_ed25519_lazi.pub"
  echo "  $SSH_DIR/id_ed25519_lazi.pub"
fi

# Add ssh config alias for org-wide access (in addition to the existing
# github.com-lazi alias which is the per-repo deploy key for obsidian-lazi)
if ! grep -q '^Host github.com-lazi-org' "$SSH_DIR/config" 2>/dev/null; then
  cat >> "$SSH_DIR/config" <<'EOF'

# Org-wide deploy/personal key for lazi-maschenborn org repos.
# Use URL: git@github.com-lazi-org:lazi-maschenborn/<repo>.git
Host github.com-lazi-org
  HostName github.com
  User git
  IdentityFile /workspace/extra/elfi-ssh/id_ed25519_lazi
  IdentitiesOnly yes
EOF
  echo "  ssh config alias 'github.com-lazi-org' appended"
else
  echo "  ssh config alias 'github.com-lazi-org' already present"
fi

# known_hosts is preserved from earlier setup (github.com fingerprint)

echo

# ─── done ──────────────────────────────────────────────────────────────────

cat <<EOF
── done ───────────────────────────────────────────────────────────────────

Next steps:

1. Verify the OneCLI vault entries:
     onecli secrets list

2. Review .env was updated correctly:
     grep -E '^(SUPABASE|CLOUDINARY|LAZI_|VERCEL|RESEND_LAZI|HETZNER|COOLIFY|LAZISTATION|MOCO_)' "$ENV_FILE" | sed 's/=.*/=<...>/'

3. Kill Elfi's running container so the next message-spawn picks up the new env:
     docker kill \$(docker ps -q --filter 'name=nanoclaw-v2-lazi') 2>/dev/null || true

4. **Delete the briefing now — secrets are persisted in vault + .env:**
     shred -uz "$BRIEFING"

5. Test by sending Elfi a DM in Google Chat referencing one of the new skills:
     "Schau im LAZI-Vault was zu Astro/Tailwind drinsteht"   (obsidian-lazi)
     "Wer ist in Klasse DIME 555?"                          (dime-unterricht)
     "Wie ist der Zwei-Tier-Status auf lazi.works?"          (lazi-works)
EOF
