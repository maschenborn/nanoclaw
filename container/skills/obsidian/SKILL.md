---
name: obsidian
description: Work in Michael's personal Obsidian vault at `/workspace/extra/obsidian/mashburn/` following Andrej Karpathy's LLM Wiki pattern — research existing notes, ingest new sources, maintain cross-references, keep tags/frontmatter consistent. Use this skill ANY time Michael asks to search, find, save, file, tag, link, or clean up anything related to the vault; also when he uses words like "Wiki", "Vault", "Obsidian", "Note", "Fundstück", "Karpathy", "ingest", "filen", "einsortieren", "zero-inbox"; also when he shares new knowledge ("schau mal, ich habe das entdeckt / hier ist ein interessanter Tweet / Artikel / Gist") — then proactively ask whether to file it as a wiki page.
---

# Obsidian Vault Skill (mashburn)

Michael's personal knowledge system. The vault lives at `/workspace/extra/obsidian/mashburn/` inside your container (host path: `/home/maschenborn/obsidian/mashburn/`). A host-side daemon (`obsidian-sync.service`) continuously bi-directionally syncs this directory with Obsidian Sync Cloud — **every write you perform propagates to Michael's phone and desktop within seconds**. You do NOT call `ob sync` manually. If a vault CLAUDE.md tells you to run `ob sync` (written for Michael's workstation), ignore that instruction for your container.

The vault follows **Andrej Karpathy's LLM Wiki Pattern**: the wiki is not a passive store but a **compounding artifact** that grows over time. Cross-refs are already there, contradictions flagged, syntheses reflect all the sources ingested so far. Human maintenance would be untenable — LLMs don't tire.

> **Division of labor:** Michael curates sources, asks questions, thinks. You (Alfred) summarize, cross-reference, file, bookkeep. Your job is **maintenance**, not direction.

**Spec-Version:** v2 (since 2026-04-25). Additive to v1 — no breaking changes. The 144 existing files are `quality_bar: v1` and stay that way. Files you write from now on must satisfy `quality_bar: v2`.

## The four core operations

Every vault task reduces to one of these:

| Operation | When | See |
|---|---|---|
| **Ingest** | New source arrives (tweet, article, gist, idea, tool discovery) | `references/ingest-workflow.md` |
| **Query** | User asks the vault (research, retrieval, "was hatte ich nochmal zu X") | Below: "Query workflow" |
| **Lint** | Periodic health check (contradictions, orphans, stale notes, missing backlinks) | Below: "Lint workflow" |
| **Crystallize** (v2) | File an abstracted chat-session as a first-class Wiki-Source — only when Michael explicitly says so | `references/crystallization-workflow.md` |

All respect **Interactive > Batch**: show Michael what's happening step by step, not a 20-file-edit bang at the end.

## Vault topology

Three coexisting layers — intentional, not a bug:

```
Wiki/                       ← LLM Wiki layer (Karpathy pattern). Synthesis across sources.
├── Entities/               People, tools, companies, products (1 entity = 1 page)
│   └── Fonts/              Font entities + preview assets
├── Concepts/               Patterns, methods, ideas (the "thinking work")
├── Sources/                Originals (articles, gists, papers, threads, sessions)
├── index.md                Curated catalog — ALWAYS read first before editing Wiki
├── log.md                  Append-only timeline of wiki operations
└── hot.md                  Recent-activity snapshot

Pre-Wiki domain folders (catalog-style, 1 object = 1 file):
├── AI Orchestration/       Agents/, Claude Best Practice/, MCPs/, Skills/
├── Design,UI,UX/           Design patterns, styleguides
├── Fundstücke/             Incoming bookmarks / "Fundstücke" (found-things)
├── Marketing/
├── Produktinnovationen/
├── Tools/                  Tools/, Tools/MacOS/, Tools/Obsidian/

Personal (no wiki ambition):
├── Rezepte/                Cookbook
├── Lazi/                   Private project notes

Inbox:
└── Inbox/                  ⚡ Unfiled captures. Zero-Inbox goal.

Meta:
├── _obsidian.md            Vault-wide spec + conventions (authoritative)
├── optimierung.md          Mission list / v2-upgrade backlog
└── migration-queue.md      Dataview-views over review-state
```

**Note:** `Wiki/Questions/` was removed in the v1 migration (2026-04-24). Don't create pages there.

## The first law: read `index.md` + `log.md` first

**Before any Wiki edit**, read:
1. `Wiki/index.md` — the curated catalog. Shows all pages by type. If you link `[[X]]`, X must exist there.
2. `Wiki/log.md` last 50 lines — tells you what was done recently. Without this you duplicate or contradict prior work.
3. `Wiki/hot.md` — most recent context snapshot, useful for queries.

These three files are the crown jewels of the vault. Update them after every operation (log.md always, hot.md after bigger ingests, index.md when adding new Wiki pages).

## Frontmatter essentials (v2)

Full schema per document type in `references/frontmatter.md`. Minimum fields every file needs:

```yaml
---
tags:
  - claude-memory     # required for all Wiki/* pages
  - source|concept|entity  # type marker
  - <3-5 topic tags>
created: 2026-04-25     # YYYY-MM-DD
status: current         # current | stale | superseded
# plus the freigabe block (every reviewed file in the vault has it):
reviewed: true
reviewed_date: 2026-04-25
quality_bar: v2         # new files ab v2-release
source_complete: true
blocked_reason: ""
---
```

**Critical field-name discipline for `Wiki/Sources/*`:**

| Use (v2) | NOT (legacy in pre-Wiki catalog) |
|---|---|
| `source_type` | `type` |
| `source_url` | `url` |
| `source_date` | `date_added`, `datum` |
| `author` | `autor` |

Pre-Wiki catalog files (`Tools/`, `Fundstücke/`, `AI Orchestration/`) legitimately use `datum`, `autor`, `typ`, `quelle`, `herausgeber` — don't "normalize" those. The distinction is: Wiki/Sources/* = v2-schema; pre-Wiki = legacy-schema (stays).

**v2-opt-in fields** (see references/frontmatter.md for details):
- `confidence: low | medium | high` on controversial/aging Concepts (no floating point)
- `last_confirmed: YYYY-MM-DD` — updated when a new Source is attached to the Concept
- `supersedes: "[[Old Page]]"` / `superseded_by: "[[New Page]]"` — optional, but `status: superseded` requires `superseded_by:`
- `pii_reviewed: true` — mandatory on `source_type: session`, optional otherwise
- `self_sourced: true` + `repo:` — for Entity-Pages where the repo itself IS the source (skill collections etc.)

## Tagging discipline

- **Casing:** kebab-case, English, singular. `claude-code` ✓, `ClaudeCode` ✗, `claude-codes` ✗.
- **Count:** 3-8 tags per page.
- **Layer:** at least one type-tag (`source`, `concept`, `entity`, `tool`, `mcp`, `skill`) and one domain-tag (`claude-code`, `agent-sdk`, `design`, `llm`, ...).
- **Author-tag:** `vorname-nachname` (e.g. `boris-cherny`) for threads/guides.
- **First: look at existing tags.** `grep -rh '^tags:' /workspace/extra/obsidian/mashburn/Wiki/ | sort -u | head -50` before inventing new ones.

## Linking

- **Wikilinks** `[[Target Page]]` — not markdown `[text](url)`. Keep link-text = target title; use aliases on the target page if you want different display text.
- **Back-refs are symmetric** for Concept/Entity: if A links to B, B must link back to A (or have a documented reason). Symmetric back-refs are a **hard requirement** for `reviewed: true` on Concept/Entity pages; optional for Sources.
- **No dead links.** If you can't find the target, either create the page or use plain text.
- **No hub-nodes.** Connections run through tags + `sources`/`related` properties, not an artificial "hub page".

## Typed relations in Concept bodies (v1.1+)

Every Concept page ends with a `## Beziehungen` section containing at least one typed relation:

```markdown
## Beziehungen

- **uses** → [[Prompt Cascade Hierarchy]]
- **depends on** → [[Claude Code Configuration]]
- **contradicts** → [[ConPort Monolithic Memory]]
- **extended by** → [[Agent Harness Engineering]]
- **siehe auch** → [[Memex]]
- **synthesiert aus** → [[Source A]], [[Source B]]
- **supersedes** → [[Old Concept]]          (v2)
- **superseded_by** → [[New Concept]]       (v2)
```

Vocabulary (stable): `uses`, `depends on`, `contradicts`, `extends`, `extended by`, `siehe auch`, `Hauptquelle`, `synthesiert aus`, `konkrete Implementierung`, `historisches Vorbild`, `abgrenzt zu`, `supersedes`, `superseded_by`, `Original-Discovery`, `Original-Prompt`, `Architektur-Source`.

Grep-bar, low-friction, visible to Michael in Obsidian.

## Inbox workflow (Zero-Inbox goal)

When you see files in `Inbox/`:

1. **Read** the content.
2. **Classify:** Source (Wiki candidate), Pre-Wiki note (Fundstück/Tool/MCP/Skill/Rezept), or Noise (delete).
3. **Propose destination + title + tags** to Michael — wait for confirmation, then move.
4. **Populate frontmatter** per destination-type (see `references/frontmatter.md`).
5. If Wiki-candidate: run full ingest (see `references/ingest-workflow.md`), updating Entities/Concepts/index/log.

**Don't stack.** Process entries one at a time. Michael should be able to intervene.

## Query workflow

When Michael asks the vault ("was habe ich zu X?", "fiel mir neulich was zu Y ein, wo steht das?"):

1. **Read `Wiki/index.md` first** — the curator's view.
2. **Grep:** `grep -rli "<term>" /workspace/extra/obsidian/mashburn/ 2>/dev/null | head -20`
3. **Open candidates** and synthesize across them. Don't quote full pages back — summarize + cite via `[[Page Title]]` so Michael can jump in Obsidian.
4. **If the answer spans multiple pages without existing synthesis:** propose creating a new Concept page or updating `index.md`. Ask first. The synthesis you just produced will otherwise "verdampfen im Chat" (Karpathy); save it as a page.

## Lint workflow

Periodic or on-request: read-only first, batch findings, ask approval, then edit.

Checks (priority order):
- **P1 — Dangling wikilinks.** Every `[[X]]` must resolve to an existing `X.md`. Use `grep -rohE '\[\[[^]]+\]\]' Wiki/ | sort -u` then check existence.
- **P1 — Backlink symmetry** on Concept/Entity: for every `[[X]]` in a Concept/Entity body, check that X links back.
- **P2 — Orphans:** Wiki pages with zero incoming wikilinks.
- **P2 — Stale:** `created > 180 days` + no new Source appended since then.
- **P3 — Tag-casing drift:** `ClaudeCode` vs `claude-code` etc. (P3 = auto-fixable, dry-run first).
- **P3 — Missing `claude-memory` tag** on Wiki/* pages.

Present findings as markdown checklist with file paths. Michael approves → edit.

## Proactive filing

When Michael shares something with persistent value in a chat (new tool tip, new technique, important decision, insight from a thread), **ask**:

> "Möchtest du das als Wiki-Page filen? Ich sehe es als [[Entity|Concept|Source]] unter `Wiki/...` mit Tags `[...]`. Oder eher in `<Pre-Wiki-Folder>/`?"

When you produced a valuable Query answer that doesn't exist yet as a page, actively propose filing the synthesis as a new Concept. Better ask once too often than lose the insight.

## Working style (for every operation)

1. **Read `Wiki/index.md`, last 50 lines of `Wiki/log.md`, and 2-3 sibling pages in the target folder** before writing. Gives you tone, frontmatter structure, cross-ref conventions.
2. **Plan the change list** (which pages new, which updated, which cross-refs set) and show Michael before editing. 10-15 files on a single ingest is normal — but he should see what's coming.
3. **Work incrementally.** One file, sanity-check, next. Progress update every 3-5 files on big ops.
4. **Close with a log entry** in `Wiki/log.md` (`## [YYYY-MM-DD] <op> | <title>` + summary). For pre-Wiki edits, log entry is optional.
5. **Refresh `hot.md`** after bigger ingests with the new recent-context snapshot.
6. **Report summary** back: "2 new Entity-pages, 1 Concept extended, 3 back-refs set, index.md X→Y pages."

## Conflict avoidance during live sync

Since `obsidian-sync` is continuous, Michael may edit on phone/desktop while you work. Two things protect you:

- **Claude Code's Read-before-Edit invariant.** The Edit tool refuses to work on a file you haven't read in the current session — if Michael changed the file between your Read and Edit, Edit will fail or produce an unexpected diff. That's your primary safety net; don't try to duplicate it.
- **Soft guidance for long operations:** on ingests with 10+ file-edits, if more than ~5 minutes have passed between your original Read and a planned Edit of the same file, re-read it before editing. New files never conflict — prefer creating over editing when the work model allows.

**If conflict markers appear** (rare): stop, report to Michael, let him resolve.

**What you do NOT need to do:**
- No manual mtime-polling before every edit (the Read-before-Edit contract already gives you the newest content at Read-time).
- No "is Michael online right now?" heuristics — you have no reliable signal, and the invariant above makes the question moot.

## Hard rules

1. **Never touch `/workspace/extra/obsidian/` root** (outside `mashburn/`) or `.obsidian/` config. That's Michael's harness configuration.
2. **Never create a Wiki page without reading `Wiki/index.md` and the tail of `Wiki/log.md` first.**
3. **Never batch-edit more than 5 files without showing Michael a diff summary.**
4. **Never duplicate content between Wiki and pre-Wiki.** If a Fundstück gets promoted to Wiki, delete the Fundstück note or replace with a pointer (`Moved to [[Wiki/Sources/Title]]`).
5. **Never ignore the v2 schema-drift rules** for Wiki/Sources/* — specifically: never write `type:`/`url:`/`date_added:`/`datum:`/`autor:` alone on a new Wiki/Sources file. Always use `source_type/source_url/source_date/author`. (Schema-check commands in `references/ingest-workflow.md` Step 3b.)
6. **PII-scan is mandatory for `source_type: session`** — a session digest that captures chat content will often include API keys, tokens, private paths. See `references/ingest-workflow.md` Step 3a.
7. **Session-crystallization is trigger-only.** Don't turn chats into Wiki pages on your own initiative. Only when Michael explicitly says "crystallize", "als Source filen", "fil das als Page".

## v2 quick-reference

| Scenario | v1 | v2 |
|---|---|---|
| Ingest a new Source | steps 1-11 | + Step 3a PII-scan, + Step 3b schema-check |
| Source frontmatter enforcement | No check — legacy keys (`type`/`url`/`datum`/`autor`) coexist with modern `source_type/source_url/source_date/author` across existing 27 files | Same field set; schema-check rule (§3b) catches missing v2 keys and legacy-only drift on new writes. `pii_reviewed: true` optional (mandatory only on session-type) |
| Concept aging | nothing | opt-in `confidence` + `last_confirmed` |
| Page deprecated | `status: veraltet` | `status: superseded` + mandatory `superseded_by:` |
| Session as source | — (didn't exist) | `source_type: session` + `source-session` tag + PII-scan + lessons back-propagated |

All other workflows unchanged.

### When you extend an existing v1 file

If you append a new source to a `quality_bar: v1` Concept, add a lesson bullet to an existing Entity page, or amend any pre-v2 file: **the file stays `quality_bar: v1`.** Don't self-promote it to v2. Quality-bar upgrades are Michael-initiated and happen in dedicated re-review sessions, not as side-effects of an ingest. This keeps the v1→v2 filter honest — `quality_bar: v1` means "was last reviewed under the v1 criteria", not "hasn't been touched since".

Corollary: your v2 invariants (schema-check for Wiki/Sources/, PII-scan for sessions) apply to **files you create**. When editing a v1 file, respect its existing schema — don't "normalize" legacy keys like `datum`/`autor` on a v1 Source page just because v2 prefers `source_date`/`author`. Leave them alongside the v2 keys (they coexist as migration-era backward-compat).

## Quick reference (for scripts)

```bash
VAULT=/workspace/extra/obsidian/mashburn

# Read curator catalog + recent activity before any Wiki work
cat "$VAULT/Wiki/index.md"
tail -50 "$VAULT/Wiki/log.md"

# List Wiki pages by type
ls "$VAULT/Wiki/Entities/" "$VAULT/Wiki/Concepts/" "$VAULT/Wiki/Sources/" 2>/dev/null

# Full-vault search
grep -rli "search-term" "$VAULT" 2>/dev/null | head -20

# Existing tags
grep -rh '^tags:' "$VAULT/Wiki/" | sort -u

# Append to log
echo "## [$(date -I)] <op> | <title>" >> "$VAULT/Wiki/log.md"
echo "- Summary line" >> "$VAULT/Wiki/log.md"
echo "" >> "$VAULT/Wiki/log.md"

# Check schema compliance before writing a Wiki/Sources/ file (see references/ingest-workflow.md §3b)
```

## Reference files

Read on demand — each focused on one aspect:

- [`references/ingest-workflow.md`](references/ingest-workflow.md) — step-by-step Source → Wiki (with PII-scan + schema-check)
- [`references/crystallization-workflow.md`](references/crystallization-workflow.md) — Session → Wiki-Source (v2, First-Class-Operation)
- [`references/frontmatter.md`](references/frontmatter.md) — full YAML schema per document type with examples

## Don'ts

- **No wikilinks to non-existent pages** just because you think there should be one. Either create the target or use plain text.
- **No renamed pages without an `unresolved`-check afterwards.** Dangling links are easy to create by renaming.
- **No author names in the title** (`"Chronos Claude Code Leak Deep Dive"` ✓, `"Chronos - Claude Code Leak (by Rafal Darlak)"` ✗). Author goes in frontmatter.
- **No kebab-case filenames.** Human-readable: `"Obsidian CLI.md"`, not `obsidian-cli.md`.
- **No empty frontmatter.** Even short notes need `tags` + `typ` (pre-Wiki) or `tags` + `claude-memory`-tag (Wiki).
- **No big refactors without announcement.** If you want to touch 20 files, ask first.
- **No file deletes without confirmation.** Deletion is permanent; propose, wait for "ja".

## Pointer to vault-level guidance

Michael maintains vault-wide conventions at `/workspace/extra/obsidian/mashburn/_obsidian.md` — the authoritative spec (readable from your side). It documents the migration state, v1.1 and v2 fields, lint rules, and typed-relations vocabulary. Read it at session start before any serious edit.

The vault-root `CLAUDE.md` at `/workspace/extra/obsidian/CLAUDE.md` is written for Michael's desktop workstation (uses `ob sync`). The only rules in it that apply to you are "nothing outside `mashburn/`" and "read `Wiki/index.md` + recent `Wiki/log.md` before Wiki-edits". Ignore the `ob sync` instructions.

## Why this all?

Because a wiki that isn't maintained dies in 3-4 weeks. Michael builds his external brain. Your job is that he still opens it in five years and finds answers that make his future self think: "stimmt, das hatten wir schon mal analysiert". Every clean cross-ref, every consistent tag is a small contribution to the thing not decaying.

Karpathy: *"LLMs don't get bored."* That's the privilege. Use it.
