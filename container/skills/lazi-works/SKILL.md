---
name: lazi-works
description: Architektur + Implementations-Patterns für die `lazi.works`-Plattform — die öffentliche Portfolio-Plattform der LAZI Akademie (Studierende laden Werke + Projekte hoch, Kuratierung durch Akademie, Multi-Display-Slideshow im Foyer). Use whenever Michael Fragen zu lazi.works hat: Architektur, Datenmodell (Werk / Projekt / Display / Werkschau), Two-Tier-Status (UserIntent + AcademyApproval), Rollen + Permissions, Routen, Cloudinary-Pipeline, Supabase-Realtime für Display-Sync, Tests. Auch bei Freigabe-Workflow: Werk freigeben / genehmigen / ablehnen / sperren, AcademyApproval PENDING / REVOKED, ApprovalLog, ausstehende Werke prüfen, automatische Morgen-Freigaben, Werk-Approval-Notification Cards mit Cloudinary-Bild. Schreibt auch Code-Snippets in dem Stack (Next 16 + MUI 7 + Prisma 6 + Supabase + Cloudinary).
---

# lazi.works Skill

Public Portfolio-Plattform der LAZI Akademie. Studierende laden Werke (Foto / Video / Grafik) hoch, gruppieren in Projekten; Akademie kuratiert (Public Feed, Werkschau pro Semester, Multi-Display-Sync im Foyer). Doppelter Zweck: **Außenwirkung** (öffentliches Portfolio) + **note-relevant** (Bewertungs-Material für Dozenten).

**Repo (auf Michaels Mac, nicht Hetzner)**: `~/Projects/lazi/lazi.works.new/`. Branch `main`. Auf Hetzner kein direkter Zugriff — wenn Code-Änderungen nötig sind, Workflow über Michaels lokale Umgebung; du beschreibst die Änderung, er führt aus.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, MUI 7, TypeScript |
| Backend | Next API Routes + Server Actions |
| App-DB (prod) | **PostgreSQL 17 im Mittwald-Container** (`c-bczvk2`, intern `postgres:5432`, DB `laziworks`), **Prisma 6** als ORM (`prisma/schema.prisma` ist Source of Truth) |
| Auth + Realtime | **Supabase** — nur noch für Login/OAuth/JWT (Google Workspace `hd: lazi-akademie.de`) und Realtime-Channels (Display-Slideshow Broadcasts). `public.*`-Tabellen in Supabase liegen historisch redundant — App liest/schreibt sie **nicht mehr**, kann jederzeit TRUNCATEt werden. |
| Media | **Cloudinary** (signed Direct Upload) |
| Hosting | **Mittwald Container Stack** (Project `p-plhv26`, App-Container `c-krnsej`, Image `ghcr.io/lazi-maschenborn/lazi-works:<sha>`, intern Port 3000). Live unter `https://lazi.works` (DNS A → `185.215.158.114`). |
| Runtime (lokal + CI) | **Bun** |
| Tests | **Playwright** E2E |
| PWA | via Workbox (`next.config.ts`) |

**Vercel ist abgeschafft** (Stand 2026-05-13). Die Projekte `lazi-works` + `dime-trainer` wurden komplett gelöscht, Team-Plan auf Hobby/Free downgegradet. Wenn du irgendwo noch Vercel-Referenzen siehst (Code, Doku, `vercel.json`) — das ist Altlast, nicht Production-Truth.

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

## Status-Felder (vollständiges Bild, Stand 2026-05-08)

Werke und Projekte haben **drei** Status-Felder und zwei Schalter:

### `userIntent` — Student-Wunsch
`DRAFT | INTERNAL | PUBLIC`

### `academyApproval` — Akademie-Entscheidung
`PENDING | INTERNAL | PUBLIC | REVOKED`

### `publishStatus` — technische Erreichbarkeit der URL ⚠️
`DRAFT | ONLINE`

**Kritisch:** `publishStatus: "ONLINE"` ist das einzige Feld, das die öffentliche URL tatsächlich erreichbar macht. Ein Werk mit `userIntent: PUBLIC` + `academyApproval: PUBLIC` aber `publishStatus: "DRAFT"` gibt 404. Beim Freigeben als PUBLIC immer auch `publishStatus: "ONLINE"` setzen.

### `visibility` — denormalisiertes Feld
Spiegelt vermutlich `userIntent` (`DRAFT` → `INTERNAL`, `PUBLIC` → `PUBLIC`). Nicht manuell setzen — wird von der Applikation verwaltet.

### Sichtbarkeits-Matrix

| userIntent | academyApproval | publishStatus | Sichtbarkeit |
|---|---|---|---|
| DRAFT | * | DRAFT | nur User selbst |
| INTERNAL | PENDING | DRAFT | nur User, Approval pending |
| INTERNAL | INTERNAL/PUBLIC | DRAFT | akademie-intern |
| PUBLIC | PUBLIC | **ONLINE** | öffentlich im Feed/Werkschau ✅ |
| PUBLIC | PUBLIC | DRAFT | URL nicht erreichbar ❌ |
| PUBLIC | PENDING/REVOKED | * | bleibt intern |
| * | REVOKED | * | nicht sichtbar |

Plus User-Schalter `hideInProfile`, `hideInFeed`.

### URL-Format

- **Werk:** `https://lazi.works/<studentHandle>/<werkId>` (Werk hat kein eigenes handle-Feld, UUID wird direkt als Subhandle verwendet)
- **Projekt:** `https://lazi.works/<studentHandle>/<projektHandle>` (Projekt hat eigenes `handle`-Feld, human-readable Slug)

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

Auth via Supabase mit Google OAuth (Workspace-restricted via `hd` claim — nur `@lazi-akademie.de`). Das ist einer der zwei verbliebenen Supabase-Use-Cases — alles andere (Postgres-Reads/Writes) läuft gegen Mittwald.

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

Was Elfi aus NanoClaws `.env` / OneCLI-Vault zur Verfügung hat (aus `setup-elfi-secrets.sh` gespiegelt):

```env
# Supabase — NUR Auth + Realtime, KEINE Postgres-Queries mehr
SUPABASE_URL=https://yrhjahpxwyflwoaqtgrt.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # admin-side für Approval-Workflow gegen die *Auth*-API
SUPABASE_DB_PASSWORD=...             # Altlast — Postgres-Tabellen werden nicht mehr genutzt
SUPABASE_DATABASE_URL=...            # Altlast — nicht für App-Queries
SUPABASE_DIRECT_URL=...              # Altlast

# Mittwald-Postgres (Production-DB der App)
# Connection-String liegt im OneCLI-Vault ("lazi.works Mittwald Postgres"),
# in der App via Prisma als DATABASE_URL gesetzt. Format:
#   postgresql://lazi:<password>@postgres:5432/laziworks?schema=public
# (Hostname "postgres" ist nur projekt-intern aus dem App-Container erreichbar.)
# Lokaler Zugriff via Port-Forward:
#   mw container port-forward c-bczvk2 --project-id p-plhv26 15432:5432

# Cloudinary
CLOUDINARY_CLOUD_NAME=lazi
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Mittwald API (für mw-CLI-Operationen auf dem Stack)
# Token liegt in 1Password / OneCLI, nicht im Klartext hier
```

`VERCEL_TOKEN` ist **weg** (war für Vercel-Deploys, Plattform existiert nicht mehr).

Bei Code-Snippets, die Michael in `lazi.works.new/.env.local` eintragen soll, **prefix die Public-Vars mit `NEXT_PUBLIC_`** (Next.js-Konvention):

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=lazi
```

Die `_SERVICE_ROLE_KEY` und `_API_SECRET`-Vars **niemals** mit `NEXT_PUBLIC_` versehen — sie würden im Browser-Bundle landen. Gleiches gilt für den Mittwald-Postgres-`DATABASE_URL` — der ist server-only.

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
- **Kein Auto-Deploy** mehr — Michael deployed manuell von seinem Mac aus mit:

  ```bash
  cd ~/Projects/lazi/lazi.works.new
  ./infra/mittwald-stack/build-and-push.sh
  ```

  Dieses Script:
  1. Liest `.env.local` (alter `vercel env pull`-Snapshot, bleibt als reine Build-Args-Quelle) für Build-Variablen
  2. Holt das Postgres-PW aus 1Password (`op` CLI)
  3. `docker buildx build --platform linux/amd64 …` und push zu **GHCR** (`ghcr.io/lazi-maschenborn/lazi-works:<sha>`)
  4. Schreibt `IMAGE_TAG=<git-sha[-wip-ts]>` in `infra/mittwald-stack/.env`
  5. `mw stack deploy --stack-id <id> --env-file ./.env` — Mittwald pullt das neue Image und rolled den App-Container `c-krnsej` neu hoch

- **Du selbst (im Container) hast keinen Mac-Zugriff** — du kannst nicht deployen. Wenn ein Deploy gebraucht wird: Michael ans Terminal verweisen, ihm den genauen Stand sagen.
- ENV-Variablen für die App-Runtime sind im Mittwald-Stack-Env gepflegt (`mw stack ... --env-file ./infra/mittwald-stack/.env`), nicht im Repo. Build-Args kommen aus `.env.local` auf Michaels Mac.

## Datenbank-Zugriff: Mittwald-Postgres (Stand 2026-05-13)

Du hast **`mw` CLI** (`@mittwald/cli@1.16.0`, im PATH als `mw`) und **`psql`** (postgresql-client, im PATH) im Container. Sowie diese Env-Vars:

- `MITTWALD_API_TOKEN` — von `mw` automatisch gelesen (Hard rule unten: Proxy-Bypass nötig)
- `LAZI_PG_PASSWORD` — Postgres-Passwort für User `lazi`

Statische Connection-Daten:

| Was | Wert |
|---|---|
| Mittwald-Project-ID | `p-plhv26` |
| Project-UUID | `b81c4736-acf9-4a8d-9df3-4e37d26a874f` |
| Postgres-Container | `c-bczvk2` (intern Port 5432) |
| App-Container | `c-krnsej` (intern Port 3000) |
| DB | `laziworks` |
| User | `lazi` |
| Interner Postgres-Hostname | `postgres` (nur aus `c-krnsej` erreichbar) |

### Hard rule 0: Proxy-Bypass für Mittwald API

Jeder `mw`-Call braucht `NO_PROXY=api.mittwald.de`, sonst hijackt der OneCLI-Gateway die Anfrage und gibt 400/403 zurück (gleiches Muster wie bei googleapis — siehe `google-lazi`-Skill). Bevorzugte Form: Env-Var am Anfang der Bash-Session setzen.

```bash
export NO_PROXY=api.mittwald.de
mw project list   # → zeigt p-plhv26 und Co.
```

### Was funktioniert (read-only Mittwald-API)

Mit dem Token gelist du u.a.: `mw project list`, `mw project get --id <uuid>`, `mw container list --project-id p-plhv26`, `mw user ssh-key list`. Hinreichend für **read-only Inspections der Mittwald-Infrastruktur**.

### Direktes psql via Port-Forward (funktioniert ✅ seit 2026-05-13)

Du hast einen eigenen Mittwald-SSH-Key (`sshKeyId 4dfc2066-…`, Comment `elfi@nanoclaw 2026-05-13`) am Account `m.aschenborn@gmail.com`. Der Privkey ist als RO-Mount unter `/workspace/extra/elfi-mittwald-ssh/id_ed25519` da, und beim Container-Start kopiert ein Host-Wire-Up (`src/container-runner.ts:512`) ihn nach `~/.ssh/id_ed25519_mittwald` und legt `~/.ssh/config` an mit:

```
Host *.project.host
    StrictHostKeyChecking accept-new
    UserKnownHostsFile ~/.ssh/known_hosts
    IdentityFile ~/.ssh/id_ed25519_mittwald
    IdentitiesOnly yes
```

Das passiert automatisch, du musst nichts tun. Verifizier dass `~/.ssh/config` existiert wenn du Zweifel hast.

**Recipe für eine psql-Session:**

```bash
export NO_PROXY=api.mittwald.de
mw container port-forward c-bczvk2 --project-id p-plhv26 15432:5432 &
PF=$!
for i in {1..40}; do pg_isready -h localhost -p 15432 -U lazi -d laziworks -q && break; sleep 0.3; done
PGPASSWORD="$LAZI_PG_PASSWORD" psql -h localhost -p 15432 -U lazi -d laziworks -c 'SELECT ...'
# weitere Queries …
kill $PF 2>/dev/null
```

Mehrere Queries in einer Session: Port-Forward einmal starten, mehrere `psql -c '...'` Calls, am Ende `kill $PF`. Oder interaktiv: `psql -h localhost -p 15432 -U lazi -d laziworks` ohne `-c`, dann `\q` zum Beenden.

**Hard rules für DB-Writes:**

- **ASK-FIRST bei jedem Write** (gleiche Pattern wie InvoiceNinja/Alfred). UPDATE/INSERT/DELETE → erst Query bei Michael abklären, dann ausführen, dann Ergebnis bestätigen.
- **Transaktional bei Mehrfach-Statements**: `BEGIN;` → mehrere Statements → `SELECT count(*)` zum Sanity-Check → `COMMIT;` oder `ROLLBACK;`.
- **NIEMALS `DROP TABLE`, `TRUNCATE`, oder schemaverändernde DDL** — das geht durch Prisma-Migrations, nicht via psql.

### Alternative — `mw container exec` (NICHT autonom nutzen)

Statt Port-Forward könntest du `mw container exec c-krnsej --project-id p-plhv26 -- ...` machen — das geht über die Mittwald-API (kein SSH). Aber das shellt in den **Produktions-App-Container** (c-krnsej, die laufende lazi.works Next-App). Auto-mode classifier blockt das. **Immer ASK-FIRST bei Michael**, unabhängig davon was du tust. Im Normalfall reicht der Port-Forward-Pfad oben.

### Migrations-Realität

Auch wenn du an die DB rankommst: **fünf Code-Stellen** schreiben noch direkt nach Supabase statt Mittwald (siehe Liste unten). Bei Inkonsistenzen (z.B. Student fehlt in Mittwald, ist aber in Supabase) — Michael melden, nicht selbst syncen.

---

## Freigabe-Workflow (Elfi-Automation)

> ⚠️ **STALE — Migration noch nicht abgeschlossen (Stand 2026-05-13)**
>
> Die unten gezeigten Snippets fragen `Werk` / `Projekt` / `ApprovalLog` über die **Supabase-PostgREST-API** ab. Das war richtig solange die App-DB Supabase war — ist jetzt aber **falsch**: die Produktions-Daten liegen seit dem Umzug auf **Mittwald-Postgres**.
>
> Realistische Zwischenlösung bis der Workflow neu gebaut ist:
> - **Pending-Werke abfragen**: Michael bitten, eine Liste pending Werke zu schicken (er hat psql-Access)
> - **Approval-Workflow**: Per Hand mit Michael durchgehen, statt API-Calls
>
> Die Supabase-`public.*`-Tabellen liefern ggf. *plausible aber veraltete* Antworten — nicht mehr darauf vertrauen.
>
> Das Snippet bleibt aus historischem Interesse hier, bis ein migrierter Workflow steht.

### Ausstehende Werke / Projekte abfragen (HISTORISCH — Supabase-Pfad)

```js
// Werke mit PENDING approval
const r = await fetch(`${SUPABASE_URL}/rest/v1/Werk?academyApproval=eq.PENDING&select=id,titel,userIntent,beschreibung,cloudinaryPublicId,student(vorname,nachname,semester)`,
  { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });

// Projekte mit PENDING approval
const r2 = await fetch(`${SUPABASE_URL}/rest/v1/Projekt?academyApproval=eq.PENDING&select=id,titel,userIntent,beschreibung,student(vorname,nachname,semester)`,
  { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
```

### Werk freigeben (PUBLIC) — HISTORISCH (Supabase-Pfad)

Drei Schritte: (1) Werk updaten, (2) ApprovalLog schreiben, (3) Google-Chat-Card senden.

```js
// 1. Status setzen — academyApproval UND publishStatus UND URL bauen
const student = await fetchStudent(werk.studentId); // handle für URL nötig
await fetch(`${SUPABASE_URL}/rest/v1/Werk?id=eq.${werkId}`, {
  method: 'PATCH',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  // publishStatus: 'ONLINE' ist PFLICHT — ohne es bleibt die URL 404!
  body: JSON.stringify({ academyApproval: 'PUBLIC', approvedContentHash: werk.contentHash, publishStatus: 'ONLINE' })
});
// URL: /<studentHandle>/<werkId> (Werk hat kein eigenes handle, UUID ist der Subhandle)
const werkUrl = `https://lazi.works/${student.handle}/${werkId}`;

// 2. ApprovalLog (id MUSS explizit als UUID mitgegeben werden — nicht auto-generated!)
const { randomUUID } = await import('crypto');
await fetch(`${SUPABASE_URL}/rest/v1/ApprovalLog`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: randomUUID(), entityType: 'WERK', entityId: werkId, action: 'APPROVED', targetStatus: 'PUBLIC', approvedContentHash: werk.contentHash, performedByDozentenId: null, performedByStudentId: null, note: 'Auto-approval by Elfi' })
});
```

ApprovalLog `id` ist **nicht auto-generated** → `randomUUID()` ist Pflicht (gilt auch nach der Migration, ist Schema-Property).

### Cloudinary-URL-Format für Cards (bestätigt funktionierend)

```
https://res.cloudinary.com/lazi/image/upload/w_800,c_limit,dpr_1.0,q_auto:best/<cloudinaryPublicId>.jpg
```

Regeln:
- **Keine `f_auto`** Transformation (kann Dateiformat wechseln → `.jpg`-Endung bricht)
- `.jpg` explizit anhängen
- `w_800,c_limit` für Chat-Thumbnails optimal
- Google Chat lädt `imageUrl` server-seitig (kein CSP-Problem)

### Card-Format für Freigabe-Notification

```json
{
  "title": "✅ <titel>",
  "description": "<vorname> <nachname> · <semester>",
  "imageUrl": "https://res.cloudinary.com/lazi/image/upload/w_800,c_limit,dpr_1.0,q_auto:best/<publicId>.jpg",
  "children": [{"type": "text", "text": "<beschreibung>"}],
  "actions": [{"label": "Werk öffnen", "url": "https://lazi.works/werk/<id>"}]
}
```

`children` nur befüllen wenn `beschreibung` vorhanden und nicht leer.

### Täglicher Auto-Approval-Job

Task `task-1778175563354-q2t0d0` läuft täglich 08:30 Europe/Berlin. Pre-check-Script fragt Supabase ab und setzt `wakeAgent: false` wenn nichts pending → kein unnötiger API-Call.

⚠️ **Auch dieser Pre-Check ist Teil der Supabase-Stale-Migration:** solange die Daten in Mittwald sind aber das Script noch Supabase fragt, kann der Job (a) schweigen obwohl was zu tun wäre oder (b) auf alte Geister-Datensätze in Supabase reagieren. Beim nächsten Trigger mit Michael abklären, ob der Pre-Check schon migriert wurde.

## Hard rules

1. **Niemals direkt auf `main` pushen** ohne Test-Run und Michaels OK — siehe `coding-protocol`-Skill
2. **Niemals `_SERVICE_ROLE_KEY` mit `NEXT_PUBLIC_` prefixen** (würde Service-Key im Browser leaken)
3. **Schema-Änderungen über Prisma-Migrations** gegen die Mittwald-Postgres-DB, nie direkt am DB-Schema. Supabase-Schema ist Altlast und für die App egal.
4. **Cloudinary-Uploads immer signed** — niemals unsigned-Endpoint nutzen (würde Cloudinary-Quota öffentlich machen)
5. **Approval-Logik nicht umgehen** — Werke ohne Akademie-Approval bleiben intern, auch wenn UserIntent=PUBLIC

## Failure handling

- **Prisma-Migration-Fehler**: Drift zwischen Schema und Mittwald-DB. `bunx prisma db pull` (gegen Port-Forward) zur Inspection, dann manuelle Migration. Tell Michael bei Drift.
- **Supabase-Realtime-Disconnect**: Display-Sync stockt. Browser-Reload des Display-Clients reicht meist; bei Cluster-weitem Problem im Supabase-Dashboard checken.
- **Supabase-Auth-Fail**: Login klappt nicht (z.B. JWT-Refresh-Issue). Supabase-Dashboard → Authentication-Logs. Häufige Ursache: Anon-Key / `hd`-Restriction-Config.
- **Cloudinary-Quota**: Free-Tier-Limit erreicht? Im Cloudinary-Dashboard prüfen, ggf. alte Test-Assets löschen.
- **Mittwald-App-Container-Crash**: App ist 5xx oder unerreichbar. `mw container logs c-krnsej --project-id p-plhv26 --tail 200` und `mw container ls --project-id p-plhv26` zum Health-Check. Häufige Ursache: fehlende ENV-Var im Stack-Env oder Image-Tag zeigt auf nicht-gepushtes SHA.
- **Mittwald-Postgres-Container-Crash**: App startet, kann aber nicht zur DB connecten. `mw container logs c-bczvk2 --project-id p-plhv26`. Bei Storage-Problemen Volume-Mount checken.

## Code-Stellen die noch direkt Supabase-Postgres schreiben (Migration in Arbeit)

Diese Spots schreiben noch ins alte Supabase-`public.*`-Schema statt nach Mittwald via Prisma — d.h. neue User landen *temporär* an der falschen Stelle. Migration läuft (Stand 2026-05-13):

- `src/proxy.ts:141` — `supabase.rpc('get_permission_level')` (Fallback, JWT-Claim ist Fast-Path)
- `src/app/api/create-student/route.ts:84` — `supabaseAdmin.from('Student').insert()`
- `src/app/api/create-dozent/route.ts:76` — `supabaseAdmin.from('Dozent').insert()`
- `src/app/signup/page.tsx:15` — `supabase.from('Fachbereich').select()`
- `src/app/signup/SignupForm.tsx:102` — `supabase.from('Student').insert()`

Bis das migriert ist: User-Anlage in der Mittwald-DB inkonsistent. Wenn Michael fragt warum Login klappt aber Student nicht erscheint — das hier ist der Grund.

## Was diese Skill NICHT macht

- **Direkt am Mac-Repo arbeiten**: Du bist im Hetzner-Container, kein Zugriff auf `~/Projects/lazi/lazi.works.new/`. Code-Änderungen formulierst du als konkrete Anweisung an Michael (Datei + Zeile + Diff), er macht sie.
- **DB-Schema ändern**: Nur über Prisma-Migration-Files gegen Mittwald-Postgres, nie direkt SQL.
- **Production-Deploy**: kein autonomer `./build-and-push.sh` oder `mw stack deploy`. Michael deployed selbst von seinem Mac aus.
