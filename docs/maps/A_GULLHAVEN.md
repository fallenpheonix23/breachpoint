# GULLHAVEN — Phase 2 design document (Brief A)

**Status:**
- **Phase 1 done:** the Breach mode is implemented and tested on `breachtest.json`.
- **Phase 2 (this doc):** updated to match the implemented mode. Awaiting approval for the Phase 3 build.

**Source of the brief:** the verbatim Brief A text was lost when the conversation was summarised. This design follows what was kept:
- an asymmetric attack/defend map, which needs a new game mode;
- the shared rules (≈40 m sightline cap, 2+ walkable levels, a 3rd-level position with a counter, real stairs and ramps, one-way drops, readability on small screens, palette away from team colours);
- the constraints: no reuse of Ashgrove's parallel lanes or Kilnworks' hub-and-ring, and no copying of real Valorant or CoD layouts.

If you still have the original Brief A text, I'll check this against it before the build.

## 1. New mode: BREACH (attack / defend, with respawns)
The engine today only runs Team Deathmatch (kill limit 75, 10 min). Breach is an objective mode with respawns, which suits a 5v5 against bots better than one-life rounds.

**Halves.** Each team attacks once. Your team attacks first, then the sides swap at the same map.

**Setup.** At the start of each half there are 20 s of setup. The attackers' spawn gate stays closed so the defenders can get into position.

**Two sites, in order:**
- **Site A** unlocks first. Once A falls, **Site B** unlocks:
  - the attackers' spawn moves forward to the Coastguard Garage;
  - the defenders' respawn wave gets longer;
  - +2:30 is added to the clock.

**Capturing a site.** Stand in the site's capture zone (≈ 12 × 8 m):

| attackers in the zone (no living defender) | time to capture |
|---|---|
| 1 | 14 s |
| 2 | 10 s |
| 3 or more | 8 s |

**Capture rules:**
- **Contested:** any living defender inside the zone freezes progress.
- **Checkpoints:** progress locks at 33% and 66%.
- **Decay:** 3 s after the zone empties, progress decays at 1% per second, but never below the last checkpoint.

**Clock.** 3:30 to take A. Overtime runs while attackers stand in an active zone with progress above 0.

**Respawns:**
- Attackers: 5 s.
- Defenders: 6 s while A is active, 8 s for B.
- Spawn protection is 2 s.
- The existing spawn sentries guard both spawn rooms. They follow the role, so they switch sides at half time.
- **During setup, attackers can't use abilities.** Grapple Line and Jump Pad carried bots over a 4 m spawn wall in testing. Gullhaven's Slipway spawn is roofed anyway.

**Who wins:** whoever captured more sites. If tied, higher capture progress on the next site. If still tied, less attack time used.

**Bot behaviour:**
- **Attackers** pick one of the three approaches to the active site, regroup at a staging point, then push the zone together. They prioritise the zone when the clock is under 45 s.
- **Defenders** hold tagged spots around the active site. Whenever capture progress rises, two of them retake the zone.

## 2. Map: Gullhaven signal station
- **Setting:** a fishing harbour below a cliff-top coastguard signal station. Overcast morning with sea mist.
- **Footprint:** 100 × 110 m (x −50…50, z −52…58). Attackers come up from the south (harbour), defenders hold the north (cliff top).
- **Levels:**
  - Harbour (0 m).
  - Upper town terrace (4.5 m). The terrace is a solid plateau that covers everything north of the cliff line at z −14.
  - 3rd level (9 m): the lighthouse lantern gallery and the Transmitter Hall gallery.
- **The progression itself is vertical:** Site A is at harbour level, Site B on the cliff top. Every Phase 2 attack route climbs 4.5 m by stair, ramp or tunnel.
- **Template (new):** a funnel. Three wide harbour approaches converge on A, then three climbs (centre stair, east tunnel, west lighthouse ramp) fan out to B.

## 3. Layout (to scale, from the rectangles the build will use)
Legend: `S` attacker spawn · `D` defender spawn · `F` attacker forward spawn (phase 2) · `A`/`B` capture zones · `.` harbour ground (0 m) · `+` terrace ground (4.5 m) · `:` indoor · `/` stair or ramp (0 → 4.5) · `=` tunnel with ramp · `L` lighthouse · `^` solid terrace mass · `#` solid.
1 character = 2 m, x −50…50; rows are z −52 (north, top) … 56 (south, bottom).
```
 -52 ^^^^^^^^^^^^^^^^^^DDDDDDDDDDDDDD^^^^^^^^^^^^^^^^^^
 -50 ^^^^^^^^^^^^^^^^^^DDDDDDDDDDDDDD^^^^^^^^^^^^^^^^^^
 -48 ^^^^^^^^^^^^^^^^^^DDDDDDDDDDDDDD^^^^^^^^^^^^^^^^^^
 -46 ^^LLLL^^^^^^^^^^^^DDDDDDDDDDDDDD^^^^^^^^^^^^^^^^^^
 -44 ^^LLLL^^^^^^^^^^++DDDDDDDDDDDDDD^^^^^^^^^^^^^^^^^^
 -42 ^^LLLL^^^^^^^^^^++^^^^++++^^^^^^++++++^^^^^^^^^^^^
 -40 ^^++++++++++++++^^^^^^++++++++++++++++^^^^^^^^^^^^
 -38 ^^++++++++++++++::::::::::++++++++++++^^^^^^^^^^^^
 -36 ^^++++++++++++++::::::::::++++++++++++^^^^^^^^^^^^
 -34 ^^++++++++++++++::BBBBB:::++++++++++++^^^^^^^^^^^^
 -32 ^^++++++++++++++::BBBBB:::++++++++++++^^^^^^^^^^^^
 -30 ^^++++++++++++++::BBBBB:::++++++++++++^^^^^^^^^^^^
 -28 ^^++++++++++++++::::::::::++++++++++++^^^^^^^^^^^^
 -26 ^^///^^^^^^^^^^^::::::::::^^^++^^===^^^^^^^^^^^^^^
 -24 ^^///^^^^^^^^^^^^^++++++++++++++^===^^^^^^^^^^^^^^
 -22 ^^///^^^^^^^^^^^^^++++++++++++++^===^^^^^^^^^^^^^^
 -20 ^^///^^^^^^^^^^^^^++++++++++++++^===^^^^^^^^^^^^^^
 -18 ^^///^^^^^^^^^^^^^++++++++++++++^===^^^^^^^^^^^^^^
 -16 ^^///^^^^^^^^^^^^^++++++++++++++^===^^^^^^^^^^^^^^
 -14 ##......##########++++++++++++++#===##############
 -12 ##......###############////######===##############
 -10 ##......###############////######===##############
  -8 ##......###############////######===##############
  -6 ##......###############////######===##############
  -4 ##......###############////######===##############
  -2 ##......###########::::::::::::..........#########
   0 ##.................::::::::::::..........#########
   2 ##.................:::AAAAAA:::..........#########
   4 ##.................:::AAAAAA:::..........#########
   6 ##.................:::AAAAAA:::.................##
   8 ##......###########:::AAAAAA:::.................##
  10 ##......###########::::::::::::####...###.......##
  12 ##......###########::::::::::::####...###.......##
  14 ##......###########............####...###.......##
  16 ##......###########............####FFFFFF.......##
  18 ##......###########............####FFFFFF.......##
  20 ##......:::::::::::............####FFFFFF.......##
  22 ##......:::::::::::............####FFFFFF.......##
  24 ##......:::::::::::............####FFFFFF.......##
  26 ##......:::::::::::............####FFFFFF.......##
  28 ##......:::::::::::............####FFFFFF.......##
  30 ##......:::::::::::............##########.......##
  32 ##......:::::::::::............##########.......##
  34 ##......###########............##########.......##
  36 ##......###########............##########.......##
  38 ##......###########............##########.......##
  40 ##......###############....##############.......##
  42 ##......###############....##############.......##
  44 ##................#####....#####................##
  46 ##................#####....#####................##
  48 ##................SSSSSSSSSSSSSS................##
  50 ##################SSSSSSSSSSSSSS##################
  52 ##################SSSSSSSSSSSSSS##################
  54 ##################SSSSSSSSSSSSSS##################
  56 ##################SSSSSSSSSSSSSS##################
```

### Callouts
- **Harbour:** Slipway (attacker spawn) · Boat Lane · Quay · Net Lofts · Boathouse (2 floors) · Fish Market · Breakwater · Harbour Front · Net Yard · Tank Yard · Coastguard Garage (forward spawn) · Garage Lane.
- **Site A:** Pumping Station (pump floor plus a 4.5 m gantry).
- **Climbs:** Cliff Stair · Pipe Gallery · Lighthouse Path / Lighthouse Ramp.
- **Cliff top:** Signal Garden · Cable Cut · Generator Yard · Keeper's Lane · Lighthouse.
- **Site B:** Transmitter Hall (4.5 m floor, 9 m gallery).
- **Defender spawn:** Relay Barracks, with the Barracks Gate, West Gate and Yard Link.

## 4. Routes
**Phase 1, attacking A (Pumping Station: south door, west door, east yard door, north door from the Cliff Stair):**

| Approach | Path | Length | Character |
|---|---|---|---|
| West | Boat Lane → Net Lofts → Net Yard → west door | ≈ 72 m | Narrow alley, drying-net screens, Boathouse windows above |
| Centre | Slip gate → Fish Market → Harbour Front → south door | ≈ 40 m | Open market with stalls. Fastest, most exposed |
| East | Quay → Breakwater → Tank Yard → east yard door | ≈ 70 m | Sea-wall path broken by a lamp hut and pot stacks |

- **Defenders' routes to A:** Barracks → Garden → Cliff Stair → north door (≈ 60 m). Also Generator Yard → Pipe Gallery → Tank Yard, or the Lighthouse Path down to the Net Yard.
- **Links between approaches:** the Boathouse joins West and Centre; Garage Lane joins East and Centre once it opens in phase 2.

**Phase 2, attacking B (Transmitter Hall: south door from the Garden, east door from the Generator Yard, west door from Keeper's Lane, north door from the Barracks Gate):**

| Climb | Path | Length from the Garage | Character |
|---|---|---|---|
| Centre | Tank Yard → Pumping Station → Cliff Stair → Signal Garden → south door | ≈ 60 m | One 8 m-wide stair under the garden's parapet |
| East | Tank Yard → Pipe Gallery (tunnel; 12 m ramp inside) → Generator Yard → east door | ≈ 60 m | Hidden climb. Comes out on the defenders' flank |
| West | Net Yard → Lighthouse Path → Lighthouse Ramp → Keeper's Lane → west door | ≈ 100 m | Long, but it passes the Lighthouse (the 3rd level) |

Defenders reach B in ≈ 8 m through the Barracks Gate. Their advantage there is offset by the longer 8 s respawn wave.

## 5. Verticality
- **Two full levels.** Roughly the north half of the playable area is terrace at 4.5 m. Also at 4.5 m: the Pumping Station gantry, the Boathouse upstairs, and the Coastguard Garage roof walk (reached from inside the garage; phase 2 only).
- **3rd level (9 m):**
  - **Lighthouse lantern gallery.** Reached by a spiral of straight flights inside the tower; open to whichever team gets there.
    - *What it does:* it looks over Keeper's Lane and the top of the Lighthouse Ramp.
    - *Counter:* it's open on three sides. The seaward side is solid so it can't see the harbour, which would be a line over 40 m. You leave it the same way you came.
  - **Transmitter Hall gallery.** A U-shaped gallery over the B floor, with two stairs. It's the defenders' power spot.
    - *Counter:* it's open to the floor below and to the east and west doors, and it has a one-way drop into the zone.
- **One-way drops (≤ 4.5 m):**
  - the Signal Garden parapet gap down to the Harbour Front (defenders can rotate to A fast; attackers can't climb back that way);
  - the Pumping Station gantry → pump floor;
  - the Generator Yard ledge → Tank Yard;
  - the Transmitter Hall gallery → the B zone.
- **Stairs and ramps:** rise 0.3 m, run 0.45–0.5 m. The two ramps (Pipe Gallery, Lighthouse) are 12 m long at 20.6°, as on Kilnworks.

## 6. Sightlines and readability (small screens)
- **Cap 40 m.** Breaking the long axes:
  - Breakwater (52 m): a lamp hut (x 36…42, z 24…30) and a stack of lobster pots at z 10, overlapping and offset.
  - Net Lofts (44 m): a winch house at z 26…32, and drying-net screens. The screens are a "shot" layer: they block sight and bullets but you can walk through them.
  - Market to cliff: the Pumping Station sits between them, and the Signal Garden has a 2.2 m parapet along the cliff edge, open only at the Cliff Stair.
- **High ground doesn't look down on the harbour.** Every terrace edge has a parapet. The defenders' height advantage is local, at the top of each climb, not map-wide.
- **No spawn-to-site lines.** Neither spawn can see a capture zone, and no capture zone can see a spawn (the validator will check both).
- **Backgrounds:** a mid-tone weathered band from 0–4.5 m on every wall facing a route; a plain whitewashed render above it. The busy detail (nets, ropes) sits on side walls, not behind the approaches.
- **Lighting:** overcast and even. The fog starts at 90 m.
- **Palette:**
  - whitewash `#dedad0`
  - weathered band `#9b9a90`
  - tarred timber `#6e6a62`
  - lichen ochre `#b8a45a`
  - sea-glass green `#7fa39a` (desaturated, clearly not team blue)
  - slate `#5d6468`
- **Side identity:** attackers see timber, nets and boats; defenders see white render, aerials and the lighthouse.

## 7. Timing targets (sprint 9 m/s; the validator will measure)
| | Attackers | Defenders |
|---|---|---|
| Phase 1, to A (fastest route) | ≈ 4.5 s after the gate opens (centre) / 8 s (flanks) | ≈ 7 s (but 20 s setup) |
| Phase 2, to B | ≈ 6.5 s from the Garage (centre or east) / 11 s (west) | ≈ 1 s |

## 8. Chokepoints
| choke | width |
|---|---|
| Slip gate (spawn exit, centre) | 8 m |
| Boat Lane and Quay (spawn exits, sides) | 6 m |
| Pumping Station doors | 2.4 m (4 doors) |
| Cliff Stair | 8 m |
| Pipe Gallery tunnel | 6 m |
| Lighthouse Ramp | 6 m |
| Barracks Gate / West Gate / Yard Link | 8 / 4 / 2 m |

## 9. Landmarks
The lighthouse (west cliff), the transmitter mast above B (visible from everywhere, so it always points to B), the Pumping Station's twin intake pipes, the slipway with hauled-out boats, and the breakwater lamp hut.

## 10. Engine and format (Phase 1: implemented)
**Mode code:** `src/modes/breach.js` (controller). It's wired into `game.js` (spawns, respawn delay, clock, end screen), `bot.js` (objective goals), `abilities.js` (setup block) and the loadout map card (shows the mode).

**Map JSON fields** (documented in `docs/MAP_FORMAT.md`):
```jsonc
"mode": "breach", "setup": 20, "clock": [210, 150],
"objectives": [ { "id": "A", "name": "Pumping Station", "rect": [x0,z0,x1,z1], "y": [y0,y1], "order": 0, "capture": [14,10,8] } ],
"gates":  [ { "id": "slipGate", "min": [x,y,z], "max": [x,y,z], "opens": "setup" | "<objective id>" } ],
"spawns": [ { "role": "attack" | "defend", "phase": 0, "at": [x,y,z], "yaw": 0 } ],   // phase = index of the active site
"turrets": [ { "role": "attack", "at": [x,y,z] } ],
"holds":  [ { "site": "A", "at": [x,y,z] } ],                                         // defender bot positions
"routes": { "name": { "role": "attack", "phase": 0, "pts": [[x,y,z], …] } }           // attacker bot approaches
```

**How it plays:**
- **Gates** are added after the bot path grid is built, so bots treat them as open and simply wait while they're closed.
- **Attacking bots** take a random approach route for the current phase. A bot that spawned forward skips the waypoints behind it. Inside the zone they hold random points.
- **Defending bots** hold tagged spots (75%) or points in the zone. When capture progress rises, every defender retakes the zone.

**Tools:**
- **`node tools/breachtest.js [map]`:** scripted checks of every capture rule, plus N full bot matches. It checks both halves finish, no attacker leaves spawn during setup, and sites are capturable.
  - Result on the test map: 18/18 checks pass.
  - Attackers took both sites in 7 of 12 halves, and at least one site in every half.
- **`node tools/validate.js <map>`, section 7 (Breach):** per site, spawn → zone time for each role, spawn-room ↔ capture-zone sightlines (must be 0), and whether the setup gates really seal the attacker spawn.

**Still needed in Phase 3 (map-specific):** Gullhaven's geometry, its objectives, gates, holds and routes, and a sim run for the 40–60% balance target.

## 11. Known risks (to check in Phases 3–4)
- **Balance is the biggest unknown.** It depends on bot attack/defend behaviour, which is new code. If attackers win less than 40% of bot matches, the first levers are capture time and the defenders' respawn wave, not geometry.
- **Defenders may reach A at the same time as attackers** if the 20 s setup feels too long or too short. It's one number to tune.
- **The Signal Garden parapet gap** (the defenders' drop to A) could become a camping spot over the Harbour Front. The parapet has to keep sightlines to the market under 40 m.
- **The Pipe Gallery is a 26 m enclosed tunnel.** That's strong for shotguns and grenades, so it needs one side alcove so attackers aren't trapped in a straight tube.
- **The map is 110 m long.** Phase 1 fights should stay in the southern half. If defenders hold the Cliff Stair instead of A, the attack spills into dead harbour space.
