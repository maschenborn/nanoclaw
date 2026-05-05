# Ingest workflow — Source → Wiki

**Ingest** is the most important operation. A new source arrives, you produce a summary page and **update all affected Entity/Concept pages**. 10-15 file edits is normal.

**Golden rule:** Interactive > Batch. Show Michael the planned change list before editing 15 files. He should see it coming and steer cross-refs.

## Step-by-step

### 1. Receive the source

- URL / paste from Michael (WhatsApp, claw, direct chat).
- **Before writing:** check for duplicates. `grep -rli "<keyword-or-author>" /workspace/extra/obsidian/mashburn/Wiki/Sources/ /workspace/extra/obsidian/mashburn/Wiki/index.md`.
- If already there: ask "Update existing Source or add new complement?"

### 2. Read index.md + log.md + hot.md

Mandatory pre-flight:
- `Wiki/index.md` — shows what exists. From this you see which Entities/Concepts are already there and which pages you must touch.
- `Wiki/log.md` last 50 lines — gives you the recent state, recent ops, tone for your new log entry.
- `Wiki/hot.md` — active threads / what Michael was focused on.

### 3. Draft the Source page

File: `Wiki/Sources/<descriptive-title>.md`. **No author name in the title.**

```yaml
---
tags:
  - claude-memory
  - source
  - <3-5 topic tags>
created: 2026-04-25
status: current
source_type: article | tweet | thread | gist | video | paper | repo | session
source_url: "https://..."
source_date: 2026-02                 # YYYY-MM if day unknown, YYYY-MM-DD otherwise
author: "Name (@handle)"             # plain string, OR [[Entity-Name]] if Entity page exists
pii_reviewed: true                   # if you ran Step 3a
reviewed: true
reviewed_date: 2026-04-25
quality_bar: v2                      # all new files ab v2-release
source_complete: true
blocked_reason: ""
---

# <Title>

**Type:** <medium>
**Author:** [[Name]] or plain
**URL:** https://...
**Ingested:** 2026-04-25

## Was ist es
One-paragraph context.

## Kern-These
Direct quote if possible.

## <Structured main points>
Bullets, table, diagram. Keep the Source page compact — the thinking happens in Concepts.

## Verwandte Pages
- [[Primary synthesis Concept]]
- [[Author Entity]]
- [[Other Concept]]

## Warum es hier liegt
One sentence: what makes this source wiki-worthy?
```

### 3a. PII scan (mandatory v2 — before any Wiki/Sources/ write)

Before writing your drafted content to the vault, scan it for secrets/PII. **Bash-grep for this specific step is an explicit exception** to the "prefer Grep-tool over bash-grep" rule — the scan needs to run against content that doesn't yet exist as a file in the vault.

**Two acceptable flows — pick whichever fits the current context:**

**Flow A — Bash-grep-on-/tmp (shortest path, recommended):**

```bash
# Write the draft to a random /tmp file (isolated, ephemeral)
DRAFT=$(mktemp /tmp/ingest-draft-XXXXXX.md)
cat > "$DRAFT" <<'EOF'
<paste planned content here — the full file including frontmatter>
EOF

# Run the regex set (one command, all patterns OR-ed)
grep -E '(sk_live_|sk_test_|pk_live_|ghp_|gho_|ghs_|github_pat_|xoxb-|xoxp-|AKIA|aws_access)|BEGIN (RSA )?PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY|[A-Za-z0-9_-]{32,}|@(mashburn|internal|local|privat)\.' "$DRAFT"
grep -iE '(password|passwd|secret|api_key|token)\s*[:=]\s*\S+' "$DRAFT"

# ALWAYS delete the draft, matter if matches or not
rm -f "$DRAFT"
```

**Flow B — Tool-native (Write-to-/tmp + Grep-tool):**

Use when the draft is long enough that paste-into-heredoc is awkward, or when Flow A's Bash permission isn't granted:

1. Use the Write tool to create `/tmp/ingest-draft-<random>.md` with the planned content.
2. Use the Grep tool with the same regex patterns, `path: "/tmp/ingest-draft-<random>.md"`.
3. After the scan: Bash `rm -f /tmp/ingest-draft-<random>.md`.

Both flows produce the same result. Flow A is shorter; Flow B is tool-native-cleaner. Choose based on permission context. **Never skip the rm step** — `/tmp/` is ephemeral but not instantly swept.

**Handling:**

| Match type | Default action |
|---|---|
| No matches | set `pii_reviewed: true` and proceed |
| Token-like ≥32 | context check: SHA-commit / docker-digest / base64-thumbnail = whitelist OK; unclear = ask Michael |
| Known secret prefix | **stop**, ask Michael — very rare false-positive |
| Password-like | redact to `[REDACTED]` or abort; never write unreviewed |
| Private email | redact to `<user>@<redacted-domain>` |
| PEM | **abort always** |

**Critical for `source_type: session`** — chat logs routinely contain tokens/keys that public tweets/articles never do. No `pii_reviewed: true` = no write for session-sources.

**Whitelist for "looks suspicious but isn't":**
- Git commit hashes (40 hex chars, context = "commit"/"sha")
- NPM/Docker image digests (`sha256:...`)
- Public wallet addresses when the source is about that wallet

### 3b. Schema-drift check (mandatory v2 — for Wiki/Sources/ writes)

Before writing a new file at `Wiki/Sources/<name>.md`, confirm frontmatter compliance:

```bash
# Read your planned frontmatter (between first pair of ---) and check:
# REQUIRED keys (all four must be present):
#   source_type, source_url, source_date, author
# LEGACY keys (acceptable ONLY if the v2 equivalent is also present — pure migration-era coexistence):
#   type coexisting with source_type   → OK
#   type alone (no source_type)        → DRIFT, fix before write
#   datum coexisting with source_date  → OK
#   datum alone                        → DRIFT
#   autor coexisting with author       → OK
#   autor alone                        → DRIFT
#   url alone                          → DRIFT
```

If any v2-key is missing, add it. Don't write until all four (`source_type`, `source_url`, `source_date`, `author`) are present with real values.

**Additional v2 invariants:**
- `source_type: session` → `pii_reviewed: true` required
- `status: superseded` → `superseded_by: [[Target]]` required (or `blocked_reason: deprecated_without_replacement`)

Michael's workstation has a bash hook that enforces these automatically (`schema-drift-check.sh`). You don't have that hook — you do the check yourself by reading this step.

### 4. Identify affected Entities/Concepts

Scan your Source body for:
- **People** → Entity candidates (only create if mentioned ≥2× in the source or author of the source)
- **Tools/Companies/Products** → Entity candidates
- **Patterns/Methods/Ideas** → Concept candidates
- **References to existing pages** (from `index.md`)

Show Michael the plan:
```
Plan:
- Create: Wiki/Sources/<Title>.md
- Create: Wiki/Concepts/<New Concept>.md (primary synthesis)
- Create: Wiki/Entities/<Author>.md (first-author)
- Update: Wiki/Concepts/<Existing Concept>.md (new source appended)
- Update: Wiki/Entities/<Existing Entity>.md (new contribution)
- Update: Wiki/index.md (2 new pages + 2 source-count updates)
- Append: Wiki/log.md
- Update: Wiki/hot.md
```

Wait for confirmation or correction.

### 5. Create Entity pages (if new)

Small — 30-60 lines. Frontmatter from `references/frontmatter.md`. Body:
- Role description (1-2 paragraphs)
- "Beiträge im Wiki" — wikilinks to Concepts/Sources this entity shaped
- "Verwandte Pages"

P1-lint rule: Entity only if ≥1 mention in a Source (single-mention-in-tweet doesn't warrant an Entity). Exception: `self_sourced: true` + `repo:` for skill collections / tool repos that ARE the source.

### 6. Create or extend Concept pages

**New:** The thinking work. Structure:
- **Problem** — what does this solve?
- **Lösung** — how?
- **Details** (tables, diagrams, mechanical description)
- **Warum es funktioniert** / **Trade-offs** / **Abgrenzung zu Verwandtem**
- **Umsetzung in mashburn** (if Michael's setup is relevant)
- **## Beziehungen** — mandatory, at least one typed relation (see SKILL.md for vocabulary)

**Extend existing:** new source in the `sources:` frontmatter array, new section "Weiteres aus [[New Source]]" or inline integration. Prefer compressing to sprawling — don't append every new point to the bottom.

Typed-relations note: every Concept must have a `## Beziehungen` section with ≥1 typed relation (`**verb** → [[X]]`). If extending a Concept that lacks this section, add it.

### 7. Cross-refs symmetric

For every new wikilink A → B: check that B → A exists. If not, add it (or document why it's asymmetric, e.g. Source → Entity is unidirectional by convention).

Back-refs typically live in:
- Entity pages: list of Concepts they shaped
- Concept pages: "Verwandte Pages" + abgrenzungs-sections
- Source pages: "Verwandte Pages"

### 8. Update index.md

- New Entities in the Entity section (alphabetical or thematic — match existing structure)
- New Concepts in Concepts section
- New Sources in Sources section with date
- Source-counts in parens if an existing Entity/Concept got a new source
- Page-count stats at the bottom

### 9. Append to log.md

At the file end add a new block:

```markdown
## [2026-04-25] ingest | <Shorttitle>

- Source: [[<Source Page>]]
- Created: [[<New Entity>]] (Entity), [[<New Concept>]] (Concept)
- Updated: [[<Existing Entity>]] (new source-ref), [[<Existing Concept>]] (extended section X)
- Cross-refs set between all 5 pages
- Index: 60 → 62 pages
```

### 10. Refresh hot.md

`updated: <date>` + new Recent Facts + Recent Changes. Replace the old snapshot, don't append. Keep it current-context, keep it short.

### 11. Report summary

Brief: "X new pages, Y updated, Z cross-refs set. index.md A→B pages. Anything to double-check?"

## Common traps

- **Too many new Entities.** If a person is mentioned once, no Entity. Plain string in `author:`.
- **Source page too long.** Source-page bodies are summaries, not full-text copies. Thinking belongs in Concepts.
- **Dangling wikilinks.** Every `[[X]]` must point at an existing `X.md`. If X doesn't exist: create it or use plain text.
- **Forgotten `index.md` update.** Most common mistake. Index is the navigation.
- **Forgotten `log.md` entry.** Michael scrolls the log to recap.
- **No duplicate-check beforehand.** Two Entity-pages for the same person is poison.
- **v2-drift:** writing `type:` instead of `source_type:` on a Wiki/Sources file. Michael's host has a hook that would block this — but you don't. Step 3b is your safety net.

## Mini-example (real, from log.md)

> `## [2026-04-12] ingest | MiroFish — AI Swarm Prediction Platform`
>
> - Source: GitHub 666ghj/MiroFish (53.8k stars, Shanda Group backing)
> - Created:
>   - [[MiroFish - AI Swarm Prediction Platform]] (Source) — Multi-agent prediction system, OASIS framework
>   - [[Multi-Agent Prediction Systems]] (Concept) — Swarm intelligence, parallel digital worlds
> - Architektur: 5-stage pipeline
> - Cross-Refs: Links zu [[LLM Wiki Pattern]], [[Context Portal MCP - Project Memory Bank]]
> - Use Cases: Policy testing, public opinion forecasting
> - Index aktualisiert (37 → 39 Pages)

Compact, wikilinks, page-count delta, cross-ref hint. That's the template.
