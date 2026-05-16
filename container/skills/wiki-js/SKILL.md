---
name: wiki-js
description: Wiki.js v2 für team:orange unter `https://wiki.teamorange.de` — **das offizielle interne team:orange-Wiki** mit strukturierten Prozessen, Tool-Doku, Organisations-Wissen, Vorlagen. Use whenever Michael nach offizieller Doku fragt ("wie ist der Prozess für X", "wo finde ich die Vorlage Y", "was wissen wir formal über Tool Z"), oder neue Doku-Seiten anlegen will die für das ganze team:orange-Team sichtbar werden sollen. Auth via OneCLI gateway (Bearer JWT). GraphQL-only, kein REST.
---

# Wiki.js Skill (team:orange offizielles Wiki)

Wiki.js unter `https://wiki.teamorange.de` ist das **kanonische team:orange-Wiki** — strukturierte Tool-Doku, Organisationsprozesse, formales Wissen. Stand 2026-05-16 ~39 Seiten in hierarchischen Pfaden (`tools/intern/...`, `organisation/prozesse/...`, `wissen/...`).

## Auth + Endpoint

GraphQL-only an `https://wiki.teamorange.de/graphql`. OneCLI injiziert `Authorization: Bearer <jwt>` automatisch — du sendest plain POST.

```bash
curl -s -X POST "https://wiki.teamorange.de/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ pages { tags { tag } } }"}' | jq
```

## Pfadstruktur

Wiki.js organisiert Seiten als hierarchische Slug-Pfade (nicht Wikilinks wie Obsidian). Gefundene Top-Level-Räume:

| Pfad-Prefix | Inhalt |
|---|---|
| `tools/intern/` | Interne Tools (MOCO, 1Password, Mautic, Anwendungen, …) |
| `tools/development/` | Entwicklungstools |
| `organisation/prozesse/` | Geschäftsprozesse |
| `organisation/vorlagen/` | Templates (z.B. Präsentationsvorlagen) |
| `wissen/email/` | E-Mail-Know-how (Abmeldelink, Compliance, …) |
| `wissen/...` | Sonstige Wissensgebiete |

Neue Seiten in die passende Hierarchie einordnen, nicht in den Root.

## Häufigste GraphQL-Queries

### Alle Seiten listen (Index)

```graphql
query {
  pages {
    list(orderBy: TITLE) { id path title locale tags }
  }
}
```

### Seite by Path lesen (Content)

```graphql
query($path: String!) {
  pages {
    singleByPath(path: $path, locale: "de") {
      id title path description content tags { tag } updatedAt
    }
  }
}
```

`content` ist Markdown.

### Suche

```graphql
query($q: String!) {
  pages {
    search(query: $q, locale: "de") {
      results { id title path description }
      totalHits
    }
  }
}
```

Volltext über Titel + Description + Content.

### Tag-Übersicht

```graphql
query { pages { tags { id tag title } } }
```

### Seite anlegen

```graphql
mutation {
  pages {
    create(
      content: "# Titel\n\nMarkdown-Inhalt …"
      description: "Kurzbeschreibung (für Suche)"
      editor: "markdown"
      isPublished: true
      isPrivate: false
      locale: "de"
      path: "tools/intern/neue-seite"
      tags: ["tool", "intern"]
      title: "Titel der Seite"
    ) {
      responseResult { succeeded message }
      page { id path }
    }
  }
}
```

### Seite updaten

```graphql
mutation {
  pages {
    update(
      id: 42
      content: "# Aktualisierter Inhalt"
      description: "..."
      editor: "markdown"
      isPublished: true
      isPrivate: false
      locale: "de"
      path: "tools/intern/neue-seite"
      tags: ["tool", "intern", "updated"]
      title: "Titel"
    ) {
      responseResult { succeeded message }
    }
  }
}
```

### Seite löschen

```graphql
mutation {
  pages {
    delete(id: 42) { responseResult { succeeded message } }
  }
}
```

## curl-Patterns

GraphQL über curl ist mühsam zu escapen. Pattern mit heredoc für die Query-Variable:

```bash
QUERY=$(cat <<'EOF'
{ pages { search(query: "MOCO", locale: "de") { results { id title path } } } }
EOF
)
curl -s -X POST "https://wiki.teamorange.de/graphql" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --arg q "$QUERY" '{query: $q}')" | jq
```

Oder für Mutations mit Variablen (sauberer):

```bash
VARS=$(jq -n \
  --arg path "tools/intern/test" \
  --arg title "Test" \
  --arg content "# Test\n\nInhalt" \
  '{path: $path, title: $title, content: $content}')

curl -s -X POST "https://wiki.teamorange.de/graphql" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --argjson vars "$VARS" '{
    query: "mutation($path: String!, $title: String!, $content: String!) { pages { create(path: $path, title: $title, content: $content, description: \"\", editor: \"markdown\", isPublished: true, isPrivate: false, locale: \"de\", tags: []) { responseResult { succeeded message } page { id } } } }",
    variables: $vars
  }')" | jq
```

## Cookbook

### "Wo finde ich die Doku zu MOCO?"

```bash
# Search
curl -s -X POST "https://wiki.teamorange.de/graphql" -H "Content-Type: application/json" \
  -d '{"query":"{ pages { search(query:\"MOCO\", locale:\"de\") { results { id title path description } } } }"}' \
  | jq '.data.pages.search.results[] | {title, path, description}'
```

→ z.B. `tools/intern/moco` mit Beschreibung. Dann den Content holen:

```bash
curl -s -X POST "https://wiki.teamorange.de/graphql" -H "Content-Type: application/json" \
  -d '{"query":"{ pages { singleByPath(path:\"tools/intern/moco\", locale:\"de\") { title content tags { tag } } } }"}' \
  | jq -r '.data.pages.singleByPath | "# \(.title)\n\n\(.content)"'
```

### "Schreib mal eine Seite über X im Wiki"

→ ASK-FIRST! Wiki-Seiten sind sichtbar für das ganze team:orange. Erst:
1. Path vorschlagen ("ich würde das unter `wissen/email/<topic>` ablegen")
2. Draft-Content zeigen (volle Markdown)
3. Tags vorschlagen
4. Michael bestätigt → mutation `create` ausführen

## Hard Rules

- **Reads unrestricted** — Suchen, Pages lesen, Tags durchschauen, Index erzeugen.
- **Create ASK-FIRST**: jede neue Seite ist team:orange-öffentlich sichtbar. Draft + Path + Tags zeigen → Michael "ja" → mutation.
- **Update ASK-FIRST**: bestehende Seiten ändern ist heikel — andere Team-Mitglieder verlinken evtl. drauf, kennen den Stand. Bevor du `update` machst: Diff erklären ("ich ergänze Abschnitt Z, ändere nichts anderes"), Michael bestätigt, dann update.
- **Delete → Doppelbestätigung**: `delete`-Mutation ist final. Path + Titel klar nennen, zweimaliges OK abwarten.
- **Niemals `isPrivate: true` autonom setzen** — das macht Seiten unsichtbar für andere User. Wenn Michael privat braucht: explizit fragen.

## Beziehung zu den anderen Wissens-Systemen

Vier Speicher mit klaren Rollen — bei Mehrdeutigkeit fragen:

| Speicher | Was reinkommt | Wer's sieht |
|---|---|---|
| **Wiki.js** (`wiki-js` skill) | **Offizielle** Doku, Prozesse, Tool-Anleitungen, Templates, Compliance-Inhalte | Ganzes team:orange-Team |
| **Obsidian-Vault** (`obsidian-orange` skill) | **Working-Notes**, Meeting-Notes, Recherche-Snippets, Brainstorm, Kunden-Historie | Du + Michael (git-managed, andere können prinzipiell pullen) |
| **Linkwarden** (`linkwarden` skill) | **URLs** mit gescraped Content, Inspirations-Sammlungen | Account-User von bookmarks.teamorange.de |
| **Tool-eigene Daten** (Mautic, Twenty, MOCO, Zammad, Directus) | Strukturierte Records die zu ihrem Tool gehören | Tool-Berechtigte |

**Faustregel beim Wissens-Speichern**:
- Etwas dass "wir als Firma wissen sollten" → Wiki.js
- Etwas das "ich (Timo) mir merken muss" / Working-Context → Obsidian
- Eine URL die wert ist später zu finden → Linkwarden
- Ein strukturiertes Record (Customer, Ticket, Project) → das passende Tool

**Beim Suchen** (Michael fragt was) — Reihenfolge:
1. Wiki.js search (`pages.search`) — wenn's offizielle Doku ist, steht's hier
2. Obsidian (`grep` im Vault) — wenn's Working-Note ist
3. Linkwarden search — wenn's eine URL/Artikel-Referenz ist
4. Tools-spezifisch (z.B. "in Zammad nach Ticket suchen")

Wenn du suchst und nichts findest, in mehreren Speichern nacheinander probieren bevor du "weiß ich nicht" sagst — die Wahrscheinlichkeit dass irgendein Speicher's hat ist hoch.
