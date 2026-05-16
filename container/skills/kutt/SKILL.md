---
name: kutt
description: Kutt-basierter Link-Shortener für team:orange unter `https://links.teamorange.de` mit drei verschiedenen Custom-Domains für unterschiedliche Link-Zwecke (corporate, dev, external). Use whenever Michael einen kurzen Link erzeugen will ("mach mir nen Shortlink", "verkürz mal", "brauch das in kurz für Visitenkarten/Mail/Slides"), oder bei Inspirations-Diskussionen wofür welche Domain passend wäre. Auth via OneCLI gateway (`X-API-Key`-Header transparent injiziert).
---

# Kutt Skill (team:orange Link-Shortener)

team:orange betreibt eine selbst-gehostete Kutt-Instanz unter `https://links.teamorange.de`. Es gibt **drei konfigurierte Custom-Domains** für unterschiedliche Link-Klassen — die Domain-Wahl ist Teil der Marken-Kommunikation, **nicht beliebig austauschbar**.

## Die drei Domains — Kategorisierungs-Regel

| Domain | Zweck | Beispiele bestehend |
|---|---|---|
| `teamorange.agency` | **Marketing & Corporate-Repräsentation** — Links die team:orange als Marke nach außen zeigen (Social-Profile, Pitches, Newsletter-Sign-ups, Visitenkarten) | `teamorange.agency/instagram` (Social-Profile-Direktlink) |
| `teamorange.dev` | **Interne Entwicklungstools & Service-URLs** — Endpunkte unserer eigenen Dev/Tooling-Infra die wir intern oder per Auto-Integrationen nutzen | `teamorange.dev/pdf` (PDF-Generator-Wrapper auf chrome.teamorange.dev), `teamorange.dev/screenshot` |
| `link.von.to` | **Externe Inhalte / kreative Verweise** — Links zu externen Artikeln, Quellen, "Schau mal hier"-Material; gerne mit verspielten/sprechenden Slugs | `link.von.to/orangenkuchen` |

**Wichtig: nicht einfach gehorchen — mitdenken.** Wenn Michael "mach mir nen Shortlink zu X" sagt, ist das eine *Aufgabe*, kein *Befehl*. Du:

1. Klassifizierst den Ziel-Link in eine der drei Kategorien (oder fragst nach falls unklar)
2. Schlägst eine passende Domain + Slug-Idee vor (slug ist die Wahl mit dem meisten Wirkungs-Potential — kreativ, merkbar, on-brand)
3. Wartest auf Michaels OK (oder Gegenvorschlag) **bevor** du den Link anlegst
4. Bei externen `link.von.to/...`-Slugs: gerne mehrere Slug-Vorschläge (orangenkuchen-Stil — bildhaft, deutsch, nicht generisch)

## Auth + Endpoint

`https://links.teamorange.de/api/v2/...` — OneCLI injiziert `X-API-Key: <key>` automatisch.

Account-Owner: `nerds@teamorange.de` (= team:orange-Account).

## API Cookbook

### Existierende Links listen

```bash
curl -s "https://links.teamorange.de/api/v2/links?limit=50" \
  | jq '.data[] | {link, target, visits: .visit_count, created: .created_at}'
```

Default-Sortierung ist neueste zuerst. `?limit=N&skip=M` für Pagination.

### Suche nach Ziel-URL (z.B. um Doppel-Anlage zu vermeiden)

```bash
curl -s "https://links.teamorange.de/api/v2/links?search=$(printf '%s' 'westermann' | jq -sRr @uri)" \
  | jq '.data[] | {link, target}'
```

`?search=...` matched gegen target, address, description. Vor jedem Anlegen Suche fahren — Michael hat oft schon was vergleichbares.

### Link anlegen

```bash
TARGET="https://example.com/lange-url/mit-vielen-parametern?utm=etc"
DOMAIN="teamorange.dev"   # eine der drei
SLUG="myslug"             # custom-url
DESC="Optional kurze Notiz wofür"

curl -s -X POST "https://links.teamorange.de/api/v2/links" \
  -H "Content-Type: application/json" \
  -d "{
    \"target\": \"$TARGET\",
    \"customurl\": \"$SLUG\",
    \"domain\": \"$DOMAIN\",
    \"description\": \"$DESC\"
  }"
```

Response enthält `link` mit der finalen URL. Wenn `customurl` schon belegt: HTTP 400 mit `"customurl is already in use"`. Dann anderen Slug vorschlagen.

Domain weglassen (`"domain": null` oder Feld weglassen) → default-Domain `links.teamorange.de` mit auto-generiertem Slug. Den Fall vermeiden — passt zu keiner unserer drei Kategorien.

### Link löschen

```bash
LID="<uuid>"
curl -s -X DELETE "https://links.teamorange.de/api/v2/links/$LID"
```

### Statistik zu einem Link

```bash
LID="<uuid>"
curl -s "https://links.teamorange.de/api/v2/links/$LID/stats" | jq
```

Visits-Count, Browser-Splits, Country-Splits, Referrer-Splits — gut für "wie performt unser Newsletter-Shortlink"-Fragen.

## Cookbook-Workflows

### "Mach mir nen Shortlink zu <URL>"

```
1. Ziel-URL classifizieren (corporate / dev / external) — bei Unklarheit Michael fragen
2. Suche ob's schon einen gibt: GET /links?search=<keyword>
3. Falls ja: bestehenden Link zurückgeben + Visits-Stat
4. Falls nein: 2-3 Slug-Optionen + passende Domain vorschlagen → auf Michaels OK warten → POST
5. Antwort mit dem finalen Link (klickbar)
```

Beispiel-Slug-Brainstorm für externen `link.von.to/...`:
- URL ist ein Artikel über User-Experience-Patterns → Slug-Optionen: `ux-pattern`, `interaktion`, `userflow`
- besser: bildhafte / wortspielige Slugs im Geist von "orangenkuchen" — z.B. `kompass`, `kakao`, `papierflieger`. Etwas das man sich merkt, das Charakter hat.

### "Wie performt unser <slug>-Link?"

```bash
# Finde Link by Slug
curl -s "https://links.teamorange.de/api/v2/links?search=instagram" \
  | jq '.data[] | select(.address == "instagram")'
# Stats holen
curl -s "https://links.teamorange.de/api/v2/links/$LID/stats"
```

→ Visits, Trend, Browser/Country, antworten mit konkreten Zahlen.

### "Welche Shortlinks gibt's überhaupt?"

```bash
curl -s "https://links.teamorange.de/api/v2/links?limit=100" \
  | jq '[.data[] | {link, target, visits: .visit_count}] | sort_by(-.visits)'
```

Bei Liste in Antwort: link + Ziel-URL + Visits jeweils gruppiert nach Domain (corporate / dev / external) damit Michael die Übersicht behält.

## Hard Rules

- **Create immer ASK-FIRST** für die Domain-Slug-Combo — auch wenn der Ziel-Link klar ist. Slugs sind langlebig, falsche Wahl schwer zu korrigieren ohne den Link totzumachen. **Drei Slug-Vorschläge anbieten** + Domain-Empfehlung + warten.
- **Bei Re-Use** (Slug schon belegt) nicht stillschweigend was anderes nehmen — Michael melden, neue Idee anbieten.
- **Slug-Konventionen einhalten**:
  - `teamorange.agency/<slug>` — slug ist meist generisch-funktional (`instagram`, `linkedin`, `team`, `kontakt`, `newsletter`)
  - `teamorange.dev/<slug>` — slug ist tool-/funktionsorientiert (`pdf`, `screenshot`, `staging`, `vpn`)
  - `link.von.to/<slug>` — slug ist **kreativ-bildhaft** (`orangenkuchen` ist das Vorbild, nicht ID-style oder generisch). Mehrere Optionen anbieten.
- **Domain-Mischen → nicht** — niemals corporate-Inhalt unter teamorange.dev oder umgekehrt. Wenn ein Link beide Welten betrifft (z.B. eine Demo-Page die wir auch nach außen zeigen): mit Michael klären welche Domain führt.
- **Delete → Doppelbestätigung**: ein toter Link bricht alle Verweise in alten Mails/Visitenkarten/Slides. Vor `DELETE` prüfen wo der Link überall verlinkt sein könnte (Linkwarden + Wiki + Obsidian-Vault grep'en) und Michael darauf hinweisen.
- **Source-Link in Antworten**: Bei Listen oder Stat-Reports den Kutt-internen UI-Link für den jeweiligen Eintrag mitgeben (Pattern: `https://links.teamorange.de/edit/<id>` — falls verfügbar) ODER zumindest das `link`-Feld (= die Short-URL selbst) zum direkten Anklicken.

## Beziehung zu anderen Skills

- **Linkwarden** speichert URLs als Bookmark-Sammlung. Kutt erzeugt Short-URLs. Komplementär: wenn Michael "merk dir den Artikel" sagt → Linkwarden. Wenn er "mach mir nen Shortlink für meine Visitenkarte" sagt → Kutt. Bei "speicher den Link UND mach nen Shortlink" → beides parallel, klar als zwei Schritte vorschlagen.
- **Wiki.js**: in Wiki-Seiten verwendete URLs sollten oft kurz sein → bei größerer Doku-Page hinterher `teamorange.dev/<slug>` Links anbieten für interne Tool-Endpoints.
- **Obsidian-Vault**: Vault verlinkt mit Wikilinks intern, nicht mit Short-URLs. Aber Notes können `teamorange.dev/...`-Links referenzieren wenn sie Tool-Endpunkte dokumentieren.
