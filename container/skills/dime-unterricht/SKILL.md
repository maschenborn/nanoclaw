---
name: dime-unterricht
description: Operations für Michaels Dozenten-Tätigkeit an der LAZI Akademie (DIME-Fachbereich) — DOK-Spreadsheet (Anwesenheit + Noten + LOG), Google Classroom API (Assignments anlegen, Drive-Uploads, Roster lesen), Stunden-Tagebuch im LAZI-Obsidian-Vault, Termine. Use whenever Michael asks about Klausuren, Anwesenheit, Hausaufgaben, Klassenroster, Notenvergabe, Tagebuch-Eintragen — z.B. "wer war heute in DIME 555?", "leg die Klausur als Draft in Classroom an", "trag den LOG-Eintrag für UE7 ein", "was hatten die letzte Stunde?", "Liste der Luna-Studenten mit UID".
---

# DIME-Unterrichts-Skill

Michael unterrichtet an der **LAZI Akademie Esslingen** im Fachbereich **DIME** (Digital Media). Drei aktive Kurse im SS 2026, dienstags. Diese Skill bündelt das operative Wissen für Termin-zu-Termin-Aufgaben.

**Hard-Rule (aus CLAUDE.local.md, hier verschärft):** Niemals als „team:orange" / „Team Orange" / „teamorange" verbalisieren — auch nicht in Code, Commits, Mails, Classroom-Posts. Technische URLs wie `coolify.teamorange.dev` sind unvermeidbar; im Verbalen die Marke „LAZI" oder „Michael" verwenden.

## Kurse SS 2026

| Kurs | Course-ID (Classroom) | Kohorte | Sem |
|---|---|---|---|
| DIME 444 | `846565417675` | Flash | 4. |
| DIME 555 | `846559505635` | Luna | 5. |
| DIME 666 | `846565980942` | Smarties | 6. |

Termine immer Montags. Detailwissen (Stunden-Inhalte, Tagebücher, Wissensartikel) liegt **vollständig im LAZI-Obsidian-Vault** unter `/workspace/extra/obsidian-lazi/Kurse/<Kohorte>/DIME xxx/`. Lies dort — nicht aus dem Gedächtnis.

## DOK-Spreadsheet — die zentrale Notenmatrix

Das **DOK-Sheet** ist die Source of Truth für Anwesenheit, LOG und Noten. Per Sheets-API zugreifen.

### Sheet-IDs
| Semester | Spreadsheet-ID |
|---|---|
| SS 2026 (aktuell) | `1wnvRfe8DmWmUJAi7RRHSCFaGcM-y_9Adkg5HtTWg7Ug` |
| WS 2025 | `19LMA2e7kW9sA1mTX0-o2zsE8vcmvDc4iI3eeyv8Trt0` |
| SS 2025 | `1d2LoDKdJ2briQb7nDicE7gv6tUxyY1r_XsxmFgKMhvg` |

Tabs heißen `DIME | 444`, `DIME | 555` (gid `244262870`), `DIME | 666`.

### Layout (SS 2026)

```
Row 1 :  Bereichsüberschriften — LOG ab Spalte AP, NOTEN ab Spalte AU
Row 3 :  Header Anwesenheit
         A=Vorname, B=Nachname, C=Gruppe, J="Einheit ="
         K..AC = UE 1 .. UE 30  (15 reichen oft)
Row 4 :  Header LOG
         AP=UE-Nr, AQ=Datum, AR=Beschreibung, AS=Anmerkung, AT=Gewichtung
Row 5+:  Studierende (Anwesenheit) UND parallel LOG-Einträge
         (UE-Nr + Datum vorausgefüllt)

Anwesenheits-Werte:  A = anwesend
                     F = Fehlt unentschuldigt
                     E = entschuldigt

NOTEN-Spalten:  AU = "Praktische Klausur" (erste Note)
                AV..BB = "Beschreibung der Note" (weitere Klausur-Slots)
```

### UE → Row-Mapping (LOG-Einträge)

```
UE1 = Row 5
UE2 = Row 6
...
UE7 = Row 11
UE15 = Row 19
```

Anwesenheits-Spalten:
```
UE1 = K (Index 10)
UE2 = L (11)
...
UE7 = Q
```

### Wichtig — niemals Zukunft überschreiben

Termine sind **vorausgefüllt** über das ganze Semester. Beim Schreiben **immer nach Datum ≤ heute filtern**, sonst zerstörst du Zukunfts-Slots, die noch befüllt werden müssen.

### Bereits eingetragene LOGs (SS 2026, Stand 2026-05-04)

- `DIME | 555` AR9 (UE5 13.04.) — Praktischer Test HTML/CSS
- `DIME | 555` AR11 (UE7 27.04.) — Praktische Klausur HTML/CSS
- `DIME | 666` AR11 (UE7 27.04.) — Single-Purpose-Apps Präsentationen + kite.video

## Google Classroom API

**Auth-Flow**: OAuth Desktop-App, Refresh-Token. Bundle bereits über `google-lazi`-Skill — siehe dort für Token-Exchange. Identität: `michael.aschenborn@lazi-akademie.de` (Lehrkraft-Account in LAZI Workspace).

**GCP-Projekt**: `dime-474307`. Aktive APIs: Classroom, Sheets, Docs, Slides, Forms, Drive.

### Helper-Patterns aus dem `classroom-api/`-Repo

Repo bei Michael: `~/Projects/lazi/classroom-api/` (auf Mac, nicht hier auf Hetzner). Wenn du im Container Code ausführst, der mit Classroom interagieren soll, **schreibe eigenen TypeScript-Code** mit der `googleapis`-Lib oder direkten REST-Calls — die Helpers aus dem Mac-Repo sind nicht im Hetzner-Container.

#### Assignment anlegen (Draft → Michael published manuell)

```ts
import { google } from 'googleapis';
const classroom = google.classroom({ version: 'v1', auth });
await classroom.courses.courseWork.create({
  courseId: '846559505635',  // DIME 555
  requestBody: {
    title: 'Praktische Klausur HTML/CSS',
    description: '...',
    workType: 'ASSIGNMENT',
    state: 'DRAFT',           // ← immer DRAFT, Michael publiziert
    materials: [{
      driveFile: {
        driveFile: { id: '<file-id>', title: '<file-title>' },
        shareMode: 'VIEW',
      },
    }],
    dueDate: { year: 2026, month: 5, day: 15 },
    dueTime: { hours: 23, minutes: 59 },
    maxPoints: 100,
  },
});
```

`state` = `'DRAFT'` ist **non-negotiable**: niemals direkt `'PUBLISHED'` ohne explizites OK von Michael.

#### Drive-Upload + Public-Read (für Aufgaben-Anhänge)

```ts
const drive = google.drive({ version: 'v3', auth });
const f = await drive.files.create({
  requestBody: { name, mimeType: 'application/zip' },
  media: { mimeType: 'application/zip', body: fs.createReadStream(path) },
  fields: 'id, name, webViewLink',
});
await drive.permissions.create({
  fileId: f.data.id!,
  requestBody: { role: 'reader', type: 'anyone' },
});
```

#### Roster lesen

```ts
const students = await classroom.courses.students.list({
  courseId: '846559505635',
  pageSize: 100,
});
```

Returns userIds, profile.name, profile.emailAddress. Für Notenvergabe-Skripte: erst Roster ziehen, dann pro Student `studentSubmissions` patchen.

## Tagebuch-Workflow im LAZI-Vault

Pro Termin: ein **Stunden-File** + Eintrag im **Tagebuch-Übersichts-File**. Dazu der LOG-Eintrag im DOK-Sheet.

### Stunden-File-Pfad

```
/workspace/extra/obsidian-lazi/Kurse/<Kohorte>/DIME xxx/<YYYY-MM-DD> DIME xxx.md
```

z.B. `Kurse/Luna/DIME 555/2026-05-11 DIME 555.md`

### Frontmatter-Standard

```yaml
---
tags: [DIME555, ...thematische tags, prüfungsrelevant?]
typ: unterricht
kurs: DIME 555
semester: 2026-SS
datum: 2026-05-11
status: aktiv
prüfungsrelevant: true
schwierigkeit: basis|mittel|hoch
bereiche: [HTML, CSS, ...]
related:
  - Kurse/Luna/DIME 555/Luna 555 Tagebuch.md
---
```

### Tagebuch-Eintrag (an Übersichts-File anhängen)

```
### NN — DD.MM.YYYY ✅
**Thema:** ...
- Bullet-Points (3–5)
→ Details: [[YYYY-MM-DD DIME xxx]]
---
```

### Linking-Regeln (hart)

- **Stunde → Tagebuch → Kohorte + Kurs** (das ist die Linking-Pyramide)
- **Stunde → Wissens-Artikel** und **Wissens-Artikel → Kurs**
- **NIEMALS** Cross-Course-Links (DIME 444 ↔ DIME 555) — auch wenn Themen ähnlich sind
- **NIEMALS** Cross-Kohorten-Links (z.B. Luna ↔ Smarties)

Begründung: jede Kohorte hat ihre eigene Lernlinie. Cross-Links erzeugen falsche „Übergreifend"-Beziehungen die für Studenten verwirrend sind.

## Workflow-Sequenz nach jeder Unterrichtseinheit

1. **Stunden-File** anlegen unter `Kurse/<Kohorte>/DIME xxx/YYYY-MM-DD DIME xxx.md` mit Frontmatter
2. **Tagebuch** ergänzen (Übersichts-File: `Kurse/<Kohorte>/DIME xxx/<Kohorte> xxx Tagebuch.md`)
3. **Optional**: Draft-Announcement via Classroom API anlegen → Michael prüft → publiziert manuell
4. **DOK-Sheet LOG** in Spalte AR der UE-Zeile beschreiben (siehe UE→Row-Mapping)
5. **Anwesenheit** im DOK-Sheet pro Studierendem in der UE-Spalte (K..AC)
6. **Vault-Pull/Push**: vor Schritt 1 `git pull --ff-only`, nach Schritt 2 `git commit && git push` (siehe `obsidian-lazi`-Skill)

## Aktuelle offene Aufgabe (Stand 2026-05-04)

**DIME 666 Landingpage zur Single-Purpose-App**:

- Stack-Pflicht: Astro / Tailwind / Bun (latest)
- Classroom-Draft existiert (CourseWork-ID `862705302578`, Status `DRAFT`)
- Vorlage liegt bei Michael auf Mac unter `~/Downloads/landingpage/` + ZIP
- AGENTS.md-Pre-Flight-Gate verlangt: Marketing-Ziel, CTA, 5-Sek-Test, Benefits, Social Proof, Anti-Patterns
- Kommando: `npx antigravity-awesome-skills --antigravity` als Pre-Flight

Wenn Michael das anpackt: ihn an die Pre-Flight-Fragen erinnern, bevor Code geschrieben wird.

## Praktische-Klausur-Bewertungen (Luna, eingetragen 2026-05-04)

DOK `DIME | 555` Spalte AU bereits gesetzt. Plagiats-Cluster sind erkannt und dokumentiert (im Vault unter `Kurse/Luna/DIME 555/Klausuren/`), **nicht** in technische Note eingerechnet — das ist Michaels eigene Entscheidung.

| Cluster | Mitglieder | Hinweis |
|---|---|---|
| float-classic | Cora ↔ Elia ↔ Lana | gleiche Magic Numbers, alle `font-family:futura` (statt `futura-pt`) |
| float + `<br>` | Nathalie ↔ Selina | identische Pixel-Werte, `rgba(0,0,0,0.7)`, `<h3>/<h2>/<h4>`-Missbrauch |
| position:absolute | Bruce ↔ Emanuel | Code 1:1 identisch, gleicher Tippfehler "Florian lichmann" |

## LDAP-UIDs der Luna-Studierenden (für NAS-Deploys)

```
cora.gressinger        228642813
maart.luehrs           1708436834
bruce.khieosavath      1986693865
emanuel.knezevic       1358388061
marlene.strobel         481794074
elia.kissling           838997708
lana.schuetz           1022641487
nathalie.stempniewicz   223694182
selina.neufeld          241381198
christopher.scherer    (kein Home, Stand 2026-05-04 — neu prüfen)
```

UIDs für `lazistation`-Skill bei Deploys auf `/volume1/homes/@LH-LAZI-AKADEMIE.DE/<numericID>/...`.

## Hard rules

1. **Classroom: Drafts only**, niemals direkt veröffentlichen ohne Michael
2. **DOK-Sheet: niemals Zukunfts-Slots überschreiben** (Filter `Datum ≤ heute`)
3. **Cross-Course / Cross-Kohorten-Links verboten** im Vault
4. **Hetzner ≠ Mac**: Helper-Repos liegen auf Michaels Mac, hier im Container nur deren Logik nachbauen — nicht versuchen, Pfade wie `~/Projects/...` zu öffnen
5. **Schülerdaten** (Roster, Mails, Noten, Anwesenheit) bleiben im LAZI-Kontext — niemals an Alfreds Vault, ins DMS, in andere Mails kopieren

## Failure handling

- **Classroom 401**: Refresh-Token expired oder revoked. Siehe `google-lazi`-Skill.
- **Sheets 403 forbidden**: Account hat keine Edit-Rechte. Ist der `michael.aschenborn@lazi-akademie.de`-Account Owner / Editor des Sheets? Tell Michael.
- **Drive Quota**: Soft limit reached. Bei vielen Uploads in kurzer Folge: 429 → exponential backoff.
- **Stunden-File schon vorhanden**: nicht überschreiben — append nur. Stunden sind chronologisch eindeutig.
