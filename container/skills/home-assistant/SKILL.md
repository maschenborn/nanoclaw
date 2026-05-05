---
name: home-assistant
description: Query and control Michael's Home Assistant instance via its REST API. Use any time Michael asks about the state of his smart home (lights, climate, sensors, locks, media, presence, scenes, automations, scripts) or wants to trigger/change anything in it — e.g. "mach das Licht im Wohnzimmer an", "ist die Haustür zu?", "wie warm ist es oben?", "pausiere die Musik", "welche Geräte sind gerade an?", "starte die Rolladen-runter-szene", "läuft die Waschmaschine noch?". Authentication is handled transparently by the OneCLI gateway — no token management needed.
---

# Home Assistant Skill

Michael runs a Home Assistant instance and exposes it via **Nabu Casa Cloud** (Home Assistant's official remote-access service). You reach it at:

```
https://ws55kly1dyinqbc0lmamnmoo5qqs5tfq.ui.nabu.casa
```

A Long-Lived Access Token is stored in OneCLI with host-pattern matching this Nabu-Casa URL. Any HTTPS request you make to that host gets `Authorization: Bearer <token>` injected automatically by the OneCLI gateway — you just call the HA REST API with `curl` / `fetch`, no auth headers in your call.

## Scope distinction — important

This is **Michael's actual smart home**. Reads are cheap and safe. Writes change physical reality in his house — lights, heating, door locks, media devices. Treat writes with care:

- **Reading is always fine on request** (states, history, logs, service listings)
- **Writing requires an explicit user request for the specific action** — don't chain actions the user didn't ask for
- **Never call "dangerous" services autonomously**: `lock.*` (door locks), `alarm_control_panel.*`, `vacuum.*` that starts a physical robot, anything in a `notify.*` service that pages others, etc. Confirm first, even if the user seems to want it in a general sense.
- **If a request would affect other people** (lights in a shared bedroom late at night, audio in shared rooms, thermostat changes), check with Michael before firing

## The REST API

Base URL: `https://ws55kly1dyinqbc0lmamnmoo5qqs5tfq.ui.nabu.casa/api`

Docs: <https://developers.home-assistant.io/docs/api/rest/>

### Essential endpoints

Shell-style (use `curl -s` in Bash; response is JSON, pipe through `jq` for readability):

```bash
HA=https://ws55kly1dyinqbc0lmamnmoo5qqs5tfq.ui.nabu.casa

# Health check — verifies auth is working
curl -s $HA/api/

# Get all entity states (can be huge — 1MB+ on big installations)
curl -s $HA/api/states | jq 'length'

# State of one specific entity
curl -s $HA/api/states/light.wohnzimmer | jq

# Find entities by domain (light, switch, sensor, cover, climate, media_player, ...)
curl -s $HA/api/states | jq '[.[] | select(.entity_id | startswith("light."))] | .[] | {entity_id, state, name: .attributes.friendly_name}'

# Find entities by friendly-name keyword
curl -s $HA/api/states | jq --arg q "wohnzimmer" '[.[] | select((.attributes.friendly_name // "" | ascii_downcase | contains($q | ascii_downcase)))] | .[] | {entity_id, state, name: .attributes.friendly_name}'

# Call a service (turn on a light)
curl -s -X POST $HA/api/services/light/turn_on \
  -H 'Content-Type: application/json' \
  -d '{"entity_id": "light.wohnzimmer"}'

# Service with parameters (brightness 50%)
curl -s -X POST $HA/api/services/light/turn_on \
  -H 'Content-Type: application/json' \
  -d '{"entity_id": "light.wohnzimmer", "brightness_pct": 50}'

# Trigger a scene
curl -s -X POST $HA/api/services/scene/turn_on \
  -H 'Content-Type: application/json' \
  -d '{"entity_id": "scene.abendstimmung"}'

# Run an automation on demand
curl -s -X POST $HA/api/services/automation/trigger \
  -H 'Content-Type: application/json' \
  -d '{"entity_id": "automation.morgenroutine"}'

# Recent state changes (last hour)
curl -s "$HA/api/history/period?minimal_response=true" | jq 'length'

# Logbook (human-readable event history)
curl -s "$HA/api/logbook?end_time=$(date -u +%Y-%m-%dT%H:%M:%S)" | jq '.[0:10]'

# All available services (discover what you can call)
curl -s $HA/api/services | jq '.[] | {domain, services: .services | keys}'
```

## Discovery workflow — topology.md FIRST

**Before any curl to `/api/states`, read `references/topology.md`.** It's the authoritative offline catalog of every entity in Michael's house, grouped by HA Area (room) and domain type (Lampen / Jalousien / Klima / Medien / etc.). It lists ~1525 entities in ~2100 lines of markdown with their entity_id, friendly name, current-at-generation state, and relevant capability hints (dimmbar, RGB, position-range, °C).

**Why read topology first**: `/api/states` returns 1+ MB of JSON. Loading all that into context is wasteful, plus the topology already gives you friendly grouping by room that is not in the raw state list.

**Typical flow when Michael asks to control something**:

1. Read `references/topology.md` (it's in the same dir as this SKILL.md)
2. Grep / scan for the room or device keywords Michael mentioned
3. You now have the entity_id. Call `/api/services/<domain>/<service>` directly.
4. **Never call `/api/states` for discovery** unless the user is asking about a brand-new device or something you can't find in topology.md.

**When topology.md falls short** — e.g. entity was recently added, or the topology is stale — use the legacy discovery recipes below as fallback:

```bash
# Entity count per domain
curl -s $HA/api/states | jq '[.[] | .entity_id] | group_by(split(".")[0]) | map({domain: .[0] | split(".")[0], count: length})'

# Entities by friendly-name keyword
curl -s $HA/api/states | jq --arg q "wohnzimmer" '[.[] | select((.attributes.friendly_name // "" | ascii_downcase | contains($q | ascii_downcase)))] | .[] | {entity_id, state, name: .attributes.friendly_name}'
```

After using the fallback, tell Michael what you found — he may want to regenerate topology.md.

**Regenerate topology.md** (when Michael asks, or when the catalog feels stale): see `references/regenerate-topology.md` for the exact template-API calls and markdown-generation steps.

Don't dump all states in chat — too noisy. Filter to ≤10 relevant entities and show `entity_id + state + friendly_name`.

## Common services per domain

| Domain | Services |
|---|---|
| `light` | `turn_on` / `turn_off` / `toggle` (supports `brightness`, `brightness_pct`, `color_name`, `rgb_color`, `kelvin`) |
| `switch` | `turn_on` / `turn_off` / `toggle` |
| `cover` | `open_cover` / `close_cover` / `stop_cover` / `set_cover_position` (0–100) — for Rollos/Blinds |
| `climate` | `set_temperature`, `set_hvac_mode`, `set_fan_mode` |
| `media_player` | `play_media`, `media_play`, `media_pause`, `media_stop`, `volume_set` (0.0–1.0), `select_source` |
| `scene` | `turn_on` (with `entity_id: scene.xyz`) |
| `script` | `turn_on` to run the script; `{entity_id: script.xyz}` |
| `automation` | `trigger` (one-shot), `turn_on`/`turn_off` (enable/disable) |
| `notify` | `notify.<target>` with `{message, title?}` — **always ask first** |
| `input_boolean` / `input_select` / `input_number` | helpers Michael uses in dashboards |

## How to respond in chat (WhatsApp context)

When reporting HA state in WhatsApp:

- Use friendly names, not entity IDs (users don't care about `light.wz_stehlampe_1`, they want "Stehlampe Wohnzimmer")
- For states, translate: `on`→"an", `off`→"aus", `home`→"zuhause", `away`→"unterwegs", `locked`→"verriegelt", `open`→"offen"
- Use WhatsApp-style formatting: `*bold*` for names, bullets `•` for lists
- For temperature/climate: include unit (°C)
- For brightness: percentage
- For locks: be cautious. Say "Haustür ist *verriegelt*", not "secure". And don't auto-unlock.
- Keep numeric readouts concise — one line per entity in a list

## Hard rules

1. **Never call `lock.unlock` or `alarm_control_panel.disarm`** without Michael explicitly asking for that exact action. "Mach die Tür auf" while he's stepping out the house is fine; "Entriegle die Haustür" randomly when he asked "was macht die Tür?" is not.
2. **Never start physical cleaning or outdoor-device services** autonomously (robot vacuum, pool pump, irrigation) — confirm even for small things.
3. **Never send notifications via `notify.*` services** unless Michael asked to. Otherwise his phone gets spammed.
4. **Don't chain actions**: if he asks for *one* light, don't also turn off the others just because they're in the same room.
5. **Don't disable automations or scripts permanently** unless he asked. Use `automation.trigger` (one-shot) instead of `automation.turn_off` (disable).
6. **Mention every write action you did** in your response — transparency over brevity. "Lampe Wohnzimmer eingeschaltet ✓" is better than a generic "Erledigt".

## Failure handling

- `401 Unauthorized`: OneCLI token injection failed. Check with `curl -s $HA/api/` — if 401 there too, the token was rotated or deleted. Tell Michael.
- `404 Not Found` on `/api/states/<entity_id>`: entity doesn't exist. Don't invent one — search for candidates and ask.
- `500` / timeout: HA instance unreachable (Nabu Casa offline, local HA restarting). Tell Michael, suggest he check his HA status page.

## Example — full interaction

Michael: *"Mach das Licht im Wohnzimmer aus"*

```bash
HA=https://ws55kly1dyinqbc0lmamnmoo5qqs5tfq.ui.nabu.casa

# 1. find candidate entities
curl -s $HA/api/states | jq --arg q "wohnzimmer" '[.[] | select(.entity_id | startswith("light.")) | select((.attributes.friendly_name // "" | ascii_downcase) | contains($q | ascii_downcase))] | .[] | {entity_id, state, name: .attributes.friendly_name}'
# -> light.wohnzimmer_decke "on", light.wohnzimmer_stehlampe "off"

# 2. act on the one that's on (or, if multiple are on, confirm)
curl -s -X POST $HA/api/services/light/turn_off -H 'Content-Type: application/json' -d '{"entity_id": "light.wohnzimmer_decke"}'

# 3. tell Michael exactly what you did
```

Response in chat: *"Deckenlampe Wohnzimmer ausgeschaltet ✓ (Stehlampe war schon aus.)"*
