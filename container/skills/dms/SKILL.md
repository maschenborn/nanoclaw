---
name: dms
description: File documents into PhoenixDMS — Michael's local Document Management System on the NAS. Use whenever a document needs to be archived: (a) an inbound email is addressed to **phoenix@aschenborn.dev** (the dedicated DMS-route alias — the threadId looks like `resend:phoenix@aschenborn.dev:<hash>`), (b) Michael shares a PDF (or other document) on WhatsApp / email and asks to "leg das ab", "archive that", "ins DMS", "in Phoenix speichern", "filed das", or similar, (c) Michael forwards a Rechnung/invoice/Vertrag/Beleg with intent to keep it. Authentication is handled transparently by the OneCLI gateway — no token in your code.
---

# PhoenixDMS Skill

Michael runs a Document Management System on his NAS. You file documents into it via a single ingest endpoint:

```
http://192.168.10.10:3001/api/email/ingest
```

The endpoint is shaped around an **email-with-attachments** schema, but you also use it for non-email sources (WhatsApp PDFs, manual uploads) by constructing a synthetic email payload — see "Construct payload from non-email source" below.

A `PhoenixDMS Ingest Key` is stored in OneCLI with host-pattern `192.168.10.10` and header `X-Ingest-Key`. Any HTTP request you make to that host gets the header injected automatically — you just `curl` / `fetch` without any auth code.

## When to use this skill

Three trigger paths:

### Trigger 1 — Inbound email to phoenix@aschenborn.dev

The chat-sdk message you receive does NOT include the recipient. The threadId encodes the **sender**, not the recipient (`resend:<senderAddress>:<msgIdHash>`) — you cannot detect phoenix@-bound mails from the threadId alone.

**To check the recipient**, call Resend's API with the inbound message's `id` (the chat-sdk-Message `id` field IS the Resend email_id):

```bash
curl -s "https://api.resend.com/emails/receiving/$EMAIL_ID" \
  -H "Authorization: Bearer $RESEND_API_KEY" | jq '{from, to, subject}'
```

If `to` includes `phoenix@aschenborn.dev` (case-insensitive substring match — recipient may be the only `to` value, or one of several): **this is a DMS-route mail. File it autonomously, no follow-up question, no reply to sender.**

If `to` is `alfred@aschenborn.dev` or any other address: do NOT use this skill autonomously. Treat as conversation per the main CLAUDE.local.md "Hard rule — NEVER auto-reply".

**Fetching the attachment bytes** — chat-sdk only carries metadata, you need to download via Resend:

```bash
# 1. List attachments with download URLs
curl -s "https://api.resend.com/emails/receiving/$EMAIL_ID/attachments" \
  -H "Authorization: Bearer $RESEND_API_KEY" > /tmp/atts.json
jq -r '.data[] | "\(.id) \(.filename) \(.download_url)"' /tmp/atts.json

# 2. Download each, base64-encode for the ingest payload
for url in $(jq -r '.data[].download_url' /tmp/atts.json); do
  curl -s "$url" -o /tmp/$(basename "$url" | head -c 40)
done
```

`$RESEND_API_KEY` is in the container env (sourced from the host `.env`). If it's missing, you have no path to retrieve attachments — tell Michael, don't fabricate the file contents.

### Trigger 2 — WhatsApp/email document with archive intent

Michael shares a PDF on WhatsApp (or sends one via email to `alfred@`) and signals intent to archive: "leg das ab", "ins DMS", "archive das mal", "Rechnung filed", "kannst du das in Phoenix tun?", etc. Construct a synthetic email payload (see below) and POST it.

If unsure whether he wants it filed *or* discussed first, **ask once** — once he confirms, file it without further confirmation prompts.

### Trigger 3 — Explicit DMS command

Michael says "DMS", "Phoenix", "archivieren" without ambiguity. Same flow as Trigger 2.

## Hard rules

1. **Never invent or alter document content.** What goes in the DMS is exactly what arrived. Don't summarize the body into the `text` field — paste it verbatim.
2. **Never file without a reasonable `from` and `subject`.** If those are missing on the source, fall back to sensible defaults (see "Construct payload from non-email source") rather than empty strings — the DMS rejects empty `from` / `subject`.
3. **One document = one ingest call.** Don't batch unrelated docs into a synthetic email. Each archive item gets its own POST.
4. **Don't delete the source after filing** (the WhatsApp PDF, the email). Filing is additive; the message stays in the conversation history.
5. **Don't auto-file conversational mails to alfred@** — only `phoenix@` recipients OR explicit user intent triggers archival.
6. **Tell Michael what you filed.** One short line: file name, sender, subject. Never just "filed" — he needs to know what landed where.

## Endpoint reference

### POST `/api/email/ingest`

**Required headers** (auth is auto-injected, you only set Content-Type):

```
Content-Type: application/json
X-Ingest-Key: <auto-injected by OneCLI for host 192.168.10.10>
```

**Body schema** (same shape the bridge used — `/opt/orchester/services/phoenix-email-bridge/src/index.ts:56`):

```json
{
  "from":         "Sender Name <sender@example.com>",
  "to":           "phoenix@aschenborn.dev",
  "subject":      "Rechnung Nr. 12345",
  "text":         "plain-text body of the email",
  "html":         "<p>HTML body, optional</p>",
  "attachments": [
    {
      "filename":     "Rechnung.pdf",
      "content_type": "application/pdf",
      "content":      "<base64-encoded file bytes>"
    }
  ],
  "email_id":     "optional Resend email id, omit if synthetic"
}
```

**Response on success**: `200 OK` with a JSON body confirming the document was indexed. Include the relevant pieces of that response when you tell Michael.

**Response on error**:
- `400 Missing required fields: from, subject` — required fields blank or omitted. Re-check your payload.
- `401 Unauthorized` — OneCLI didn't inject the header. Check secret with `onecli secrets list` (the secret name is `PhoenixDMS Ingest Key`). Tell Michael; don't loop.
- `5xx` — DMS is down. Try `curl -s http://192.168.10.10:3001/api/health` for a quick aliveness check. If it's down, tell Michael and don't retry indefinitely.

## Construct payload from non-email source

When the source is a WhatsApp PDF (or anything not email-shaped), build a synthetic envelope:

| Field | What to fill in |
|---|---|
| `from` | Best-known origin. If Michael shared it, `Michael Aschenborn <m.aschenborn@gmail.com>`. If he says "Rechnung von Vodafone", set `from` to `"Vodafone (via Michael) <m.aschenborn@gmail.com>"` so DMS-classification can still group by Michael but read context. |
| `to` | Always `phoenix@aschenborn.dev` — that's the DMS-route address. |
| `subject` | Derive from filename + Michael's hint. E.g. file `2026-04-Rechnung.pdf` + Michael said "von Vodafone" → `"Rechnung Vodafone 2026-04 (manuell via WhatsApp)"`. Avoid generic "Document" — DMS needs a meaningful subject. |
| `text` | Free-text from Michael, or a one-line stub: `"Manuell archiviert via Alfred (WhatsApp), DATUM"`. Do NOT leave empty. |
| `html` | Empty string `""`. |
| `attachments` | One entry per file. `filename` = original name. `content_type` = inferred from extension (.pdf → application/pdf, .jpg → image/jpeg, ...). `content` = base64 of the file bytes. |

## Reading WhatsApp attachments

When Michael sends a PDF on WhatsApp, the chat-sdk message your agent receives includes attachment metadata. The bytes themselves are written to a path in the session workspace — typically under `/workspace/extra/whatsapp-media/` (Michael's WhatsApp adapter persists files there).

Look in the inbound message JSON for an `attachments[]` field — each entry has `filename`, `mimeType` and a path or URL. Read the file via `fs.readFileSync(path)` (or `Bun.file(path).bytes()`), then base64-encode for the ingest call.

## Example — file an inbound phoenix@ email (Trigger 1)

The full inbound message is already in your context. The original payload (parsed from the chat-sdk envelope) is structured roughly like:

```js
{
  "author": { "userId": "thomas.reusser@dinnebiergruppe.de", ... },
  "text": "<plain-text body>",
  "formatted": { ... },
  "attachments": [{ "type": "file", "name": "Gutachten.pdf", "mimeType": "application/pdf" }, ...]
}
```

The recipient comes from the threadId (`resend:phoenix@aschenborn.dev:hash`). Reconstruct the ingest payload from those fields. The attachment bytes are NOT in the chat-sdk message — for resend inbound, they're available via Resend's attachment-download URL (the `phoenix-email-bridge` source does this in two steps: `GET /emails/receiving/<id>/attachments` then download each `download_url`). If you don't have the email_id and download URLs, ask Michael to forward the original — or proceed with an empty attachments array and a note in `text` that the original PDFs were not retrievable.

```bash
PAYLOAD=$(jq -n --arg from "Thomas Reusser <thomas.reusser@dinnebiergruppe.de>" \
  --arg to "phoenix@aschenborn.dev" \
  --arg subject "Leasingrückgabeprotokoll" \
  --arg text "..." \
  --arg b64a "$(base64 -w 0 /workspace/agent/Gutachten.pdf)" \
  --arg b64b "$(base64 -w 0 /workspace/agent/Rueckgabeprotokoll.pdf)" \
  '{from:$from, to:$to, subject:$subject, text:$text, html:"",
    attachments:[
      {filename:"Gutachten.pdf",content_type:"application/pdf",content:$b64a},
      {filename:"Rueckgabeprotokoll.pdf",content_type:"application/pdf",content:$b64b}
    ]}')

curl -s -X POST http://192.168.10.10:3001/api/email/ingest \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD"
```

## Example — file a WhatsApp PDF (Trigger 2)

Michael sent `Stromrechnung_2026-04.pdf` and wrote *"leg das ab"*.

```bash
FILE=/workspace/extra/whatsapp-media/Stromrechnung_2026-04.pdf
PAYLOAD=$(jq -n \
  --arg from "Michael Aschenborn <m.aschenborn@gmail.com>" \
  --arg to "phoenix@aschenborn.dev" \
  --arg subject "Stromrechnung 2026-04 (manuell via WhatsApp)" \
  --arg text "Manuell archiviert via Alfred, $(date -I)" \
  --arg b64 "$(base64 -w 0 "$FILE")" \
  --arg fn "$(basename "$FILE")" \
  '{from:$from, to:$to, subject:$subject, text:$text, html:"",
    attachments:[{filename:$fn, content_type:"application/pdf", content:$b64}]}')

curl -s -X POST http://192.168.10.10:3001/api/email/ingest \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD"
```

## Confirmation message back to Michael

Format for WhatsApp:

```
*📁 Im DMS abgelegt*
• <Datei-Name>
_<Sender>, "<Subject>"_
```

Examples:

- `*📁 Im DMS abgelegt* — Stromrechnung_2026-04.pdf (Vodafone, "Rechnung 12345")`
- `*📁 2 Anhänge im DMS abgelegt* — Gutachten.pdf + Rueckgabeprotokoll.pdf (Thomas Reusser, "Leasingrückgabe")`

If filing failed: tell Michael WHY in one line (auth / DMS down / payload), don't try to invent a fix.

## Failure handling

- **DMS unreachable** (`curl: (28)` timeout, `5xx`): tell Michael — *"DMS scheint gerade nicht erreichbar (Status XYZ). Hab nichts hochgeladen — soll ich's später nochmal probieren?"*
- **Auth missing** (`401`): unusual — means OneCLI's secret was deleted or host-pattern mismatched. Tell Michael; ask him to verify with `onecli secrets list`.
- **Validation error** (`400`): you didn't construct the payload right. Check the response body, fix, retry.
- **Network from container blocked**: shouldn't happen — verify with `curl -s -m 3 http://192.168.10.10:3001/api/health` first; if 200, the path is reachable, the failure is in your call.

## What this skill does NOT do

- Read or list documents already in the DMS (no read API used here)
- Delete or modify existing DMS entries
- Tag, classify, or categorize — DMS does that itself based on subject + sender + content
- Send anything to anyone — confirmation back to Michael is via the normal message flow, not via email
