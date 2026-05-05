# Regenerate topology.md

Use this when Michael says "die topology ist veraltet", "update die HA-liste", or when you notice entities in `/api/states` that aren't in `topology.md`.

## What you write

Replace the file at (container path):

```
/workspace/extra/orchester/alfred/container/skills/home-assistant/references/topology.md
```

This is Michael's NanoClaw project dir, mounted into your container at `/workspace/extra/orchester/` with read-write. You have full write access there.

## How to get the data

Home Assistant's REST API has no direct `area_registry` endpoint, but the Template API (`POST /api/template`) exposes the internal `areas()` and `area_id()` helpers. That's the authoritative source for room assignments — much better than guessing from friendly names.

```bash
HA=https://ws55kly1dyinqbc0lmamnmoo5qqs5tfq.ui.nabu.casa

# 1. All areas: id + human-readable name
curl -sS -X POST $HA/api/template -H 'Content-Type: application/json' -d '{
  "template": "{% set a=[] %}{% for area in areas() %}{% set _ = a.append({\"id\": area, \"name\": area_name(area) }) %}{% endfor %}{{ a | tojson }}"
}'

# 2. Every entity with its area_id + friendly_name + current state
curl -sS -X POST $HA/api/template -H 'Content-Type: application/json' -d '{
  "template": "{% set rows=[] %}{% for s in states %}{% set aid=area_id(s.entity_id) %}{% set _ = rows.append({\"entity_id\": s.entity_id, \"area_id\": aid, \"name\": state_attr(s.entity_id,\"friendly_name\") or s.entity_id, \"state\": s.state }) %}{% endfor %}{{ rows | tojson }}"
}'

# 3. Full state dump (for capability hints — supported_color_modes, current_position, current_temperature, etc.)
curl -sS $HA/api/states
```

## How to shape the output

```markdown
# Home Topology

> Generiert am <YYYY-MM-DD> · <N> Entities total

## <Area Name>

### Lampen
- `light.xxx` — Name [state] · capability hints

### Jalousien
- `cover.xxx` — Name [state] · position 0-100

### Klima
- `climate.xxx` — Name · <current_temperature>°C

### Medien
- `media_player.xxx` — Name [state]

### Schalter
- `switch.xxx` — Name [state]

### Sensoren
- `sensor.xxx` — Name [state]

### Bewegungsmelder / Präsenz
- `binary_sensor.xxx` — Name [state]

### Szenen
- `scene.xxx` — Name

### Automatisierungen
- `automation.xxx` — Name [state]

### Scripts / Helfer
- `script.xxx` — Name
- `input_boolean.xxx` — Name [state]
- `input_number.xxx` — Name [state]

### Sonstige
- any other domains

## <Nächste Area Name>
...

## Nicht zugeordnet
<entities where area_id is null — grouped the same way>
```

## Rules for the regeneration

- **Include every entity** Michael has — don't skip `update.*`, `button.*`, `sun.*`, `zone.*`, `device_tracker.*`. Michael said "volle Liste, ich lösche raus was ich nicht will" — you err on the side of inclusion.
- **Sort Areas alphabetically** (by display name), except "Nicht zugeordnet" which is always last.
- **Within each Area, use the H3 order shown above** (Lampen first, then Jalousien, Klima, ...). Sub-order within H3 is alphabetical by entity_id.
- **Capability hints after ` · `**:
  - lights with `supported_color_modes` containing `color_temp` → `· dimmbar`
  - lights with `rgb`/`hs` → `· dimmbar, RGB`
  - covers with `current_position` attribute → `· position 0-100`
  - climate → `· <current_temperature>°C`
  - else: omit the ` · ` hint entirely
- **Keep the current state in `[...]`** — useful snapshot even though it ages. A separator `[off]` / `[on]` / `[home]` / `[24.3]` is one glance of context.
- **Don't translate entity_ids.** Never rename them. They're system identifiers.

## After writing

Tell Michael: line count + area count + entity count as three numbers. No commentary unless something unusual came up (e.g. API returned fewer entities than last time — could be integration breakage worth mentioning).
