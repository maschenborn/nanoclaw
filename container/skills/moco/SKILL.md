---
name: moco
description: Time tracking + projects + tasks + clients + offers + invoices in MOCO at `https://teamorange.mocoapp.com/api/v1` für team:orange. Use whenever Michael fragt nach Projekten, Aufgaben/Tasks, Zeiterfassung, Kunden, Angeboten/Offers, oder Rechnungen im team:orange-Kontext — egal ob lesen ("welche offenen Tasks hab ich diese Woche?", "wer hat letzten Monat am meisten Stunden gemacht?") oder erstellen (Zeiteintrag, Task anlegen, Angebot, Rechnung). Auth ist via OneCLI gateway transparent gemanagt (keine Token im Code), Host-Pattern `teamorange.mocoapp.com`.
---

# MOCO Skill (team:orange)

MOCO ist team:orange's Projekt-Management-System: Kunden, Projekte, Tasks, Time-Entries, Angebote, Rechnungen, Personen. Michael ist Owner mit User-ID **933725938**.

## Auth + Endpoint

`https://teamorange.mocoapp.com/api/v1` — OneCLI injiziert `Authorization: Token token=<key>` automatisch. Du `curl`-st einfach:

```bash
curl -s "https://teamorange.mocoapp.com/api/v1/projects?active=1" | jq '.[0:3]'
```

## Pagination — Pflicht-Pattern

Alle MOCO-List-Endpoints sind paginated, default 50/page, max 100. Check `X-Total`-Header für Total-Count und iteriere `?page=2`, `?page=3` etc. bis durch.

```bash
PAGE=1; TOTAL=0
while :; do
  RESP=$(curl -sD /tmp/h.txt "https://teamorange.mocoapp.com/api/v1/projects?active=1&page=$PAGE&per_page=100")
  TOTAL=$(grep -i '^x-total:' /tmp/h.txt | awk '{print $2}' | tr -d '\r')
  echo "$RESP" | jq -r '.[].id'
  COUNT=$(echo "$RESP" | jq 'length')
  [ "$COUNT" -lt 100 ] && break
  PAGE=$((PAGE+1))
done
```

## Schema-Highlights

| Endpoint | Was |
|---|---|
| `/users` | Personen im Account (User-IDs für Filter) |
| `/customers` | Kunden (id, name, currency) |
| `/projects?active=1` | Aktive Projekte (id, name, customer_id, leader_id, budget) |
| `/projects/{id}/tasks` | Tasks innerhalb eines Projekts |
| `/activities` | Time-Entries (date, hours, project_id, task_id, user_id, description) |
| `/offers` | Angebote |
| `/invoices` | Rechnungen |
| `/deals` | Pipeline-Deals |

Common-Filter:
- `?date={YYYY-MM-DD}` (exakter Tag) oder `?from=...&to=...` (Zeitraum)
- `?user_id=933725938` (Michael)
- `?customer_id={id}`

## Cookbook

### Diese Woche meine Stunden

```bash
WEEK_START=$(date -d 'monday' +%Y-%m-%d)
TODAY=$(date +%Y-%m-%d)
curl -s "https://teamorange.mocoapp.com/api/v1/activities?from=$WEEK_START&to=$TODAY&user_id=933725938&per_page=100" \
  | jq '[.[] | {date, hours, project: .project.name, description}] | sort_by(.date)'
```

### Tasks die mir gerade offen sind (aktive Projekte, Task-Done = false)

```bash
# 1. Liste aktive Projekte wo Michael Leader oder Beteiligter ist
curl -s 'https://teamorange.mocoapp.com/api/v1/projects/assigned?active=1' \
  | jq '[.[] | {id, name, customer_name: .customer.name}]'

# 2. Tasks pro Projekt
curl -s 'https://teamorange.mocoapp.com/api/v1/projects/{pid}/tasks?active=1' \
  | jq '[.[] | select(.task_done == false) | {id, name, billable}]'
```

### Time-Entry anlegen (write — ASK-FIRST)

```bash
curl -s -X POST 'https://teamorange.mocoapp.com/api/v1/activities' \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-16","project_id":<pid>,"task_id":<tid>,"hours":1.5,"description":"<text>"}'
```

**Write-Operations sind ASK-FIRST**: erst Draft (z.B. Time-Entry-JSON ausformuliert) zeigen → Michael bestätigt → POST.

### Rechnung anlegen

Heavy operation — komplexes Schema, multiple Items, Tax-Rate etc. Wenn Michael will: erst alle Felder mit ihm durchgehen, dann ein vollständiges Draft als curl-Body zeigen, dann auf seine explizite Freigabe POST.

## Hard Rules

- **Reads unrestricted** für jede Anfrage von Michael, kein Confirm nötig
- **Writes ASK-FIRST** — auch wenn er klar formuliert ("trag 2h auf Projekt X ein") — kurz zurück: "Schreibe 2.0h am 2026-05-16 auf Projekt X, Task Y, Beschreibung Z. OK?" → er sagt "ja" → POST
- **Niemals DELETE ohne Doppelbestätigung** (löschen ist final in MOCO)
- **PII / Kunden-Daten** nicht in andere Channels leaken (kein Forward an Alfred/Elfi/etc. außer auf Anweisung)
