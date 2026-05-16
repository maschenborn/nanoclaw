---
name: obsidian-orange
description: Work in the team:orange Obsidian vault — a **git-managed** wiki under `/workspace/extra/obsidian-orange/`, hosted at `gitlab.teamorange.dev:29418/teamorange/obsidian`. Use whenever Michael fragt nach team:orange-Wissen: Kunden-Notizen, Projekt-Historie, Patterns/Snippets, Meeting-Notes, interne Doku, "schreib mal ne Notiz zu X", "was wissen wir über Kunde Y", "wo war die Konfig für Z". **ALWAYS git pull --ff-only BEFORE reading or writing, ALWAYS git commit + push AFTER any edit.**
---

# Obsidian-Orange Skill (team:orange Wiki)

team:orange hat ein **Obsidian-Wiki** als zentralen Wissensspeicher — Kunden-Profile, Projekt-Historie, Tech-Stack-Notizen, Meeting-Protokolle, Snippets. Du arbeitest direkt im Vault, kein Conversion-Layer. Datei = .md mit YAML-Frontmatter.

## Vault location

```
/workspace/extra/obsidian-orange/
```

Es ist ein **Git-Repo** (`origin: ssh://git@gitlab.teamorange.dev:29418/teamorange/obsidian.git`). Anders als Alfreds privater `mashburn`-Vault gibt es **keinen Obsidian-Sync-Daemon** — Sync läuft ausschließlich via Git. Wenn du nicht pullst, siehst du veraltete Inhalte. Wenn du nicht pushst, gehen deine Edits verloren (zumindest aus Sicht anderer Geräte/Sessions).

## Auth — Deploy Key

Ein dedizierter SSH-Deploy-Key liegt unter `/workspace/extra/timo-orange-ssh/` (read-only mount aus dem Host):

```
/workspace/extra/timo-orange-ssh/
├── config                # SSH-Alias mapping (Port 29418, User git)
├── id_ed25519_orange     # private key
├── id_ed25519_orange.pub
└── known_hosts           # gitlab.teamorange.dev:29418 fingerprints
```

Dieser Key ist **nur für dieses eine Repo** autorisiert (registriert als Deploy-Key mit Write-Permission auf `teamorange/obsidian`). Er gilt nicht für andere GitLab-Projekte.

Damit `git` deinen Deploy-Key nutzt, setz `GIT_SSH_COMMAND` einmal in deiner Session:

```bash
export GIT_SSH_COMMAND='ssh -F /workspace/extra/timo-orange-ssh/config -i /workspace/extra/timo-orange-ssh/id_ed25519_orange -o IdentitiesOnly=yes -o UserKnownHostsFile=/workspace/extra/timo-orange-ssh/known_hosts'
```

Danach gelten alle `git`-Aufrufe automatisch durch den Deploy-Key.

Identity-Setup für Commits (einmal pro Container-Session reicht):

```bash
cd /workspace/extra/obsidian-orange
git config user.email "timo@nanoclaw"
git config user.name  "Timo"
```

## Hard Rules — kritisch

### 1. ALWAYS `git pull --ff-only` BEFORE lesen oder schreiben

Bevor du den Vault liest UND bevor du irgendwas änderst, frisch pullen:

```bash
cd /workspace/extra/obsidian-orange
git pull --ff-only
```

`--ff-only` ist Pflicht. Wenn der Pull mit "not possible to fast-forward" failt, gibt's lokale Änderungen die nicht committed sind — dann nicht weiterarbeiten, sondern Michael melden ("Vault hat untracked oder uncommitted Änderungen, ich kann nicht pullen, bitte schau drauf").

### 2. ALWAYS `git add && git commit && git push` NACH jeder Edit-Aktion

Direkt nach jedem File-Edit:

```bash
cd /workspace/extra/obsidian-orange
git add -A
git commit -m "<aussagekräftige Commit-Message>"
git push origin main
```

Ein File-Edit ohne Push = nicht passiert. Wenn du im Lauf der Session mehrere Files änderst, kannst du am Ende ein-mal-commit/push machen. Aber spätestens am Ende der Session.

Commit-Message-Stil: präsens-imperativ Englisch oder Deutsch, eine Zeile, was du gemacht hast. Beispiele:
- `add note on Dobmeier site-relaunch`
- `update Aurea Solutions kontakt-history`
- `link Mautic-segment "qualifizierte Leads" to projects/teamorange-de.md`

### 3. Niemals Force-Push, niemals zurücksetzen ohne Plan

`git push --force`, `git reset --hard`, `git push --force-with-lease` — alle drei NIE ohne expliziten Auftrag von Michael. Wenn ein Push wegen Konflikt failt: stoppen, Michael melden, **er** entscheidet wie's weitergeht.

### 4. Sensitive Daten

Du hast Write-Access auf das ganze Repo. Bedeutet: du könntest Geheimnisse einkippen (API-Tokens, PII, Customer-Daten). Bevor du etwas commitest:

- Prüfe dass kein Token / Passwort / API-Key im Inhalt steht
- PII (E-Mail, Telefon, Adressen, Geburtsdaten) nur wenn der Vault-Kontext das eindeutig vorsieht (z.B. `customers/`-Subdir mit Kontaktdaten ist OK; eine Meeting-Note die einmal nebenbei ne Mail-Adresse erwähnt, OK; ein File `passwords.md` — STOP, das gehört in den Passwort-Manager, nicht in den Vault)
- Bei Zweifel: Michael fragen "soll ich X mit in die Commit-Message bzw. ins File übernehmen?"

## Workflow

### Lesen / Recherche

```bash
# 1. Pull (oder skippen falls die Session schon mal gepullt hat in den letzten paar Minuten)
cd /workspace/extra/obsidian-orange && git pull --ff-only

# 2. Suchen — grep ist meist schneller als Obsidian-CLI
grep -rn "Dobmeier" --include='*.md' /workspace/extra/obsidian-orange/ | head

# 3. Datei lesen
cat /workspace/extra/obsidian-orange/customers/dobmeier.md
```

### Neue Note anlegen

```bash
cd /workspace/extra/obsidian-orange
git pull --ff-only

# YAML-Frontmatter + Inhalt
cat > meetings/2026-05-16-dobmeier-review.md <<'EOF'
---
date: 2026-05-16
type: meeting
attendees: [michael, dobmeier-team]
project: dobmeier-relaunch
tags: [meeting, dobmeier]
---

# Dobmeier Review-Call 16.05.2026

## Diskutiert

- ...

## Action Items

- [ ] ...
EOF

git add meetings/2026-05-16-dobmeier-review.md
git commit -m "add meeting note dobmeier review 2026-05-16"
git push origin main
```

### Bestehende Note erweitern

```bash
cd /workspace/extra/obsidian-orange && git pull --ff-only

# Edit (z.B. Anfügen am Ende)
echo -e "\n## Update 2026-05-16\n\n…" >> customers/dobmeier.md

git add customers/dobmeier.md
git commit -m "extend Dobmeier customer note with 2026-05-16 update"
git push origin main
```

### Verlinken — Obsidian-Wikilink-Style

Obsidian rendert `[[Customer/Dobmeier]]` als Link zur Datei. Beim Schreiben: einfach so verlinken, kein extra Markdown nötig. Auch `[[Customer/Dobmeier|Anzeigetext]]` mit Display-Override geht.

## Karpathy-LLM-Wiki Pattern (Optional)

Falls Michael vom Karpathy-Pattern spricht — das ist der Workflow den er auch in seinen privaten Vault einbaut (Alfred-Skill `obsidian`):

- **Ingest**: rohes Material (Mail, URL, Notiz) wird zu einer Note mit Frontmatter, in Inbox abgelegt
- **Query**: Recherche-Frage → Notes zusammen-grep'en + zusammenfassen
- **Lint**: regelmäßig Inbox aufräumen, falsche/duplizierte Notes zusammenführen

Für team:orange wenig anwendbar weil der Vault hier mehr Workspace-Wiki als Lebensindex ist — aber die `Ingest`-Logik (saubere Frontmatter, klare Kategorisierung, Wikilinks) ist immer gut.

## Datenhygiene-Regel (verschärft)

**Niemals** Inhalte aus diesem Vault in andere Vaults (Alfreds `mashburn`, Elfis `obsidian-lazi`) kopieren — Vault-Trennung muss bestehen. Auch nicht andersherum.

Für team:orange-Kunden-Daten gilt zusätzlich: Customer-PII (E-Mail, Telefon, Adresse) bleibt in den entsprechenden Tools (Twenty CRM, Mautic, Zammad) statt zusätzlich im Vault zu doppeln. Im Vault landen *Notizen über* den Kunden (was wurde besprochen, was ist die Geschichte, welche Patterns gibt's bei dem), nicht zwingend die exakten Kontaktdaten.
