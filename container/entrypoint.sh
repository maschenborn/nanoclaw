#!/bin/bash
# NanoClaw agent container entrypoint.
#
# The host passes initial session parameters via stdin as a single JSON blob,
# then the agent-runner opens the session DBs at /workspace/{inbound,outbound}.db
# and enters its poll loop. All further IO flows through those DBs.
#
# We capture stdin to a file first so /tmp/input.json is available for
# post-mortem inspection if the container exits unexpectedly, then exec bun
# so that bun becomes PID 1's direct child (under tini) and receives signals.

set -e

# Optional: wire a Mittwald-SSH key into ~/.ssh if the agent has one mounted.
# `mw container port-forward` shells out to ssh under the hood; without a
# matching ~/.ssh/config entry it picks up no identity and fails with
# "Permission denied (password,publickey)". Mount layout convention:
# /workspace/extra/<agent>-mittwald-ssh/id_ed25519 (chmod 600 on the host).
if [ -f /workspace/extra/elfi-mittwald-ssh/id_ed25519 ]; then
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  cp /workspace/extra/elfi-mittwald-ssh/id_ed25519 "$HOME/.ssh/id_ed25519_mittwald"
  chmod 600 "$HOME/.ssh/id_ed25519_mittwald"
  cat > "$HOME/.ssh/config" <<'EOF'
Host *.project.host
    StrictHostKeyChecking accept-new
    UserKnownHostsFile ~/.ssh/known_hosts
    IdentityFile ~/.ssh/id_ed25519_mittwald
    IdentitiesOnly yes
EOF
  chmod 600 "$HOME/.ssh/config"
fi

cat > /tmp/input.json

exec bun run /app/src/index.ts < /tmp/input.json
