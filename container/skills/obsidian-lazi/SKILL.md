---
name: obsidian-lazi
description: Work in Michael's LAZI Obsidian vault — a separate, **git-managed** Obsidian vault at `/workspace/extra/obsidian-lazi/` (NOT the same as Alfreds `mashburn` vault). Use whenever the user asks Elfi to look up / write LAZI-related notes, lesson plans, course materials, ideas, klassenfeedback, etc. — e.g. "leg eine Notiz zu DiMe-Termin Donnerstag an", "was hab ich zum Thema Kreativitäts-Methoden im Vault?", "schreib mir Brainstorming zur Klassenarbeit". Vault is a Git repo (`git@github.com-lazi:lazi-maschenborn/obsidian.git`) — **always `git pull` before any work, always `git push` after**.
---

# Obsidian-LAZI Skill

Michaels LAZI-Vault lebt **getrennt** von seinem Hauptvault `mashburn` (Alfreds Domäne). Beide Vaults sind in deinen Container gemountet — du arbeitest **ausschließlich** im LAZI-Vault, nie im `mashburn`. Die Datenhygiene-Regel aus deinem CLAUDE.local.md gilt verschärft: **niemals** Inhalte von einem Vault in den anderen kopieren.

## Vault location

```
/workspace/extra/obsidian-lazi/
```

Es ist ein **Git-Repo** (`origin: git@github.com-lazi:lazi-maschenborn/obsidian.git`). Anders als Alfreds `mashburn`-Vault gibt es **keinen `obsidian-sync`-Daemon** der Änderungen automatisch syncen würde. Wenn du nicht pullst/pushst, werden Michaels Edits am Telefon und deine Edits hier divergent.

## Auth — Deploy Key

Ein dedizierter SSH-Deploy-Key liegt unter `/workspace/extra/elfi-ssh/` (read-only mount, aus dem Host gemountet):

```
/workspace/extra/elfi-ssh/
├── config              # SSH-Alias mapping
├── id_lazi_obsidian    # private key
├── id_lazi_obsidian.pub
└── known_hosts         # github.com fingerprint pre-populated
```

Dieser Key kann **nur dieses eine Repo** (`lazi-maschenborn/obsidian`) lesen UND schreiben. Er ist nicht für andere GitHub-Operationen autorisiert.

Damit `git` deinen Deploy-Key nutzt, **prefixe jede git-Operation** mit `GIT_SSH_COMMAND`:

```bash
export GIT_SSH_COMMAND='ssh -F /workspace/extra/elfi-ssh/config -i /workspace/extra/elfi-ssh/id_lazi_obsidian -o IdentitiesOnly=yes -o UserKnownHostsFile=/workspace/extra/elfi-ssh/known_hosts'
```

Du kannst das einmalig am Anfang einer Skill-Session in deine Shell-env setzen, dann gelten alle folgenden `git`-Aufrufe automatisch durch den Deploy-Key. Oder du prefixst Inline:

```bash
GIT_SSH_COMMAND='...' git pull --ff-only
```

## Hard rules — kritisch

### 1. ALWAYS `git pull --ff-only` BEFORE any work

Bevor du auch nur eine Datei im Vault liest (für Recherche-Zwecke ist Pull optional), aber **bevor du irgendwas änderst oder anlegst**, muss du frisch pullen:

```bash
cd /workspace/extra/obsidian-lazi
GIT_SSH_COMMAND='ssh -F /workspace/extra/elfi-ssh/config -i /workspace/extra/elfi-ssh/id_lazi_obsidian -o IdentitiesOnly=yes -o UserKnownHostsFile=/workspace/extra/elfi-ssh/known_hosts' \
  git pull --ff-only
```

`--ff-only` schützt davor, beim merge in einen Konflikt zu rauschen. Wenn das fehlschlägt (lokale Änderungen die noch nicht gepushed wurden), siehe Failure Handling unten.

### 2. ALWAYS `git commit && git push` AFTER any change

Sobald du eine Datei angelegt/geändert hast und der Job erledigt ist:

```bash
cd /workspace/extra/obsidian-lazi
git add -A
git commit -m "<beschreibender Commit-Titel>" --author="Elfi (NanoClaw) <elfi@nanoclaw.local>"
GIT_SSH_COMMAND='ssh -F /workspace/extra/elfi-ssh/config -i /workspace/extra/elfi-ssh/id_lazi_obsidian -o IdentitiesOnly=yes -o UserKnownHostsFile=/workspace/extra/elfi-ssh/known_hosts' \
  git push
```

**Push ist nicht optional.** Wenn du Edits machst und nicht pushst, sieht Michael sie weder am Handy noch am Desktop. Das wäre ein bug, kein Feature.

### 3. Commit-Messages: konkret, nicht generisch

- ❌ "Update vault"
- ❌ "Notizen hinzugefügt"
- ✅ "DiMe 5./6. Sem.: Brainstorming Vibecoding-Workshop angelegt"
- ✅ "Klasse 7b: Feedback nach Klassenarbeit Algebra 2026-05-10"

Author bleibt `Elfi (NanoClaw) <elfi@nanoclaw.local>` — Michael sieht im git log, was du gemacht hast vs. was er selbst.

### 4. NEVER copy LAZI vault content into other vaults / contexts

Identisch zum data hygiene rule in CLAUDE.local.md, aber konkret hier:
- **Niemals** Schüler-Mailadressen, Notenlisten, Klassenroster aus dem Vault in `Alfreds /workspace/extra/obsidian/mashburn/` kopieren oder dorthin verlinken
- **Niemals** Vault-Inhalte ins PhoenixDMS pushen
- **Niemals** ohne Michaels expliziten Wunsch Inhalte als WhatsApp/Mail an externe Personen schicken

### 5. Conflicts NEVER force-push

Wenn ein Push wegen Divergenz fehlschlägt:
- **Pull --rebase** (mit GIT_SSH_COMMAND prefix), conflict-resolve, dann push
- Wenn das nicht straightforward ist: **Stop**, melde Michael den Status, er entscheidet
- **Niemals** `git push --force` — würde Edits von Michaels Handy plattmachen

## Vault-Struktur (zur Orientierung)

```
/workspace/extra/obsidian-lazi/
├── CLAUDE.md            # Instructions specific to working in this vault
├── Inbox/               # Quick-capture, später sortieren
├── Ideen/               # Brainstorming, Konzept-Entwürfe
├── Kurse/               # Pro Kurs eine Unter-Struktur (DiMe, etc.)
├── ...
└── .git/                # Git repo metadata
```

Lies `CLAUDE.md` im Vault-Root als erstes — der Vault selbst gibt dir spezifische Konventionen. Diese Skill hier deckt nur die Mechanik (Git, Mounts, Auth) ab.

## Common workflows

### Workflow — "schau im LAZI-Vault nach X" (read-only)

```bash
cd /workspace/extra/obsidian-lazi
# pull is optional for pure reads, but always-pull is the safer default
GIT_SSH_COMMAND='...' git pull --ff-only

# dann grep / find / cat / Tools deiner Wahl
grep -ri 'vibecoding' --include='*.md' .
```

### Workflow — "leg im LAZI-Vault eine Notiz an"

```bash
cd /workspace/extra/obsidian-lazi
GIT_SSH_COMMAND='...' git pull --ff-only

# Datei schreiben (Beispiel: neue Inbox-Notiz)
cat > "Inbox/2026-05-07 DiMe Vibecoding-Workshop Brainstorming.md" <<'EOF'
---
created: 2026-05-07
tags: [dime, workshop, vibecoding]
---

# DiMe Vibecoding-Workshop — Brainstorming

...
EOF

# Commit + Push
git add -A
git commit -m "DiMe: Brainstorming Vibecoding-Workshop angelegt" --author='Elfi (NanoClaw) <elfi@nanoclaw.local>'
GIT_SSH_COMMAND='...' git push
```

### Workflow — "ergänze in der bestehenden Note Y noch Z"

```bash
cd /workspace/extra/obsidian-lazi
GIT_SSH_COMMAND='...' git pull --ff-only

# Edit (atomic — nutze Edit/Write tool, nicht sed)
# ...

git add -A
git commit -m "<Page-Name>: <was du ergänzt hast> ergänzt" --author='Elfi (NanoClaw) <elfi@nanoclaw.local>'
GIT_SSH_COMMAND='...' git push
```

## Failure handling

- **`Permission denied (publickey)`**: deploy-key wurde umkonfiguriert / entfernt. Tell Michael; er muss in GitHub den Deploy-Key prüfen / neu hinzufügen. Nicht selber retry-loopen.
- **`Updates were rejected because the remote contains work that you do not have locally`** beim push: jemand anderes (Michaels Handy via Obsidian-Sync? Andere Session?) hat in der Zwischenzeit gepushed. → `git pull --rebase`, conflict-resolve, push retry. Wenn rebase Konflikte produziert die du nicht trivial lösen kannst, stop und meld Michael den Status.
- **`fatal: refusing to merge unrelated histories`**: das passiert eigentlich nicht, wenn doch — meld Michael, er muss den State manuell fixen.
- **Network timeout / GitHub down**: warte 30 Sekunden, ein retry. Wenn weiter down: tell Michael, lass den Vault in dem Zustand wie du ihn hast (lokal committed, nicht gepushed). Beim nächsten Wake versuchst du wieder zu pushen.

## What this skill does NOT do

- **Cross-vault operations**: Niemals Inhalte zwischen `obsidian-lazi/` und `obsidian/mashburn/` kopieren
- **Direkte Sync mit Obsidian-Sync-Daemon**: dieser Vault hat das nicht. Git ist der einzige Sync-Mechanismus. Erinnere Michael wenn relevant.
- **Branch-Ops**: dieser Vault arbeitet linear auf `main`. Keine Feature-Branches, keine PRs. Nur Commits + Push auf main.
- **`git push --force`**: niemals. Bei Konflikten lösen oder Michael fragen.
- **Repo-Admin** (Settings ändern, Deploy Keys verwalten, Mitglieder hinzufügen): das macht Michael in der GitHub-UI, nicht du.
