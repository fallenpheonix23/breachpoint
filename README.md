# BREACHPOINT — 5v5 first-person shooter (browser, Three.js)

You + 4 bot teammates vs 5 enemy bots. Team deathmatch (first to 75 or 10 minutes) on Ashgrove or Kilnworks, plus a Breach attack/defend mode in development.

## Play online
https://fallenpheonix23.github.io/breachpoint/ (Chrome/Edge/Firefox/Safari 17.2+)

## Run locally
```
npm install         # three.js 0.160 for the node test tools (the page loads it from jsDelivr)
./run.sh            # serves on http://localhost:8080 (needs python3)
```

## Loadout (3 steps)
1. **Weapon** — spin through the 5 guns on a 3D turntable (← → / A D).
2. **Abilities** — two wheels (Q slot on top, E slot below); tick **LOCK IN** on each (W/S pick wheel, A/D browse, Space lock).
3. **Deploy** — random map reveal (↻ shuffle), callsign, bot skill, graphics (Auto adapts resolution to your laptop), aim mode.

## Maps (each: a LONG sniper route, a MID route, a SHORT close-quarters route + connectors)
- **Port Calder** — coastal port, morning: The Pier · Fish Market · Warehouse Row
- **Solara** — Mediterranean hill town, sunset: Olive Terrace · Piazza del Sole · The Souk
- **Neon District** — night city, rain: Expressway · Night Market · Hotel Kyoka
Buildings with doors/windows are enterable; alleys, shops and passages connect the routes.

## Controls (laptop-friendly)
WASD move · Shift sprint (hold breath when scoped) · Space jump / **wall-bounce** · C crouch (silent footsteps) · Z prone
**X corner cover** (slide A/D, aim at an edge to peek, F near a corner = takedown) · LMB fire
**RMB toggles aim/scope** (or Hold in settings) — **Tab** and **Caps Lock** also toggle aim · R reload · F/V punch · Q/E abilities · P scoreboard · Esc pause

## Fairness & visibility
- Bots use the **same trace as bullets** to decide if they can see you (`game.canSee` → `game.trace`), re-check it every
  100 ms while firing, and never fire on a stale sighting.
- Bots only start fights within the distance where a soldier is ≥ 20 px tall on a 1366×768 screen at 95° FOV (≈ 56 m;
  snipers ≈ 1.8×, and their scope **glints** when aimed at you). Reaction delay 250–400 ms (Veteran); aim error grows with
  range and the opening shots at range mostly miss. Presets: Recruit / Veteran / Elite (`DIFFICULTY` in `src/config.js`).
- Settings: horizontal **FOV** (default 95°), **render scale** (default 100%, no silent downscaling), **enemy highlight**
  (Standard rim / Strong / Off). Soldiers ignore distance fog. HUD scales down on small screens.
- Getting hit: directional arcs toward the shooter, hit thump + bullet crack from their side; on death a kill-cam zooms
  onto your killer (outlined through walls) with "killed by X with Y from N m".

## Stealth & sound
Footsteps depend on surface (wood, stone, wet asphalt, indoor tile). Sprinting is loud, walking is quiet, crouch-walking
is silent. Bots hear gunfire and loud footsteps and come to investigate. HUD noise meter shows how loud you are.

## Map system
JSON map format with floors, stairs, ramps, drop-downs, bridges, wall openings, collision layers and area
tags: see `docs/MAP_FORMAT.md`. Debug view: `index.html?mapdebug=testbed` (0 = fly, 1..N = floor cut-aways).

## Dev tools
`node tools/validate.js <mapId|file.json>` — map validator (connectivity, travel times, sightlines, readability).
`node tools/navtest.js <mapId>` — a real bot walks to every key area.
`node tools/maptest.js` validates every map (reachability of spawns/routes/nests/connectors).
`MAP=kilnworks node tools/sim.js 300` runs a headless 10-bot match. `node tools/covertest.js` tests corner cover.
`node tools/breachtest.js` — Breach mode rule checks + bot matches on the breachtest map.
`node tools/lostest.js` — bot fairness tests (perception == bullets, no firing through walls, reaction delay, engage range).
`VFOV=63 node tools/investigate.js` — per-distance breakdown of bot shots/damage, visual occlusion and on-screen target size.
URL test flags: `?autostart&debug&map=kilnworks&weapon=sniper&ab=arc,stasis&quality=low`.
