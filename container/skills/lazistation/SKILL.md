---
name: lazistation
description: Operations auf der **Lazistation** (Synology DS116, ARM, im LAZI-LAN) — SSH-Access, Pfad-Struktur (lokale User vs LDAP-Homes), Web-Hosting für Studierenden-Projekte, Synology-Quirks (busybox-tar, kein chown via sudo, ACL-Trick), Deploy-Patterns. Use whenever Michael Aufgaben zur Schul-NAS hat: Files hochladen, Web-Bereich für Studierende einrichten, ACLs setzen, Stand prüfen. Triggers: "lazistation", "Synology", "NAS", "DSM", "studenten-deploy", "intern.lazi.works".
---

# Lazistation Skill

**Hardware**: Synology DS116, ARM-Architektur. Steht im LAZI-Akademie-Netzwerk Esslingen. Zentral für Studierenden-Web-Projekte (Hosting unter `intern.lazi.works`) und Datei-Sync der Schule.

**Wichtig**: Du operierst auf der NAS via SSH. Synology-Spezifika sind eigenwillig — die meisten Linux-Tools fehlen oder verhalten sich anders. Lies die Quirks unten **vor** komplexen Aktionen.

## Zugang

```bash
SSH:  ssh -p 50022 admin@lazistation.synology.me
DSM:  https://laziakademie.de8.quickconnect.to/
Web:  https://intern.lazi.works/~<user>@lazi-akademie.de/<ordner>   (LDAP-User)
      https://intern.lazi.works/~Claude/<ordner>                    (lokaler Account "Claude")
```

**SSH-Hostname `lazistation` allein klappt NICHT** — immer FQDN + Port `50022`.

DSM-Login-Passwort liegt in `.env` als `LAZISTATION_DSM_PW` (vom `setup-elfi-secrets.sh` gesetzt) bzw. in OneCLI-Vault unter `Lazistation DSM admin`.

## Pfad-Struktur

| Pfad | Wer / wann |
|---|---|
| `/volume1/homes/<username>/` | Lokale Synology-User (z.B. `admin`, `Claude`) |
| `/volume1/homes/@LH-LAZI-AKADEMIE.DE/<numericID>/<username>-<uid>/` | LDAP-User der `lazi-akademie.de`-Domain (Studierende, Kollegen) |
| `<home>/www/` | Web-Ordner — von dort served `intern.lazi.works/~<user>/...` |

LDAP-User-IDs für die Luna-Kohorte (DIME 555) sind im `dime-unterricht`-Skill aufgelistet.

**Mein Account auf der Lazistation**: `Claude` (lokaler User, kein LDAP). Home: `/volume1/homes/Claude/`. Web-Ordner: `/volume1/homes/Claude/www/`. Dorthin landen meine eigenen Test-Deploys (Wasserstandsmeldung-Apps für die Klasse, Demos etc.).

## Synology-Quirks (was anders ist)

### Tools-Lage

| Tool | Status |
|---|---|
| `getent` | **fehlt** |
| `synouser` | **nicht im PATH** (existiert in `/usr/syno/bin/`) |
| `synoacltool` | `/usr/syno/bin/synoacltool` (nicht im PATH) |
| `setfacl`, `getfacl` | **fehlt** (Synology nutzt eigenes ACL-System) |
| `file` | **nicht installiert** |
| `tar` | **busybox-tar** — bricht still bei macOS-xattr-Headern ab |
| `scp` | braucht `-O`-Flag (legacy) für absolute Pfade |

### `chown` geht NICHT — ACL-Trick stattdessen

Das DSM-admin-Passwort `secret0815` (oder was es jetzt ist) wird von `sudo` **abgelehnt** auf der Lazistation. Daher kein `chown`. Stattdessen Synology-ACLs:

```sh
/usr/syno/bin/synoacltool -add <path> 'user:<user>@lazi-akademie.de:allow:rwxpdDaARWcCo:fd'
/usr/syno/bin/synoacltool -add <path> 'group:http:allow:r-----a-R-c--:fd'
/usr/syno/bin/synoacltool -add <path> 'user:admin:allow:rwxpdDaARWcCo:fd'
```

Permission-String erklärt:
- `r` read · `w` write · `x` exec · `p` change permissions
- `d` delete · `D` delete-children · `a` append · `A` allow read-attr · `R` read-named-attr
- `c` read ACL · `C` change ACL · `o` change owner
- `:fd` Inheritance: **f**ile + **d**irectory (vererbt sich an neue Kinder)

### Bei frischen www-Ordnern

Synology kann den Ordner zunächst im **Linux-Mode** statt **ACL-Mode** anlegen. Reihenfolge:

1. `mkdir <neuer www-ordner>`
2. **ACLs SOFORT setzen** (siehe oben) — dann Files reinkopieren
3. Files erben ACL via `:fd`-Flag

Wenn man Files VOR den ACLs reinkopiert, müssten die ACLs danach manuell rekursiv angewendet werden — fehleranfällig.

### Tarball-Erstellung (Mac → Lazistation)

macOS' `tar` hängt extended-attribute-Header (`._*`) an, die busybox-tar still abbricht. Lösung beim Packen:

```sh
COPYFILE_DISABLE=1 tar --no-xattrs -czf out.tar.gz <src>
```

(Auf Linux-Host ohne macOS-xattrs ist das egal.)

### Hintergrund-SSH-Bash hängt

Lange SSH-Sessions mit interaktiver `bash -s`-Pipe (z.B. mehrere `cd`/`cmd`/`cd back`) hängen reproduzierbar nach 3–4 Iterationen. **Workaround**:

1. Lokal Skript schreiben: `deploy.sh`
2. `scp -O deploy.sh admin@lazistation.synology.me:/tmp/deploy.sh`
3. `ssh -p 50022 admin@lazistation.synology.me "bash /tmp/deploy.sh"`

So bleibt die Session kurz und deterministisch.

### `set -e` weglassen

In Deploy-Skripten **NICHT** `set -e` benutzen — `synoacltool` und `cp` haben Edge-Cases die nonzero zurückgeben aber trotzdem das gewünschte Ergebnis erzeugen. Bei `set -e` brichst du unnötig ab.

Alternativ: einzelne Befehle mit `|| true`-Suffix wenn sie best-effort sind.

## Deploy-Pattern (bewährt)

Beispiel: HTML/CSS-Klassen-Aufgabe an die Luna-Kohorte verteilen.

```sh
# 1. Lokal Tarball packen
cd ~/Downloads/test5-praktische-klausur/
COPYFILE_DISABLE=1 tar --no-xattrs -czf praktische-klausur.tar.gz vorlage/

# 2. Auf Lazistation hochladen
scp -O -P 50022 praktische-klausur.tar.gz admin@lazistation.synology.me:/tmp/

# 3. Deploy-Skript hochladen
scp -O -P 50022 deploy-test5.sh admin@lazistation.synology.me:/tmp/

# 4. Skript ausführen
ssh -p 50022 admin@lazistation.synology.me "bash /tmp/deploy-test5.sh"
```

`deploy-test5.sh` (auf der Lazistation) macht dann pro User:

```sh
# Per Luna-Studierendem
for STUDENT in cora.gressinger maart.luehrs ...; do
  UID=<aus-dime-unterricht-skill>
  HOME=/volume1/homes/@LH-LAZI-AKADEMIE.DE/<numericID>/${STUDENT}-${UID}
  WWW=${HOME}/www/praktische-klausur

  mkdir -p "$WWW"
  /usr/syno/bin/synoacltool -add "$WWW" "user:${STUDENT}@lazi-akademie.de:allow:rwxpdDaARWcCo:fd"
  /usr/syno/bin/synoacltool -add "$WWW" "group:http:allow:r-----a-R-c--:fd"
  /usr/syno/bin/synoacltool -add "$WWW" "user:admin:allow:rwxpdDaARWcCo:fd"

  cp -r /tmp/vorlage/* "$WWW/"
done
```

### Bisherige Deploys (Pattern erprobt)

| Datum | Slug | Zielgruppe | Bemerkung |
|---|---|---|---|
| 2026-04-20 | `test4` | `toast-hawaii/` für 9 Luna + Claude | erste Cohort-Deploy-Generation |
| 2026-04-27 | `test5` | `praktische-klausur/` für 9 Luna + Claude | Klausur-Pattern bewährt |

Christopher Scherer hatte am 2026-04-27 noch kein NAS-Home — bei jedem neuen Deploy die Liste neu prüfen, ob alle Studierenden Homes haben.

## Hard rules

1. **Niemals `chown` versuchen** — geht nicht, wegen sudo-block. Immer ACL-Pfad nutzen.
2. **`set -e` weglassen** in Deploy-Skripten (siehe oben).
3. **Tarballs ohne xattrs** packen (busybox-tar empfindlich).
4. **Hintergrund-SSH-Bash vermeiden** — Skript hochladen + ein-shot ausführen.
5. **www-Ordner zuerst ACLn**, dann befüllen.
6. **DSM-Settings nicht via SSH ändern** — DSM-Web-UI nutzen für Config-Änderungen (DSM hat eigene Config-Files die SSH-Änderungen überschreibt beim nächsten Reload).

## Failure handling

- **`Permission denied`** auf Datei-Ops als `admin`: ACLs prüfen mit `/usr/syno/bin/synoacltool -get <path>`. Ggf. fehlt der `admin`-Eintrag — dann ergänzen.
- **`tar: short read`** beim Entpacken: macOS-xattrs-Footgun, neu packen mit `COPYFILE_DISABLE=1 tar --no-xattrs ...`.
- **HTTP 403 auf `intern.lazi.works/~<user>/...`**: `group:http`-ACL fehlt, Web-Server kann nicht lesen. Mit `synoacltool -add` ergänzen.
- **Studierender hat kein Home**: erst LDAP/Synology-Sync prüfen — meist hat sich der Student noch nie eingeloggt. Tell Michael, er soll den Studenten kurz einloggen lassen, dann existiert das Home automatisch.

## Was diese Skill NICHT macht

- **DSM-Updates** (System-Patches): macht Michael manuell via DSM-Web-UI
- **Backup-Konfiguration**: existiert separat (Synology-Backup), nicht hier
- **Hyper Backup, Snapshot Replication**: DSM-Pakete, nicht via SSH
- **VPN-Server-Settings**: DSM-UI
- **Externer Zugang außerhalb der Schule**: über Synology QuickConnect (URL oben), kein eigener VPN-Setup hier
