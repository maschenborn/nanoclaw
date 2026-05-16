---
name: directus
description: Directus Headless-CMS für team:orange (`https://directus.teamorange.dev`). Use whenever Michael fragt nach Content-Items, Collections, User-Daten oder Asset-Files die in Directus liegen. Du hast einen Admin-Token via OneCLI gateway — also Vollzugriff auf alles, was Directus exposed. Behandle entsprechend vorsichtig (Read-First-Mentalität bei unbekannten Collections).
---

# Directus Skill (team:orange)

Directus unter `https://directus.teamorange.dev` ist team:orange's Headless-CMS — strukturierte Inhalte, User-Datenmodelle, File-Storage. Token ist Admin-Level, also keine Permission-Boundary von Directus-Seite. Verantwortung liegt komplett bei dir.

## Auth + Endpoint

`https://directus.teamorange.dev/...` — OneCLI injiziert `Authorization: Bearer <token>` automatisch.

```bash
# Server-Info + Auth verifizieren
curl -s "https://directus.teamorange.dev/server/info" | jq '{version: .data.project.project_name, env: .data.directus.version}'
curl -s "https://directus.teamorange.dev/users/me" | jq '.data | {email, role, status}'
```

## Schema-Discovery

Bevor du an Daten ranschreibst — Schema-Discovery:

```bash
# Alle Collections
curl -s "https://directus.teamorange.dev/collections" \
  | jq '.data[] | select(.meta.system == false) | {collection, note: .meta.note}'

# Fields einer Collection
COL=articles
curl -s "https://directus.teamorange.dev/fields/$COL" \
  | jq '.data[] | {field, type, special: .meta.special}'
```

## Standard-Operations

### Items lesen

```bash
COL=articles
# Mit Filtern + Sortierung + Limit
curl -s "https://directus.teamorange.dev/items/$COL?filter[status][_eq]=published&sort=-date_created&limit=10" \
  | jq '.data[] | {id, title, date_created}'

# Single Item by ID
curl -s "https://directus.teamorange.dev/items/$COL/$ID" | jq '.data'
```

### Items schreiben (ASK-FIRST)

```bash
curl -s -X POST "https://directus.teamorange.dev/items/$COL" \
  -H 'Content-Type: application/json' \
  -d '{"title": "...", "body": "...", "status": "draft"}'
```

### Files hochladen

```bash
curl -s -X POST "https://directus.teamorange.dev/files" \
  -F "file=@/path/to/file.pdf" \
  -F "title=Document Title"
```

### Users / Roles

```bash
curl -s "https://directus.teamorange.dev/users?limit=50" \
  | jq '.data[] | {email, first_name, last_name, role}'
```

## Hard Rules

- **Reads unrestricted**
- **Writes ASK-FIRST** — egal welche Collection. Du hast Admin-Token, kannst alles ändern; daraus erwächst die Pflicht zur Doppelvorsicht.
- **Schema-Changes (Collections / Fields anlegen, löschen, ändern)** → NIEMALS ohne expliziten Auftrag von Michael, und auch dann mit ausführlicher Vor-Bestätigung. Schema-Migrations können Daten-Inkonsistenzen erzeugen, Backups fehlen evtl.
- **User-Management** (Users anlegen, Rollen vergeben) → ASK-FIRST mit voller Info (welcher User, welche Rolle, welche Permissions).
- **File-Deletes** → Doppelbestätigung. Files können von Frontend-Apps referenziert sein, Broken-Links sind sichtbar.
- **Backups**: Directus hat eigene Backup-Strategie via Schema-Snapshots — du machst keine Backups selbst, sondern verlässt dich auf das was Michael konfiguriert hat. Bei größeren Writes optional: Schema-Snapshot vorher anstoßen via `/schema/snapshot`.
