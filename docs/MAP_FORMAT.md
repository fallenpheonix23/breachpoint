# BREACHPOINT map format (JSON)

Maps live in `src/maps/data/<id>.json` and are registered in `src/maps/index.js`.
They are built by `src/maps/loader.js` on top of `MapKit` (`src/maps/kit.js`).
All units are metres; **y is up**; the ground plane is y = 0.

## Player metrics to design against (from the code)
| | value |
|---|---|
| body | box, half-width 0.35 m; height 1.8 / 1.2 / 0.6 (stand / crouch / prone) |
| eye height | 1.66 / 1.08 / 0.42 |
| speed | walk 6.2 m/s (AR), sprint 9.0 m/s, crouch 3.1 m/s |
| step-up | ≤ 0.62 m (stairs: rise ≤ 0.3, run ≥ 0.45) |
| ramps | ≤ 40° (`MAX_SLOPE_DEG`) |
| jump | 1.24 m apex (ledges ≤ 1.15 m are bot "jump" links) |
| drops | bots use drops ≤ 4.5 m; make one-way drops ≥ 1.3 m |
| doorways | ≥ 1.6 m wide (2.0+ recommended), ≥ 2.2 m tall |
| default FOV | 95° horizontal → a 1.8 m soldier is 1127/d px tall at 1366×768 (28 px at 40 m) |

## Top level
```jsonc
{
  "id": "foundry", "name": "FOUNDRY", "location": "…", "desc": "…", "swatch": ["#…", …],
  "bounds": [x0, z0, x1, z1],                 // nav / minimap extent
  "symmetry": "none" | "mirrorX" | "rotate180", // auto-copies entities (opt out per entity with "mirror": false)
  "floors": [ { "name": "Ground", "y": 0 }, { "name": "Upper", "y": 4 }, { "name": "Roof", "y": 8.3 } ],
  "theme": { … same as JS maps: sky, sun, hemi, fog, grade, bloom, weather, ambient, stepOut … },
  "materials": { "plaster": { "tex": "plaster", "color": "#d8d2c6", "scale": 3, "rough": 0.9, "metal": 0 } },
  "geometry": [ …entities… ],
  "areas":   [ …tags / callouts… ],
  "spawns":  [ { "team": 0, "at": [x, y, z], "yaw": degrees? } ],
  "routes":  { "<name>": { "kind": "long|mid|short", "symmetric": true, "pts": [[x, y, z], …] } }, // bot lanes
  "turrets": [ { "team": 0, "at": [x, y, z] } ],
  "connectors": [ [x, y, z] ]                  // flank waypoints for bots
}
```
Textures available for materials: `plaster brick stone tiles wood concrete metal plate corrugated roof asphalt sand grass cloth`.
`"basic": [r, g, b]` makes an unlit emissive material (values > 1 bloom).

## Entities (`geometry`)
Every entity accepts `"layer"` and `"mirror": false`.

| layer | blocks movement | blocks bullets & sight | use |
|---|---|---|---|
| `all` (default) | ✓ | ✓ | walls, floors, crates |
| `move` | ✓ | — | railings, grates, glass-free bars, invisible bounds |
| `shot` | — | ✓ | foliage screens, hanging cloth, smoke panels |
| `visual` | — | — | decoration only |

```jsonc
{ "type": "box",    "min": [x,y,z], "max": [x,y,z], "mat": "…", "round": 0.05 }
{ "type": "ground", "rect": [x0,z0,x1,z1], "y": 0, "mat": "…" }                  // visual floor plane
{ "type": "floor",  "rect": [x0,z0,x1,z1], "y": 4, "t": 0.3, "mat": "…",          // slab, top at y
  "holes": [[x0,z0,x1,z1], …] }                                                   // stairwells, drop-holes
{ "type": "wall",   "from": [x,z], "to": [x,z], "y": 0, "h": 4, "t": 0.3, "mat": "…", "frame": "trim",
  "openings": [ { "at": 3.0, "w": 1.6, "y": 0, "h": 2.4, "kind": "door|window|hole|grate" } ] }
  // axis-aligned; "at" = opening centre measured from "from"; openings may stack (door + window above)
  // window defaults: y 1.1, h 1.1 · grate = see/shoot through, can't pass
{ "type": "stairs", "from": [x,z], "dir": "+x|-x|+z|-z", "w": 2, "y": 0, "to": 4, "run": 0.5, "open": false }
{ "type": "ramp",   "rect": [x0,z0,x1,z1], "dir": "+z", "y0": 0, "y1": 1.5, "thick": null } // ≤ 40°
{ "type": "railing","from": [x,z], "to": [x,z], "y": 4 }                          // movement-only
{ "type": "cover",  "at": [x,y,z], "w": 3, "d": 0.8, "h": 1.1, "mat": "…" }       // tagged cover spot
{ "type": "nest",   "at": [x,y,z], "dir": "+x|-x", "mat": "…" }                    // sniper nest (slits)
{ "type": "prop",   "kind": "crate|barrel|container|car|tree|palm|lamp|bench|planter|stall|fountain", "at": [x,y,z], … }
{ "type": "sign",   "at": [x,y,z], "w": 4, "h": 1, "text": "…", "color": "#fff", "facing": "n|s|e|w" }
{ "type": "light",  "at": [x,y,z], "color": 16769184, "intensity": 5, "dist": 14 }
{ "type": "lightstrip", "min": [x,y,z], "max": [x,y,z], "mat": "light" }
{ "type": "water",  "rect": [x0,z0,x1,z1], "y": -1 }
```

## Areas (`areas`)
```jsonc
{ "name": "A Site", "mirrorName": "B Site", "kind": "SITE|SPAWN|MID|LONG|SHORT|HALL|INDOOR|ROOF",
  "tag": "siteA|siteB|spawn|…", "rect": [x0,z0,x1,z1], "y": [y0, y1], "floor": 1, "key": true, "hint": "…" }
```
`y` restricts the callout to a height band (so "Loft" sits above "Workshop"). `key: true` areas get
spawn travel times in the validator. `HALL`/`INDOOR` enable the hallway melee bonus.

## Breach mode (attack / defend)
Add `"mode": "breach"` to a map (usually with `"symmetry": "none"`). Extra top-level fields:
```jsonc
"setup": 20,                     // seconds the attacker spawn stays sealed
"clock": [210, 150],             // seconds for the first site, + seconds added per capture
"objectives": [ { "id": "A", "name": "…", "rect": [x0,z0,x1,z1], "y": [y0,y1], "order": 0, "capture": [14,10,8] } ],
"gates": [ { "id": "…", "min": [x,y,z], "max": [x,y,z], "opens": "setup" | "A" | "B" } ],   // blocks all; opens on event
"spawns": [ { "role": "attack" | "defend", "phase": 0, "at": [x,y,z], "yaw": 0 } ],         // phase = active-site index
"turrets": [ { "role": "attack" | "defend", "at": [x,y,z] } ],
"holds": [ { "site": "A", "at": [x,y,z] } ],
"routes": { "<name>": { "role": "attack", "phase": 0, "kind": "mid", "pts": [[x,y,z], …] } }
```
Spawns fall back to the latest earlier phase that has points. Tag spawn rooms as `"kind": "SPAWN"` areas: the validator uses them
for the spawn ↔ capture-zone sightline check. Seal attacker spawns with walls and a roof plus a `"setup"` gate.

## Tooling
- `node tools/validate.js <id|file.json>` → connectivity, stuck spots, travel times, longest sightlines,
  spawn-to-spawn lines, on-screen size at 1366×768 / 1920×1080, positions hittable from > 30 m,
  plus `tools/out/<id>/floor-*.svg` plans.
- `node tools/navtest.js <id>` → a real bot walks from each spawn to every key area.
- `index.html?mapdebug=<id>[&view=N]` → free-fly 3D (0) and per-floor top-down cut-aways (1..N),
  overlays: N = nav, G = areas, L = collision layers.
- `index.html?autostart&debug&map=<id>` → play it.
- `node tools/breachtest.js [id]` → Breach rules + full bot matches (default map: `breachtest`).
