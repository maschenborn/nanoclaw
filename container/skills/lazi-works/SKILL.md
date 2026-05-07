---
name: lazi-works
description: Architektur + Implementations-Patterns für die `lazi.works`-Plattform — die öffentliche Portfolio-Plattform der LAZI Akademie (Studierende laden Werke + Projekte hoch, Kuratierung durch Akademie, Multi-Display-Slideshow im Foyer). Use whenever Michael Fragen zu lazi.works hat: Architektur, Datenmodell (Werk / Projekt / Display / Werkschau), Two-Tier-Status (UserIntent + AcademyApproval), Rollen + Permissions, Routen, Cloudinary-Pipeline, Supabase-Realtime für Display-Sync, Tests. Schreibst auch Code-Snippets in dem Stack (Next 16 + MUI 7 + Prisma 6 + Supabase + Cloudinary).
---

# lazi.works Skill

Public Portfolio-Plattform der LAZI Akademie. Studierende laden Werke (Foto / Video / Grafik) hoch, gruppieren in Projekten; Akademie kuratiert (Public Feed, Werkschau pro Semester, Multi-Display-Sync im Foyer). Doppelter Zweck: **Außenwirkung** (öffentliches Portfolio) + **note-relevant** (Bewertungs-Material für Dozenten).

**Repo (auf Michaels Mac, nicht Hetzner)**: `~/Projects/lazi/lazi.works.new/`. Branch `main`. Auf Hetzner kein direkter Zugriff — wenn Code-Änderungen nötig sind, Workflow über Michaels lokale Umgebung; du beschreibst die Änderung, er führt aus.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, MUI 7, TypeScript |
| Backend | Next API Routes + Server Actions |
| DB | PostgreSQL via **Supabase** (Auth + Realtime), **Prisma 6** als ORM (`prisma/schema.prisma` ist Source of Truth) |
| Media | **Cloudinary** (signed Direct Upload) |
| Hosting | **Vercel** |
| Runtime (lokal + CI) | **Bun** |
| Tests | **Playwright** E2E |
| PWA | via Workbox (`next.config.ts`) |

## Datenmodell — Kern-Entities

(Aus `prisma/schema.prisma`. Hier die produkt-wichtige Sicht, nicht alle Felder.)

### Student
Basis-User-Entity. Jeder Login hat einen Student-Datensatz. Flags:
- `isTutor: bool` — kuratiert Werke + Displays (Berechtigung über Default-Student hinaus)

### Dozent
Verlinkt mit optionalem Student-Profil (Dozent kann auch Student-Workspace haben). Flags:
- `isAdmin: bool` — Studierenden + Dozenten verwalten
- `isStudiengangLeiter: bool` — Stufe 4 in der Hierarchie
- `fachbereiche: String[]` — Fachzuordnung (z.B. `["DIME"]`)

### Werk
Cloudinary-Asset (Foto/Video). Wichtige Felder:
- `rating: Int` — 1..5
- **Two-Tier-Status** (siehe unten)
- `viewCount`, `likeCount` (denormalisiert für Feed-Performance)
- `projektId?` — optionale Verknüpfung zu Projekt
- `hideInProfile: bool`, `hideInFeed: bool` — User-Schalter

### Projekt
Owner = Student (auch Team-Lead). Felder:
- `isTeamProject: bool` + `ProjektMitglied[]`
- `ProjektAsset[]` — eingebettete YouTube/Figma-Embeds (separate Entity)
- `werke[]` — verlinkte Werke
- `coverWerk?` — Werk-ID für Projekt-Cover
- `projektTyp: enum` — `NORMAL | ABSCHLUSSPROJEKT | ZWISCHENPRUEFUNG | WORKSHOP | EXKURSION | EVENT`
- `puckData: JsonB` — Puck Page Builder State (für Custom-Layouts)

### Display / DisplayGruppe / Szene
Multi-Display-Sync im Foyer via **Supabase Realtime**:
- DisplayGruppe = N Displays die synchron laufen (z.B. 4 Bildschirme im Eingang)
- Szene = was gerade angezeigt wird (Werk-Slideshow, Werkschau-Plakate, Statisches)
- Snapshot-Queue mit Sequence-Cursor, `queueSize=50`
- Theme-Overlay für saisonale Specials: `snow`, `halloween`, `carneval`

### Werkschau
Pro Semester eine Werkschau-Entity. Felder:
- `plakat` (Cloudinary)
- `datumVon`, `datumBis`
- Standschilder-Druckansicht (PDF-Export)

### CloudinaryPreset
Admin-managed Download-Presets (z.B. „4K-Bildschirm-Slideshow", „Druckqualität 300dpi").

### ApprovalLog
Audit-Trail aller Freigabe-Aktionen. Wichtig: speichert `contentHash` (SHA-256 vom Werk-Datensatz) → Versionsverfolgung. Wenn Inhalt nach Freigabe geändert wird, fällt Status zurück auf Pending.

## Two-Tier-Status (das Schlüsselkonzept)

Werke und Projekte haben **zwei** Status-Werte, die kombiniert die Sichtbarkeit ergeben:

- `UserIntent` (was der Studierende will): `DRAFT | INTERNAL | PUBLIC`
- `AcademyApproval` (was die Akademie freigibt): `PENDING | INTERNAL | PUBLIC | REVOKED`

| UserIntent | AcademyApproval | Sichtbarkeit |
|---|---|---|
| DRAFT | * | nur User selbst |
| INTERNAL | PENDING | nur User, Approval pending |
| INTERNAL | INTERNAL/PUBLIC | akademie-intern sichtbar |
| PUBLIC | PUBLIC | öffentlich im Feed/Werkschau |
| PUBLIC | PENDING/REVOKED | bleibt intern bis freigegeben |
| * | REVOKED | nicht mal mehr INTERNAL sichtbar |

Plus User-Schalter `hideInProfile`, `hideInFeed` als zusätzliche User-Steuerung.

**Content-Hash-Trick**: bei Approval wird `approvedContentHash` gespeichert. Wenn der `contentHash` (live berechnet) abweicht (Inhalt nach Freigabe geändert), gilt das Werk als „verändert seit Approval" und fällt zurück auf Pending — Akademie muss neu prüfen.

## Rollen + Permissions

| Rolle | Bedingung | Was zusätzlich |
|---|---|---|
| **Student** (Default) | jeder Login | eigene Werke/Projekte CRUD, öffentlicher Feed lesen |
| **Tutor** | `student.isTutor` | + Werke fremder freigeben/ablehnen, Displays kuratieren |
| **Dozent** | hat Dozent-Datensatz | + Werke fremder bewerten, Studierenden-Liste lesen |
| **Admin** | `dozent.isAdmin` | + Studierenden + Dozenten verwalten, Werkschau anlegen, Settings |
| **Studiengang-Leiter** | `dozent.isStudiengangLeiter` | Level 4 — alles oben + Studiengangs-Settings |

Permission-Logik in `src/lib/permissions.ts`. Feature-Flag:
```env
NEXT_PUBLIC_USE_NUMERIC_PERMISSION_LEVELS=true|false
```

Default `false` — beim Lesen / Schreiben von Code: Boolean-Flags nutzen. Wenn `true`: 0..5 numerisch (das ist die geplante Zukunfts-API).

## Routen-Map

### Public (kein Login)

```
/                                — Landing
/feed                            — Public-Werke-Feed (paginiert, gefiltert)
/feed/[semester]                 — Feed gefiltert auf Semester
/werkschau/[semesterhandle]      — Werkschau-Plakat + alle Werke
/[handle]                        — Studierenden-Profil (öffentlich)
/[handle]/[subhandle]            — Werk-Page
/team/[projekthandle]            — Team-Projekt-Page
```

### Auth-Flow

```
/login          /signup          /auth/callback
```

Auth via Supabase mit Google OAuth (Workspace-restricted via `hd` claim — nur `@lazi-akademie.de`).

### Campus (Login required)

Student-Bereich:
```
meine-werke   meine-projekte   profil   aufgaben
```

Dozent-Bereich (zusätzlich):
```
werke   projekte
```

Admin-Bereich (zusätzlich):
```
studierende   dozenten   displays   werkschau   semester   einstellungen
```

### Display

```
/display/...
/multivision/[displayGruppeId]/[displayIndex]
```

### API-Routes (`src/app/api/`)

`upload-werk`, `cloudinary/generate-signature`, `students`, `werke`, `auth/me`, `create-student`, …

## Doku im Repo (`lazi.works.new/.claude/`)

Wenn du Code-Änderungen planst: lies die relevante doku-Datei VORHER. Liste:

- `overview.md`
- `setup/{README,supabase-setup,oauth-setup,security-checklist}.md`
- `architecture/{tech-stack-decision,semester-progression,media-pipeline,deployment}.md`
- `features/{display-slideshow,feed-system,campus-admin,pwa,werk-upload-guide}.md`
- `puck.md` — Puck Page Builder Integration
- `tests.md` — Playwright-Pattern
- `deployment-checklist.md`

## ENV-Variablen für lazi.works

Aus `setup-elfi-secrets.sh` in NanoClaws `.env` gespiegelt:

```env
# Supabase (geteilte Instanz mit DIME-Trainer)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_PASSWORD=...
SUPABASE_DATABASE_URL=...
SUPABASE_DIRECT_URL=...

# Cloudinary
CLOUDINARY_CLOUD_NAME=lazi
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Vercel
VERCEL_TOKEN=...
```

Bei Code-Snippets, die Michael in `lazi.works.new/.env.local` eintragen soll, **prefix die Public-Vars mit `NEXT_PUBLIC_`** (Next.js-Konvention):

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=lazi
```

Die `_SERVICE_ROLE_KEY` und `_API_SECRET`-Vars **niemals** mit `NEXT_PUBLIC_` versehen — sie würden im Browser-Bundle landen.

## Tests

```bash
bun run test:e2e          # Playwright E2E
```

Braucht `.env.test` (lokale Supabase-CLI-Instanz):

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Test-Datenbank wird von der lokalen Supabase-CLI gehostet (`supabase start`). Vor E2E-Lauf muss die laufen.

## Deployment

- Production-Branch: `main`
- Auto-Deploy via **Vercel** bei jedem Push auf `main`
- Preview-Deploys für PRs
- Vercel-CLI lokal: `vercel deploy` (bei dir im Container `vercel-cli`-Skill ist's installed)
- ENV-Variablen in Vercel-UI gepflegt (nicht im Repo)

## Hard rules

1. **Niemals direkt auf `main` pushen** ohne Test-Run und Michaels OK — siehe `coding-protocol`-Skill
2. **Niemals `_SERVICE_ROLE_KEY` mit `NEXT_PUBLIC_` prefixen** (würde Service-Key im Browser leaken)
3. **Schema-Änderungen über Prisma-Migrations**, nie direkt am Supabase-DB-Schema
4. **Cloudinary-Uploads immer signed** — niemals unsigned-Endpoint nutzen (würde Cloudinary-Quota öffentlich machen)
5. **Approval-Logik nicht umgehen** — Werke ohne Akademie-Approval bleiben intern, auch wenn UserIntent=PUBLIC

## Failure handling

- **Prisma-Migration-Fehler**: Drift zwischen Schema und DB. `bunx prisma db pull` zur Inspection, dann manuelle Migration. Tell Michael bei Drift.
- **Supabase-Realtime-Disconnect**: Display-Sync stockt. Browser-Reload des Display-Clients reicht meist; bei Cluster-weitem Problem im Supabase-Dashboard checken.
- **Cloudinary-Quota**: Free-Tier-Limit erreicht? Im Cloudinary-Dashboard prüfen, ggf. alte Test-Assets löschen.
- **Vercel-Build-Fail**: Logs in Vercel-UI lesen. Häufige Ursache: `NEXT_PUBLIC_*` Var fehlt in der Vercel-Env-Config.

## Was diese Skill NICHT macht

- **Direkt am Mac-Repo arbeiten**: Du bist im Hetzner-Container, kein Zugriff auf `~/Projects/lazi/lazi.works.new/`. Code-Änderungen formulierst du als konkrete Anweisung an Michael (Datei + Zeile + Diff), er macht sie.
- **DB-Schema ändern**: Nur über Prisma-Migration-Files, nie direkt SQL gegen Supabase.
- **Production-Deploy**: kein autonomer `vercel deploy --prod`. Michael deployed selbst.
