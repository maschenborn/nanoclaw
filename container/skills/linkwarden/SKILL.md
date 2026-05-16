---
name: linkwarden
description: Linkwarden v2.14+ — selbst-gehostetes Bookmark-Management für team:orange unter `https://bookmarks.teamorange.de`. Use whenever Michael fragt nach "wo war der Link zu …", "such mal in Bookmarks nach …", "Inspirations-Liste zu X", oder will einen neuen Link speichern ("speicher diesen Artikel", "merk dir die URL"). Auth via OneCLI gateway (Bearer JWT auf `bookmarks.teamorange.de`) transparent gemanagt.
---

# Linkwarden Skill (team:orange Bookmarks)

Linkwarden ist team:orange's selbst-gehostetes Bookmark-Tool — Links in Collections, taggable, durchsuchbar, mit Volltext-Index aus dem gescraped Page-Content (Linkwarden cached HTML + extrahiert `textContent`). 80+ Links Stand 2026-05-16.

## Auth + Endpoint

`https://bookmarks.teamorange.de/api/v1/...` — OneCLI injiziert `Authorization: Bearer <jwt>` automatisch. Account-Owner: `nerds@teamorange.de`.

```bash
curl -s "https://bookmarks.teamorange.de/api/v1/users" | jq '.response[] | {id, username, email}'
```

## Datenmodell

| Resource | Endpoint | Felder |
|---|---|---|
| **Links** (Bookmarks) | `/api/v1/links` | id, name, url, description, collectionId, tags, textContent (gescraped Body), createdAt |
| **Collections** | `/api/v1/collections` | id, name, color, parentId, _count.links |
| **Tags** | `/api/v1/tags` | id, name, _count.links |
| **Users** | `/api/v1/users` | id, username, email |
| **Search** | `/api/v1/search` | Volltext + Filter über alle Links |

## Cookbook

### Alle Collections auflisten

```bash
curl -s "https://bookmarks.teamorange.de/api/v1/collections" \
  | jq '.response[] | {id, name, links: ._count.links, color}'
```

Aktuelle Collections (Stand 2026-05-16, IDs evtl. anders):
- `Unorganized` (2) — Default-Inbox für Links ohne explizite Collection
- `Inspiration für T:O Webseite` (3) — Design/Layout-Inspirationen
- … weitere (live abfragen)

### Links in einer Collection

```bash
COL_ID=3
curl -s "https://bookmarks.teamorange.de/api/v1/links?collectionId=$COL_ID&limit=20" \
  | jq '.response[] | {id, name, url, tags: [.tags[].name], createdAt}'
```

### Volltext-Suche (NUR Link-Content, NICHT Collection/Tag-Namen!)

Linkwarden indexiert via `/api/v1/search?searchQueryString=...` **nur** `name`, `description`, `url` und gescrapten `textContent` der einzelnen Links — **nicht** die Namen ihrer Collections und auch **nicht** die Tag-Namen. Heißt: ein Link namens "Presse" in einer Collection "Westermann" wird bei einer Suche nach "westermann" **NICHT gefunden**, wenn das Wort "Westermann" nirgends im Link-Inhalt steht.

```bash
QUERY="newsletter signup"
curl -s -G "https://bookmarks.teamorange.de/api/v1/search" \
  --data-urlencode "searchQueryString=$QUERY" \
  | jq '.response[] | {id, name, url, snippet: (.description // .textContent[:160])}' | head -40
```

Optional Filter dabei: `&collectionId=X`, `&tags=tag1,tag2`.

### ⚠️ Such-Strategie für "Bookmarks zu X" — IMMER alle drei Pfade probieren

Wenn Michael fragt "such Bookmarks zu X" (Kunde, Projekt, Thema), die Wahrscheinlichkeit dass X in einem Collection-Namen oder Tag-Namen statt im Link-Content steht ist hoch. Pflicht-Suche in dieser Reihenfolge, Ergebnisse dedupliziert zusammenführen:

```bash
QUERY="westermann"  # was Michael gesagt hat, lowercased

# Path 1: Volltext-Suche im Link-Content
HITS_SEARCH=$(curl -s -G "https://bookmarks.teamorange.de/api/v1/search" \
  --data-urlencode "searchQueryString=$QUERY" \
  | jq '.response // []')

# Path 2: Collections mit dem Namen X (case-insensitive substring)
MATCHING_COLLECTIONS=$(curl -s "https://bookmarks.teamorange.de/api/v1/collections" \
  | jq --arg q "$QUERY" '[.response[] | select(.name | ascii_downcase | contains($q | ascii_downcase)) | {id, name}]')

HITS_COLLECTIONS="[]"
for CID in $(echo "$MATCHING_COLLECTIONS" | jq -r '.[].id'); do
  LINKS=$(curl -s "https://bookmarks.teamorange.de/api/v1/links?collectionId=$CID&limit=50" | jq '.response // []')
  HITS_COLLECTIONS=$(echo "$HITS_COLLECTIONS $LINKS" | jq -s 'add')
done

# Path 3: Tags mit Namen X (case-insensitive)
MATCHING_TAGS=$(curl -s "https://bookmarks.teamorange.de/api/v1/tags" \
  | jq --arg q "$QUERY" '[.response[] | select(.name | ascii_downcase | contains($q | ascii_downcase)) | .id] | join(",")' | tr -d '"')

HITS_TAGS="[]"
if [ -n "$MATCHING_TAGS" ] && [ "$MATCHING_TAGS" != "null" ]; then
  HITS_TAGS=$(curl -s -G "https://bookmarks.teamorange.de/api/v1/links" \
    --data-urlencode "tags=$MATCHING_TAGS" --data-urlencode "limit=50" \
    | jq '.response // []')
fi

# Dedupe nach Link-ID und zusammen rausgeben
echo "$HITS_SEARCH $HITS_COLLECTIONS $HITS_TAGS" \
  | jq -s 'add | unique_by(.id) | .[] | {id, name, url, collection: (.collection.name // null), description}'
```

In **deinem Bericht an Michael**: nicht nur die direkten Search-Hits sondern auch Collection-Match-Hits zeigen, klar gelabelt woher der Fund kommt ("aus Collection Westermann", "Tag matched"). Eine Antwort wie "alle 97 Bookmarks durchsucht, nichts gefunden" ist nur ehrlich wenn alle DREI Pfade leer waren.

### Tags auflisten + Top-Tags

```bash
curl -s "https://bookmarks.teamorange.de/api/v1/tags" \
  | jq '.response | sort_by(-._count.links) | .[0:10] | .[] | {name, count: ._count.links}'
```

### Neuen Link anlegen

Default-Collection ist meist `Unorganized` (id 2) — wenn Michael nicht explizit eine Collection nennt, dorthin.

```bash
URL="https://example.com/article"
NAME="Beispiel Artikel zu X"
COL=2  # Unorganized
curl -s -X POST "https://bookmarks.teamorange.de/api/v1/links" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$URL\",
    \"name\": \"$NAME\",
    \"description\": \"Optional kurze Notiz wofür\",
    \"collection\": { \"id\": $COL },
    \"tags\": [{\"name\": \"newsletter\"}, {\"name\": \"ux\"}]
  }"
```

Linkwarden scrapped die Seite asynchron im Hintergrund — `textContent`, `image`, `pdf`-Archiv kommen ein paar Sekunden später. Auf Read-Calls also nicht erschrecken wenn die Felder beim ersten Mal noch leer sind.

### Link in andere Collection verschieben

```bash
LID=42
NEW_COL=5
curl -s -X PUT "https://bookmarks.teamorange.de/api/v1/links/$LID" \
  -H "Content-Type: application/json" \
  -d "{\"collection\": {\"id\": $NEW_COL}}"
```

### Collection anlegen

```bash
curl -s -X POST "https://bookmarks.teamorange.de/api/v1/collections" \
  -H "Content-Type: application/json" \
  -d '{"name": "Neue Kategorie", "color": "#0ea5e9"}'
```

## Workflow-Patterns

### "Michael will neuen Link speichern, sagt nicht wohin"

→ default `Unorganized` (id 2), keine Rückfrage. Optional Tags aus Kontext extrahieren (z.B. wenn URL `*linkedin.com*` → tag `linkedin`, wenn Subject klar `newsletter`-mäßig → `newsletter`). Bei Unsicherheit: keine Tags setzen, sind Optional.

### "Such mal Bookmarks zu X"

→ **immer drei Pfade parallel** (siehe "Such-Strategie" oben): Volltext-Search **plus** Collection-Name-Match **plus** Tag-Name-Match. Dedupliziert ausgeben, gelabelt woher jeder Hit kommt. Wenn nichts in allen drei Pfaden: dann (und nur dann) "kein Treffer".

### "Was haben wir in Collection X?"

→ erst `/api/v1/collections` für die ID-Map, dann `/api/v1/links?collectionId=...&limit=30` für den Inhalt.

### "Welche Tags gibt's überhaupt?"

→ `/api/v1/tags` mit Count, Top-20 oder so. Tags sind flach (kein Hierarchy-System wie bei Obsidian).

## Hard Rules

- **Reads unrestricted**: Listen, Suchen, anzeigen — alles ohne Confirm.
- **Anlegen ohne Confirm**: neue Links speichern (POST `/links`) wenn Michael das explizit anfragt ("speicher diesen Link"). Bei dem Hint dass er was "merken" will → einfach reinpacken.
- **Modifizieren ASK-FIRST**: bestehende Links ändern (PUT/PATCH) — Description, Tags, Collection-Move. Auch wenn klein, könnte Michaels Organisationsschema durcheinander bringen. Kurze Rückfrage: "Soll ich Link X von Collection Y nach Z verschieben?" → er sagt ja → PUT.
- **Löschen → Doppelbestätigung**: DELETE `/links/<id>` ist final. Erst Confirm anfragen + Link-Inhalt (name + url) zeigen damit kein Missverständnis. Nur auf zweimaliges "ja" / "lösch das" durchziehen.
- **Collections-Schema** (anlegen / umbenennen / löschen) → ASK-FIRST. Auch hier: Michaels Organisationsschema.

## Beziehung zu obsidian-orange

Linkwarden = **gespeicherte URLs/Bookmarks** mit gescraped Volltext und Tag-System.  
Obsidian-Orange-Vault = **Notizen + Strukturwissen** mit Wikilinks zwischen Notes.

Überschneidung: wenn Michael einen wichtigen Artikel inhaltlich in den Vault übernehmen will (z.B. als Recherche-Material zu einem Kunden), dann ist das ein zweistufiger Vorgang — erst in Linkwarden speichern (Bookmark), dann eine Note im Vault anlegen die auf den Link verweist + relevante Auszüge zitiert. Frag bei Unklarheit nach welcher der beiden Speicher gemeint ist.
