---
name: servd-state
description: Lies und manipuliere den State der servd-v2-App (Michaels Advent-Kalender-artige Massage-Session-Verwaltung unter https://servd.aschenborn.net). Nutze diese Skill wann immer Michael über "geplante Massage-Sessions", "Karten" (revealed/redeemed/pinned), "Pin"s, einen Termin/Tag im Kalender, "die App", "servd" oder "den Server" (= Egert) spricht — egal ob er nach dem heutigen Stand fragt, in die Zukunft schaut ("was ist nächste Woche geplant?"), etwas pinnen/unpinnen will, oder eine bestimmte Karte revealen möchte. Nur für servd verfügbar — Alfred und Elfi haben diese Skill bewusst nicht.
---

# servd-state Skill

Du bist der Agent für Michaels servd-v2-App. Das ist ein persönlicher Adventskalender-artiger Tracker für Massage-Sessions: pro Tag eine "Karte" mit einer Massage-Aktion (oder einem Dud/Jackpot), die Michael revealen und mit einem Timer einlösen kann. Manche Tage pinnt er sich für später vor.

## Architektur in einem Satz

State, Schedule und Cards leben alle drei als JSON-Files am Host (Egert) unter `/data/servd-v2/` und sind per **directory-level Bind-Mount** in den Next.js-Container reingereicht (`/data/servd-v2` → `/app/data`). Alle drei sind zur Laufzeit lesbar UND beschreibbar (atomic-rename funktioniert).

## Was wo liegt

| Was | Wo | Wie du dran kommst |
|---|---|---|
| **App-API** (heutige Karte, recent, pinned, permanent, `?date=`-Filter) | https://servd.aschenborn.net/api/state | HTTPS — **Default für alles Gespräch** |
| **Raw state.json** (revealed/redeemed/pinned ohne Card-Inhalte) | Host: `/data/servd-v2/state.json` · Container: `/app/data/state.json` | SSH — Ops/Debugging |
| **Schedule** (Datum → cardId) | Host: `/data/servd-v2/schedule.json` · Container: `/app/data/schedule.json` | SSH — Generieren/Editieren erlaubt |
| **Cards** (alle Karten-Inhalte) | Host: `/data/servd-v2/cards.json` · Container: `/app/data/cards.json` | SSH — Editieren erlaubt; **nach Änderungen Container-Restart nötig** (in-memory Cache, siehe unten) |
| **Hourly Backups** | Host: `/data/servd-v2/backups/state-YYYYMMDD-HHMMSS.json` (14 Tage Retention) | SSH `ls` / `cat` |
| **Server** | `root@46.224.227.221` (Egert, `egert.aschenborn.net`) | SSH mit deinem Key |

**Permissions auf den Files** (Stand 2026-05-16): owner `1001` (Next.js-Container-User `nextjs`), group `1000` (`maschenborn`), mode `0664`. Dir ist setgid auf group 1000 → neue Files erben group `maschenborn`. Heißt: sowohl die App (UID 1001) als auch maschenborn (UID 1000, via group) können atomic-rename machen. Wenn du als root via SSH schreibst — kein Problem, du übersteuerst alles.

**Wichtige Erkenntnis**: Die App-API liefert **schon angereicherte Daten** — du musst Card-Inhalte nicht selbst aus `cards.json` zusammensuchen. Default-Workflow für Smalltalk über Massage-Sessions: nur `curl /api/state` und (bei Bedarf) `curl /api/state?date=YYYY-MM-DD`. SSH ist nur für Operations / Notfall / Tiefgang.

**Effizienz-Hinweis**: `recent[]` aus `/api/state` enthält **bereits den State pro Tag** (revealed mit `revealedAt` oder fehlend = nicht revealed) UND den Card-Inhalt. Heißt: für Fragen wie „Welche Tage hat sie verpasst?" / „Was wäre da gewesen?" über die letzten Tage brauchst du **EINEN** Call (`/api/state`), nicht pro Tag einen. `state == null` im recent-Eintrag = Tag verpasst. `?date=` Filter nur für Daten *außerhalb* der recent-Fenster (Zukunft, älter als ~5 Tage) verwenden.

## Wie du SSH machst

Du hast einen eigenen SSH-Key unter `/workspace/extra/servd-ssh/id_ed25519`.

**Wichtig: Das `ssh`-Binary ist in diesem Container nicht installiert.** Nutze stattdessen das `ssh2`-npm-Paket. Es muss ggf. einmalig pro Container-Session installiert werden:

```bash
cd /tmp && mkdir -p sshtest && cd sshtest && npm init -y && npm install ssh2
```

Danach via Node.js verbinden:

```js
const { Client } = require('/tmp/sshtest/node_modules/ssh2');
const fs = require('fs');
const key = fs.readFileSync('/workspace/extra/servd-ssh/id_ed25519');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('cat /data/servd-v2/state.json', (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => { console.log(out); conn.end(); });
  });
}).connect({ host: '46.224.227.221', port: 22, username: 'root', privateKey: key });
```

Der Key ist von Michael auf dem Server autorisiert (`servd@nanoclaw`).

## Wie du Coolify ansprichst

Coolify-API läuft auf `https://coolify.egert.aschenborn.net`. OneCLI injiziert das Bearer-Token automatisch in jeden HTTPS-Call auf diesen Host — du `curl`-st einfach, ohne Auth im Code:

```bash
curl -s https://coolify.egert.aschenborn.net/api/v1/applications/uw480c4cskcsg8s804kk008g | head -50
```

App-UUID `uw480c4cskcsg8s804kk008g` ist die servd-v2-App.

## Schema von state.json

```ts
interface AppState {
  revealed: Record<string, {        // key: ISO date "YYYY-MM-DD"
    revealedAt: string;             // ISO timestamp wann Michael revealt hat
    totalSeconds?: number;          // Timer-Gesamtdauer der Karte (fehlt bei Duds/Jackpots)
    redeemedSeconds?: number;       // schon abgelaufene Timer-Sekunden
    lastTimerAt?: string;           // letzter Start/Pause-Zeitpunkt
  }>;
  pinned: string[];                 // Liste von date-strings YYYY-MM-DD
}
```

Beispiel:
```json
{
  "revealed": {
    "2026-05-15": { "revealedAt": "2026-05-15T10:00:00.000Z", "totalSeconds": 300, "redeemedSeconds": 120, "lastTimerAt": "2026-05-15T10:05:00.000Z" }
  },
  "pinned": ["2026-05-18", "2026-05-25"]
}
```

## Cookbook

### State + Card-Inhalte zu einem Datum (Default-Pfad)

```bash
# Heute (oder generelle Übersicht: today/recent/pinned/permanent)
curl -s https://servd.aschenborn.net/api/state

# Spezifisches Datum
curl -s "https://servd.aschenborn.net/api/state?date=2026-05-25"
```

Response-Shape:

```jsonc
{
  "today":   { "date":"...", "card":{ "cardId":"...", "text":"...", "type":"short|dud|jackpot|...", "flavor":"...", "duration":300 },
               "state": null | { "revealedAt":"...", "totalSeconds":..., "redeemedSeconds":..., "lastTimerAt":"..." },
               "canReveal": true|false },
  "recent":  [ same shape as today.card+state, last 5 revealed ],
  "pinned":  [ same shape, all currently pinned dates ],
  "permanent": [ same shape, special permanent cards ]
}
```

**Karten-Typen:** `short` (5-Min-Karte mit `duration`), `dud` (Niete, kein Timer), `jackpot` (Special, evtl. langer Timer). Schau auf `type` bevor du über "die Massage" sprichst — bei `dud` ist es ja keine Massage.

### Cards + Schedule direkt lesen / editieren

Cards und Schedule liegen seit der Mount-Umstellung (2026-05-16) direkt am Host und sind editierbar. **Caching-Verhalten:**

| Datei | Caching | Wirksam |
|---|---|---|
| `state.json` | Kein Cache — per Request frisch gelesen | Sofort |
| `schedule.json` | **In-memory Cache** (Modul-Level, einmalig befüllt) | Erst nach Container-Restart |
| `cards.json` | **In-memory Cache** (vermutlich gleich) | Erst nach Container-Restart |

**Nach schedule.json- oder cards.json-Änderungen immer Container restarten:**

```js
// via ssh2 (siehe "Wie du SSH machst"):
conn.exec(
  'C=$(docker ps --filter "name=uw480c4cskcsg8s804kk008g" --format "{{.Names}}" | head -1) && docker restart $C',
  (err, stream) => { stream.on('close', () => conn.end()); }
);
```

~5 Sekunden Downtime. Danach via `curl https://servd.aschenborn.net/api/state` verifizieren.

**Tagesindividuelle Anpassungen gehören in `schedule.json`**, nicht in `cards.json`. Der schedule.json-Eintrag pro Datum hat eigene `text`- und `duration`-Felder (denormalisiert), die den Card-Default überschreiben. cards.json ist die globale Kartenvorlage — Änderungen dort wirken sich auf alle Tage aus, die diese Karte verwenden.

Default-Lesepfad bleibt die API, weil die schon die *relevanten* Karten zurückgibt.

Lesen via ssh2 (siehe "Wie du SSH machst" für Setup):

```js
const { Client } = require('/tmp/sshtest/node_modules/ssh2');
const fs = require('fs');
const key = fs.readFileSync('/workspace/extra/servd-ssh/id_ed25519');
const cfg = { host: '46.224.227.221', port: 22, username: 'root', privateKey: key };

const conn = new Client();
conn.on('ready', () => {
  conn.exec('cat /data/servd-v2/cards.json', (err, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      const cards = JSON.parse(out);
      console.log(`cards: ${cards.length}`);
      conn.end();
    });
  });
}).connect(cfg);
```

Atomar editieren (SFTP + ssh2 exec für rename/chown — analog State-Write-Pattern unten, nur Quelle/Ziel sind `cards.json` bzw. `schedule.json`). Backup vor jeder Editier-Aktion via ein `cp /data/servd-v2/cards.json /data/servd-v2/backups/cards-pre-<TS>.json` über `conn.exec(...)`.

Atomic-rename funktioniert seit dem Dir-Mount-Fix (2026-05-16); vorher gab's EXDEV. Nach Edit: **Container restart**, weil Cache (siehe Tabelle oben).

### Eine Karte pinnen / unpinnen

Bevorzugt via App-API (sie kümmert sich um atomic `.tmp + rename`):

```bash
curl -s -X POST https://servd.aschenborn.net/api/pin \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-18"}'
```

`/api/pin` ist ein Toggle — derselbe Call entfernt den Pin wieder.

### Karte revealen / Timer starten/pausieren

```bash
# Reveal
curl -s -X POST https://servd.aschenborn.net/api/reveal \
  -H 'Content-Type: application/json' -d '{"date":"2026-05-15"}'

# Timer Start
curl -s -X POST https://servd.aschenborn.net/api/redeem \
  -H 'Content-Type: application/json' -d '{"date":"2026-05-15","action":"start"}'

# Timer Pause
curl -s -X POST https://servd.aschenborn.net/api/redeem \
  -H 'Content-Type: application/json' -d '{"date":"2026-05-15","action":"pause"}'
```

**Wann nicht autonom revealen/timern**: Reveal ist ein bewusstes Ritual — du fragst zurück, bevor du es autonom machst. Pinning/Unpinning ist niedrigschwellig, kannst du auf direkte Anweisung machen.

### Direkter State-Write (Notfall, atomisch — Pflicht-Pattern)

Nur wenn die App-API nicht ausreicht. Atomisches `.tmp + mv` und JSON-Validation sind Pflicht — die App liest die Datei jederzeit, halbgeschriebener Stand korrumpiert sie.

Komplette Routine als Node.js-Script (nutzt `ssh2` + `ssh2-sftp-client`; siehe "Wie du SSH machst" für die einmalige Installation):

```bash
cd /tmp/sshtest && npm install ssh2 ssh2-sftp-client
```

```js
const { Client } = require('/tmp/sshtest/node_modules/ssh2');
const SftpClient = require('/tmp/sshtest/node_modules/ssh2-sftp-client');
const fs = require('fs');
const key = fs.readFileSync('/workspace/extra/servd-ssh/id_ed25519');
const cfg = { host: '46.224.227.221', port: 22, username: 'root', privateKey: key };

(async () => {
  // 1. Aktuellen State per SFTP holen
  const sftp = new SftpClient();
  await sftp.connect(cfg);
  const raw = await sftp.get('/data/servd-v2/state.json');
  const state = JSON.parse(raw.toString('utf8'));

  // 2. Modifizieren (Beispiel: pinned-Datum hinzufügen)
  state.pinned.push('2026-05-20');

  // 3. Validieren — JSON.stringify wirft bei Zyklen / Invalidität, JSON.parse(stringify) als Round-Trip-Check
  const serialized = JSON.stringify(state, null, 2);
  JSON.parse(serialized);  // throw bei kaputtem JSON

  // 4. Atomisch hochladen — .tmp + chown/chmod + rename auf dem Host
  await sftp.put(Buffer.from(serialized, 'utf8'), '/data/servd-v2/state.json.tmp');
  await sftp.end();

  // chown / chmod / mv via ssh2.exec (keine SFTP-Calls dafür)
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', () => {
      conn.exec(
        'chown 1001:1001 /data/servd-v2/state.json.tmp && ' +
        'chmod 644 /data/servd-v2/state.json.tmp && ' +
        'mv /data/servd-v2/state.json.tmp /data/servd-v2/state.json',
        (err, stream) => {
          if (err) return reject(err);
          stream.on('close', () => { conn.end(); resolve(); });
          stream.on('data', () => {});
        });
    }).on('error', reject).connect(cfg);
  });
})();
```

Container-User ist `nextjs` (uid 1001:1001) — Owner und Mode 644 sind Pflicht, sonst kann die App den State nicht mehr schreiben.

### Restore aus stündlichem Backup

```js
const { Client } = require('/tmp/sshtest/node_modules/ssh2');
const fs = require('fs');
const key = fs.readFileSync('/workspace/extra/servd-ssh/id_ed25519');
const cfg = { host: '46.224.227.221', port: 22, username: 'root', privateKey: key };

function run(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => out += d);
        stream.on('close', () => { conn.end(); resolve(out); });
      });
    }).on('error', reject).connect(cfg);
  });
}

(async () => {
  // 1. Verfügbare Backups listen
  console.log(await run('ls -lat /data/servd-v2/backups/ | head -20'));

  // 2. Restore — Datums-Suffix ersetzen
  const backup = '/data/servd-v2/backups/state-20260515-091416.json';
  await run(
    // a. validieren
    `node -e 'JSON.parse(require("fs").readFileSync("${backup}","utf8"))' && ` +
    // b. atomar replizieren
    `cp ${backup} /data/servd-v2/state.json.tmp && ` +
    `chown 1001:1001 /data/servd-v2/state.json.tmp && ` +
    `chmod 644 /data/servd-v2/state.json.tmp && ` +
    `mv /data/servd-v2/state.json.tmp /data/servd-v2/state.json`
  );
})();
```

## Disaster-Recovery (Persistenz von Grund auf)

Falls Coolify-Storage-Eintrag, Host-Pfad oder Cron weg sind — siehe Markdown-Briefing 2026-05-15. Kurzfassung der Schritte:

1. Host-Pfad anlegen + Owner setzen (`mkdir -p /data/servd-v2/backups`, leeren State seeden, `chown 1001:1001`)
2. Coolify-Storage-Eintrag neu (CLI: `coolify app storage create ...`)
3. Redeploy (Coolify-API oder UI)
4. Backup-Script `/usr/local/bin/servd-v2-backup.sh` + Crontab `0 * * * *`

App-UUID: `uw480c4cskcsg8s804kk008g`. Storage-UUID: `bgudoclvu2db4mq4x86k5spj`.

## Gesprächs-Stil

Wenn Michael nach "was ist heute / morgen / nächste Woche geplant?" fragt:

1. State holen (HTTP) → wer ist gepinnt + wer ist revealed
2. Schedule holen (SSH, einmal pro Session cachen mental) → welche cardId an welchem Datum
3. Cards holen (SSH, einmal pro Session) → was bedeutet welche cardId
4. Zusammenführen und auf Deutsch erzählen, was an dem Tag ansteht. Nicht roh-JSON ausspucken — natürlich erzählen, was die Karte ist (Massagetyp, Dauer, etc.).

Wenn Michael etwas pinnen / unpinnen / revealen will: API-Call, kurze Bestätigung, fertig. Bei Reveal nochmal kurz nachfragen, weil das ein bewusstes Ritual ist.

## Bekannte Limits

- API hat keine Auth — wer den FQDN kennt, kann lesen/schreiben. Du machst dir darüber keinen Kopf, Michael weiß es.
- Backups liegen nur am Host — kein Off-Server-Mirror. Nicht dein Problem zum Lösen, aber gut zu wissen.
- Alle drei Dateien (`state.json`, `schedule.json`, `cards.json`) sind seit dem Dir-Mount-Fix (2026-05-16) auf dem Host und beschreibbar. state.json per API, schedule/cards per SSH + Container-Restart.
