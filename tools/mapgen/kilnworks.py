#!/usr/bin/env python3
"""Generates src/maps/data/kilnworks.json (Brief C, design: docs/maps/C_KILNWORKS.md).
Rotational symmetry (rotate180 about the origin): the WEST half (x < 0) is authored and the loader rotates it
to make the east half (x, z) -> (-x, -z). Blue spawns south-west, red north-east.
Pieces that straddle x = 0 (the Furnace Hall core) are authored once with mirror=False.
Coordinates: x east, z south, y up (metres).   python3 tools/mapgen/kilnworks.py [--sketch]"""
import json, math, os, sys

E = []
T = 0.4                      # wall thickness
G1, G2, ROOF = 4.5, 9.0, 9.3 # upper floor, upper ceiling, roof top
HALL_H = 13.0                # Furnace Hall wall height
FT = 9.0                     # furnace top (3rd level)

# ───────────────────────── helpers (same conventions as ashgrove.py) ─────────────────────────
def box(x0, y0, z0, x1, y1, z1, mat, **kw): E.append(dict(type='box', min=[x0, y0, z0], max=[x1, y1, z1], mat=mat, **kw))
def visual(x0, y0, z0, x1, y1, z1, mat, **kw): box(x0, y0, z0, x1, y1, z1, mat, layer='visual', **kw)
def slab(r, y, mat, holes=(), t=0.3, **kw): E.append(dict(type='floor', rect=list(r), y=y, t=t, mat=mat, holes=[list(h) for h in holes], **kw))
def ramp(r, d, y0, y1, mat, **kw): E.append(dict(type='ramp', rect=list(r), dir=d, y0=y0, y1=y1, mat=mat, **kw))
def railing(a, b, y=0, **kw): E.append(dict(type='railing', **{'from': list(a), 'to': list(b)}, y=y, **kw))
def sign(x, y, z, w, h, text, color, facing, **kw): E.append(dict(type='sign', at=[x, y, z], w=w, h=h, text=text, color=color, facing=facing, **kw))
def strip(x0, y0, z0, x1, y1, z1, mat='light', **kw): E.append(dict(type='lightstrip', min=[x0, y0, z0], max=[x1, y1, z1], mat=mat, **kw))
def wall(a, b, y, h, mat, ops=(), t=T, frame='olive', **kw):
    E.append(dict(type='wall', **{'from': list(a), 'to': list(b)}, y=y, h=h, t=t, mat=mat, frame=frame,
                  openings=[dict(at=at, w=w, y=oy, h=oh, kind=k) for (at, w, oy, oh, k) in ops], **kw))
def stairs(fx, fz, d, w, y, to, mat='steel', run=0.5, rail=True, **kw):
    E.append(dict(type='stairs', **{'from': [fx, fz]}, dir=d, w=w, y=y, to=to, mat=mat, run=run, **kw))
    if not rail: return
    steps = math.ceil((to - y) / 0.3 - 1e-6); L = steps * run; s0 = 0.6
    m = {'mirror': kw['mirror']} if 'mirror' in kw else {}
    for side in (-1, 1):
        if d in ('+x', '-x'):
            sg = 1 if d == '+x' else -1; zz = fz + side * (w / 2 + 0.06); railing((fx + sg * s0, zz), (fx + sg * L, zz), y, **m)
        else:
            sg = 1 if d == '+z' else -1; xx = fx + side * (w / 2 + 0.06); railing((xx, fz + sg * s0), (xx, fz + sg * L), y, **m)
    return L

def walls(r, y, h, mat, open_=None, frame='olive', **kw):
    """Four walls inside rect r; open_ = {'n'|'s'|'w'|'e': [(centre, w, oy, oh, kind)]} (centre = x for n/s, z for w/e)."""
    x0, z0, x1, z1 = r; open_ = open_ or {}
    def ops(side, start): return [(abs(c - start), w, oy, oh, k) for (c, w, oy, oh, k) in open_.get(side, [])]
    wall((x0, z0 + T / 2), (x1, z0 + T / 2), y, h, mat, ops('n', x0), frame=frame, **kw)
    wall((x0, z1 - T / 2), (x1, z1 - T / 2), y, h, mat, ops('s', x0), frame=frame, **kw)
    wall((x0 + T / 2, z0 + T), (x0 + T / 2, z1 - T), y, h, mat, ops('w', z0 + T), frame=frame, **kw)
    wall((x1 - T / 2, z0 + T), (x1 - T / 2, z1 - T), y, h, mat, ops('e', z0 + T), frame=frame, **kw)

DOOR = lambda c, w=2.0: (c, w, 0, 2.5, 'door')
WIN = lambda c, w=1.6: (c, w, 1.1, 1.1, 'window')
inset = lambda r, d=T: (r[0] + d, r[1] + d, r[2] - d, r[3] - d)

# ───────────────────────── plan (west half, x −56…0, z −40…40) ─────────────────────────
OUT = {   # open ground (y 0)
    'spawn': (-56, 24, -44, 40), 'spawnN': (-54, 20, -50, 24), 'spawnE': (-44, 34, -40, 38),
    'pumpLaneS': (-54, 6, -48, 20), 'pumpLaneN': (-54, -22, -48, -6), 'slagYard': (-56, -40, -40, -18), 'slagGate': (-40, -28, -32, -24),
    'railS': (-40, 32, 0, 39), 'railN': (-40, -39, 0, -32),
    'coalAlley': (-40, 12, -32, 32), 'hopperCourt': (-40, -12, -12, 12), 'pumpGate': (-44, -3, -40, 3),
    'kilnGateS': (-25, 28, -21, 32), 'kilnGateN': (-20, 12, -16, 16), 'dryGateS': (-30, -16, -26, -12), 'ashGate': (-21, -32, -17, -28),
    'sortYard': (-14, 12, 0, 32), 'ashYard': (-14, -32, 0, -12),
}
BLD = {   # enclosed buildings: rect, ground openings, upper openings (None = single storey), stair (fx, fz, dir) or None, height
    'pump':   dict(r=(-56, -6, -44, 6), g={'s': [DOOR(-52)], 'n': [DOOR(-49.5)], 'e': [DOOR(0)]},
                   u={'e': [DOOR(-4.5, 1.8)], 'n': [WIN(-51)]}, st=(-55.0, 5.2, '-z')),
    'drying': dict(r=(-32, -28, -14, -16), g={'w': [DOOR(-26.5)], 'n': [DOOR(-19)], 'e': [DOOR(-22)], 's': [DOOR(-28)]},
                   u={'e': [DOOR(-16.5, 1.8)], 'n': [WIN(-24), WIN(-28.5)]}, st=(-31.0, -16.8, '-z')),
    'weigh':  dict(r=(-22, 31, -14, 40), g={'w': [DOOR(37)], 'e': [DOOR(34)]}, u=None, st=None, h=4.5),
    'lamp':   dict(r=(-22, -40, -14, -31), g={'w': [DOOR(-33)], 'e': [DOOR(-37)]}, u=None, st=None, h=4.5),
}
KILN = (-32, 16, -14, 28)          # tall single-volume shed with a gallery along its north wall
HALL = (-12, -12, 12, 12)          # Furnace Hall (straddles x = 0)
# upper decks (y G1) that are NOT inside a building
DECK = {'hopperDeck': (-36, -10, -26, 0), 'pumpBridge': (-44, -6, -36, -3), 'chargeBridge': (-26, -3, -12, 0)}
CONV = [(-14, -18, -7, -15), (-10, -15, -7, -12)]   # enclosed conveyor bridge: Drying Loft → Hall mezzanine (north door)

# ───────────────────────── materials / theme (palette away from team blue/red) ─────────────────────────
MATS = {
    'yard':   dict(tex='concrete', color='#9c968b', scale=3, rough=0.95, normal=0.4),
    'soot':   dict(tex='concrete', color='#8f897e', scale=3, rough=0.92, normal=0.5),     # mid-tone 0–4.5 m band
    'buff':   dict(tex='plaster', color='#d2c4a4', scale=3, rough=0.9, normal=0.45),     # pale buff render (brick texture read as red)
    'steel':  dict(tex='metal', color='#b3b8bc', scale=2, rough=0.6, metal=0.25),
    'olive':  dict(tex='metal', color='#6f7a55', scale=2, rough=0.55, metal=0.35),       # painted steel trim
    'safety': dict(tex='metal', color='#cfa93c', scale=2, rough=0.5, metal=0.3),         # safety yellow
    'deck':   dict(tex='concrete', color='#a39e94', scale=2, rough=0.8),
    'roof':   dict(tex='corrugated', color='#a4a6a3', scale=2, rough=0.7, metal=0.2),
    'kiln':   dict(tex='stone', color='#bfae8c', scale=1.6, rough=0.95),
    'clay':   dict(tex='sand', color='#b9a27c', scale=1.5, rough=1),
    'slag':   dict(tex='stone', color='#77746d', scale=1.8, rough=1),
    'timber': dict(tex='wood', color='#a09a8a', scale=2, rough=0.85),
}
THEME = {
    'sky': {'top': '#8fa3b5', 'horizon': '#e2ddd2', 'bottom': '#c8c4ba', 'sun': '#fff0d6', 'elev': 55, 'az': 210, 'clouds': 0.55, 'stars': 0},
    'sun': {'color': '#fff0dc', 'intensity': 2.3}, 'hemi': {'sky': '#e4e6e8', 'ground': '#9e978a', 'intensity': 1.2},
    'fog': {'color': '#d9d5cb', 'near': 110, 'far': 380}, 'exposure': 1.0, 'env': 0.45,
    'grade': {'sat': 1.0, 'contrast': 1.04, 'vignette': 0.12}, 'bloom': 0.2, 'weather': 'none', 'ambient': 'town', 'stepOut': 'stone',
}

# ───────────────────────── ground, boundary ─────────────────────────
E.append(dict(type='ground', rect=[-58, -42, 58, 42], mat='yard', mirror=False))
box(-58, 0, -42, -56, 12, 42, 'soot')            # west boundary (rotated → east)
box(-56, 0, 40, 0, 12, 42, 'soot')               # south boundary west half (rotated → north east half)
box(-56, 0, -42, 0, 12, -40, 'soot')             # north boundary west half (rotated → south east half)

# ───────────────────────── mass: solid works blocks between lanes ─────────────────────────
def inside(x, z, r): return r[0] <= x < r[2] and r[1] <= z < r[3]
open_rects = list(OUT.values()) + [b['r'] for b in BLD.values()] + [KILN, (-12, -12, 0, 12)]
H = {}
for z in range(-40, 40):
    for x in range(-56, 0):
        if any(inside(x + 0.5, z + 0.5, r) for r in open_rects): continue
        H[(x, z)] = 10.0
for c in ((-14, 12), (-13, 12), (-14, -13), (-13, -13)): H[c] = 10.0   # close the court ↔ yard corner slots
for z in range(-6, -3):
    for x in range(-44, -40): H[(x, z)] = G1 - 0.3                       # plinth under the Pump Bridge (bridge deck sits on it)
used = set()
for z in range(-40, 40):
    for x in range(-56, 0):
        if (x, z) not in H or (x, z) in used: continue
        h = H[(x, z)]; w = 1
        while (x + w, z) in H and H[(x + w, z)] == h and (x + w, z) not in used: w += 1
        d = 1
        while all((x + k, z + d) in H and H[(x + k, z + d)] == h and (x + k, z + d) not in used for k in range(w)): d += 1
        for a in range(w):
            for b in range(d): used.add((x + a, z + b))
        if h < G1: box(x, 0, z, x + w, h, z + d, 'soot'); continue
        box(x, 0, z, x + w, G1, z + d, 'soot'); box(x, G1, z, x + w, h, z + d, 'buff')
        visual(x, h, z, x + w, h + 0.04, z + d, 'roof')
# cornice strips along exposed roof edges, merged into runs
runs = set()
for (x, z), h in H.items():
    for dx, dz in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        if H.get((x + dx, z + dz), 0) < h: runs.add((dx, dz, h, x, z))
done = set()
for (dx, dz, h, x, z) in sorted(runs):
    if (dx, dz, h, x, z) in done: continue
    n = 0
    while (dx, dz, h, x + (n if dx == 0 else 0), z + (n if dz == 0 else 0)) in runs: done.add((dx, dz, h, x + (n if dx == 0 else 0), z + (n if dz == 0 else 0))); n += 1
    o, i, y0, y1 = 0.08, 0.3, h - 0.35, h + 0.06
    if dz == -1: visual(x, y0, z - o, x + n, y1, z + i, 'olive')
    if dz == 1:  visual(x, y0, z + 1 - i, x + n, y1, z + 1 + o, 'olive')
    if dx == -1: visual(x - o, y0, z, x + i, y1, z + n, 'olive')
    if dx == 1:  visual(x + 1 - i, y0, z, x + 1 + o, y1, z + n, 'olive')

# ───────────────────────── buildings ─────────────────────────
for name, b in BLD.items():
    r = b['r']
    if b['u'] is None:     # single storey
        walls(r, 0, b['h'], 'soot', b['g'])
        slab((r[0] - 0.1, r[1] - 0.1, r[2] + 0.1, r[3] + 0.1), b['h'] + 0.3, 'roof')
        strip((r[0] + r[2]) / 2 - 1.5, b['h'] - 0.06, (r[1] + r[3]) / 2 - 0.15, (r[0] + r[2]) / 2 + 1.5, b['h'] - 0.01, (r[1] + r[3]) / 2 + 0.15)
        continue
    walls(r, 0, G1, 'soot', b['g'])
    walls(r, G1, G2 - G1, 'buff', b['u'])
    fx, fz, d = b['st']; L = stairs(fx, fz, d, 1.6, 0, G1)
    hole = (fx - 0.8, fz - L, fx + 0.8, fz) if d == '-z' else (fx - 0.8, fz, fx + 0.8, fz + L)
    slab(inset(r), G1, 'deck', [hole])
    for bx in ((r[0], r[1], r[2], r[1] + T), (r[0], r[3] - T, r[2], r[3]), (r[0], r[1] + T, r[0] + T, r[3] - T), (r[2] - T, r[1] + T, r[2], r[3] - T)):
        box(bx[0], G1 - 0.32, bx[1], bx[2], G1, bx[3], 'soot')          # fill the band under the upper walls (same mat as the wall below)
    slab((r[0] - 0.12, r[1] - 0.12, r[2] + 0.12, r[3] + 0.12), ROOF, 'roof')
    visual(r[0] + T, G2 - 0.01, r[1] + T, r[2] - T, G2, r[3] - T, 'buff')          # plain interior ceiling (roof underside read near-black)
    cx, cz = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    for yy in (G1 - 0.36, G2 - 0.02): strip(cx - 2, yy - 0.05, cz - 0.15, cx + 2, yy, cz + 0.15)

# Pump House interior: the pump engine sits between the offset north/south doors
box(-53, 0, -1.5, -48.2, 2.5, 1.5, 'olive', round=0.08); visual(-51.5, 2.5, -0.6, -49.5, 3.6, 0.6, 'steel')
# Drying Shed interior: two offset rack rows (2.2 m, full cover)
box(-30, 0, -24.2, -18, 2.2, -23.6, 'timber'); box(-24, 0, -20.6, -16.5, 2.2, -20.0, 'timber')
# Weighbridge / Lamp Store interiors (desk + shelving)
box(-19.5, 0, 34.8, -16.5, 2.3, 36.2, 'timber'); box(-21.4, 0, 31.6, -19.6, 2.3, 32.2, 'timber')
box(-19.5, 0, -36.2, -16.5, 2.3, -34.8, 'timber'); box(-21.4, 0, -39.0, -19.6, 2.3, -38.4, 'timber')

# Kiln Shed: tall single volume (0–8 m), two kilns, a gallery along the north wall with a drop-window to Coal Alley
K = KILN
walls(K, 0, G1, 'soot', {'w': [DOOR(22)], 's': [DOOR(-23)], 'e': [DOOR(22)], 'n': [DOOR(-18)]})   # E door faces the clay bunker
walls(K, G1, 3.5, 'buff', {'w': [(17.6, 1.6, 0, 2.4, 'door')]})                 # gallery drop door → Coal Alley (4.5 m, one-way)
slab((K[0] + T, K[1] + T, K[2] - T, 19.6), G1, 'deck')
railing((K[0] + T, 19.6), (-16.2, 19.6), G1)
for bx in ((K[0], K[1], K[2], K[1] + T), (K[0], K[1] + T, K[0] + T, 19.6), (K[2] - T, K[1] + T, K[2], 19.6)):
    box(bx[0], G1 - 0.32, bx[1], bx[2], G1, bx[3], 'soot')
stairs(-15.2, 27.1, '-z', 1.6, 0, G1)
box(-29, 0, 21, -25, 3.6, 25, 'kiln', round=0.5); visual(-28, 3.6, 22, -26, 5.2, 24, 'kiln', round=0.4)
box(-22, 0, 20.5, -18, 3.6, 24.5, 'kiln', round=0.5); visual(-21, 3.6, 21.5, -19, 5.2, 23.5, 'kiln', round=0.4)
slab((K[0] - 0.12, K[1] - 0.12, K[2] + 0.12, K[3] + 0.12), 8.3, 'roof'); visual(K[0] + T, 7.99, K[1] + T, K[2] - T, 8.0, K[3] - T, 'buff')
for x in (-27, -20): strip(x - 1.5, 7.9, 26.4, x + 1.5, 7.95, 26.7)
strip(-25, G1 - 0.4, 17.2, -21, G1 - 0.35, 17.5)

# ───────────────────────── upper decks / bridges ─────────────────────────
for name, r in DECK.items():
    slab(r, G1, 'deck')
box(-36, 0, -10, -26, G1 - 0.3, 0, 'soot')                                    # hopper bins under the deck (solid)
ramp((-26, -10, -14, -6.5), '-x', 0, G1, 'deck')                                # 20.6° ramp, Hopper Court → Hopper Deck
railing((-36, -10), (-26, -10), G1); railing((-36, -10), (-36, -6), G1); railing((-36, -3), (-36, 0), G1); railing((-27, 0), (-26, 0), G1)   # deck edges
railing((-26, -3), (-26, -6.5), G1)
box(-36, G1, -0.25, -27, G1 + 2.2, 0, 'olive')                               # wind screen: the deck overlooks the court, not the alley/rail
railing((-44, -6), (-36, -6), G1); railing((-44, -3), (-36, -3), G1)           # pump bridge
railing((-26, -3), (-12, -3), G1); railing((-26, 0), (-12, 0), G1)             # charge bridge
for (x, z) in ((-38.5, -4.5), (-22, -1.5), (-16, -1.5)): box(x - 0.2, 0, z - 0.2, x + 0.2, G1 - 0.3, z + 0.2, 'steel')   # bridge posts
# conveyor bridge (enclosed, roofed, windows face the Ash Yard)
for r in CONV: slab(r, G1, 'deck'); slab((r[0] - 0.1, r[1] - 0.1, r[2] + 0.1, r[3] + 0.1), G1 + 3.25, 'roof')
wall((-13.8, -17.8), (-7.2, -17.8), G1, 3.2, 'olive', [(3.3, 1.4, 1.1, 1.0, 'window')], t=0.3)
wall((-13.8, -15.2), (-10.0, -15.2), G1, 3.2, 'olive', t=0.3)
wall((-7.2, -17.6), (-7.2, -12.0), G1, 3.2, 'olive', t=0.3)
wall((-9.8, -15.0), (-9.8, -12.0), G1, 3.2, 'olive', [(1.5, 1.2, 1.1, 1.0, 'window')], t=0.3)
for (x, z) in ((-12, -16.5), (-8.5, -13.5)): box(x - 0.2, 0, z - 0.2, x + 0.2, G1 - 0.3, z + 0.2, 'steel')

# ───────────────────────── Furnace Hall (core, straddles x = 0) ─────────────────────────
NM = dict(mirror=False)
# west half walls (rotation builds the east half): west wall with ground + upper doors, north/south halves
wall((-11.8, -11.6), (-11.8, 11.6), 0, G1, 'soot', [(11.6, 2.6, 0, 2.6, 'door')])
wall((-11.8, -11.6), (-11.8, 11.6), G1, HALL_H - G1, 'buff', [(10.1, 1.8, 0, 2.4, 'door')])          # upper door z −1.5 → Charge Bridge
wall((-12, -11.8), (0, -11.8), 0, G1, 'soot', [(6.5, 2.4, 0, 2.6, 'door')])                           # ground door x −5.5 → Ash Yard
wall((-12, -11.8), (0, -11.8), G1, HALL_H - G1, 'buff', [(3.5, 1.8, 0, 2.4, 'door')])                 # upper door x −8.5 → Conveyor Bridge
wall((-12, 11.8), (0, 11.8), 0, G1, 'soot'); wall((-12, 11.8), (0, 11.8), G1, HALL_H - G1, 'buff')
# mezzanine ring (3 m) at G1, west-half pieces; drop gaps in the inner railing
slab((-11.6, -11.6, -9, 11.6), G1, 'deck'); slab((-9, -11.6, 0, -9), G1, 'deck'); slab((-9, 9, 0, 11.6), G1, 'deck')
railing((-9, -9), (-9, -6.2), G1); railing((-9, -4.2), (-9, 1.3), G1); railing((-9, 3.1), (-9, 9), G1)   # gap z −6.2…−4.2 = drop
railing((-9, -9), (-8.4, -9), G1); railing((-6.6, -9), (-3.2, -9), G1); railing((-1.2, -9), (0, -9), G1)                                    # gap x −3.2…−1.2 = drop
railing((-9, 9), (0, 9), G1)
# the furnace (solid to the 3rd level), its top platform, parapet with stair gaps, and the chimney
box(-3.5, 0, -3.5, 3.5, FT, 3.5, 'kiln', **NM); visual(-3.65, 0, -3.65, 3.65, 1.2, 3.65, 'steel', **NM)
for (x0, z0, x1, z1) in ((-3.5, -3.5, 3.5, -3.25), (-3.5, 3.25, 3.5, 3.5), (-3.5, -3.25, -3.25, 1.3), (3.25, -1.3, 3.5, 3.25)):
    box(x0, FT, z0, x1, FT + 1.0, z1, 'steel', **NM)
box(-0.8, FT, -0.8, 0.8, HALL_H + 0.4, 0.8, 'steel', **NM); visual(-1.0, HALL_H + 0.4, -1.0, 1.0, 24, 1.0, 'steel', **NM)   # chimney
stairs(-9.5, 2.15, '+x', 1.5, G1, FT, 'steel', run=0.4)                         # mezzanine → furnace top (rotated copy on the east)
# hall roof with a light well; even interior light
slab((-12.1, -12.1, 0, 12.1), HALL_H + 0.05, 'roof', [(-8, -8, -4, 8)])
for z in (-6, 0, 6): strip(-11.5, 3.95, z - 1, -11.3, 4.05, z + 1)
for x in (-8, -3): strip(x - 1, HALL_H - 0.15, -10.5, x + 1, HALL_H - 0.1, -10.2); strip(x - 1, HALL_H - 0.15, 10.2, x + 1, HALL_H - 0.1, 10.5)
strip(-1, G1 - 0.45, -10.5, 1, G1 - 0.4, -10.2, **NM); strip(-1, G1 - 0.45, 10.2, 1, G1 - 0.4, 10.5, **NM)

box(-16.4, 0, -2.6, -15.6, 3.2, 2.6, 'steel')            # blast baffle outside the west door
box(-8, 0, -16.4, -3, 3.2, -15.6, 'steel')                # blast baffle outside the north door
# hall stair: floor → mezzanine north strip (solid flight also screens the north-door ↔ west-door diagonal)
stairs(-7.5, -1.5, '-z', 1.6, 0, G1, 'steel')
# ───────────────────────── purposeful cover (each piece has a job) ─────────────────────────
box(-40, 0, 8, -35, 3.4, 11, 'steel', round=0.1)          # coal bunker A  } overlapping offset pair: no straight line
box(-37, 0, 13, -32, 3.4, 16, 'steel', round=0.1)         # coal bunker B  } Coal Alley ↔ Hopper Court
box(-24, 0, -1, -20, 3.0, 3, 'timber', round=0.05)        # scale-house crates: splits the Pump House ↔ Hall door line
box(-18, 0, 6, -15, 1.1, 7.4, 'timber')                   # pallets (waist-high)
box(-38, 0, 0.5, -36, 2.6, 4.5, 'steel', round=0.1)        # coke bin outside the Pump Gate (breaks Pump House ↔ court line)
box(-36, 0, 33.4, -32, 2.6, 36.4, 'safety', round=0.15)   # ore wagon (Rail Cut)
box(-28, 0, 37.2, -26, 1.0, 39, 'timber')                 # sleeper stack (waist-high)
box(-10, 0, 35.2, -6, 2.6, 38.2, 'safety', round=0.15)    # ore wagon
box(-8, 0, 20, -4, 3.2, 24, 'clay', round=0.2)            # clay bunker (Sort Yard)
box(-12, 0, 26, -10, 1.1, 27.2, 'timber')                 # sacks (waist-high)
box(-10, 0, -26, -6, 2.4, -22, 'steel')                   # ash bins (Ash Yard)
box(-3, 0, -24, -0.5, 1.1, -22.5, 'steel')                # skip (waist-high)
box(-53.5, 0, 9, -52, 1.1, 10.5, 'steel', round=0.4)      # drums by the Pump House south door
box(-52, 0, -36, -47, 2.8, -31, 'slag', round=0.4)        # slag heaps (Slag Yard)
box(-46, 0, -28, -42, 1.1, -25, 'slag', round=0.3)
box(-55, 0, -24, -51, 2.6, -21, 'slag', round=0.4)
box(-5.5, 0, 5, -4, 1.1, 7, 'steel')                      # ingot cart (hall floor, waist-high)
box(-11.2, G1, -11.2, -9.8, G1 + 1.0, -9.6, 'timber')     # mezzanine corner crate
# spawn yard dressing: clay bales at the exits (corner cover), sign
box(-55.5, 0, 25, -53.8, 1.2, 27, 'clay', round=0.2); box(-46, 0, 37.5, -44.4, 1.2, 39.5, 'clay', round=0.2)
box(-56, 0, 30, -53, 3.2, 33, 'kiln', round=0.4)          # spare kiln (yard landmark, blocks spawn → lane line)

# ───────────────────────── landmarks & side identity (signs are per side, not rotated) ─────────────────────────
visual(-49, 10, -33, -45, 14, -29, 'steel'); visual(-48, 14, -32, -46, 17, -30, 'olive')               # water tower over Slag Yard
visual(-12, 9.5, 21, 0, 10.2, 23, 'safety'); visual(-12, 0, 21.6, -11.4, 9.5, 22.4, 'safety')          # gantry crane over the Sort Yard
for (x, z, t, f) in ((-50, 23.6, 'CLAY YARD', 's'), (-51, 6.05, 'PUMP HOUSE', 's'), (-23, 28.05, 'KILN SHED', 's'),
                     (-32.05, -20, 'DRYING SHED', 'w'), (-18, 39.9, 'WEIGHBRIDGE', 'n')):
    sign(x, 3.2, z, 3.0, 0.6, t, '#efe6cf', f, boost=0.7, mirror=False)
for (x, z, t, f) in ((50, -23.6, 'SLAG YARD', 'n'), (51, -6.05, 'BOILER HOUSE', 'n'), (23, -28.05, 'MOULD SHED', 'n'),
                     (32.05, 20, 'PRESS SHED', 'e'), (18, -39.9, 'LAMP STORE', 's')):
    sign(x, 3.2, z, 3.0, 0.6, t, '#efe6cf', f, boost=0.7, mirror=False)
for (x, z) in ((-50, 36), (-50, 28)): strip(x - 0.3, 3.4, 39.7, x + 0.3, 3.8, 40, mat='lamp', mirror=False)
for (x, z) in ((-60, 0),): pass

# ───────────────────────── areas, spawns, routes ─────────────────────────
def area(name, r, kind, mirrorName=None, y=None, key=False, tag=None, hint='', mirror=True, floor=None):
    a = dict(name=name, rect=list(r), kind=kind, hint=hint, y=list(y) if y else [-0.5, 0.95])
    if mirrorName: a['mirrorName'] = mirrorName
    if key: a['key'] = True
    if tag: a['tag'] = tag
    if floor is not None: a['floor'] = floor
    if not mirror: a['mirror'] = False
    return a
UP = (G1 - 0.6, 7.4)
AREAS = [
    area('Clay Yard', OUT['spawn'], 'SPAWN', 'Slag Yard Spawn', tag='spawn', hint='Exits: north to Pump Lane, east to the Rail Cut'),
    area('Pump Lane', OUT['pumpLaneS'], 'SHORT', 'Pump Lane'), area('Pump Lane', OUT['pumpLaneN'], 'SHORT', 'Pump Lane'),
    area('Pump House', BLD['pump']['r'], 'INDOOR', 'Boiler House', y=(-0.5, 2.0)), area('Pump House Upstairs', BLD['pump']['r'], 'INDOOR', 'Boiler House Upstairs', y=UP, floor=1),
    area('Cinder Heap', OUT['slagYard'], 'LONG', 'Cinder Heap', key=True), area('Cinder Gate', OUT['slagGate'], 'HALL', 'Cinder Gate'),
    area('Rail Cut', OUT['railS'], 'LONG', 'Rail Cut', key=True), area('Rail Cut', OUT['railN'], 'LONG', 'Rail Cut'),
    area('Weighbridge', BLD['weigh']['r'], 'INDOOR', 'Lamp Store', y=(0, 4)), area('Lamp Store', BLD['lamp']['r'], 'INDOOR', 'Weighbridge', y=(0, 4)),
    area('Coal Alley', OUT['coalAlley'], 'HALL', 'Coal Alley'), area('Hopper Court', OUT['hopperCourt'], 'MID', 'Hopper Court', key=True),
    area('Pump Gate', OUT['pumpGate'], 'HALL', 'Pump Gate'), area('Kiln Gate', OUT['kilnGateS'], 'HALL', 'Kiln Gate'), area('Kiln Gate', OUT['kilnGateN'], 'HALL', 'Kiln Gate'),
    area('Drying Gate', OUT['dryGateS'], 'HALL', 'Drying Gate'), area('Ash Gate', OUT['ashGate'], 'HALL', 'Ash Gate'),
    area('Kiln Shed', KILN, 'INDOOR', 'Press Shed', y=(-0.5, 2.0), key=True), area('Kiln Gallery', (KILN[0], KILN[1], KILN[2], 19.6), 'INDOOR', 'Press Gallery', y=UP, floor=1),
    area('Drying Shed', BLD['drying']['r'], 'INDOOR', 'Mould Shed', y=(-0.5, 2.0)), area('Drying Loft', BLD['drying']['r'], 'INDOOR', 'Mould Loft', y=UP, floor=1, key=True),
    area('Sort Yard', OUT['sortYard'], 'MID', 'Ash Yard', key=True), area('Ash Yard', OUT['ashYard'], 'MID', 'Sort Yard'),
    area('Hopper Deck', DECK['hopperDeck'], 'ROOF', 'Hopper Deck', y=UP, floor=1, key=True), area('Pump Bridge', DECK['pumpBridge'], 'HALL', 'Pump Bridge', y=UP, floor=1),
    area('Charge Bridge', DECK['chargeBridge'], 'HALL', 'Charge Bridge', y=UP, floor=1), area('Conveyor', CONV[0], 'HALL', 'Conveyor', y=UP, floor=1), area('Conveyor', CONV[1], 'HALL', 'Conveyor', y=UP, floor=1),
    area('Furnace Hall', HALL, 'INDOOR', y=(-0.5, 2.0), key=True, mirror=False, hint='Centre: the furnace blocks every door-to-door line'),
    area('Mezzanine', HALL, 'INDOOR', y=UP, key=True, mirror=False, floor=1),
    area('Furnace Top', (-3.5, -3.5, 3.5, 3.5), 'ROOF', y=(FT - 0.6, FT + 3), key=True, mirror=False, floor=2, hint='3rd level — open to the whole mezzanine'),
]
SPAWNS = [dict(team=0, at=[x, 0, z], yaw=(0 if z < 30 else -90 if z >= 34 else -115)) for (x, z) in ((-51, 27), (-48, 27), (-51, 31), (-48, 31), (-51, 35), (-48, 36), (-46, 31))]
ROUTES = {
    'rail':  dict(kind='long', symmetric=True, pts=[[-48, 0, 34], [-42, 0, 36], [-30, 0, 36.5], [-20.5, 0, 37.5], [-15.5, 0, 34], [-8, 0, 33.6], [-6, 0, 27], [0, 0, 18]]),
    'pump':  dict(kind='short', symmetric=True, pts=[[-50, 0, 28], [-52, 0, 21], [-51, 0, 10], [-46, 0, 0], [-38.5, 0, -1.5], [-26, 0, 6], [-14, 0, 2]]),
    'deck':  dict(kind='mid', symmetric=True, pts=[[-36, 0, 24], [-33, 0, 5], [-13, 0, -8], [-30, 4.5, -6], [-22, 4.5, -1.5], [-10.5, 4.5, -1.5]]),
    'loft':  dict(kind='mid', symmetric=True, pts=[[-36, 0, 24], [-34, 0, 2], [-28, 0, -14], [-24, 0, -22], [-24, 4.5, -19], [-12, 4.5, -16.5], [-8.5, 4.5, -10.5]]),
}
CONNECTORS = [[-23, 0, 30], [-18, 0, 14], [-28, 0, -14], [-36, 0, -26], [-19, 0, -30], [-16, 0, -26], [-50, 4.5, 0], [-30, 4.5, -6]]

data = dict(id='kilnworks', name='KILNWORKS', location='Brick & tile works · overcast afternoon',
            desc='A rotationally symmetric brickworks built around a three-storey Furnace Hall: rail cuts on the flanks, sheds and lofts in between, and a fight for the furnace top.',
            swatch=['#cdbb98', '#6f7a55', '#cfa93c', '#5a5f63'], bounds=[-58, -42, 58, 42], symmetry='rotate180',
            floors=[dict(name='Ground', y=0), dict(name='Upper', y=G1), dict(name='Furnace Top', y=FT)],
            theme=THEME, materials=MATS, geometry=E, areas=AREAS, spawns=SPAWNS, routes=ROUTES, connectors=CONNECTORS, turrets=[dict(team=0, at=[-46.5, 0, 24.8])])

if '--sketch' in sys.argv:   # full-map ASCII plan from the same rectangles (rotation applied)
    rot = lambda r: (-r[2], -r[3], -r[0], -r[1])
    cells = {}
    def paint(r, ch):
        for zz in range(int(r[1]), int(r[3]), 2):
            for xx in range(int(r[0]), int(r[2]), 2): cells[(xx // 2, zz // 2)] = ch
    for half in (lambda r: r, rot):
        for k, r in OUT.items(): paint(half(r), '.')
        for k, b in BLD.items(): paint(half(b['r']), ':')
        paint(half(KILN), ':'); paint(half(DECK['hopperDeck']), '+'); paint(half(DECK['pumpBridge']), '+'); paint(half(DECK['chargeBridge']), '=')
        for r in CONV: paint(half(r), '=')
        paint(half((-8, 20, -4, 24)), 'o'); paint(half((-40, 8, -35, 11)), 'o'); paint(half((-37, 13, -32, 16)), 'o'); paint(half((-24, -1, -20, 3)), 'o')
        paint(half((-36, 33.4, -32, 36.4)), 'o'); paint(half((-10, 35.2, -6, 38.2)), 'o')
    paint(HALL, ':'); paint((-12, -12, 12, -9), '+'); paint((-12, 9, 12, 12), '+'); paint((-12, -9, -9, 9), '+'); paint((9, -9, 12, 9), '+'); paint((-3.5, -3.5, 3.5, 3.5), 'F')
    for zz in range(-40, 40, 2):
        print(f'{zz:4d} ' + ''.join(cells.get((xx // 2, zz // 2), '#') for xx in range(-56, 56, 2)))
    sys.exit()

out = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'maps', 'data', 'kilnworks.json')
with open(out, 'w') as f: json.dump(data, f, indent=1)
print(f'wrote {os.path.normpath(out)}: {len(E)} entities, {len(AREAS)} areas')
