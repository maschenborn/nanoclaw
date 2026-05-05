# Crystallization workflow — Session → Wiki-Source

Work sessions between Michael and you produce insights regularly. If they're not filed, they evaporate in chat. **Crystallization** is the process of solidifying a completed session as a **first-class Wiki-Source** (`source_type: session`).

**Karpathy:** *"Crystallization is the process of taking a completed chain of work... and automatically distilling it into a structured digest."*

## When to crystallize

**Triggers (all explicit — you do not crystallize on your own initiative):**
- Michael says "crystallize this", "file das als Source", "als Wiki-Page", "Session als Page"
- A longer chat-interaction produced a persistent decision, a bug-fix with generalized lessons, or a design for something that will be built

**Trigger phrases you MUST NOT treat as crystallize-commands on their own:**
- "speicher das" (could mean: write to log.md) → ask
- "notiere das" (could mean: add to existing page) → ask
- "kurz zusammenfassen" (query answer, not crystallize) → no file write

**Don't crystallize:**
- Pure Q&A without persistent value ("was heißt XYZ?")
- Lint/audit runs (those belong in `Wiki/log.md`, not as Source)
- Duplicates of existing Sources or Concepts

**Don't crystallize mid-operation.** If Michael says "speicher das" / "crystallize das" while you're in the middle of another operation (ingest, lint, multi-file edit), **do not interrupt and crystallize**. Instead:

1. Finish the current operation (or safely suspend at a consistent point — all files written, index/log updated).
2. Report completion of the current op.
3. Then disambiguate: "Die Ingest-Session ist durch. Soll ich jetzt crystallisieren — die ganze Session oder nur einen Teil davon?"

Rationale: crystallize produces a session-source covering "the session". If you fire it mid-operation, the digest lacks the part you were about to finish, and back-propagating lessons into Concepts that aren't yet in their final state creates fragile cross-refs. Crystallize is a **post-hoc** operation by definition.

## Pre-flight

1. Read `Wiki/index.md` — is the topic already there? (avoid duplicates)
2. Read last 50 lines of `Wiki/log.md` — related ops recently?
3. Read `Wiki/hot.md` — active threads? Your session might "close" one.

## Digest structure

Session-Source pages have 5 mandatory body sections + frontmatter:

```markdown
---
tags:
  - claude-memory
  - source
  - source-session          # mandatory tag (flat folder structure, tag-based classification)
  - <3-5 topic tags>
source_type: session
source_url: ""              # usually empty; or link to related plan/PR
source_date: 2026-04-25     # session date (= created)
session_duration: "~90min"  # rough estimate
participants:
  - "Michael"
  - "Alfred"                # you
author: "Michael + Alfred"
created: 2026-04-25
status: current
pii_reviewed: true          # MANDATORY for session-type (see ingest-workflow.md §3a)
reviewed: true
reviewed_date: 2026-04-25
quality_bar: v2
source_complete: true
blocked_reason: ""
---

# <Session title — descriptive, NO date in title>

## Frage

One paragraph: what question did this session answer or attempt to answer?
Synthesized from Michael's opening prompt — don't copy chat quotes verbatim.

## Vorgehen

Bullets or short sections: what steps, tools, sources were used?
Structure only, not every command.

- Read: [[Source A]], [[Concept B]], external URL X
- Decided: approach Y over Z, reasons below
- Built: file A, new Wiki page B, MCP tool C

## Findings

The **substantive insights**. This is the valuable part.
Each finding = bullet with 1-3 sentences.

- Finding 1 — concrete, attributable, not vague
- Finding 2 — with wikilinks to affected pages
- Finding 3 — if a process-lesson, note "→ see Lessons section below"

## Lessons

What do you now **do differently**? These lessons are back-propagated into the affected
Concept/Entity pages (see step 4 below).

- **Lesson 1:** Rule / procedure / anti-pattern — one sentence, imperative
- **Lesson 2:** ...

## Pages angefasst

List of vault pages edited/created. Symmetric to back-refs.

- Created: [[New Concept]], [[New Entity]]
- Updated: [[Existing Source]] (+ new cross-ref), [[Existing Concept]] (new lesson)
- Not touched (intentionally): [[X]] — reason

## Beziehungen

At least one typed relation to adjacent Concepts/Sources.

- **synthesiert aus** → [[A]], [[B]]
- **extended by** → [[C]]
- **siehe auch** → [[Related Concept]]
```

## Step-by-step

### 1. Confirm scope

Show Michael a short sketch:
```
Plan: file session as [[<title proposal>]] under Wiki/Sources/.
Tags: [claude-memory, source, source-session, <3-5 domain tags>]
Expected lessons: ~3-5
Pages to update: [<A>, <B>, <C>] — will get lesson bullets appended
PII-scan: will run Step 3a
```

Wait for confirmation or title correction. **Title is descriptive, no date** (date is in frontmatter + `source_date`).

### 2. PII-scan

**Mandatory for session-sources.** See `ingest-workflow.md` §3a. Session digests routinely contain:
- Your own session-like IDs (session-IDs, PR numbers, file hashes)
- Internal path fragments (`/workspace/...`, `/home/maschenborn/...`)
- Chat-internal phrases identifying Michael's workflow

**Whitelist for session-specific OK cases:**
- Claude session UUIDs — not sensitive
- Git commit SHAs
- File paths under `/workspace/extra/obsidian/` or `~/.claude/` — not secret

On matches: redact or ask. Only after clean pass: `pii_reviewed: true`.

### 3. Write the digest

Follow the 5-section structure above. **Do not chat-log.** Synthesize.

Markers of a good digest:
- **Findings are factual**, not narrative: "Tool X crashes on input Y" — not "we noticed that..."
- **Lessons are imperative**: "Always sync before batch-edit" — not "maybe one should..."
- **Pages-list is symmetric**: every page listed there will, at the end of the session, have a wikilink back to this session-source

Length: 80-200 lines typical. Longer = probably should be split into a Concept page.

### 4. Back-propagate lessons

This is the core of crystallization — otherwise the session disappears into `Wiki/Sources/` and no one finds the lessons.

For each lesson: identify the **applicable Concept/Entity page** and append a bullet. Format:

```markdown
## Lessons (aus Sessions)

- [2026-04-25] Always sync before batch-edit — from [[Session Title]] retro-finding #3
```

New section `## Lessons (aus Sessions)` at the end of the Concept/Entity page, after `## Beziehungen`.

The section is append-only, chronological. If it grows large enough, it justifies a sub-concept page.

### 5. Cross-refs

- Session-Source → Concept/Entity with lesson: `**beeinflusst** → [[X]]`
- Concept/Entity → Session-Source: in the `## Lessons (aus Sessions)` section

### 6. index.md + log.md

- `index.md`: new session-Source in Sources section (with date + short descriptor)
- `log.md`: block `## [YYYY-MM-DD] crystallize | <session title>` with Pages-Created/Updated

### 7. hot.md

Session is the new recent-context. Refresh snapshot.

### 8. Summary

```
Session [[<Title>]] filed as Source.
- PII-scan: clean
- 5 lessons propagated to 3 Concepts ([[A]], [[B]], [[C]])
- index.md: X → X+1 pages
```

## Common traps

- **Chat-dump instead of digest.** Session-Source isn't a transcript. Synthesize.
- **Lessons not propagated.** Then the session is just a folder entry.
- **Too many session-sources.** Not every chat deserves it. Default is: don't file.
- **PII-scan forgotten.** Session-logs are the main reason the PII-filter exists.
- **Title with date.** Date is in frontmatter. Title is topic.
- **No explicit trigger, just vibes.** If Michael didn't explicitly say "crystallize", **ask** — don't just do it.

## Mini-example (synthetic, illustrative)

> ```markdown
> ---
> source_type: session
> source_date: 2026-04-25
> session_duration: "~2h"
> participants: ["Michael", "Alfred"]
> tags: [claude-memory, source, source-session, vault-v2, obsidian-skill]
> ---
>
> # Obsidian v2 Skill-Alignment with Alfred
>
> ## Frage
> How do we bring Alfred's obsidian skill from v1-pre-migration to v2-parity without
> breaking his existing knowledge of the vault or introducing host-only concepts
> (like bash hooks)?
>
> ## Vorgehen
> - Read: Alfred's current SKILL.md, Michael's obsidian-skill, v2 plan file
> - Decided: adapt — no hooks (Alfred has none), no retro-TODO (Michael owns spec-evolution),
>   but schema-check as a written skill-rule step (3b)
>
> ## Findings
> - Alfred's skill was from 2026-04-22, so v1-migration + v1.1 + v2 all missing
> - Alfred's environment: /workspace/extra/obsidian/mashburn, continuous sync daemon → no ob sync
>
> ## Lessons
> - **Skill parity checks** between host-Claude and agent-Claude need explicit env-deltas documented.
> - **Hook functionality** gets translated into written skill-rules for environments without hooks.
>
> ## Pages angefasst
> - Created: [[container/skills/obsidian/references/*]] (3 new reference files)
> - Updated: [[container/skills/obsidian/SKILL.md]] (full rewrite to v2)
>
> ## Beziehungen
> - **synthesiert aus** → [[compounding-memex-v2 plan]]
> - **siehe auch** → [[Agent Harness Engineering]]
> ```
