# Frontmatter schema by document type

Every page in the vault has YAML frontmatter. Field order isn't strict, but following this ordering helps visual diffs.

## Common core fields

| Field | Format | Required | Example |
|---|---|---|---|
| `tags` | list (`  - tag`) | yes | see SKILL.md tagging-section |
| `typ` | string | yes (except Wiki) | `referenz`, `tool`, `skill`, `mcp`, ... |
| `status` | string | optional | `aktuell`, `complete`, `entdeckt`, `zu-prüfen`, `current`, `stale`, `superseded` |

## Freigabe block (ALL files since 2026-04-24)

Part of v1-migration. Every file carries after review:

| Field | Description |
|---|---|
| `reviewed` | `true`/`false` — current `quality_bar` is satisfied |
| `reviewed_date` | `YYYY-MM-DD` of freigabe |
| `quality_bar` | `v1` initial, `v2` ab 2026-04-25 |
| `source_complete` | body contains complete source content (may be `true` even if the source URL is dead — the body stands) |
| `blocked_reason` | `""` or one of: `source_unreachable`, `drop_candidate`, `needs_merge`, `needs_typ_decision`, `awaits_concept`, `needs_frontmatter_review`, `deprecated_without_replacement` |

## v2 optional fields (additive, since 2026-04-25)

| Field | Where | Description |
|---|---|---|
| `confidence` | Wiki/Concepts/* | **opt-in** for controversial/aging Concepts. `low` / `medium` / `high` (no floating-point). Guideline: `high` = ≥3 sources + <90d since `last_confirmed`, `medium` = ≥2 sources OR <180d, `low` = 1 source + >180d |
| `last_confirmed` | Wiki/Concepts/* | updated when a new source is attached. Without `confidence` it's meaningless |
| `supersedes` | all Wiki | wikilink to predecessor: `supersedes: "[[Old Page]]"` |
| `superseded_by` | all Wiki | wikilink to successor. **Required when `status: superseded`** |
| `pii_reviewed` | Wiki/Sources/* | `true` after PII-scan (ingest-workflow.md §3a). **Mandatory for `source_type: session`**, optional otherwise |

## Pre-Wiki: Threads / Guides (`AI Orchestration/Claude Best Practice/`)

```yaml
---
tags:
  - claude-code
  - best-practices
  - <other topics>
  - <author-tag-like-boris-cherny>
typ: thread
autor: "Boris Cherny (@bcherny)"
bereiche:
  - claude-code
  - agent-sdk
related:
  - "AI Orchestration/Claude Best Practice/Advanced Tool Use.md"
quelle: "https://x.com/bcherny/status/..."
datum: 2026-02-13
gespeichert: 2026-02-15
status: complete
reviewed: true
reviewed_date: 2026-04-24
quality_bar: v1
source_complete: true
blocked_reason: ""
---
```

## Pre-Wiki: MCPs (`AI Orchestration/MCPs/`)

```yaml
---
tags:
  - mcp
  - <technology-or-service>
  - <publisher>
typ: mcp
repo: "https://github.com/<org>/<repo>"
status: getestet
reviewed: true
reviewed_date: ...
quality_bar: v1
source_complete: true
blocked_reason: ""
---
```

Body must contain `claude mcp add` command + `.mcp.json` config.

## Pre-Wiki: Skills (`AI Orchestration/Skills/`)

```yaml
---
tags:
  - skill
  - <publisher>
  - <topic>
typ: skill
kategorie: <from-Anthropic-Skill-Guide>   # e.g. document-asset-creation, image-generation
repo: "https://github.com/..."
status: entdeckt
# freigabe block
---
```

## Pre-Wiki: Tools (`Tools/`, `Tools/MacOS/`, `Tools/Obsidian/`)

```yaml
---
tags:
  - <category>
  - <technology>
typ: tool
kategorie: <tool-kategorie>    # e.g. generative-ui, memory-agent
bereiche:
  - <domain>
status: entdeckt
quelle: "https://..."
lizenz: MIT                    # optional, v1.1+
migration_decision: keep       # keep | promote | merge | drop
# freigabe block
---
```

**Catalog body rule (v1.1):** Body must contain Michael's own perspective/status — what it is, why noted, current status (looked at / tried / abandoned). **No pure upstream-README dump.** If you keep upstream content, put it under a separate `## Original README` section.

## Pre-Wiki: Fundstücke (`Fundstücke/`)

```yaml
---
tags:
  - <topic-tags>
typ: tweet | referenz | artikel | fundstück
autor: "Name (@handle)"
quelle: "https://..."
datum: 2026-02-13
gespeichert: 2026-02-15
status: complete
# freigabe block
---
```

## Pre-Wiki: Rezepte (`Rezepte/`)

```yaml
---
tags:
  - rezept
  - <type-like-vegan-vegetarisch>
  - <cuisine-like-asiatisch>
  - <ingredient-highlight>
typ: rezept
portionen: 4
quelle: "TikTok @user" | "eigene Idee" | "Kochbuch XYZ"
# freigabe block
---
```

## Wiki: Source (`Wiki/Sources/`)

```yaml
---
tags:
  - claude-memory
  - source
  - <topic tags>
created: 2026-04-25
status: current
source_type: gist | article | tweet | thread | video | paper | repo | session
source_url: "https://..."
source_date: 2026-01           # YYYY-MM if day unknown
author: "[[Andrej Karpathy]]"  # Wikilink if Entity exists, else plain string
pii_reviewed: true             # v2 — mandatory on source_type: session
# freigabe block
---
```

### Sub-schema: Session-Source (`source_type: session`)

New source-type since v2 for crystallized chat-sessions (see `references/crystallization-workflow.md`).

```yaml
---
tags:
  - claude-memory
  - source
  - source-session           # mandatory tag (flat folder, tag-based classification)
  - <topic tags>
source_type: session
source_url: ""               # typically empty, or link to plan-file / PR
source_date: 2026-04-25      # session date (= created)
session_duration: "~90min"
participants:
  - "Michael"
  - "Alfred"
author: "Michael + Alfred"
created: 2026-04-25
status: current
pii_reviewed: true           # MANDATORY
reviewed: true
reviewed_date: 2026-04-25
quality_bar: v2
source_complete: true
blocked_reason: ""
---
```

## Wiki: Entity (`Wiki/Entities/`)

```yaml
---
tags:
  - claude-memory
  - entity
  - <type-like-person-tool-product>
  - <domain>
entity_type: person | tool | project | organization | font | product
created: 2026-04-08
status: current
sources:
  - "[[Karpathy LLM Wiki Gist]]"
  - "[[Other Source]]"
# OR, for self-sourced entities (repo is the source):
self_sourced: true
repo: "https://github.com/org/name"
# freigabe block
---
```

Entities have a short role description + "Beiträge im Wiki" + "Verwandte Pages" in the body.

## Wiki: Concept (`Wiki/Concepts/`)

```yaml
---
tags:
  - claude-memory
  - concept
  - <topic-like-llm-knowledge-management>
created: 2026-04-08
status: current                 # current | stale | superseded
sources:
  - "[[Karpathy LLM Wiki Gist]]"
  - "[[Other Source]]"
# OR single-source concepts (explicit flag):
single_source: true
# — v2 opt-in, only for controversial/aging concepts —
confidence: medium              # low | medium | high
last_confirmed: 2026-04-24      # updated on each new source-append
# freigabe block
---
```

**Confidence derivation (guideline, not forced):**

| Value | Criteria |
|---|---|
| `high` | ≥3 sources AND `last_confirmed` < 90 days |
| `medium` | ≥2 sources OR `last_confirmed` < 180 days |
| `low` | 1 source AND >180 days without new attachment |

Concept body structure: Definition / Kern-These / Belege / `## Beziehungen` (with ≥1 typed relation in `**verb** → [[X]]` form).

## Wiki: Index / Log / Hot

```yaml
---
tags:
  - claude-memory
  - wiki-index | wiki-log | meta
typ: meta
created: 2026-04-08
status: current
# freigabe block (all three have it)
---
```

## Wiki: Meta-Note (`_obsidian.md`, `optimierung.md`, `migration-queue.md`)

```yaml
---
tags:
  - meta
  - vault
  - konventionen
typ: meta
# freigabe block
---
```

## Special field: `related` vs. wikilinks

- **Inline in body:** `[[Title]]` for cross-refs. Obsidian-native, clickable.
- **In `related:` frontmatter:** **full paths** with `.md`. Only when programmatic access is needed (e.g. for Dataview). Not every note needs `related`.
- **In `sources:` / `source:` (Wiki):** `[[Source-Page]]` as wikilink.

## Normalization rules

- **Dates:** `YYYY-MM-DD`. If uncertain, `YYYY-MM`. **Not year alone.**
- **URLs:** full with `https://`.
- **Authors:** `"Name (@handle)"` if handle known, else just name.
- **Tags:** kebab-case, English, singular. 3-8 per page.
- **Strings with special chars** in double quotes.

## Typed-relations vocabulary (formalized v1.1)

For `## Beziehungen` sections in Concepts:

- `**siehe auch** → [[X]]`
- `**Hauptquelle** → [[X]]`
- `**synthesiert aus** → [[A]], [[B]]`
- `**extended by** → [[X]]`
- `**extends** → [[X]]`
- `**uses** → [[X]]`
- `**depends on** → [[X]]`
- `**contradicts** → [[X]]`
- `**historisches Vorbild** → [[X]]`
- `**konkrete Implementierung** → [[X]]`
- `**Original-Discovery** → [[X]]`
- `**Original-Prompt** → [[X]]`
- `**Architektur-Source** → [[X]]`
- `**abgrenzt zu** → [[X]]`
- `**supersedes** → [[X]]` (v2)
- `**superseded_by** → [[X]]` (v2)

Stable vocabulary — don't invent new verbs without asking.

## Classification field (optional)

Some pre-Wiki notes have `classification: Must-have | Useful | Archive`. Not required, but if present, respect and don't remove.

## Lint invariants (v2)

- `status: superseded` → `superseded_by:` must be set (or `blocked_reason: deprecated_without_replacement`)
- `source_type: session` → `pii_reviewed: true` must be set
- Wiki/Sources/* must have `source_type`, `source_url`, `source_date`, `author` (not `type`, `url`, `date_added`, `datum`, `autor` alone — coexistence with v2 keys as migration-era compat is OK)
- Concept/Entity pages must have symmetric back-refs on all `[[wikilinks]]` in body
