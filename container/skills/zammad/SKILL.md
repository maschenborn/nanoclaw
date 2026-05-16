---
name: zammad
description: Zammad Helpdesk-System für team:orange (`https://helpdesk.teamorange.de`). Use whenever Michael fragt nach Tickets, Support-Anfragen, Customer-Cases, Ticket-Status oder will eine Antwort/Note an einem Ticket platzieren. Auth ist via OneCLI gateway (Token-Auth Header `Authorization: Token token=...`) transparent gemanagt.
---

# Zammad Skill (team:orange Helpdesk)

Zammad ist das Helpdesk-System unter `https://helpdesk.teamorange.de`. Tickets von Customers landen hier; Agents bearbeiten + antworten.

## Auth + Endpoint

`https://helpdesk.teamorange.de/api/v1/...` — OneCLI injiziert `Authorization: Token token=<key>` automatisch.

```bash
curl -s "https://helpdesk.teamorange.de/api/v1/users/me" | jq
```

## Schema-Highlights

| Endpoint | Was |
|---|---|
| `/api/v1/tickets` | Liste / Detail / Create / Update von Tickets |
| `/api/v1/tickets/{id}/articles` | Articles (= Mails/Notes) innerhalb eines Tickets |
| `/api/v1/ticket_articles` | All Articles cross-ticket (für Search) |
| `/api/v1/users` | Customer + Agent Records |
| `/api/v1/organizations` | Kunden-Organisationen |
| `/api/v1/groups` | Ticket-Gruppen (Routing-Buckets) |
| `/api/v1/tickets/search?query=...` | Volltextsuche über Tickets (Zammad QL syntax) |

Ticket-State-IDs (typisch):
- 1 = new, 2 = open, 3 = pending reminder, 4 = closed, 5 = pending close, 6 = merged

## Cookbook

### ⚠️ Pflicht: bei JEDER Ticket-Antwort den UI-Link mit angeben

URL-Pattern für die Zammad-UI ist **fragment-basiert** (`/#ticket/zoom/<id>`):

```
https://helpdesk.teamorange.de/#ticket/zoom/<TICKET_ID>
```

Wenn du Tickets listest oder erwähnst, dieses URL-Muster **immer** pro Ticket beifügen — Michael soll mit einem Klick direkt in Zammad springen können. Beispiel-Format:

```
#24305 PS-Los-Sparen (05.05.2026) — https://helpdesk.teamorange.de/#ticket/zoom/24305
#24306 WG: Rechte Facebook (07.05.2026) — https://helpdesk.teamorange.de/#ticket/zoom/24306
```

Nicht nur ID/Titel ohne Link.

### Offene Tickets dieser Woche

```bash
curl -s "https://helpdesk.teamorange.de/api/v1/tickets/search?query=state.name:open+OR+state.name:new&limit=50" \
  | jq -r '.assets.Ticket | to_entries | map(.value) | sort_by(-.id) | .[0:20] | .[] | "#\(.number) [\(.title)] — https://helpdesk.teamorange.de/#ticket/zoom/\(.id)"'
```

Beachte: Zammad's `tickets/search`-Response hat `.assets.Ticket` als Map (Key=ID, Value=Ticket-Object). Die direkten `.id`-Felder im Object sind die internen IDs für die UI-URL.

### Ticket-Detail + alle Articles

```bash
TID=12345
echo "Link: https://helpdesk.teamorange.de/#ticket/zoom/$TID"
curl -s "https://helpdesk.teamorange.de/api/v1/tickets/$TID" | jq
curl -s "https://helpdesk.teamorange.de/api/v1/tickets/$TID/articles" \
  | jq '[.[] | {id, sender, type, from, body: (.body | .[0:200])}]'
```

### Internal-Note an Ticket anhängen (ASK-FIRST für customer-facing)

```bash
# Internal-Note — nur Agents sehen die. Stiller Audit-Trail.
curl -s -X POST "https://helpdesk.teamorange.de/api/v1/ticket_articles" \
  -H 'Content-Type: application/json' \
  -d '{
    "ticket_id": '$TID',
    "subject": "Note",
    "body": "<text>",
    "type": "note",
    "internal": true
  }'
```

Für customer-facing Reply (mail-out): `type: "email"`, `internal: false`. Das geht raus an den Customer → **ALWAYS ASK-FIRST**.

### Ticket-State ändern

```bash
curl -s -X PUT "https://helpdesk.teamorange.de/api/v1/tickets/$TID" \
  -H 'Content-Type: application/json' \
  -d '{"state_id": 4}'   # state 4 = closed
```

## Hard Rules

- **Reads unrestricted**: Tickets durchsuchen, Inhalte zeigen, Statistiken aggregieren — alles ohne Confirm
- **Source-Links Pflicht**: Bei JEDER Antwort die Tickets referenziert (Liste, Suche, Einzelticket) den UI-Link `https://helpdesk.teamorange.de/#ticket/zoom/<id>` pro Ticket mitgeben. Nicht nur Ticket-Nummern abdrucken.
- **Internal-Notes** als Audit-Spuren oder Recherche-Findings (`internal: true`) ohne Confirm OK, weil nicht customer-facing
- **Customer-facing Replies** (`type: "email"` oder `"phone"`, oder `internal: false`) → **IMMER ASK-FIRST**, vollständigen Body anzeigen, Michael bestätigt, dann POST
- **State-Transitions** (close/reopen/merge) → ASK-FIRST, weil sichtbar für Customer
- **Niemals Tickets löschen** ohne explizite Doppelbestätigung von Michael
