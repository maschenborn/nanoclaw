---
name: mautic
description: Mautic Marketing-Automation für team:orange (`https://mautic.teamorange.de`). Use whenever Michael fragt nach Kontakten/Leads, Segmenten, Mail-Kampagnen, Formularen, Lead-Scoring, Campaign-Performance oder Marketing-Automation-Workflows. Auth via OAuth2 client_credentials grant — Token-Exchange + Caching macht der Skill-Code selbst, kein User-Browser-Flow nötig.
---

# Mautic Skill (team:orange Marketing Automation)

Mautic unter `https://mautic.teamorange.de` ist team:orange's Marketing-Automation: Lead-Capture (Formulare), Lead-Scoring, Segmente, E-Mail-Kampagnen, Automation-Flows. **1229 Kontakte** im aktuellen System (Stand 2026-05-16). Zwischen Mautic und Twenty-CRM: Mautic = Top-of-Funnel (Marketing-Leads), Twenty = Sales-Pipeline (qualifizierte Opportunities).

## Auth-Flow (client_credentials)

Mautic-OAuth2 hat einen Server-to-Server-Flow: du tauschst Client-Credentials direkt gegen einen Access-Token, kein Browser-Redirect. Token gilt 1h (3600s).

```bash
# 1. Token holen (cache in /tmp falls noch frisch)
TOKEN_CACHE=/tmp/timo-mautic-token
NOW=$(date +%s)

if [ -f $TOKEN_CACHE ] && [ $(($(stat -c%Y $TOKEN_CACHE) + 3300)) -gt $NOW ]; then
  ACCESS=$(cat $TOKEN_CACHE)
else
  RESP=$(curl -s -X POST "https://mautic.teamorange.de/oauth/v2/token" \
    -d "grant_type=client_credentials&client_id=$MAUTIC_CLIENT_ID&client_secret=$MAUTIC_CLIENT_SECRET")
  ACCESS=$(echo "$RESP" | jq -r .access_token)
  if [ -n "$ACCESS" ] && [ "$ACCESS" != "null" ]; then
    echo -n "$ACCESS" > $TOKEN_CACHE
    chmod 600 $TOKEN_CACHE
  else
    echo "Mautic-Token konnte nicht geholt werden: $RESP" >&2
    exit 1
  fi
fi

# 2. API-Call mit dem Token
curl -s -H "Authorization: Bearer $ACCESS" "https://mautic.teamorange.de/api/contacts?limit=5"
```

`MAUTIC_CLIENT_ID` und `MAUTIC_CLIENT_SECRET` sind als env-vars im Container (forwarded aus dem Host-`.env` via `container.json`). Token-Cache `/tmp/timo-mautic-token` lebt nur in der Container-Session, beim nächsten Spawn wird er neu geholt.

## API-Endpoint-Übersicht

Basis: `https://mautic.teamorange.de/api/`

| Resource | Endpoint | Beispiel-Use |
|---|---|---|
| Contacts (Leads) | `/api/contacts` | suchen, anlegen, taggen, scoren |
| Companies | `/api/companies` | B2B-Records, zugeordnete Contacts |
| Segments (Listen) | `/api/segments` | Statische + dynamische Segmente |
| Segment-Mitglieder | `/api/segments/{id}/contacts` | Wer ist in welcher Liste |
| Emails (Mail-Templates + Sends) | `/api/emails` | versendete und geplante Mail-Kampagnen |
| Forms (Lead-Capture) | `/api/forms` | Formular-Definitionen + Submissions |
| Form-Submissions | `/api/forms/{id}/submissions` | Wer hat sich wo eingetragen |
| Campaigns | `/api/campaigns` | Automation-Flows |
| Campaign-Events | `/api/campaigns/{id}/events` | Aktionen innerhalb eines Flows |
| Stages | `/api/stages` | Lead-Stage (z.B. MQL, SQL) |
| Notes | `/api/notes` | Notes an Contacts/Companies |
| Points (Scoring) | `/api/points` | Lead-Scoring-Regeln |
| Tags | `/api/tags` | flache Tag-Liste |

Pagination: `?limit=N&start=M` (offset-style). Default-limit ist 30, max meist 200.  
Filter: `?search=...` für Full-Text, plus Field-spezifische Filter via `?where[0][col]=email&where[0][expr]=eq&where[0][val]=...`.

## Cookbook

### Top-Contacts nach Punkten

```bash
curl -s -H "Authorization: Bearer $ACCESS" \
  "https://mautic.teamorange.de/api/contacts?orderBy=points&orderByDir=DESC&limit=10" \
  | jq '.contacts | to_entries | map(.value | {id, points, name: .fields.all.email})'
```

### Letzte Form-Submissions

```bash
# Erst Formulare listen
curl -s -H "Authorization: Bearer $ACCESS" "https://mautic.teamorange.de/api/forms?limit=20" \
  | jq '.forms | to_entries | map(.value | {id, name, submissionCount})'

# Submissions zu einem Formular
FID=12
curl -s -H "Authorization: Bearer $ACCESS" "https://mautic.teamorange.de/api/forms/$FID/submissions?limit=10" \
  | jq '.submissions[] | {date_submitted, results: .results}'
```

### Contact suchen by Email

```bash
EMAIL="test@example.com"
curl -s -H "Authorization: Bearer $ACCESS" \
  "https://mautic.teamorange.de/api/contacts?search=email:$EMAIL" \
  | jq '.contacts'
```

### Contact anlegen (WRITE — ASK-FIRST)

```bash
curl -s -X POST -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  "https://mautic.teamorange.de/api/contacts/new" \
  -d '{"email":"...","firstname":"...","lastname":"..."}'
```

### Email-Kampagne triggern (WRITE — IMMER ASK-FIRST)

```bash
# Eine spezifische Email an einen Contact senden — sichtbar für den Empfänger
EID=42
CID=493
curl -s -X POST -H "Authorization: Bearer $ACCESS" \
  "https://mautic.teamorange.de/api/emails/$EID/contact/$CID/send"
```

### Contact zu Segment hinzufügen

```bash
SID=5
CID=493
curl -s -X POST -H "Authorization: Bearer $ACCESS" \
  "https://mautic.teamorange.de/api/segments/$SID/contact/$CID/add"
```

## Hard Rules

- **Reads unrestricted** — alle Lesen-Operationen (Contacts listen, Segmente durchsuchen, Performance-Stats abfragen) ohne Confirm.
- **Writes mit Customer-Sichtbarkeit IMMER ASK-FIRST**:
  - Email-Sends (`/api/emails/.../send`) — Mail geht raus an Empfänger
  - Campaign-Trigger (Automation-Start für einen Contact)
  - Contact-Tagging falls die Tags Workflows triggern
  - Form-Submission-Simulation (würde Automations starten)
- **Bulk-Operations** (alle Contacts in Segment X taggen, alle aus Liste Y löschen) → Doppelbestätigung mit explizitem Mengen-Hinweis ("das wären 247 Contacts").
- **Niemals Schema/Custom-Fields anlegen oder löschen** — das ist Admin-Sphäre.
- **DSGVO**: PII-Daten (E-Mail, Name, Adresse) niemals in andere Channels exportieren ohne explizite Frage. Aggregate Stats (Anzahl Contacts pro Segment, Mail-Open-Rates) ist OK.
- **Token-Cache `/tmp/timo-mautic-token` löschen** wenn ein API-Call 401 zurückgibt — der Token könnte invalidiert worden sein, neue Exchange triggern.

## Mautic-Twenty-Abgrenzung

Wenn Michael fragt "wo ist Kunde X?" — pragmatisch beide checken (Mautic kann lange Lead-Historie haben, Twenty hat den aktuellen Sales-Status):

```bash
# Mautic
curl -s -H "Authorization: Bearer $ACCESS" "https://mautic.teamorange.de/api/contacts?search=email:..."
# Twenty (siehe twenty-crm Skill)
curl -s "https://crm.teamorange.de/rest/people?filter[email][eq]=..."
```

Wenn beide Records haben: kurze Doppelübersicht zeigen, Michael entscheidet welcher der "Master"-Record ist.
