# KILNWORKS — design document (Brief C) + Phase 3 build notes

**Status:** Phase 2 (design) and Phase 3 (build) are done together, at the user's request. Phase 4 (validate & iterate) is next.
**Source of the brief:** the verbatim Brief C text was lost when the conversation was summarised. This design follows what was kept:
- vertical industrial, rotate180 symmetry;
- the shared rules: ≈40 m sightline cap, 2+ walkable levels, a 3rd-level position with a counter, real stairs and ramps, one-way drops, plain mid-tone backgrounds, and a palette away from team blue and red;
- the constraint that it must not reuse Ashgrove's three parallel lanes.

Built by `tools/mapgen/kilnworks.py` → `src/maps/data/kilnworks.json`. For now it's a test map: `?autostart&map=kilnworks`.

## 1. Mode and type
- **Symmetric 5v5 Team Deathmatch** (first to 75, 10 min).
- **Rotational symmetry** (180° about the centre), not a mirror: blue spawns south-west, red spawns north-east. Every route has a twin rotated through the middle, so the halves are fair but flow diagonally.
- **Setting:** a brick and tile works, overcast afternoon.
- **Footprint:** 112 × 80 m (x −56…56, z −40…40); 3 walkable levels (Ground 0 m, Upper 4.5 m, Furnace Top 9 m).

## 2. How it differs from Ashgrove (Brief B)
| | Ashgrove | Kilnworks |
|---|---|---|
| Shape | 3 parallel east–west lanes | Hub and ring: a central hall with 4 doors, a ring of sheds and yards around it, rail cuts on the far flanks |
| Symmetry | Mirror across x = 0 | 180° rotation (diagonal flow, corner spawns) |
| Centre | Open square plus a hall | Enclosed 3-storey Furnace Hall; the furnace itself blocks every door-to-door line |
| Verticality | Upper floors of houses, a bridge, clock top | Lofts, open steel decks, enclosed conveyor bridges, a mezzanine ring and the furnace top |

## 3. Layout (to scale; generated from the build coordinates)
Legend: `.` open ground · `:` indoor · `+` upper deck or mezzanine (4.5 m) · `=` bridge (4.5 m) · `F` furnace (top at 9 m) · `o` deliberate cover · `#` solid.
1 column = 2 m (x −56…56), 1 row = 2 m (z −40 at top … 40 at bottom). Blue spawn is bottom-left, red top-right.
```
 -40 .................::::..............::::.........##......
 -38 .................::::..........oo..::::.................
 -36 .................::::..........oo..::::.....oo..........
 -34 .................::::..............::::.....oo..##......
 -32 ........#########::::..............::::.####....##......
 -30 ........#########..##..............###..####....##......
 -28 ............:::::::::..............:::::::::....##......
 -26 ............:::::::::..............:::::::::....##......
 -24 ........####:::::::::.........oo...:::::::::....#####..#
 -22 ........####:::::::::.........oo...:::::::::....#####..#
 -20 ........####:::::::::..............:::::::::....####...#
 -18 #...########:::::::::====..........:::::::::....####...#
 -16 #...#########..######====..........#..######ooo.####...#
 -14 #...#########..######..==..........#..######ooo.####...#
 -12 #...####..............++++++++++++...........ooo####...#
 -10 #...####..+++++.......++++++++++++...........ooo####...#
  -8 #...####..+++++.......++::::::::++..............####...#
  -6 ::::::+++++++++.......++::::::::++..............##::::::
  -4 ::::::+++++++++=======++::FFF:::++....oo..........::::::
  -2 ::::::....+++++=oo====++::FFF:::++....oo..........::::::
   0 ::::::..........oo....++::FFF:::++=======+++++....::::::
   2 ::::::##..............++::::::::++=======+++++++++::::::
   4 ::::::##..............++::::::::++.......+++++++++::::::
   6 #...####..............++::::::::++.......+++++..####...#
   8 #...####ooo...........++++++++++++.......+++++..####...#
  10 #...####ooo...........++++++++++++..............####...#
  12 #...####.ooo######..#..........==..######..#########...#
  14 #...####.ooo######..#..........====######..#########...#
  16 #...####....:::::::::..........====:::::::::########...#
  18 #...####....:::::::::..............:::::::::####........
  20 #..#####....:::::::::...oo.........:::::::::####........
  22 #..#####....:::::::::...oo.........:::::::::####........
  24 ......##....:::::::::..............:::::::::............
  26 ......##....:::::::::..............:::::::::............
  28 ......##....###..####..............#..##########........
  30 ......##....###..::::..............::::#########........
  32 ......##..oo.....::::..............::::.................
  34 ..........oo.....::::..oo..........::::.................
  36 .................::::..oo..........::::.................
  38 ......##.........::::..............::::.................
```
Rendered plans for each floor: `docs/maps/kilnworks/plan_0-ground.png`, `plan_1-upper.png`, `plan_2-furnace-top.png`.

### Callouts (blue's half; the rotated twin is in brackets)
Clay Yard (Slag Yard spawn) · Pump Lane · Pump House (Boiler House) · Pump Gate · Hopper Court · Hopper Deck · Charge Bridge · Coal Alley · Kiln Shed / Kiln Gallery (Press Shed) · Kiln Gate · Drying Shed / Drying Loft (Mould Shed / Loft) · Drying Gate · Ash Gate · Cinder Gate · Cinder Heap · Rail Cut · Weighbridge (Lamp Store) · Sort Yard (Ash Yard) · Conveyor · **Furnace Hall · Mezzanine · Furnace Top**.

## 4. Routes from the blue spawn (red's are the rotated copies)
| Route | Bot lane kind | Path | Arrives at |
|---|---|---|---|
| **Pump** | short | North exit → Pump Lane → Pump House (past the engine) → Pump Gate → Hopper Court | Hall west door |
| **Rail** | long | East exit → Rail Cut → through the Weighbridge → Sort Yard | Hall south door, or on into the enemy's Cinder Heap |
| **Deck** | mid (upper) | Coal Alley → Hopper Court → ramp → Hopper Deck → Charge Bridge | Mezzanine (west) |
| **Loft** | mid (upper) | Coal Alley → Drying Gate → Drying Shed → stairs → Drying Loft → Conveyor bridge | Mezzanine (north) |

**Cross-links:**
- Kiln Shed (Coal Alley ↔ Sort Yard ↔ Kiln Gates);
- Ash Gate (Drying Shed ↔ the north Rail Cut);
- Cinder Gate (Drying Shed ↔ Cinder Heap);
- the hall's internal stairs (floor ↔ mezzanine).

## 5. Verticality
- **Upper level (4.5 m):** Pump House upstairs, Hopper Deck, Pump Bridge, Charge Bridge, Kiln Gallery, Drying Loft, Conveyor and the hall mezzanine ring. With the rotated twins that's about 20% of the walkable area. All stairs are 0.3 m rise and 0.4–0.5 m run. The Hopper Deck ramp is 12 m long at 20.6°.
- **3rd level, the Furnace Top (9 m):** a 7 × 7 m platform with a 1 m parapet and the chimney as central cover. It's reached by one stair from each side's mezzanine.
  - **Counter:** the whole mezzanine ring (8–12 m away) and both stairs look onto it. It has no hard cover except the chimney, and leaving it means walking back down a stair in full view.
- **One-way drops (4.5 m):**
  - Kiln Gallery door → Coal Alley.
  - Two gaps in the mezzanine railing → hall floor.
  - Deck edges → Hopper Court.

## 6. Readability measures (small screens)
- **Lines are broken with overlapping offset blockers, not staggered gaps:**
  - coal bunkers A and B;
  - blast baffles outside every hall door;
  - the furnace;
  - offset front and back doors in every shed, plus a machine, counter or rack between them.
- **The Hopper Deck has a 2.2 m wind screen on its south edge,** so it overlooks the court only, not the long Coal Alley and Rail Cut.
- **Backgrounds and lighting:**
  - Walls are a mid-tone soot band (0–4.5 m, behind heads and torsos) with a plain buff render above. No busy textures behind common enemy positions.
  - Light strips are in every interior; the hall has a light well.
  - The fog starts beyond 110 m.
- **Palette:** buff `#d2c4a4`, soot `#8f897e`, olive `#6f7a55`, safety yellow `#cfa93c`, light steel `#b3b8bc`. There's no red brick (the brick texture rendered orange-red and was swapped out) and no saturated blue.

## 7. Phase 3 — build results
| check | result |
|---|---|
| longest sightline | **40.8 m (28 px @ 1366×768)** |
| positions hittable from > 30 m | 19.3 % |
| spawn → enemy spawn lines | 0 |
| unreachable / stuck regions | 0 / 0 |
| real-bot traversal to every key area | pass (3/3 runs, both teams) |
| coplanar faces (flicker) | 6 small overlaps (≈ 1.5 m² each) |
| contact time to the hall | 6.7 s each side; mezzanine 8.0 s; furnace top 11.8 s |

### Changed during the build (design corrections)
1. **Kiln Shed and Drying Shed doors** sat at the same z after rotation (a 60 m line shed to shed). The east doors moved to z ±22, where they face the clay bunker and the ash bins.
2. **Lines ran through the hall door to door** (rail cut ↔ kiln gate). Added blast baffles outside each hall door, plus an inside staircase whose solid flight screens the north-door ↔ west-door diagonal.
3. **The mezzanine could only be reached over the bridges** (11 s). Inside stairs from the hall floor now give 8 s.
4. **The furnace top was too cramped to fight on** (6 m with a 2 m chimney). It's now 7 m with a 1.6 m chimney.
5. **Small geometry fixes:**
   - the Drying Shed west door had been blocked by its own staircase;
   - the Hopper Deck joined the Charge Bridge over only 1 m;
   - the Kiln stairs stopped 0.3 m short of the gallery.
6. **The palette** read red-brown and near-black in the screenshots. Swapped to neutral buff render and light steel.
7. **Engine fix:** the path grid made floors inside a ramp's solid foot, so bots hopped up ramps and sometimes fell off. It's fixed in `src/nav.js` for all maps, and all maps were re-tested.

## 8. Known risks (for Phase 4)
- **Lines at 39–41 m:** Pump House ↔ Hopper Court through the pump gate, Cinder Heap ↔ Lamp Store, and Ash Yard ↔ Lamp Store. They pass the 25 px floor but sit at the cap.
- **The furnace top could become a death-trap rather than a power spot.** It takes 11.8 s to reach, and the mezzanine sees it from all sides.
- **Rail Cut and Pump Lane** are 6–7 m wide with hard walls. Good for the shotgun, poor for the sniper. There's no sniper nest by design, because the 40 m cap leaves no long lane.
- **Bot engagement** in the match sim is low (about 12% of time) and close range (about 12 m) on this compact layout. Phase 4 should check bot spread across routes.

---

## 9. Phase 4 — validation and iteration (built map, now in the rotation)
Renders (`plan_0-ground.png`, `plan_1-upper.png`, `plan_2-furnace-top.png`), 16 views at 1366×768 (both spawns and every key area) and `validator.txt` are in `docs/maps/kilnworks/`.

| check | end of Phase 3 | after Phase 4 |
|---|---|---|
| longest sightline | 40.8 m (28 px) | **39.5 m (29 px)** |
| positions hittable from > 30 m | 19.3 % | 19 % |
| spawn → enemy spawn lines | 0 | 0 |
| unreachable / stuck regions | 0 / 0 | 0 / 0 |
| real-bot traversal | pass | pass (3/3) |
| team balance, six 10-min bot matches | — | **blue 631 – red 634 kills** |
| coplanar faces | 6 (≈ 6 m²) | none visible (a light strip 1 cm under a ceiling) |

### Misses found and fixed
1. **The Pump Bridge ran through solid wall.** Its first 4 m sat inside the block between the Pump House and the court, so the Pump House's upstairs door opened onto a wall. The validator missed it because the room is still reachable by its inside stairs. Fixed: the bridge now rests on a 4.2 m plinth, and a bot path runs Pump House upstairs → bridge → Hopper Deck at a level 4.5 m.
2. **Pump House ↔ Hopper Court line, 40.8 m** through the Pump Gate. Fixed with a coke bin (2.6 m) just outside the gate.
3. **Lamp Store ↔ Ash Yard and Weighbridge ↔ Sort Yard, 40.8 m.** The line crossed a waist-high desk. Both desks are now 2.3 m counter screens.
4. **Ceilings rendered near-black** (dark corrugated roof underside). The roof material is lighter, and plain plaster ceilings were added inside the sheds.
5. **Three blue spawn points faced the yard wall.** They now face the east exit (the red ones are rotated to match).
6. **Flicker:** a bridge post sat flush with a wall face. Moved.
7. **A bot route waypoint sat on the new coke bin.** Moved.

## 10. Known risks
- **Lines at the cap:** Cinder Heap ↔ Lamp Store (39.5 m) and Cinder Heap ↔ Drying Shed (39.0 m). Both are flank areas, not the main routes.
- **Engagement range and pace:** bots fight close (average 12 m; engaged 13–17% of the time). The map plays as a close-quarters map. Snipers have no nest and no line over 40 m, so the sniper is a poor pick here, by design.
- **Furnace Top:** it takes 11.8 s to reach, and the mezzanine sees it from all sides. It may end up a death-trap. Watch kills-per-visit in playtests; if it's never contested, add a low half-wall around the chimney.
- **Narrow choke points:** the hall doors with their baffles, and the pump and kiln gates (3–4 m). Arc Grenade, Sonic Repulser and the shotgun are strong in them.
- **Pace:** a full rotation through the hall is about 60 m per side, and contact comes at 6.7 s. Faster than Ashgrove, closer to a CoD-style small map.
