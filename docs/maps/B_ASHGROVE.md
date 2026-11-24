# ASHGROVE — Phase 2 design document (Brief B)

**Status: DRAFT for approval — nothing is built yet.**

## 1. Mode and type
- **Symmetric 5v5 Team Deathmatch** (existing mode: first to 75, 10 min).
- Mirror symmetry across x = 0 (blue spawns west, red east). Geometry is mirrored for fairness, but the
  set dressing on each half differs (west = Coach Yard / stables, east = Brewery Yard / copper vats) so
  players always know which side they are on.
- Setting: a limestone market town on a canal, late morning.
- Footprint: **160 × 76 m** playable (x −80…80, z −40…36), 3 walkable levels.

Scaled to the player (from the code): sprint 9.0 m/s, walk 6.2 m/s, step ≤ 0.62 m, jump 1.24 m,
doorways ≥ 1.6 m wide × 2.4 m tall, stairs 0.3 m rise / 0.5 m run, ramps ≤ 40°.
An enemy at 40 m is 28 px tall at 1366×768 (40 px at 1920×1080) with the default 95° FOV.

## 2. Layout sketches (to scale)
Legend: `#` solid / out of bounds · `.` outdoor ground · `:` indoor floor · `=` covered passage ·
`^` stairs · `o` deliberate cover · `~` water (no access) / open void · `+` walkable upper level.
North is up (−z). Sketches are generated from the same coordinates Phase 3 will build.

```
GROUND (y 0)
   x: -80 … 80 m (1 col = 2 m)   z: -40 (top) … 40 (bottom) m (1 row = 3 m)
      |         |         |         |         |         |         |         |         
  -40 ################################################################################
  -37 ##............###COOPER######WELL YARD::::WELL YARD#####COOPER####............##
  -34 ##............####.....#######...oo..:oooo:..oo...#######.....####............##
  -31 ##.....#####.......oo.......==.......CHAPEL.......==.......oo.......#####.....##
  -28 ##.....#####INN YD...BAKER YD#.......:oooo:.......BAKER YD....INN YD#####.....##
  -25 ##BACK.######:::::##..##::::###::::##########::::###::::##..##:::::######BACK.##
  -22 ##LANESTABLE#:::::##..##::::###::::##########::::###::::##..##:::::#STABLEANE.##
  -19 ##.....######:INN:##.s#BAKERY#TAILOR########TAILOR#BAKERY#.s##:INN:######.....##
  -16 ##.....######:::::##..##::::###::::##########::::###::::##..##:::::######.....##
  -13 #...................##....................................##...................#
  -10 #...................##.....oo.....MARKET SQUARE....oo.....##...................#
   -7 ::::::#...HIGH STREET=...............::::::...............==HIGH STREET..#::::::
   -4 :WEST:#.............=A...............:^::^:...............=A.............#EAST::
   -1 :SPAWN#.JCT.........=R...MARKET......:HALL:......MARKET...=R..........JCT#SPAWN:
    2 ::::::#.............##.....oo........::::::........oo.....##.............#::::::
    5 ::::::#.............##....................................##.............#::::::
    8 ##.........##::::###==###:::::#..................#:::::###==###::::##.........##
   11 ##.....######::::###==###:::::#..::..::::::..::..#:::::###==###::::######.....##
   14 ##.....######CHEM###ar###POST:#..::::::::::::::..#POST:###ar###CHEM######.....##
   17 ##.....WASH##::::###==###:::::#.f:::TOWN HALL::f.#:::::###==###::::##WASH.....##
   20 ##QUAY.######::::###==###:::::#..::::::::::::::..#:::::###==###::::######QUAY.##
   23 ##.............truck.................:::::..................truck.............##
   26 ##...............CANAL ROcr..........:LOCK...........crNAL ROAD...............##
   29 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   32 ~~~~~~~~~~~~~~~~~ canal ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ canal ~~~~~~~~~~~~~~~~
   35 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

UPPER (y 4)
   x: -80 … 80 m (1 col = 2 m)   z: -40 (top) … 40 (bottom) m (1 row = 3 m)
      |         |         |         |         |         |         |         |         
  -40 ################################################################################
  -37 ################################################################################
  -34 ################################################################################
  -31 ################################################################################
  -28 ################################################################################
  -25 #############++++++++++++++++++++++##########++++++++++++++++++++++#############
  -22 #############++++++walk++++++++++++##########++++++++++++walk++++++#############
  -19 ############INN 1F##++#BAKERY#TAILOR########TAILOR#BAKERY#++#INN 1F#############
  -16 #############+++++##++##++++###++++##########++++###++++##++##+++++#############
  -13 ####################++###++##########################++###++####################
  -10 ####################++###bal#########################bal##++####################
   -7 ####################++###############GALLERY##############++####################
   -4 ####################+A###############+~~~~+###############+A####################
   -1 ####################++###############+~~~~+###############++####################
    2 ####################+R###############++++++###############+R####################
    5 ####################++####################################++####################
    8 #############++++###++###+++++####################+++++###++###++++#############
   11 #############++++###++###+++++###++++++++++++++###+++++###++###++++#############
   14 #############CHEM++++++++POST+###++++++++++++++###POST+++++++++CHEM#############
   17 #############++++++walk+++++++###+TOWN HALL 1F+###+++++++walk++++++#############
   20 #############+++++++++++++++++###++++++++++++++###+++++++++++++++++#############
   23 ################################################################################
   26 ################################################################################
   29 ################################################################################
   32 ################################################################################
   35 ################################################################################

CLOCK TOP (y 8) — 3rd level
   x: -80 … 80 m (1 col = 2 m)   z: -40 (top) … 40 (bottom) m (1 row = 3 m)
      |         |         |         |         |         |         |         |         
  -40 ################################################################################
  -37 ################################################################################
  -34 ################################################################################
  -31 ################################################################################
  -28 ################################################################################
  -25 ################################################################################
  -22 ################################################################################
  -19 ################################################################################
  -16 ################################################################################
  -13 ################################################################################
  -10 ################################################################################
   -7 ################################################################################
   -4 ################################################################################
   -1 #######################################CLK######################################
    2 ################################################################################
    5 ################################################################################
    8 ################################################################################
   11 ################################################################################
   14 ################################################################################
   17 ################################################################################
   20 ################################################################################
   23 ################################################################################
   26 ################################################################################
   29 ################################################################################
   32 ################################################################################
   35 ################################################################################
```

### Callouts
| Area | Floor | What it is |
|---|---|---|
| West / East Spawn | 0 | Coach Yard / Brewery Yard. Two dog-legged exits (north → Back Lane, south → Quay Lane). The east wall is solid, so nothing can look into spawn. |
| Back Lane, Quay Lane, Junction (JCT) | 0 | Spawn approach lanes. Stable and Wash House blocks split them so no straight line exceeds ~25 m. |
| Inn Yard → Cooper's Yard → Baker's Yard → Arch → Well Yard → Chapel | 0 | **Mill Alley**, the close-range lane. 3–4 m alleys with turns every 8–14 m; the Chapel interior is the only crossing at the centre. |
| Inn, Bakery, Tailor | 0 + 1 | North terrace houses. Back doors open onto the alley, front doors onto the High Street, and the upper floors have windows over the street. |
| Stair Lane (`s`) | 0 | Open alley-to-street passage, 3 m wide. |
| High Street, Arch (AR) | 0 | **Centre lane**, mid range, 21 m wide between facades. The arch gatehouse narrows it to an 8 m covered arch. |
| Market Square, Market Hall | 0 / +0.9 | Raised square (0.9 m plinth, ramps east and west, steps north and south) with the Market Hall in the middle. |
| Gallery, Clock Top (CLK) | 1 / 2 | Market Hall gallery (y 4) and the clock top (y 8), the map's **3rd level**. |
| Chemist, Post Office, Arcade (`ar`), Fish Lane (`f`) | 0 + 1 | South row. Doors to both the street and the canal road; upper rooms overlook both lanes. |
| Town Hall | 0 + 1 | Centre-south building. Doors north onto the square and south onto the canal road. |
| Canal Road, Truck, Crane (`cr`), Lock House | 0 | **Long-range lane** along the canal. The canal itself has no access (railing). The Lock House is the only crossing at the centre. |
| Arch Room | 1 | Room over each arch gate, forming a **bridge across the High Street** that links the north and south upper walks. |

## 3. Lane structure and connections
| Lane | Range | Route length (spawn → centre) | Connections to other lanes (each side) |
|---|---|---|---|
| **Mill Alley** (north) | close, < 10 m (yards up to ~18 m) | ≈ 100 m | Inn (door pair), Stair Lane, Bakery (door pair), Tailor (door pair), plus Back Lane ↔ Junction → **5** |
| **High Street** (centre) | mid, 10–30 m | ≈ 80 m | 4 to Mill Alley (above), plus Chemist, Arcade, Post Office, Fish Lane and Town Hall to the canal → **9** |
| **Canal Road** (south) | long, 30–38 m | ≈ 93 m | Chemist, Arcade, Post Office, Fish Lane, Town Hall, plus Quay Lane ↔ Junction → **6** |

- **Cross-lane doorways:** 9 per side, 18 in total, plus the upper-floor walks and the two Arch Room bridges.
- **Rotation:** you can move between alley and canal without touching the centre lane, via the Arcade ↔ Arch passage ↔ Stair Lane line (≈ 35 m) or through any terrace house plus a south-row shop.

## 4. Verticality plan
| High position | Height | Why it exists | Ways up | Counters (no position is safe from every direction) |
|---|---|---|---|---|
| Terrace window rooms (Inn, Bakery, Tailor 1F) | 4 m | Overwatch on the High Street | Interior stair, plus the Terrace Walk from the neighbouring house or Arch Room | South-row windows opposite (21 m); Clock Top (13–20 m); the walk is a flank route; shooters expose head and chest (sill 1.0 m, window 1.4 × 1.2 m) |
| South-row 1F (Chemist, Post Office) | 4 m | Street windows facing north, canal windows facing south (overwatch on the long lane) | Interior stair, plus the South Walk | Terrace windows; canal road players at 15–30 m; Arch Room; flank via the walk |
| **Arch Room** (bridge over the street) | 4 m | Controls the street axis and links both upper walks | North walk and south walk | Square and Clock Top (≈ 35 m); players directly below; flanks from both walks. **One-way drop** through a floor hatch into the arch passage (4 m). |
| Market Hall Gallery | 4 m | Mid control over the square | Two stairs (west and east), equal for both teams | Every window room; the square below; **one-way drops** off the balconies (4 m) |
| **Clock Top (3rd level)** | 8 m | Landmark power position over the square | Two stairs from the gallery (west and east) | Open on all four sides with a 1.0 m parapet. Visible from all window rooms (13–38 m) and the Arch Rooms; can be grenaded from the gallery stair-holes. No back wall to hide behind. |
| Bakery and Town Hall balconies | 4 m | Fast committal exits | Interior | **One-way drops** to the street / canal road (4 m) |

About **28% of the playable area** has a second walkable level. Ramps are real slopes (square plinth: 0.9 m over 4 m ≈ 13°); stairs use 0.3 / 0.5 m steps.

## 5. Engagement ranges
| Zone | Intended range | How it's enforced |
|---|---|---|
| Mill Alley, Chapel, house interiors, Lock House | **close < 10 m** | 3–4 m alleys, turns every 8–14 m, yards ≤ 14 × 14 m; a barrel stack in Cooper's Yard breaks the yard-to-yard line |
| High Street, Market Square, window duels | **mid 10–30 m** | 21 m street width; the arch and Market Hall cut the east–west axis (arch → square edge ≈ 24 m, square diagonal ≈ 37 m) |
| Canal Road | **long 30–38 m** | The road is broken by a truck (2.8 m tall) and a crane base, so the longest planned lines are ≈ 37–38 m (30 px at 1366×768) |

**Weapon fit:** the SMG and shotgun favour the alley, the AR and HMG the street and square, and the sniper the canal road plus the south-row rear windows.

## 6. Timing targets (sprint 9 m/s; Phase 4 will measure these)
| Route | Est. path | Est. time to centre | Expected first contact |
|---|---|---|---|
| High Street | ≈ 80 m | ≈ 8.8 s | ≈ 8–9 s, at the square edges |
| Mill Alley | ≈ 100 m | ≈ 11 s | ≈ 10–11 s, in the Well Yard / Chapel |
| Canal Road | ≈ 93 m | ≈ 10.3 s | ≈ 8–9 s, at the crane / Lock House |

Both sides are equal by symmetry. Spawn exits are dog-legged, which adds about 15 m so contact doesn't happen before 8 s.

## 7. Chokepoints (widths)
| Choke | Width | Alternatives (never the only way through) |
|---|---|---|
| Spawn exits (north and south) | 4 m each | Two per spawn |
| Arch passage (High Street) | 8 m, covered | Stair Lane, Arcade, all terrace and south-row houses, Arch Room above |
| Alley connectors and Arch | 3–4 m | Every terrace house leads back to the street |
| Chapel doors (alley centre crossing) | 2 m | The High Street and square, ~15 m away, through the Tailor house |
| Lock House doors (canal centre crossing) | 2 m | Town Hall south doors and Fish Lane |
| Canal Road beside truck and crane | 3 m | The whole south row |
| House doors | 1.6–2 m | — |

**Mirror-alignment safeguard:** symmetric doors on centre buildings (Chapel, Lock House, Town Hall) line up through the building. Each gets an interior blocker (pews / lock-gear housing / staircase) so there's no straight line through.

## 8. Landmarks
| Area | Unique shape / prop | Material accent |
|---|---|---|
| West spawn: Coach Yard | Stables, hay carts | Sage-green doors |
| East spawn: Brewery Yard | Copper vats, barrel ramp | Ochre doors |
| Mill Alley | Laundry lines overhead; Cooper's barrel stacks; stone well with timber roof; chapel bell-cote | Whitewash, oak |
| High Street | Carved gatehouse arches; hanging shop signs (inn, loaf, scissors, green cross) | Cream limestone |
| Market Square | Market Hall with a verdigris-green clock tower (visible from most of the map) | Copper green |
| Canal | Yellow gantry crane, lock gates, moored cream-and-green narrowboats, ochre truck | Teal-grey water |

## 9. Readability plan (small screens)
- **Palette is clearly different from the teams:** cream limestone, slate, sage, ochre and oak. No red brick, no saturated blue. Players stay crimson or blue, each with a bright team-coloured rim.
- **Plain mid-tone band at head and torso height:** every street-facing facade has a plain plaster band from 0–2.2 m, so enemies are always seen against a calm surface. Cobbles use a low-contrast texture. No scattered small props; cover is grouped and purposeful.
- **Even lighting:** sun 50° high from the south-east, so lanes run across the light rather than into it. Alleys get fill light and a wall lamp every ~8 m. Shop and room interiors are lit, with plain back walls, so nobody stands in a dark window.
- **Sky never behind a long line:** the long lane runs east–west between 8 m+ facades and ends on building walls. The Clock Top is framed by its canopy and pillars.
- **No pixel angles:** windows are 1.4 × 1.2 m (no slits), cover has no gaps under 0.5 m, and railings are thin posts that block movement but not sight or bullets.
- **Distance:** the longest planned line is ≤ 38 m (≥ 30 px tall at 1366×768); fog starts beyond 120 m so it never touches play.

## 10. Known risks (to check in Phase 4)
- **Clock Top may be too strong.** Mitigation: open on all sides with no back wall, two equal-length stairs, visible from 6+ windows.
- **Arch Room overwatch down the street.** Mitigation: exposed from both walks and from the square; the hatch drop gives defenders a fast exit and attackers a punish.
- **Canal Road sniper lane.** Mitigation: the 38 m cap, a 4 m-high flank from the south-row rear windows, and Fish Lane / Town Hall flanks.
- **Spawn trapping at the Junction.** Mitigation: two dog-legged exits plus the Back Lane / Quay Lane alternatives.
- **Bots:** they need the upper walks and stairs. Phase 1's layered navigation supports this; `tools/navtest.js` will verify every key area.

---

## 11. Phase 4 — validation results (built map)

Built by `tools/mapgen/ashgrove.py` → `src/maps/data/ashgrove.json` (in the map rotation).
Renders, 1366×768 screenshots and the full validator report are in `docs/maps/ashgrove/`.

| check | first build | after Phase 4 |
|---|---|---|
| longest sightline | 93.4 m (12 px @ 1366×768) | **44.6 m (25 px)** |
| positions hittable from > 30 m | 75 % | **42.5 %** |
| spawn → enemy spawn lines | 0 | 0 |
| unreachable / stuck regions in tagged areas | 23 / 0 | **0 / 0** |
| real-bot traversal to every key area | pass | pass (3/3 runs) |
| coplanar (z-fighting) faces | ~1100 | 20 slivers, 0.7 m² total |

Measured contact times (sprint, from each spawn): Market Square 7.5 s · Chapel (alley) 10.4 s · Lock House (canal) 10.3 s.

### Misses found and how they were fixed
1. **High Street ran straight through the gate (93 m).** Gate arch is now an S-bend: two offset piers (5.6 m each, overlapping) up to the arch ceiling.
2. **Front and back doors lined up in all five houses.** Doors offset by 3–5 m, plus a shop counter or shelving (2.3 m) between them.
3. **Spawn exits weren't actually staggered** (Back Lane looked through the yard to Quay Lane). Added yard walls so the north exit (x −76…−73) and south exit (x −72…−69) are really offset, plus the stable coach mid-yard. Spawns now face their nearer exit.
4. **Market-square strips beside the hall gave street-to-street lines.** Kiosks now sit against the shopfronts (2.4 m gap to the hall) and market crosses against the hall (1.4 m gap): offset gaps.
5. **Arch Room windows lined up east–west.** The two sides are staggered.
6. **Canal Road was 60 m long and open.** Truck chicane: the truck is 0.8 m deeper, with a cargo stack right behind it on the canal side.
7. **Fish Lane looked from the street to the canal.** Two overlapping buttresses.
8. **Junction to Quay Lane diagonals.** Hay wagon in the Junction, and a quay gate pier narrowing that opening to 2 m.
9. **Elevated lines from the square's upper floors along the street.** A bunting banner at 4.4–7.4 m (shot layer).
10. **Town Hall balcony saw sideways down the streets.** Balcony cheek walls.
11. **Doc kiosks were built as waist-high carts.** Rebuilt as 3 m roofed kiosks, as written.
12. **Canal water was saturated cyan** (palette rule). Changed to teal-grey.
13. **Flicker on every roof, frame and threshold.** Overlapping trim removed (shared `MapKit` fixes help all maps). Camera near plane 0.05 → 0.15. Shadow bias set to one shadow texel, and the shadow frustum snaps to texels.
14. **Engine bugs found along the way:**
    - nav drop links could pass through a wall;
    - bots on a prop top they'd reached by grapple or jump pad had no path off it;
    - `lostest` counted Stasis-released bullets as early shots.

    All three are fixed (`src/nav.js`, `tools/lostest.js`).

### Deviations from the approved doc (all made to meet the 40 m readability rule)
- New elements: gate piers, the second square kiosk, market crosses, counters, Fish Lane buttresses, cargo stack, hay wagon, quay pier, banner, balcony cheeks.
- The Tailor, Inn, Bakery, Chemist and Post Office doors moved.

## 12. Known risks
- **Window duels sit right at the limit.** Ten pairs are 41.7–44.6 m: bakery/post upstairs across the street, Town Hall door diagonals, Inn ↔ Chemist upstairs. That's 25–27 px at 1366×768, which meets the 25 px floor but is above the 40 m target. If playtests say upstairs windows dominate, shorten them first: narrower windows, or shutters on one side.
- **Tight squeeze points.** The gate S-bend, the square-strip gaps (1.4–2.4 m) and the Fish Lane buttresses (1.3 m) are crowded under fire. They're strong spots for grenades, Sonic Repulser and HMG. Bots path through them fine, but they could feel cramped in a 5v5.
- **Canal lane is slower than the doc's target.** Contact is ~10.3 s against the 8–9 s target, because of the truck chicane. The long lane is no longer the fastest route.
- **The bunting banner blocks bullets.** Players may expect to shoot through cloth. It's above head height, so this only matters for shots from upper floors.
- **Clock Top is fully exposed by design.** Its longest line is 39.8 m, to the Arch Room. Being open to the gallery and the square below is its counter. Watch whether it becomes a death-trap or a camp.
- **Bots still reach prop tops** via grapple or jump pad. They now path off them, but they can briefly stand on kiosks or the coach.
- **Graphics:** 1725 visible boxes. Twenty coplanar slivers of 2 cm or less remain where cornice ends meet walls; none were visible in the screenshots.
