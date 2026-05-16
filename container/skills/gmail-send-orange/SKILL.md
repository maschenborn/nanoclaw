---
name: gmail-send-orange
description: **Timos einzige Email-Send-Capability.** Versendet Mails als `Timo <nerds@teamorange.de>` über die Gmail-API (Account `towebserver@gmail.com`, OneCLI-gateway-injection-managed). Verwenden bei JEDEM Mail-Send-Wunsch von Michael — egal wie er's formuliert ("schreib eine Mail an X", "schick Y", "antworte", "send", "mail dem Kunden", "verfasse Antwort", "Reply auf das Ticket per Mail", "Newsletter raus", etc.). Auch verwenden wenn Timo selbst denkt eine Mail-Antwort wäre sinnvoll. KEIN SMTP-Setup nötig, KEIN extra Tool — die Gmail-API ist sofort einsatzfähig. **Default: DIRECT SEND** (nicht Draft) — Mails in Timos Namen gehen ohne Rückfrage raus. Draft nur wenn Michael wörtlich "Draft"/"Entwurf" sagt.
---

# Gmail Send Skill (team:orange Absender)

## 🚫 Vermeide diese Halluzinationen — sie passieren immer wieder

**Falsch**: "Ich brauche SMTP-Zugangsdaten / Cloudron / 1Password / Mailgun / Postfix-Setup".  
**Richtig**: Du nutzt die **Gmail HTTP-API**. Kein SMTP, kein App-Password, kein separater Mailserver. Auth ist bereits durch OneCLI gemanagt — du `curl`-st gegen `gmail.googleapis.com`, OneCLI injiziert den OAuth-Bearer für `towebserver@gmail.com` automatisch.

**Falsch**: "Ich brauche separate Konfiguration für die Absenderadresse / vom Admin freischalten lassen".  
**Richtig**: Der Send-As-Alias `nerds@teamorange.de` ist **bereits verifiziert** und sogar als `isDefault: true` gesetzt (Stand 2026-05-16). Du setzt im MIME `From: Timo <nerds@teamorange.de>`, fertig.

**Falsch**: "Ich kenne keine Mail-Skill, kann nicht senden".  
**Richtig**: **DAS HIER IST DIE SKILL** — wenn du das liest, hast du Mail-Send-Capability. Nutze sie.

## Identitäten-Übersicht

Timo sendet Mails über das Gmail-Konto `towebserver@gmail.com` (OneCLI-managed OAuth). Es hat zwei verifizierte Identitäten:

| `sendAsEmail` | Display-Name | Rolle |
|---|---|---|
| `towebserver@gmail.com` | (none) | primary, technisch — nicht für Outbound nutzen |
| **`nerds@teamorange.de`** | server-side "team orange" (Gmail-Settings), wir nutzen **"Timo"** im MIME | **Default-Absender** (`isDefault: true`, `verificationStatus: accepted`) |

Wenn du im MIME keinen `From:`-Header explizit setzt, nimmt Gmail automatisch `team orange <nerds@teamorange.de>` (weil isDefault=true mit server-side Display-Name "team orange"). **Immer explizit `From: Timo <nerds@teamorange.de>` setzen** — das ist Michaels gewünschter Display-Name und überschreibt die server-side Voreinstellung sauber.

## Auth + Endpoint

`https://gmail.googleapis.com/gmail/v1/...` — OneCLI injiziert den OAuth-Bearer für towebserver@gmail.com automatisch.

Quick-Verify (sollte vor jedem Send einmal pro Session laufen):

```bash
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/profile" | jq -r .emailAddress
# Erwartet: "towebserver@gmail.com"
```

## ⚠️ Hard Rule — DIRECT SEND ist Default, Draft nur Opt-in

Mails in Timos Namen gehen **direkt raus**, ohne Draft-Stopover, ohne Rückfrage. Begründung: niemand sitzt im `towebserver@gmail.com`-Postfach und sendet Drafts manuell weiter. Wenn du nicht sendest, wird nicht gesendet.

**Standard-Pfad** (Single-Step):
1. Body + Subject + Empfänger komponieren
2. MIME bauen + base64url-encoden
3. POST an `/users/me/messages/send`
4. Bestätigung an Michael mit Message-ID + Gmail-Thread-Link

**Wann Draft trotzdem sinnvoll** (Opt-in über wörtliche Anweisung):
- Michael sagt "mach mir nen Draft" / "Entwurf" / "lass mich erst drüberlesen" → Stufe-1 (Draft anlegen) + Body zeigen + auf "ja send"/"raus damit" warten → Stufe-2 (`/drafts/send`)

Du sollst **nicht** von dir aus draften "zur Sicherheit" — direct send ist sicher genug weil:
- Auth ist OneCLI-managed (kein Risiko falsche Identität)
- Bestätigung an Michael nach dem Send macht den Vorgang transparent
- Falls die Mail einen Bug hatte: Reply-Mail mit Korrektur ist immer noch möglich (kein irreversibler Schaden)

## MIME-Konstruktion + base64url Encoding

Gmail API erwartet die ganze RFC-2822-Mail als base64url-encoded String im Feld `raw`. Python-Pattern (in agent-container verfügbar):

```python
import base64, json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Plain-text Mail
def build_mail(to, subject, body, from_alias="Timo <nerds@teamorange.de>", reply_to=None):
    msg = MIMEText(body, "plain", "utf-8")
    msg["From"] = from_alias
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

# Multipart (Plain + HTML)
def build_mail_html(to, subject, plain_body, html_body, from_alias="Timo <nerds@teamorange.de>"):
    msg = MIMEMultipart("alternative")
    msg["From"] = from_alias
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

raw = build_mail("recipient@example.com", "Hallo", "Body-Text hier.")
print(json.dumps({"raw": raw}))
```

## Cookbook

### Direct-Send (DEFAULT-PFAD — das was du fast immer machst)

```bash
RAW=$(python3 -c '
import base64
from email.mime.text import MIMEText
msg = MIMEText("Hallo Max,\n\nKurz zur Sache ... \n\nGruß,\nTimo", "plain", "utf-8")
msg["From"] = "Timo <nerds@teamorange.de>"
msg["To"] = "max.kunde@example.com"
msg["Cc"] = "m.aschenborn@teamorange.de"
msg["Subject"] = "Re: Nachfrage Projekt X"
print(base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii"))
')

curl -s -X POST "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" \
  -H "Content-Type: application/json" \
  -d "{\"raw\":\"$RAW\"}" | jq '{id, threadId, labelIds}'
```

Response enthält die Message-ID + thread-ID. Bestätige Michael:
> "Mail an max.kunde@example.com (CC: m.aschenborn) gesendet — https://mail.google.com/mail/u/0/#sent/<thread-id>"

### Draft-Anlegen (Opt-in — NUR wenn Michael "Draft"/"Entwurf" gesagt hat)

```bash
curl -s -X POST "https://gmail.googleapis.com/gmail/v1/users/me/drafts" \
  -H "Content-Type: application/json" \
  -d "{\"message\":{\"raw\":\"$RAW\"}}" | jq '{id, message: {id: .message.id, labelIds: .message.labelIds}}'
```

Bestätige Michael: "Draft mit ID `r-xxx` angelegt. Soll ich senden, oder änderst du noch was?"

### Draft danach senden (wenn Michael "ja send" sagt)

```bash
DRAFT_ID="r-1234567890"
curl -s -X POST "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$DRAFT_ID\"}" | jq '{id, threadId, labelIds}'
```

### Draft modifizieren (Body anpassen vor Send)

```bash
DRAFT_ID="..."
NEW_RAW=$(python3 -c '...')  # neu bauen mit korrigiertem Body

curl -s -X PUT "https://gmail.googleapis.com/gmail/v1/users/me/drafts/$DRAFT_ID" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$DRAFT_ID\",\"message\":{\"raw\":\"$NEW_RAW\"}}" | jq
```

### Draft löschen (wenn Michael "doch nicht")

```bash
curl -s -X DELETE "https://gmail.googleapis.com/gmail/v1/users/me/drafts/$DRAFT_ID"
```

### In einer bestehenden Thread antworten (Threading erhalten)

Für saubere Reply-Chains: das `In-Reply-To`- und `References`-Header setzen plus `threadId` im API-Call:

```python
# Hole zuerst die Message-ID vom Original
# GET /gmail/v1/users/me/messages/<thread-message-id>?format=metadata&metadataHeaders=Message-ID
# Dann im MIME:
msg["In-Reply-To"] = original_message_id
msg["References"] = original_message_id
```

Und beim Send:
```bash
curl -s -X POST "https://gmail.googleapis.com/gmail/v1/users/me/messages/send" \
  -H "Content-Type: application/json" \
  -d "{\"raw\":\"$RAW\",\"threadId\":\"$THREAD_ID\"}"
```

## Drafts auflisten / Status checken

```bash
# Alle offenen Drafts
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=10" \
  | jq '.drafts[] | {id, message: .message.id}'

# Draft-Detail
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/drafts/$DRAFT_ID" \
  | jq '.message | {snippet, labelIds}'
```

## Hard Rules

- **Direct-Send ist Default**. Mails in Timos Namen gehen ohne Rückfrage raus, niemand sitzt im Postfach und sendet Drafts manuell weiter.
- **Draft nur wenn explizit angefordert**: Michael sagt "Draft" / "Entwurf" / "lass mich erst sehen" → dann Stufe-1-Draft + Body-Anzeige + Wartepause → Stufe-2 `/drafts/send` nach Confirm.
- **From-Alias prüfen**: vor dem ersten Send pro Session einmal `/users/me/settings/sendAs` checken, dass `nerds@teamorange.de` `verificationStatus: accepted` hat. Falls nicht — STOP, Michael melden ("Send-As-Alias verifications-Status nicht 'accepted', kann nicht senden").
- **Reply-To strategisch**: bei Mails wo der Empfänger auf Michaels persönlichen Account antworten soll, `Reply-To: m.aschenborn@teamorange.de` setzen. Default: ohne Reply-To, dann landet die Antwort wieder bei `nerds@teamorange.de`.
- **Signatur**: Gmails server-side Signatur wird bei API-Sends **nicht** automatisch angehängt. Wenn Michael will dass die Standard-Signatur drunter ist, musst du sie manuell in den Body packen oder vorher eine Sig-Vorlage aus Wiki.js holen.
- **Anhänge** kommen über `multipart/mixed` MIME-Aufbau. Für PDFs/Bilder/Files: separater Cookbook-Eintrag nötig — wenn Michael Anhänge will, frag erst nach den Files (Pfad im Container oder URL zum Holen).
- **Niemals Mail an Listen >10 Empfängern ohne explizite Mengen-Bestätigung** — Massensend ist heikel (Spam-Filter, Reputation).
- **Identifiziere dich nicht selbst als Bot** in Mail-Bodies — anders als bei Alfred/Elfi-Patterns, wo der Agent sich selbst nennt. Hier sendest du als "team orange" Marke. Michael ist die Person dahinter, du bleibst unsichtbar. Bei Unsicherheit: fragen.

## Beziehung zu anderen Mail-Channels

| Wer/Was sendet | Adresse | Tool |
|---|---|---|
| **Alfred** | `alfred@aschenborn.dev` (Resend, privat) | `mcp__nanoclaw__send_email` |
| **Elfi** | `michael.aschenborn@lazi-akademie.de` (LAZI Workspace) | Gmail API mit Elfis OneCLI-Identity |
| **Timo (du)** | `nerds@teamorange.de` (team:orange Marketing-Identity, via towebserver@gmail.com) | Gmail API mit dieser Skill |
| **Phoenix** | (kein Outbound im aktuellen Setup) | — |

Niemals fremde Mail-Identitäten benutzen. Wenn Michael sagt "schick das vom Alfred-Account" — sag dass das Alfreds Job ist und weise auf den `phoenix-inbox`/`alfred-inbox`-Forward-Pfad hin.
