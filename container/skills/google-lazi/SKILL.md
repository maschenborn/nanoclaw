---
name: google-lazi
description: Read and write to Michael's LAZI Google Workspace (`michael.aschenborn@lazi-akademie.de`) — Gmail, Calendar, Drive, Docs, Sheets, Forms, Classroom. Use whenever the user (Michael, addressing Elfi) asks about LAZI Mails / Termine / Klassen / Materialien — e.g. "was ist heute LAZI-mäßig in meinem Kalender?", "letzte Mail vom Schulleiter?", "leg eine neue Aufgabe in DiMe-Classroom an", "schick eine Nachricht an die Klasse". OAuth handled transparently by the OneCLI gateway — no token logic in the skill.
---

# Google LAZI Skill

Elfi handelt als **`michael.aschenborn@lazi-akademie.de`** im `lazi-akademie.de`-Workspace. Die Auth läuft komplett über den **OneCLI-Gateway**: OneCLI hält die OAuth-Refresh-Tokens für diesen Account, ist Elfis OneCLI-Agent-Identität exklusiv zugeordnet (nicht m.aschenborn@gmail.com — das ist Alfreds Account), und injiziert frische Access-Tokens in jeden Request an `*.googleapis.com` im Hintergrund.

Konsequenz für die Skill-Code-Seite: **du sendest die HTTPS-Calls einfach so**. Keine Token-Holung, keine Refresh-Logik, kein `--noproxy`. Der Gateway-Proxy (HTTPS_PROXY env im Container) intercepted die Calls, ersetzt das fehlende `Authorization`-Header durch den passenden LAZI-Bearer, und routet weiter.

## Auth flow — every API call

Plain curl, kein Auth-Header nötig, OneCLI ergänzt ihn:

```bash
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/profile"
# → { "emailAddress": "michael.aschenborn@lazi-akademie.de", ... }
```

Falls du explizit einen Bearer setzt (z.B. weil eine Library standardmäßig leeren Header sendet), reicht ein Placeholder — OneCLI ersetzt ihn:

```bash
curl -s -H "Authorization: Bearer onecli-managed" \
  "https://drive.googleapis.com/drive/v3/files?pageSize=10"
```

### Was passierte vorher (Hintergrund, NICHT mehr nötig)

Bis 2026-05-16 lag das LAZI-OAuth-Bundle als read-only Mount im Container und das Skill machte den refresh→access-Tausch selbst, mit `--noproxy googleapis.com` damit der Gateway nicht interferiert. Seit OneCLI Multi-Account-Apps konfiguriert ist und der LAZI-Account Elfis OneCLI-Identität (`ag-1778163532245-qw4nmf`) exklusiv zugewiesen ist, übernimmt der Gateway das. Der Mount `/workspace/extra/lazi-google/google-bundle.json` existiert weiter als Notfall-Fallback (falls OneCLI mal ausfällt) — Code dafür im Git-History unter dieser Skill.

## Identity check — wer bin ich gerade

Sanity-Check ob OneCLI Elfis LAZI-Account injiziert (nicht Alfreds m.aschenborn). **Wichtig: NICHT `/oauth2/v2/userinfo` benutzen** — diese Endpoint ist in OneCLIs Apps-Registry nicht als Provider gemapped und liefert daher `access_restricted` auch wenn die Identität korrekt da ist. Das hat NICHTS mit verlorenem Zugriff zu tun. Nutze stattdessen Gmail-Profile als Identitäts-Quelle:

```bash
curl -s "https://gmail.googleapis.com/gmail/v1/users/me/profile" | jq -r .emailAddress
# Sollte: "michael.aschenborn@lazi-akademie.de"
# Bei "m.aschenborn@gmail.com" → falsche Identität, OneCLI-Assignment in der UI prüfen
```

## Troubleshooting: `SERVICE_DISABLED` mit GCP-Projekt 311791545398

Wenn ein Google-API-Call mit Status 403 und Message wie *"<Service> API has not been used in project 311791545398 before or it is disabled"* zurückkommt — das ist KEIN Projekt-Routing-Fehler, sondern ein einmaliges Setup:

- Projekt `311791545398` = `gen-lang-client-0132377876` = das **GCP-Projekt des OneCLI-OAuth-Clients** (BYOC-Web-Client `311791545398-dbnbie7h…`).
- Google quotaed API-Calls gegen das OAuth-Client-Projekt (Quota-Bind via `X-Goog-User-Project`), nicht gegen das Daten-Projekt `dime-474307`.
- Lösung: **Michael muss die fehlende API in jenem Projekt aktivieren** — einmalig im Cloud Console:
  ```
  https://console.cloud.google.com/apis/library/<API>.googleapis.com?project=gen-lang-client-0132377876
  ```
  (`<API>` = `sheets`, `classroom`, `docs`, `forms`, `drive`, `tasks`, `slides`, etc.)

Nicht selbst versuchen das zu umgehen mit `--noproxy googleapis.com` und Bundle-Read — das fällt zwar auf den alten Fallback-Pfad zurück (siehe "Was passierte vorher"), aber damit sieht keiner mehr den OneCLI-Account-Bind und Multi-Account-Isolation ist hin. Statt dessen: kurz Michael pingen ("Bitte API X in Projekt 311791545398 aktivieren") und auf seine Bestätigung warten.

## Scope distinction

| | Reads on user request | Writes (ASK-FIRST always) |
|---|---|---|
| **Gmail** | list / search / get message bodies / labels / threads | send, draft, modify labels, delete |
| **Calendar** | list events, free/busy, search | create / update / delete events, attendee changes |
| **Drive** | list / search / read files | upload, share, move, delete |
| **Docs** | read content | create, edit, comment |
| **Sheets** | read cell ranges, formulas | write cells, formulas, add sheets |
| **Forms** | list responses, view structure | create form, edit questions, send |
| **Classroom** | list courses, students, coursework, submissions, announcements | post announcement, create coursework, grade submission, contact roster |

**Reads are always fine on request.** **Writes are ASK-FIRST every time**, two-stage gate for anything that lands in someone else's inbox / Classroom feed (compose draft → confirm; for emails: separate gate for send vs draft-only).

## Hard rules — verbatim from CLAUDE.local.md, restated for emphasis

1. **NEVER auto-reply to inbound mails.** Default for any third-party inbound is *silent acknowledgement* (read, summarise to Michael, wait for instruction). No "auto-confirmation", no "Ich leite weiter an Michael" reply. Even polite Auto-Replies are forbidden.
2. **Schülerdaten** (rosters, names, emails, grades, attendance, individual messages from students) are **highly confidential**. Never copy outside the LAZI environment — not into Obsidian, not into PhoenixDMS, not forward to Alfred. Aggregate stats fine on request; individual data only on explicit instruction with a clear purpose.
3. **Writes ASK-FIRST every time** — even when the request feels unambiguous. Build a draft, show it on the active channel (Google Chat / claw), wait for explicit "ja"/"erstellen"/"go", then POST.
4. **Identity discipline**: outbound mail goes from `michael.aschenborn@lazi-akademie.de` (you ARE authenticated as him). Body always identifies you as Elfi:
   - Opening: *"Hallo, hier ist Elfi, Michaels KI-Assistentin — Michael bittet mich, dir zu schreiben: …"*
   - Signatur: *"Viele Grüße, Elfi (Assistentin von Michael Aschenborn)"*
   - Never sign as Michael, never quote him as if he wrote.
5. **Classroom-Aktionen sind Lehrer-Aktionen.** Posts, Aufgaben, Bewertungen, Kommentare an Schüler — alles sichtbar. Nichts ohne explizite Anweisung.
6. **Send-vs-Draft-Gate**: Mail-Senden ist ein zusätzlicher Schritt nach dem Erstellen. Erst Entwurf zeigen → Michael bestätigt Inhalt → erstellen als Gmail Draft. Dann separate Frage *"Soll ich auch direkt senden?"* — erst auf erneutes "ja" → POST send.

## Common workflows

### "Was steht heute im LAZI-Kalender?"

```bash
# Today in Berlin TZ
START=$(date -u -d "today 00:00 Europe/Berlin" --iso-8601=seconds)
END=$(date -u -d "tomorrow 00:00 Europe/Berlin" --iso-8601=seconds)
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=$START&timeMax=$END&singleEvents=true&orderBy=startTime" \
  | jq '.items[] | {start: .start.dateTime, end: .end.dateTime, summary, attendees: (.attendees | length)}'
```

Format response in WhatsApp-/Chat-style (German):
```
*Heute in LAZI*
• 09:00–10:30 — DiMe Vorlesung (12 Teilnehmer)
• 14:00–15:00 — Sprechstunde
```

### "Mail vom Schulleiter neulich?"

```bash
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from%3Aschulleiter%40lazi-akademie.de&maxResults=5" \
  | jq -r '.messages[].id' | head -3 | while read id; do
    curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/$id" \
      | jq '.payload.headers[] | select(.name=="Subject" or .name=="From" or .name=="Date") | "\(.name): \(.value)"' -r
    echo '---'
  done
```

### "Mail an Klassenelternverteilung schreiben — Vorlage zeigen"

1. Lookup Klasse (Classroom course id) — *"welche Klasse meinst du?"* falls mehrdeutig
2. Roster fetchen für Adressen (Classroom API: `/courses/<id>/students`)
3. Entwurf bauen mit Identifikations-Block + Body
4. Auf Chat zeigen: 
   ```
   *Mail an DiMe 5./6. Sem. (12 Empfänger)*
   _Subject:_ Wichtige Info zum Donnerstag-Termin
   _Anrede:_ Liebe DiMe-Studierende,
   _Body:_ Hallo, hier ist Elfi, Michaels Assistentin. …
   _Signatur:_ Viele Grüße, Elfi
   Soll ich als Draft anlegen?
   ```
5. Auf "ja" → Gmail Draft anlegen (`POST /users/me/drafts`). Antwort: *"Draft 0042 angelegt — soll ich auch direkt rausschicken?"*
6. Auf zweites "ja" → `POST /users/me/drafts/<id>/send`

### "Lass die Notenliste für den letzten Test aufzeigen"

```bash
# courses
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://classroom.googleapis.com/v1/courses?teacherId=me" | jq '.courses[] | {id, name}'

# pick the relevant course id, then:
COURSE_ID=...
# coursework (assignments)
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://classroom.googleapis.com/v1/courses/$COURSE_ID/courseWork" \
  | jq '.courseWork[] | {id, title, dueDate, maxPoints}'

# submissions for one assignment
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://classroom.googleapis.com/v1/courses/$COURSE_ID/courseWork/<work_id>/studentSubmissions" \
  | jq '.studentSubmissions[] | {userId, state, assignedGrade}'
```

Aggregate to anonymized stats unless Michael explicitly asks for individual names.

## Failure handling

- **`401 invalid_credentials` / `401 invalid_grant`** on token-refresh: refresh-token is dead (rotated by Google, or revoked, or 6+ months unused). Tell Michael; new browser auth-flow needed (see installation runbook).
- **`403 insufficientPermissions` / `403 forbidden`** on an API call: scope missing from the bundle (e.g. you tried Drive but only Gmail/Calendar scopes were granted). Tell Michael; add scope means re-running the auth-URL with extended scopes.
- **`404 Not Found`** on Classroom resources: course/coursework/student id wrong, or you don't have access (e.g. course belongs to another teacher). Re-check.
- **`429 rateLimitExceeded`**: back off with exponential delay. Don't loop blindly.
- **`500` / network**: Google upstream issue. Tell Michael, retry once after a minute, then abort.

## What this skill does NOT do

- **Domain-wide delegation impersonation**: this is a User-OAuth setup, not a Service-Account-with-DwD setup. You can only act as the one identity that authorized — `michael.aschenborn@lazi-akademie.de`. Other LAZI users (other teachers, students) you only see indirectly via Michael's perspective.
- **Bulk operations across many courses/users at once**: no autonomous mass-send / mass-grade. Always per-action ASK-FIRST.
- **Cross-domain ops**: don't email or interact with `m.aschenborn@gmail.com` (Alfred-territory) or push LAZI data into Alfred-related contexts.
- **Refresh-token persistence**: the refresh-token in the bundle is long-lived but NOT permanent. If it expires, the auth-URL must be re-run interactively in a browser (procedure documented in `~/orchester/nanoclaw/CLAUDE.md`).
