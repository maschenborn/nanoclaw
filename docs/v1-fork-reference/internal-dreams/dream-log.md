# Alfred Dream Log

Beobachtungen und Muster aus autonomen Nacht-Sessions.

---

## [2026-04-23] Nacht 1

### Was gemacht
- Inbox: leer.
- Dead-Link-Fix: `[[anthropic-skills-guide.pdf]]` → echter Markdown-URL (PDF existiert nicht im Vault).
- Cross-Ref: `[[MCP]]` in [[Anthropic Skills Guide]] "Siehe auch" ergänzt (symmetrische Backlink-Lücke zur MCP-Concept-Page).
- Orphan-Scan: keine Orphans in 72 Wiki-Pages.
- hot.md + log.md aktualisiert.
- 5 Datei-Touches gesamt.

### Beobachtungen

**Dead-Link-Muster:** Die meisten verbleibenden "Dead-Links" sind gar keine — sie resolven auf Dateien in `Tools/` oder `AI Orchestration/Skills/`, die außerhalb von `Wiki/` liegen. Obsidian's filename-based resolution macht `[[Claude-Mem - AI Session Memory System]]` gültig, auch wenn die Datei in `Tools/` liegt. Die Python-Scan-Logik prüft nur den Stem-Namen, nicht den Pfad — das ist korrekt, weil Obsidian so funktioniert.

**Log-historische Dead-Links:** ca. 10-12 Wikilinks in `log.md` sind akzeptiert-offen (historische Rename-Marker, Template-Beispiele). Diese als solche markiert halten → nicht jede Nacht neu prüfen müssen.

**Vault-Datum-Diskrepanz:** Die letzten Log-Einträge tragen Datum 2026-04-25, der Shell-Timestamp zeigt 2026-04-23. Mögliche Ursache: vorherige Claude-Code-Sitzungen liefen mit falschem Systemdatum oder Timezone-Offset. Kein Handlungsbedarf — log.md ist append-only, die historischen Daten bleiben.

**Backlink-Symmetrie gut gepflegt:** Neue Concept-Pages (Complex Adaptive Systems, Emergence, Prediction Markets, Memory Systems for AI Agents) haben alle symmetrische Relations. Der Phase-9-Batch hat [[Claude Code]] von 1 auf 19 Backrefs gebracht.

### Muster / Verbesserungsvorschläge

1. **Dead-Link-Scanner sollte Nicht-Wiki-Ordner explizit whitelist-en.** Der aktuelle grep-basierte Scan findet viele Wikilinks als "dead", die tatsächlich auf `Tools/`, `AI Orchestration/Skills/`, `Fundstücke/` etc. zeigen. Ein intelligenterer Scanner würde den gesamten Vault als Namensraum nehmen, nicht nur `Wiki/`. (Dieser Alfred macht das bereits mit Python.)

2. **MCP ist jetzt das am besten quervernetzte Concept** (5 Sources, viele Entity-Mentions). Könnte Kandidat für `confidence: high` im V2-C-Tagging sein.

3. **Anthropic Skills Guide** war das einzige kürzlich hinzugefügte Source mit einer fehlenden bidirektionalen Verknüpfung (→ MCP). Alle anderen neuen Sources hatten vollständige Cross-Refs. Das spricht für gute bisherige Ingest-Qualität.

4. **Inbox war leer** — gut. Ziel Zero-Inbox wird gehalten.

### Offen für nächste Nächte

- Wenn Inbox leer und Lint sauber: Nächste produktive Aufgabe wäre V2-C Confidence-Tagging auf 5 Concepts starten (opt-in, konservativ: nur `confidence: medium` wo offensichtlich).
- Backlink-Symmetrie für Sources ist lockerer definiert (optional) — Concepts/Entities sind das Haupt-Prüfobjekt.

---

## [2026-04-23] Dream #2 — P1 Dead-Link-Stubs

### Was gemacht
- Vollständiger Dead-Link-Scan: 28 dangling Targets identifiziert, 14 in Live-Content.
- 4 neue Entity-Stub-Pages (v2) angelegt: Context Portal MCP, Claude-Mem, Claude-Obsidian, Nano Banana 2 Skill.
- 1 single-ref dead-link auf plain text konvertiert (Claude HUD).
- index.md, hot.md, log.md aktualisiert. 8 Edits gesamt.

### Beobachtungen

**Stub-Strategie funktioniert für hochvernetzte dangling links.** Wenn 5-7 live Pages auf denselben dangling Target zeigen, ist ein Stub sinnvoller als 5-7 einzelne plain-text-Konversionen. Die Stubs tragen `source_complete: false` und `blocked_reason:` — damit ist der Wartungszustand klar kommuniziert und Michael sieht beim Öffnen sofort: "braucht eine richtige Source-Page."

**"Stub" ist ein eigener Qualitätslevel** zwischen "keine Page" und "reviewed Page". Fehlt im v2-Spec explizit. Vorschlag für nächste Spec-Version: `quality_bar: stub` als gültiger Wert einführen, damit Stubs im Lint klar als "incomplete-by-design" erscheinen. Aktuell: `quality_bar: v2` + `source_complete: false` + `blocked_reason:` — funktioniert, aber ein eigener Marker wäre klarer.

**Dead-Link-Kategorisierung läuft nun gut.** Die manuelle Klassifizierung in Template-Noise, Log-historisch, Folder-Pfade, und echte dangling Links braucht ~5 Minuten pro Session. Ein Bash-Skript könnte das automatisieren: whiteliste bekannte Template-Noise-Targets und log.md, melde nur noch echte live-content dangling links. Das würde Nacht-Sessions schneller machen.

**Fehlende Repo-URLs.** 3 von 4 neuen Stubs haben kein `repo:` Feld, weil URLs nicht aus vorhandenem Vault-Material ableitbar waren. Besser als erfundene URLs. Für Source-Pages nachzutragen, wenn Michael diese Tools ingestet.

**Vault-Wachstum:** 72 → 76 Pages in einer Nacht durch reine Struct-Arbeit (kein neues externes Material). Das zeigt: der Vault hat einen langen "internal backlog" (bekannte Konzepte ohne Pages). Die echte Verdichtungsarbeit (Stub → vollständige Page) braucht externe Quellen, die Michael einbringen muss.

### Muster / Verbesserungsvorschläge

1. **Automatischer Dead-Link-Klassifizierer** als Bash-Skript einbauen: nimmt alle Vault-Filenames als Namensraum (nicht nur Wiki/), whitelisted Template-Noise, gibt nur live-content dangling links aus. Würde Lint-Scan-Phase von ~10 Min auf ~1 Min reduzieren.

2. **Stub-Tracking in index.md explizit.** Aktuell: Stubs stehen mit `(stub, ...)` im Entities-Listing. Gut. Könnte auch ein eigenes `## Stubs (maintenance backlog)`-Abschnitt in index.md werden, um Stubs von vollständigen Pages zu trennen — wenn die Zahl der Stubs wächst.

3. **Claude-Mem und Context Portal MCP** sind beides Memory-System-Komponenten, die stark mit [[Memory Systems for AI Agents]] verknüpft sind. Wenn Michael die Source-Pages irgendwann ingestet, sollte das Concept aktualisiert werden (aktuell zeigt es schon auf diese Entities, aber ohne eigene Pages waren die Links dead).

### Offen für nächste Nächte

- Wenn noch Nacht-Budget übrig: P2 Orphan-Check auf die 4 neuen Stubs (werden sie von mindestens einer Page referenziert? Ja — sie lösen dangling links). ✅ Kein weiterer Fix nötig.
- V2-C Confidence-Tagging (parkiert): wenn Inbox leer und Lint sauber, lohnt sich das nächste Nacht-Budget dafür. 5 Concepts mit `confidence: medium` würde ~5 Edits kosten.

---

## [2026-04-23] Nacht 3 — Cross-Ref-Nacht

### Was gemacht
Fokus auf Cross-Referenzierung der 5 jüngsten Sources (alle 2026-04-24 promoted):
- Boris Cherny Backlinks in 3 Sources gesetzt (Git Worktree, Team Best Practices, Setup)
- MCP Concept-Links in 2 Sources gesetzt
- 2 komplett linklose Sources mit Siehe-auch-Sektionen versehen

### Wiederkehrende Muster

**1. Author-Entity → Source-Backlink-Gap**
Boris Cherny Entity hat `sources:` Frontmatter-Liste mit 4 Source-Pages, aber keine dieser Sources verlinkten zurück. Muster: die Promotion-Session (Phase-8) hat die Entity-Page sorgfältig gepflegt, aber das Gegenstück (Autor-Erwähnung in Source-Body → Wikilink) blieb liegen.

Hypothese: Bei der Pre-Wiki → Wiki Migration wurden die Source-Bodies oft nicht angefasst — sie kamen 1:1 aus dem alten Format. Wikilinks wurden nur an offensichtlichsten Stellen gesetzt (`[[Claude Code]]`), aber Author-Erwähnungen blieben plain text.

**2. Sparse Sources ohne Wikilinks**
`agents.md outperforms Skills – Vercel` und `Demystifying Evals for AI Agents` hatten 0 Wikilinks im Body — ihre Inhalts-Sections waren nur 2-4 Zeilen. Dies deutet auf Sources hin, die als "Platzhalter" promoted wurden (Metadata vollständig, Content minimal). 

Muster: kurze Sources tendieren zu 0 Wikilinks, weil die automatische Wikilink-Setzung im Ingest-Workflow eine gewisse Textmasse braucht.

### Vorschläge für obsidian-Skill

**Lint-Regel P2.5 — Source-Backlink-Check:**
Für jede Entity-Page mit `sources:` Frontmatter-Feld: prüfe ob die gelisteten Sources den Entity-Namen im Body als `[[Entity]]`-Wikilink tragen. Falls nicht → Lint-Finding.

**Lint-Regel P3 — Zero-Wikilink Sources:**
Wiki/Sources-Pages mit 0 `[[...]]`-Wikilinks im Body (außer Frontmatter) sind Kandidaten für Siehe-auch-Ergänzung. Einfacher grep-Check: `grep -L '\[\[' Wiki/Sources/*.md`.

**Ingest-Workflow Ergänzung:**
Bei Source-Ingest: wenn `author:` Feld gesetzt und Entity-Page `Wiki/Entities/<Autor>.md` existiert → Author-Erwähnung im Body als Wikilink setzen (Schritt 9 oder neuer Schritt 9b).

### Offen für nächste Dream-Nächte
- Claude Code Customization Guide + Claude Agent SDK Tutorial ebenfalls Boris-Cherny-Sources ohne Backlink — nicht in den 5 jüngsten, aber gleiche Lücke
- `[[Demystifying Evals for AI Agents]]` ↔ `[[agents.md outperforms Skills – Vercel]]` Cross-Ref jetzt gesetzt, aber beide Pages sind inhaltlich sehr dünn — Kandidaten für Content-Enrichment wenn mehr Sources vorhanden
