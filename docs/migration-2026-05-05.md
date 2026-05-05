# NanoClaw v1 → v2 migration — Alfred install

**Date:** 2026-05-05
**v1 path:** `/home/maschenborn/orchester/alfred` (kept read-only; not modified)
**v2 path:** `/home/maschenborn/orchester/alfred-v2`

## Outcome

Alfred runs on v2. WhatsApp DM with Michael routes through `nanoclaw-v2-3dd05aae.service`. Bot identifies as `Alfred` and replies on the WhatsApp main DM.

## Deterministic side (`migrate-v2.sh`)

Handoff status was `partial`. Deterministic steps that succeeded: env merge, DB seed (1 agent group, 1 messaging group, 1 wiring), group folder copy, session migration with conversation continuity (1 session, 2 recurring tasks ported, 1 skipped), Baileys keystore copy attempt, OneCLI healthy, Anthropic auth in vault, container image built, service switched.

Two deterministic steps failed: `2c-install-whatsapp` and `2c-install-resend` — both because the install scripts hardcode `git fetch origin channels` but this fork keeps the channels branch on `upstream` only. Fixed manually:

- `git fetch upstream channels providers`
- `git show upstream/channels:src/channels/{whatsapp,resend}.ts setup/{whatsapp-auth,groups}.ts > …`
- Appended `import './whatsapp.js'; import './resend.js';` to `src/channels/index.ts`
- `pnpm install @whiskeysockets/baileys@7.0.0-rc.9 qrcode pino @resend/chat-sdk-adapter` — note: `setup/install-whatsapp.sh` pins `6.17.16` but the upstream channel adapter requires 7.x; bumped manually
- WhatsApp keystore copied from `alfred/store/auth/` → `alfred-v2/store/auth/` (38 files)

## Non-deterministic side (`/migrate-from-v1`)

### Phase 0 — routing

Smoke test #1 surfaced two bugs:

- Baileys 7.x **fixes** the v1 LID quirk by translating `6554271117503@lid` → `491633456809@s.whatsapp.net` automatically. Existing messaging-group row was wired on the LID and never matched.
- Auto-registration of a fresh phone-JID messaging group bailed out because no owner/admin existed in `user_roles`.

Resolution (single SQL transaction): granted `owner` to `whatsapp:491633456809@s.whatsapp.net`, deleted the auto-created stub messaging group, swapped the wired row's `platform_id` from the LID to the phone JID. Smoke test #2 passed.

### Phase 1 — owner + access policy

- Owner: `whatsapp:491633456809@s.whatsapp.net`
- `unknown_sender_policy`: `public`

### Phase 2 — `groups/whatsapp_main/CLAUDE.local.md`

- Backed up to `CLAUDE.local.md.v1-backup`
- Stripped 200 lines of v1 boilerplate (Communication / Memory / Message Formatting / Admin Context / Authentication / Container Mounts / Managing Groups / Global Memory / Scheduling / Task Scripts) — all covered by v2 fragments now
- Inlined the full Sending Email + Google Workspace rules from v1's `groups/global/CLAUDE.md` (no v2 equivalent — v2 has no shared global file)
- Path fix: `/workspace/group/moco.md` → `/workspace/agent/moco.md`
- Result: 330 → 128 lines

### Phase 3 — container.json

`additionalMounts` matches v1 (obsidian + orchester, both rw). `Documents` was in `mount-allowlist.json` but the host path doesn't exist — removed from allowlist. Renamed agent group "Michael DM" → "Alfred" so the system-prompt addendum says "You are Alfred" instead of "You are Michael DM"; force-synced `groupName` and `assistantName` in container.json.

### Phase 4 — fork customizations + missing groups

v1 was 105 commits ahead of `upstream/main`. Most of those are source-level changes (warm-container, IPC pipeline, Baileys patches) that don't translate to v2's architecture. The portable items — custom container skills (`home-assistant`, `obsidian`, `capabilities`, `status`) — were already copied verbatim into `container/skills/` by the migration; verified identical to v1.

Two v1 groups deferred (didn't have v2 equivalents handy):

- **Resend Inbox** (`inbox@resend`) — needs `/add-resend` flow to wire properly. The Resend secret is **not** in OneCLI vault despite what `orchester/CLAUDE.md` claims (vault has Anthropic, OpenAI, MOCO, HomeAssistant, Paperclip — no Resend). Stashed under `docs/v1-fork-reference/resend-inbox/`.
- **Alfred Dreams** (`alfred-dreams@internal`) — synthetic internal channel that doesn't exist in v2. The 3am cron task was skipped during migration. Stashed under `docs/v1-fork-reference/internal-dreams/` including `dream-log.md`. To re-enable: pick a v2 pattern (recurring task on the WhatsApp agent with output suppressed, or CLI-channel scheduled session, or build a proper internal channel adapter).

Orphan `groups/internal_dreams/`, `groups/resend_inbox/`, and stray `groups/main/CLAUDE.local.md` were removed (already stashed; unwired in DB).

## Followups

- `/add-resend` whenever inbound email is needed back. Will need a fresh Resend API key and a webhook URL pointing at v2's HTTP listener (v1's Unix socket path is gone).
- Patch local `setup/install-whatsapp.sh` to detect `upstream/channels` automatically (the helper at `setup/lib/channels-remote.sh` exists but the install scripts don't source it). Optional — doesn't affect this install, just future re-runs.
- Patch local `setup/install-whatsapp.sh` baileys pin to track `7.0.0-rc.9` to match the upstream channel adapter. Otherwise re-running the script will downgrade and break the build.
- Decide what to do with Alfred Dreams. Keep `dream-log.md` accessible if/when the dream loop comes back.
