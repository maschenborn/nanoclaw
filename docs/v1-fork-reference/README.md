# v1 fork reference

Preserved content from v1 install (`/home/maschenborn/orchester/alfred/`) that didn't migrate to v2. Use as reference when re-creating these capabilities in v2.

## resend-inbox/

The v1 Resend Inbox group (`inbox@resend`). v2 migration deferred this — to re-add:

1. Run `/add-resend` to install the channel adapter and configure credentials
2. Set in `.env`: `RESEND_API_KEY`, `RESEND_FROM_ADDRESS=alfred@aschenborn.dev`, `RESEND_FROM_NAME=Alfred`
3. Configure Resend webhook URL on resend.com to point at v2's HTTP listener (v1's Unix socket path is gone)
4. Run `/manage-channels` to wire the new resend channel to a fresh agent group
5. Use `CLAUDE.md` here as the seed for the new group's `CLAUDE.local.md` (strip v1 boilerplate same way Phase 2 of `/migrate-from-v1` did for `whatsapp_main`)

The Resend API key is **not** in OneCLI vault despite what `orchester/CLAUDE.md` claims (only 5 secrets exist: Anthropic, OpenAI, MOCO, HomeAssistant, Paperclip). Get a fresh key from resend.com when porting.

## internal-dreams/

The v1 "Alfred Dreams" group — synthetic `alfred-dreams@internal` channel for autonomous nightly sessions. Driven by a daily 3am cron task: *"Du bist Alfred im autonomen Traum-Modus..."*. v2 has no `internal` channel adapter, so the migration skipped it.

`dream-log.md` contains real observations from past nightly runs — keep this around.

To re-create in v2, you have a few patterns to choose from:
- **Recurring task on the WhatsApp agent** with output suppressed (a v2-native equivalent — task fires at 3am, agent does dream work, no chat output)
- **CLI-channel session** triggered by an external cron — runs through `claw --pipe` against a dedicated agent group
- **Custom internal channel adapter** mirroring v1's pattern — most work, most fidelity to v1
