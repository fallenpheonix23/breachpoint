#!/usr/bin/env python3
"""Generates src/maps/data/ashgrove.json from the approved Phase-2 design (docs/maps/B_ASHGROVE.md).
West half (x < 0) is authored; the loader mirrors it across x = 0. Centre buildings are authored once.
Coordinates: x east, z south, y up (metres)."""
import json, math, os

E = []          # geometry entities
T = 0.4         # wall thickness
G1, G2, ROOF = 4.0, 8.0, 8.3   # upper floor level, upper ceiling, roof slab top

def box(x0, y0, z0, x1, y1, z1, mat, **kw):
    E.append(dict(type='box', min=[x0, y0, z0], max=[x1, y1, z1], mat=mat, **kw))
def slab(r, y, mat, holes=(), t=0.3, **kw):
    E.append(dict(type='floor', rect=list(r), y=y, t=t, mat=mat, holes=[list(h) for h in holes], **kw))
def stairs(fx, fz, d, w, y, to, mat='oak', run=0.5, rail=True, **kw):
    E.append(dict(type='stairs', **{'from': [fx, fz]}, dir=d, w=w, y=y, to=to, mat=mat, run=run, **kw))
    if not rail: return
    # balustrade on both long sides (movement-only): stairs can only be entered at the bottom step
    steps = math.ceil((to - y) / 0.3 - 1e-6); L = steps * run; s0 = 0.6
    for side in (-1, 1):
        if d in ('+x', '-x'):
            sg = 1 if d == '+x' else -1; zz = fz + side * (w / 2 + 0.06)
            railing((fx + sg * s0, zz), (fx + sg * L, zz), y, **({'mirror': kw['mirror']} if 'mirror' in kw else {}))
        else:
            sg = 1 if d == '+z' else -1; xx = fx + side * (w / 2 + 0.06)
            railing((xx, fz + sg * s0), (xx, fz + sg * L), y, **({'mirror': kw['mirror']} if 'mirror' in kw else {}))
def ramp(r, d, y0, y1, mat, **kw): E.append(dict(type='ramp', rect=list(r), dir=d, y0=y0, y1=y1, mat=mat, **kw))
def railing(a, b, y=0, **kw): E.append(dict(type='railing', **{'from': list(a), 'to': list(b)}, y=y, **kw))
def prop(kind, x, y, z, **kw): E.append(dict(type='prop', kind=kind, at=[x, y, z], **kw))
def sign(x, y, z, w, h, text, color, facing, **kw): E.append(dict(type='sign', at=[x, y, z], w=w, h=h, text=text, color=color, facing=facing, **kw))
def visual(x0, y0, z0, x1, y1, z1, mat, **kw): box(x0, y0, z0, x1, y1, z1, mat, layer='visual', **kw)

def walls(r, y, h, mat, open_=None, frame='sage', **kw):
    """Four walls inside rect r=(x0,z0,x1,z1) from height y, h tall. open_ = {'n'|'s'|'w'|'e': [(centre, w, oy, oh, kind)]}
    (centre is an x for n/s sides, a z for w/e sides; oy is relative to y)."""
    x0, z0, x1, z1 = r; open_ = open_ or {}
    def ops(side, start):
        return [dict(at=abs(c - start), w=w, y=oy, h=oh, kind=k) for (c, w, oy, oh, k) in open_.get(side, [])]
    E.append(dict(type='wall', **{'from': [x0, z0 + T / 2], 'to': [x1, z0 + T / 2]}, y=y, h=h, t=T, mat=mat, frame=frame, openings=ops('n', x0), **kw))
    E.append(dict(type='wall', **{'from': [x0, z1 - T / 2], 'to': [x1, z1 - T / 2]}, y=y, h=h, t=T, mat=mat, frame=frame, openings=ops('s', x0), **kw))
    E.append(dict(type='wall', **{'from': [x0 + T / 2, z0 + T], 'to': [x0 + T / 2, z1 - T]}, y=y, h=h, t=T, mat=mat, frame=frame, openings=ops('w', z0 + T), **kw))
    E.append(dict(type='wall', **{'from': [x1 - T / 2, z0 + T], 'to': [x1 - T / 2, z1 - T]}, y=y, h=h, t=T, mat=mat, frame=frame, openings=ops('e', z0 + T), **kw))

DOOR = lambda c, w=1.8: (c, w, 0, 2.4, 'door')
WIN = lambda c, w=1.4: (c, w, 1.0, 1.2, 'window')

# ───────────────────────── outdoor ground (west half) ─────────────────────────
OUT = {
    'spawn': (-80, -8, -68, 8), 'spawnN': (-77, -12, -73, -8), 'spawnS': (-72, 8, -69, 12),
    'backLane': (-76, -36, -66, -8), 'alleyStart': (-66, -36, -52, -30), 'junction': (-66, -12, -58, 12), 'quay': (-76, 8, -66, 30),
    'innYard': (-56, -30, -44, -24), 'cooper': (-44, -38, -34, -26), 'stairLane': (-44, -26, -41, -12), 'bakerYard': (-34, -32, -24, -24),
    'alleyArch': (-24, -32, -20, -28), 'wellYard': (-20, -38, -6, -24),
    'street': (-58, -12, -40, 9), 'street2': (-36, -12, -14, 9), 'archGate': (-40, -6, -36, 2), 'square': (-14, -12, 0, 12),
    'arcade': (-40, 9, -36, 22), 'fishLane': (-17, 9, -14, 22), 'canalRoad': (-66, 22, 0, 30),
}
# ground buildings (west half): rect, ground-floor openings, upper-floor openings, stair (fx, fz, dir, w), upper?
BLD = {
    'inn':    dict(r=(-54, -24, -44, -12), g={'n': [DOOR(-51)], 's': [DOOR(-46.5), WIN(-51.8)]}, u={'s': [WIN(-51.5), WIN(-46.5)]}, st=(-52.9, -23.4, '+z', 1.6)),
    'bakery': dict(r=(-32, -24, -24, -12), g={'n': [DOOR(-28.5)], 's': [DOOR(-25.6), WIN(-29.6)]}, u={'s': [DOOR(-28.5, 1.6), WIN(-25.6)]}, st=(-31.1, -23.4, '+z', 1.6)),
    'tailor': dict(r=(-18, -24, -10, -12), g={'n': [DOOR(-16)], 's': [DOOR(-12.6)]}, u={'s': [WIN(-15.6), WIN(-12.2)]}, st=(-11.0, -23.4, '+z', 1.6)),
    'chemist': dict(r=(-54, 9, -46, 22), g={'n': [DOOR(-48)], 's': [DOOR(-51.3)]}, u={'n': [WIN(-50)], 's': [WIN(-52), WIN(-48)]}, st=(-53.0, 10.2, '+z', 1.6)),
    'post':   dict(r=(-30, 9, -20, 22), g={'n': [DOOR(-25), WIN(-22.2)], 's': [DOOR(-28.2)]}, u={'n': [WIN(-27.5), WIN(-22.5)], 's': [WIN(-27.5), WIN(-22.5)]}, st=(-21.0, 10.2, '+z', 1.6)),
}
# upper-level walkways / rooms built over mass or bridging lanes (floor at G1)
UPPER = {
    'terraceWalk': (-44, -24, -32, -18), 'walk2': (-24, -24, -18, -18), 'archRoom': (-40, -18, -36, 15), 'southWalk': (-46, 15, -30, 22),
}
UPPER_WIN = {'archRoom': {'w': [WIN(-9.5), WIN(-1.5), WIN(6.5)], 'e': [WIN(-5.5), WIN(2.5), WIN(10.5)]}, 'southWalk': {'s': [WIN(-42), WIN(-34)]}}
# centre buildings (span x = 0, authored once)
CENTRE = {'chapel': (-6, -36, 6, -24), 'square': (-14, -12, 14, 12), 'townhall': (-14, 12, 14, 22), 'lock': (-5, 22, 5, 30)}

# ───────────────────────── materials / theme ─────────────────────────
MATS = {
    'cobble': dict(tex='stone', color='#9a948a', scale=2.2, rough=0.95, normal=0.45),
    'band':   dict(tex='plaster', color='#a8a08f', scale=3, rough=0.92, normal=0.5),     # mid-tone 0–4 m band
    'lime':   dict(tex='plaster', color='#d9cfb8', scale=3, rough=0.9, normal=0.5),      # limestone upper walls
    'slate':  dict(tex='concrete', color='#5f6670', scale=3, rough=0.8),
    'oak':    dict(tex='wood', color='#8c8370', scale=2, rough=0.8),
    'floorwood': dict(tex='wood', color='#a59a86', scale=2.5, rough=0.8),
    'sage':   dict(tex='wood', color='#7f9a7a', scale=1.5, rough=0.7),
    'ochre':  dict(tex='metal', color='#c9a24e', scale=2, rough=0.5, metal=0.3),
    'chapel': dict(tex='stone', color='#cfc5ae', scale=2.4, rough=0.9),
    'verdigris': dict(tex='metal', color='#6f9e8a', scale=2, rough=0.5, metal=0.5),
    'crane':  dict(tex='metal', color='#cfb24a', scale=2, rough=0.5, metal=0.4),
    'quay':   dict(tex='stone', color='#8d887e', scale=2.5, rough=0.95),
    'shutter': dict(tex='wood', color='#6d8a6a', scale=1, rough=0.7),
    'copper': dict(tex='metal', color='#b9864f', scale=1.5, rough=0.4, metal=0.7),
    'hay':    dict(tex='cloth', color='#cdb06a', scale=1, rough=1),
    'coach':  dict(tex='plaster', color='#a3b89d', scale=2, rough=0.7),
}
THEME = {
    'sky': {'top': '#6f93b8', 'horizon': '#e3e0d6', 'bottom': '#c9c7bd', 'sun': '#fff2d8', 'elev': 50, 'az': 150, 'clouds': 0.45, 'stars': 0},
    'sun': {'color': '#fff1dc', 'intensity': 2.4}, 'hemi': {'sky': '#e2e8f0', 'ground': '#a49a86', 'intensity': 1.1},
    'fog': {'color': '#dcdcd4', 'near': 120, 'far': 420}, 'exposure': 1.0, 'env': 0.4,
    'grade': {'sat': 1.04, 'contrast': 1.03, 'vignette': 0.12}, 'bloom': 0.2, 'weather': 'none', 'ambient': 'town', 'stepOut': 'stone',
}

# ───────────────────────── boundary, ground, canal ─────────────────────────
E.append(dict(type='ground', rect=[-82, -42, 82, 30], mat='cobble', mirror=False))
box(-82, 0, -42, -0.0, 12, -40, 'lime')                 # north boundary mass (mirrored)
box(-82, 0, -40, -80, 12, 30, 'lime')                   # west boundary
E.append(dict(type='water', rect=[-90, 30, 90, 46], y=-1.4, color=0x6a8580, deep=0x3e5552, mirror=False))   # doc: teal-grey, not team blue
box(-82, -2, 30, 0, 0, 30.6, 'quay')                    # quay edge
box(-82, 0, 30.05, 0, 3.2, 30.35, None, layer='move')   # invisible barrier: no wading into the canal
railing((-76, 30.2), (0, 30.2), 0)
box(-90, 0, 40, 0, 9, 46, 'lime')                       # far-bank warehouses (plain backdrop)
visual(-90, 9, 40, 0, 9.3, 46, 'slate')

# ───────────────────────── mass (solid town blocks between lanes) ─────────────────────────
def inside(x, z, r): return r[0] <= x < r[2] and r[1] <= z < r[3]
open_rects = list(OUT.values()) + [b['r'] for b in BLD.values()] + [c for c in CENTRE.values()]
under_upper = list(UPPER.values())
X0, Z0, X1, Z1 = -80, -40, 0, 30
H = {}
for z in range(Z0, Z1):
    for x in range(X0, X1):
        cx, cz = x + 0.5, z + 0.5
        if any(inside(cx, cz, r) for r in open_rects): continue
        H[(x, z)] = 3.7 if any(inside(cx, cz, r) for r in under_upper) else 9.0
used = set()
for z in range(Z0, Z1):
    for x in range(X0, X1):
        if (x, z) not in H or (x, z) in used: continue
        h = H[(x, z)]; w = 1
        while (x + w, z) in H and H[(x + w, z)] == h and (x + w, z) not in used: w += 1
        d = 1
        while all((x + k, z + d) in H and H[(x + k, z + d)] == h and (x + k, z + d) not in used for k in range(w)): d += 1
        for a in range(w):
            for b in range(d): used.add((x + a, z + b))
        box(x, 0, z, x + w, min(h, 4), z + d, 'band')
        if h > 4: box(x, 4, z, x + w, h, z + d, 'lime')
        if h > 4: visual(x, h, z, x + w, h + 0.04, z + d, 'slate')   # roof cap (abutting caps never overlap)

# cornice strips only along exposed roof edges, merged into continuous runs (no overlapping trim pieces)
def cornices():
    runs = []
    for (x, z), h in H.items():
        if h <= 4: continue
        for dx, dz in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            if H.get((x + dx, z + dz), 0) >= h: continue
            runs.append((dx, dz, h, x, z))
    done = set()
    for dx, dz, h, x, z in sorted(runs, key=lambda r: (r[0], r[1], r[2], r[4], r[3]) if r[0] == 0 else (r[0], r[1], r[2], r[3], r[4])):
        if (dx, dz, h, x, z) in done: continue
        n = 0
        while (dx, dz, h, x + (n if dx == 0 else 0), z + (n if dz == 0 else 0)) in set(runs): done.add((dx, dz, h, x + (n if dx == 0 else 0), z + (n if dz == 0 else 0))); n += 1
        o, i = 0.08, 0.3; y0, y1 = h - 0.35, h + 0.06
        if dz == -1: visual(x, y0, z - o, x + n, y1, z + i, 'slate')
        if dz == 1:  visual(x, y0, z + 1 - i, x + n, y1, z + 1 + o, 'slate')
        if dx == -1: visual(x - o, y0, z, x + i, y1, z + n, 'slate')
        if dx == 1:  visual(x + 1 - i, y0, z, x + 1 + o, y1, z + n, 'slate')
cornices()

# fake upper windows + shutters on mass facades that face open ground (pure decoration, above 4 m)
def facade_windows():
    for name, r in OUT.items():
        if name in ('spawn', 'spawnN', 'spawnS'): continue
        x0, z0, x1, z1 = r
        for side in 'nswe':
            if side in 'ns':
                zz = z0 - 0.5 if side == 'n' else z1 + 0.5; zf = z0 if side == 'n' else z1; s = -1 if side == 'n' else 1
                for x in [x0 + 2 + 3.6 * i for i in range(int((x1 - x0 - 3) / 3.6) + 1)]:
                    if H.get((math.floor(x), math.floor(zz)), 0) >= 8:
                        visual(x - 0.6, 5.0, zf - 0.04 * (s < 0) , x + 0.6, 6.4, zf + 0.04 * (s > 0), 'glass')
                        visual(x - 0.95, 5.0, zf - 0.08 * (s < 0), x - 0.65, 6.4, zf + 0.08 * (s > 0), 'shutter')
                        visual(x + 0.65, 5.0, zf - 0.08 * (s < 0), x + 0.95, 6.4, zf + 0.08 * (s > 0), 'shutter')
            else:
                xx = x0 - 0.5 if side == 'w' else x1 + 0.5; xf = x0 if side == 'w' else x1; s = -1 if side == 'w' else 1
                for z in [z0 + 2 + 3.6 * i for i in range(int((z1 - z0 - 3) / 3.6) + 1)]:
                    if H.get((math.floor(xx), math.floor(z)), 0) >= 8:
                        visual(xf - 0.04 * (s < 0), 5.0, z - 0.6, xf + 0.04 * (s > 0), 6.4, z + 0.6, 'glass')
# facade_windows()  — removed: plain facades read better behind enemies

# ───────────────────────── buildings (west half) ─────────────────────────
def hole_for(st, w):
    fx, fz, d, _ = st; L = 7.0
    if d == '+z': return (fx - w / 2, fz, fx + w / 2, fz + L)
    if d == '-z': return (fx - w / 2, fz - L, fx + w / 2, fz)
    if d == '+x': return (fx, fz - w / 2, fx + L, fz + w / 2)
    return (fx - L, fz - w / 2, fx, fz + w / 2)

# upper-floor connection doors: shared edges between upper rects (incl. buildings' upper floors)
UP_ALL = {**{k: v['r'] for k, v in BLD.items()}, **UPPER}
def shared_doors():
    res = {k: {} for k in UP_ALL}
    names = list(UP_ALL)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            A, B = UP_ALL[a], UP_ALL[b]
            for sa, sb, axis in (('e', 'w', 'x'), ('w', 'e', 'x'), ('s', 'n', 'z'), ('n', 's', 'z')):
                ea = A[2] if sa == 'e' else A[0] if sa == 'w' else A[3] if sa == 's' else A[1]
                eb = B[0] if sb == 'w' else B[2] if sb == 'e' else B[1] if sb == 'n' else B[3]
                if abs(ea - eb) > 0.01: continue
                lo, hi = (max(A[1], B[1]), min(A[3], B[3])) if axis == 'x' else (max(A[0], B[0]), min(A[2], B[2]))
                if hi - lo < 2: continue
                c = (lo + hi) / 2 + (1.2 if hi - lo > 4 else 0)
                res[a].setdefault(sa, []).append(DOOR(c, 1.8)); res[b].setdefault(sb, []).append(DOOR(c, 1.8))
                if axis == 'x': box(ea - 0.6, G1 - 0.3, c - 0.95, ea + 0.6, G1 + 0.01, c + 0.95, 'floorwood')
                else: box(c - 0.95, G1 - 0.3, ea - 0.6, c + 0.95, G1 + 0.01, ea + 0.6, 'floorwood')
    return res
SD = shared_doors()

COUNTER = {'inn': (-50.2, -18.3, -47.4, -17.7), 'bakery': (-28.4, -18.3, -25.8, -17.7), 'tailor': (-15.5, -18.3, -13.2, -17.7),
           'chemist': (-50.5, 14.6, -47, 15.2), 'post': (-27.8, 15.2, -25.2, 15.8)}
for name, b in BLD.items():
    cx0, cz0, cx1, cz1 = COUNTER[name]; box(cx0, 0, cz0, cx1, 2.3, cz1, 'oak')   # shop counter / shelving (breaks door-to-door lines)
    r = b['r']
    walls(r, 0, G1, 'band', b['g'])
    up = {k: list(v) for k, v in b['u'].items()}
    for side, ops in SD[name].items(): up.setdefault(side, []).extend(ops)
    walls(r, G1, G2 - G1, 'lime', up)
    st = b['st']; hole = hole_for(st, st[3])
    slab((r[0] + T, r[1] + T, r[2] - T, r[3] - T), G1, 'floorwood', [hole])
    stairs(st[0], st[1], st[2], st[3], 0, G1)
    slab((r[0] - 0.15, r[1] - 0.15, r[2] + 0.15, r[3] + 0.15), ROOF, 'slate')
    cx, cz = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    for yy in (G1 - 0.32, G2 - 0.02):
        E.append(dict(type='lightstrip', min=[cx - 1.5, yy - 0.05, cz - 0.15], max=[cx + 1.5, yy, cz + 0.15], mat='light'))

for name, r in UPPER.items():
    ops = {k: list(v) for k, v in UPPER_WIN.get(name, {}).items()}
    for side, o in SD[name].items(): ops.setdefault(side, []).extend(o)
    walls(r, G1, G2 - G1, 'lime', ops)
    holes = [(-39, -1, -37, 1)] if name == 'archRoom' else []        # murder-hole: one-way drop into the arch passage
    slab((r[0] + T, r[1] + T, r[2] - T, r[3] - T), G1, 'floorwood', holes)
    # fill the 0.3 m band under the upper walls (the slab is inset; over open ground this left a gap)
    x0, z0, x1, z1 = r
    for bx in ((x0, z0, x1, z0 + T), (x0, z1 - T, x1, z1), (x0, z0 + T, x0 + T, z1 - T), (x1 - T, z0 + T, x1, z1 - T)):
        box(bx[0], G1 - 0.32, bx[1], bx[2], G1, bx[3], 'lime')
    slab((r[0] - 0.15, r[1] - 0.15, r[2] + 0.15, r[3] + 0.15), ROOF, 'slate')
    cx, cz = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
    E.append(dict(type='lightstrip', min=[cx - 0.8, G2 - 0.07, cz - 0.15], max=[cx + 0.8, G2 - 0.02, cz + 0.15], mat='light'))
railing((-39, -1), (-37, -1), G1)   # lip around the hatch on one side only

# alley arch (covered passage) and arch-gate passage ceilings
slab(OUT['alleyArch'], 3.2, 'slate'); box(-24, 3.2, -32, -20, 9, -28, 'lime')
visual(-40.1, 3.3, -6.1, -35.9, 3.7, 2.1, 'oak')    # arch beam under the Arch Room
box(-40.6, 0, -6, -39.6, 3.7, -0.4, 'band')           # west pier: covers the south 5.6 m of the arch mouth
box(-36.4, 0, -3.6, -35.4, 3.7, 2, 'band')            # east pier: covers the north 5.6 m (offset → S-bend)
# Bakery balcony (one-way drop to the street)
slab((-30, -12, -27, -10.2), G1, 'oak'); railing((-30, -10.2), (-28.6, -10.2), G1)

# ───────────────────────── centre: chapel ─────────────────────────
C = dict(mirror=False)
E.append(dict(type='wall', **{'from': [-6, -35.8], 'to': [6, -35.8]}, h=6, t=T, mat='chapel', frame='oak', mirror=False))
E.append(dict(type='wall', **{'from': [-6, -24.2], 'to': [6, -24.2]}, h=6, t=T, mat='chapel', frame='oak', mirror=False))
E.append(dict(type='wall', **{'from': [-5.8, -35.6], 'to': [-5.8, -24.4]}, h=6, t=T, mat='chapel', frame='oak', mirror=False, openings=[dict(at=4.1, w=2, y=0, h=2.6, kind='door')]))
E.append(dict(type='wall', **{'from': [5.8, -35.6], 'to': [5.8, -24.4]}, h=6, t=T, mat='chapel', frame='oak', mirror=False, openings=[dict(at=4.1, w=2, y=0, h=2.6, kind='door')]))
slab((-6.2, -36.2, 6.2, -23.8), 6.3, 'slate', mirror=False)
box(-1, 0, -34.6, 1, 3.2, -28.4, 'oak', mirror=False)                       # altar screen: no line through the doors
for zz in (-34.4, -27.4):
    for xx in (-4.2, 2.6): box(xx, 0, zz, xx + 1.6, 1.0, zz + 0.8, 'oak', mirror=False)  # pews (waist-high cover)
visual(-1.2, 6.3, -31.2, 1.2, 9.5, -28.8, 'chapel', mirror=False)                 # bell-cote
E.append(dict(type='lightstrip', min=[-3, 5.9, -30.3], max=[3, 5.95, -29.7], mat='lamp', mirror=False))

# ───────────────────────── centre: market square, hall, clock top ─────────────────────────
B0 = 0.9                       # plinth height
HG = B0 + 4.0                  # gallery floor 4.9
CT = HG + 4.3                  # clock top 9.2
box(-11, 0, -10, 11, B0, 10, 'quay', mirror=False)                                  # plinth
ramp((-15, -4, -11, 4), '+x', 0, B0, 'quay', mirror=False)
ramp((11, -4, 15, 4), '-x', 0, B0, 'quay', mirror=False)
stairs(0, -12, '+z', 12, 0, B0, 'quay', run=0.66, rail=False, mirror=False)
stairs(0, 12, '-z', 12, 0, B0, 'quay', run=0.66, rail=False, mirror=False)
# hall ground walls (y 0.9–4.9): doors W and E (aligned → central pillar), door S
E.append(dict(type='wall', **{'from': [-8, -7.8], 'to': [8, -7.8]}, y=B0, h=3.99, t=T, mat='lime', frame='oak', mirror=False))
E.append(dict(type='wall', **{'from': [-8, 7.8], 'to': [8, 7.8]}, y=B0, h=4, t=T, mat='lime', frame='oak', mirror=False, openings=[dict(at=8, w=2.2, y=0, h=2.6, kind='door')]))
E.append(dict(type='wall', **{'from': [-7.8, -7.6], 'to': [-7.8, 7.6]}, y=B0, h=4, t=T, mat='lime', frame='oak', mirror=False, openings=[dict(at=7.6, w=2.2, y=0, h=2.6, kind='door')]))
E.append(dict(type='wall', **{'from': [7.8, -7.6], 'to': [7.8, 7.6]}, y=B0, h=4, t=T, mat='lime', frame='oak', mirror=False, openings=[dict(at=7.6, w=2.2, y=0, h=2.6, kind='door')]))
box(-1.5, B0, -2.5, 1.5, HG - 0.3, 2.5, 'verdigris', mirror=False)                 # central pillar / blocker
stairs(-6.8, -6.8, '+x', 1.6, B0, HG, 'oak', run=0.45, mirror=False)
stairs(6.8, -6.8, '-x', 1.6, B0, HG, 'oak', run=0.45, mirror=False)
slab((-7.99, -7.99, 7.99, 7.99), HG, 'floorwood', [(-6.9, -7.7, -0.4, -5.9), (0.4, -7.7, 6.9, -5.9)], mirror=False)
# gallery parapet (1.0 m) with drop gaps west and east
E.append(dict(type='wall', **{'from': [-8, -7.9], 'to': [8, -7.9]}, y=HG, h=1.0, t=0.25, mat='lime', mirror=False))
E.append(dict(type='wall', **{'from': [-8, 7.9], 'to': [8, 7.9]}, y=HG, h=CT - HG + 0.2, t=0.3, mat='lime', mirror=False))   # full height beside the clock-top stairs
for x in (-7.9, 7.9):
    E.append(dict(type='wall', **{'from': [x, -7.8], 'to': [x, 7.8]}, y=HG, h=1.0, t=0.25, mat='lime', mirror=False, openings=[dict(at=10.5, w=2.2, y=0, h=1.0, kind='hole')]))
for (x, z) in ((-7.8, -7.8), (7.4, -7.8), (-7.8, 7.4), (7.4, 7.4)):
    box(x, HG, z, x + 0.4, CT + 2.6, z + 0.4, 'lime', mirror=False)                 # corner pillars
# clock top (3rd level) + stairs from the gallery
stairs(-6.6, 6.8, '+x', 1.6, HG, CT, 'oak', run=0.4, mirror=False)
stairs(6.6, 6.8, '-x', 1.6, HG, CT, 'oak', run=0.4, mirror=False)
slab((-4, -4, 4, 6), CT, 'oak', mirror=False)
slab((-0.7, 6, 0.7, 7.65), CT, 'oak', mirror=False)                                  # landing between the two stair tops
box(-4, CT - 3.2, -1, 4, CT - 0.3, 1, 'verdigris', mirror=False)                    # clock housing under the platform
for (a, b) in (((-4, -4), (4, -4)),): E.append(dict(type='wall', **{'from': list(a), 'to': list(b)}, y=CT, h=1.0, t=0.25, mat='lime', mirror=False))
for x in (-3.9, 3.9): E.append(dict(type='wall', **{'from': [x, -3.9], 'to': [x, 6]}, y=CT, h=1.0, t=0.25, mat='lime', mirror=False))
visual(-5, CT + 2.6, -5, 5, CT + 3.0, 8.4, 'verdigris', mirror=False)               # canopy roof
visual(-1.6, CT + 3.0, -1.6, 1.6, CT + 5.5, 1.6, 'verdigris', mirror=False)         # spire
for f, (x, z) in (('n', (0, -8.05)), ('s', (0, 8.05)), ('w', (-8.05, 0)), ('e', (8.05, 0))):
    sign(x, CT - 1.4, z, 2.2, 2.2, '◷', '#f4ead2', f, boost=1.3, mirror=False)
E.append(dict(type='lightstrip', min=[-2, HG - 0.35, 3.5], max=[2, HG - 0.3, 4.0], mat='light', mirror=False))

# ───────────────────────── centre: town hall ─────────────────────────
TH = CENTRE['townhall']
E.append(dict(type='wall', **{'from': [-14, 12.2], 'to': [14, 12.2]}, h=4, t=T, mat='band', frame='sage', mirror=False,
              openings=[dict(at=1.5, w=1.8, y=0, h=2.4, kind='door'), dict(at=26.5, w=1.8, y=0, h=2.4, kind='door')]))
E.append(dict(type='wall', **{'from': [-14, 21.8], 'to': [14, 21.8]}, h=4, t=T, mat='band', frame='sage', mirror=False,
              openings=[dict(at=6, w=1.8, y=0, h=2.4, kind='door'), dict(at=22, w=1.8, y=0, h=2.4, kind='door')]))
E.append(dict(type='wall', **{'from': [-13.8, 12.4], 'to': [-13.8, 21.6]}, h=4, t=T, mat='band', mirror=False))
E.append(dict(type='wall', **{'from': [13.8, 12.4], 'to': [13.8, 21.6]}, h=4, t=T, mat='band', mirror=False))
E.append(dict(type='wall', **{'from': [-14, 12.2], 'to': [14, 12.2]}, y=G1, h=4, t=T, mat='lime', frame='sage', mirror=False,
              openings=[dict(at=8, w=1.4, y=1.0, h=1.2, kind='window'), dict(at=14, w=1.8, y=0, h=2.4, kind='door'), dict(at=20, w=1.4, y=1.0, h=1.2, kind='window')]))
E.append(dict(type='wall', **{'from': [-14, 21.8], 'to': [14, 21.8]}, y=G1, h=4, t=T, mat='lime', frame='sage', mirror=False,
              openings=[dict(at=6, w=1.4, y=1.0, h=1.2, kind='window'), dict(at=22, w=1.4, y=1.0, h=1.2, kind='window')]))
E.append(dict(type='wall', **{'from': [-13.8, 12.4], 'to': [-13.8, 21.6]}, y=G1, h=4, t=T, mat='lime', mirror=False))
E.append(dict(type='wall', **{'from': [13.8, 12.4], 'to': [13.8, 21.6]}, y=G1, h=4, t=T, mat='lime', mirror=False))
stairs(-10.5, 13.2, '+x', 1.6, 0, G1, 'oak', mirror=False)
stairs(10.5, 13.2, '-x', 1.6, 0, G1, 'oak', mirror=False)
slab((-13.6, 12.4, 13.6, 21.6), G1, 'floorwood', [(-10.5, 12.4, -3.5, 14.0), (3.5, 12.4, 10.5, 14.0)], mirror=False)
slab((-14.15, 11.85, 14.15, 22.15), ROOF, 'slate', mirror=False)
slab((-3, 10.2, 3, 12), G1, 'oak', mirror=False)                                     # north balcony (one-way drop)
railing((-3, 10.2), (-1, 10.2), G1, mirror=False); railing((1, 10.2), (3, 10.2), G1, mirror=False)
box(-3.3, G1, 10.2, -2.9, G1 + 2.6, 12, 'lime', mirror=False); box(2.9, G1, 10.2, 3.3, G1 + 2.6, 12, 'lime', mirror=False)   # balcony cheeks
box(-1.2, 0, 15.5, 1.2, 3.0, 19.5, 'oak', mirror=False)                             # interior blocker (no line N→S doors)
for x in (-6, 6): E.append(dict(type='lightstrip', min=[x - 1, G1 - 0.35, 17], max=[x + 1, G1 - 0.3, 17.4], mat='light', mirror=False))

# ───────────────────────── centre: lock house ─────────────────────────
E.append(dict(type='wall', **{'from': [-5, 22.2], 'to': [5, 22.2]}, h=3.6, t=T, mat='band', mirror=False))
E.append(dict(type='wall', **{'from': [-4.8, 22.4], 'to': [-4.8, 29.8]}, h=3.6, t=T, mat='band', frame='sage', mirror=False, openings=[dict(at=2.4, w=2.2, y=0, h=2.4, kind='door')]))
E.append(dict(type='wall', **{'from': [4.8, 22.4], 'to': [4.8, 29.8]}, h=3.6, t=T, mat='band', frame='sage', mirror=False, openings=[dict(at=2.4, w=2.2, y=0, h=2.4, kind='door')]))
slab((-5.2, 22, 5.2, 30.4), 3.9, 'slate', mirror=False)
box(-1, 0, 22.4, 1, 3.2, 27.4, 'ochre', mirror=False)                                  # lock-gear housing (blocker)
E.append(dict(type='lightstrip', min=[-2.5, 3.5, 28.4], max=[2.5, 3.55, 28.8], mat='lamp', mirror=False))
visual(-4.5, -1.4, 30.6, -3.8, 0.4, 39, 'oak', mirror=False); visual(3.8, -1.4, 30.6, 4.5, 0.4, 39, 'oak', mirror=False)   # lock gates

# ───────────────────────── lanes: deliberate cover / props ─────────────────────────
box(-41, 0, -30, -38, 2.2, -27, 'oak')                                   # Cooper's barrel stack (breaks the yard-to-yard line)
for (x, z) in ((-42.5, -36.5), (-36, -36.6), (-35.5, -35.4)): prop('barrel', x, 0, z)
E.append(dict(type='box', min=[-14.2, 0, -32.2], max=[-11.8, 1.0, -29.8], mat='quay', round=0.3))      # the well (waist-high)
visual(-14.3, 1.0, -32.3, -14.1, 3.0, -32.1, 'oak'); visual(-11.9, 1.0, -29.9, -11.7, 3.0, -29.7, 'oak'); visual(-14.6, 3.0, -32.6, -11.4, 3.25, -29.4, 'slate')
prop('crate', -32.5, 0, -30.8); prop('crate', -31.3, 0, -30.8)          # Baker's yard woodpile (corner cover)
def kiosk(x0, z0, x1, z1, y=0):
    box(x0, y, z0, x1, y + 2.9, z1, 'band'); visual(x0 - 0.3, y + 2.9, z0 - 0.3, x1 + 0.3, y + 3.15, z1 + 0.3, 'slate')
    box(x0 - 0.02, y + 0.9, (z0 + z1) / 2 - 0.8, x0, y + 1.0, (z0 + z1) / 2 + 0.8, 'oak', layer='visual')   # counter ledge
kiosk(-26, -9, -23, -6); kiosk(-26, 3, -23, 6)
kiosk(-11, -12, -9.4, -10.4); kiosk(-11, 10.4, -9.4, 12)         # square kiosks against the shopfronts (2.4 m gap to the hall)
for z0, z1 in ((-10.6, -8.0), (8.0, 10.6)):                          # market crosses against the hall (1.4 m gap to the shopfronts)
    box(-0.8, B0, z0, 0.8, B0 + 3.4, z1, 'verdigris', mirror=False); visual(-0.3, B0 + 3.4, (z0 + z1) / 2 - 0.3, 0.3, B0 + 4.4, (z0 + z1) / 2 + 0.3, 'verdigris', mirror=False)
box(-63, 0, -6, -61, 1.0, -2, 'quay', round=0.1)                         # horse trough (junction)
box(-48, 0, 22.4, -42, 2.8, 26.2, 'ochre', round=0.15); visual(-48, 2.8, 22.6, -45.5, 3.4, 26.0, 'ochre')   # delivery truck
box(-30, 0, 25, -26, 6, 30, 'crane')                                     # crane base
# Canal Road chicane: the truck now reaches 26.2 and a cargo stack covers the canal side right behind it
box(-41.6, 0, 25.6, -39.2, 2.5, 29.6, 'oak', round=0.04); visual(-41.4, 2.5, 26.0, -39.6, 2.9, 28.0, 'hay')   # crate pallets + sacks
# Fish Lane: two buttresses that overlap → no straight look from the High Street to the canal
box(-17, 0, 13.6, -15.3, 3.6, 14.2, 'band'); box(-15.7, 0, 16.2, -14, 3.6, 16.8, 'band')
box(-67, 0, 8, -65, 3.6, 10, 'band'); visual(-67.2, 3.6, 7.8, -64.8, 3.9, 10.2, 'slate')   # quay gate pier: Junction ↔ Quay Lane opening narrowed to 2 m
# Junction hay wagon (breaks the junction ↔ quay diagonal)
box(-61.5, 0, 5, -58.5, 1.8, 8.5, 'oak', round=0.06); box(-61.3, 1.8, 5.2, -58.7, 2.7, 8.3, 'hay', round=0.15)
# bunting banner over the street, 4.4–7.4 m (shot layer: blocks elevated lines from the square's upper floors along the street)
box(-16.6, 4.4, -6, -16.45, 7.4, 3, 'sage', layer='shot'); visual(-16.6, 7.4, -12, -16.5, 7.48, 9, 'oak')
visual(-28.6, 6, 26.6, -27.4, 14, 27.8, 'crane'); visual(-29, 13.6, 20, -27, 14.4, 38, 'crane')
for x in (-60, -52, -36, -20, -10): E.append(dict(type='box', min=[x - 0.25, 0, 29.2], max=[x + 0.25, 0.7, 29.7], mat='quay'))   # bollards
for (x, z) in ((-64, 34), (-38, 35), (-14, 34)): visual(x - 4, -0.9, z - 1.2, x + 4, 0.3, z + 1.2, 'sage'); visual(x - 2.5, 0.3, z - 0.9, x + 1.5, 1.4, z + 0.9, 'lime')   # narrowboats
# alley wall lamps
for (x, z, f) in ((-70, -20, 'x'), (-60, -33, 'z'), (-50, -29.8, 'z'), (-39, -37.8, 'z'), (-29, -31.8, 'z'), (-13, -37.8, 'z'), (-72, 18, 'x'), (-40, 29.4, 'z')):
    E.append(dict(type='lightstrip', min=[x - 0.25, 3.0, z - 0.25], max=[x + 0.25, 3.4, z + 0.25], mat='lamp'))
# hanging shop signs (West side only; East gets its own text)
for (x, z, t, side) in ((-49, -11.6, 'THE COACH INN', 'W'), (-28, -11.6, 'BAKERY', 'W'), (-14.5, -11.6, 'TAILOR', 'W'), (-50, 8.6, 'CHEMIST', 'W'), (-25, 8.6, 'POST', 'W')):
    sign(x, 3.0, z, 2.6, 0.55, t, '#efe6cf', 's' if z < 0 else 'n', boost=0.75, mirror=False)
for (x, z, t) in ((49, -11.6, 'THE BREWER\'S ARMS'), (28, -11.6, 'CONFECTIONER'), (14.5, -11.6, 'HATTER'), (50, 8.6, 'APOTHECARY'), (25, 8.6, 'TELEGRAPH')):
    sign(x, 3.0, z, 2.6, 0.55, t, '#efe6cf', 's' if z < 0 else 'n', boost=0.75, mirror=False)
# spawn dressing: West = Coach Yard (hay, stable doors), East = Brewery Yard (copper vats)
box(-73, 0, -8.4, -66, 4.0, -8, 'band'); box(-76, 0, 8, -72, 4.0, 8.4, 'band'); box(-69, 0, 8, -66, 4.0, 8.4, 'band')   # yard walls → N exit x -76..-73, S exit x -72..-69
box(-75, 0, -1.6, -70.5, 2.6, 1.6, 'coach', round=0.08); visual(-75.3, 2.6, -1.9, -70.2, 2.85, 1.9, 'slate')   # stable coach (blocks exit-to-exit lines)
for (x, z) in ((-79, -7), (-79, 7)): box(x - 0.9, 0, z - 0.6, x + 0.9, 1.0, z + 0.6, 'hay', mirror=False)
for (x, z) in ((78.6, -6.7), (78.6, 6.7)): E.append(dict(type='box', min=[x - 1.2, 0, z - 1.2], max=[x + 1.2, 3.2, z + 1.2], mat='copper', round=0.8, mirror=False))
visual(-80, 4.2, -8, -68, 4.6, -7.6, 'sage', mirror=False); visual(68, 4.2, -8, 80, 4.6, -7.6, 'ochre', mirror=False)
E.append(dict(type='box', min=[-66, 0, 10.2], max=[-63, 1.0, 11.6], mat='hay'))

# ───────────────────────── tags, spawns, routes ─────────────────────────
def area(name, r, kind, mirrorName=None, y=None, key=False, tag=None, hint='', mirror=True, floor=None):
    a = dict(name=name, rect=list(r), kind=kind, hint=hint)
    if mirrorName: a['mirrorName'] = mirrorName
    a['y'] = list(y) if y else [-0.5, 0.95]   # ground callouts: floor level only (prop tops aren't 'unreachable area')
    if key: a['key'] = True
    if tag: a['tag'] = tag
    if floor is not None: a['floor'] = floor
    if not mirror: a['mirror'] = False
    return a
AREAS = [
    area('West Spawn · Coach Yard', OUT['spawn'], 'SPAWN', 'East Spawn · Brewery Yard', tag='spawn', hint='Two exits: north to Back Lane, south to Quay Lane'),
    area('Back Lane', OUT['backLane'], 'SHORT', 'Back Lane'), area('Junction', OUT['junction'], 'MID', 'Junction'), area('Quay Lane', OUT['quay'], 'LONG', 'Quay Lane'),
    area('Inn Yard', OUT['innYard'], 'HALL', 'Inn Yard', hint='Mill Alley — close quarters'), area("Cooper's Yard", OUT['cooper'], 'HALL', "Cooper's Yard"),
    area('Stair Lane', OUT['stairLane'], 'HALL', 'Stair Lane', hint='Alley ↔ High Street'), area("Baker's Yard", OUT['bakerYard'], 'HALL', "Baker's Yard"),
    area('Alley Arch', OUT['alleyArch'], 'HALL', 'Alley Arch'), area('Well Yard', OUT['wellYard'], 'HALL', 'Well Yard', key=True),
    area('Chapel', CENTRE['chapel'], 'INDOOR', key=True, mirror=False, hint='Only centre crossing of Mill Alley'),
    area('High Street', OUT['street'], 'MID', 'High Street', key=True), area('High Street', OUT['street2'], 'MID', 'High Street'), area('Arch', OUT['archGate'], 'MID', 'Arch', y=(0, 3.6)),
    area('Market Square', CENTRE['square'], 'MID', key=True, mirror=False), area('Market Hall', (-8, -8, 8, 8), 'INDOOR', y=(0, 4.6), mirror=False),
    area('Hall Gallery', (-8, -8, 8, 8), 'INDOOR', y=(4.6, 8.9), key=True, mirror=False, floor=1), area('Clock Top', (-4, -4, 4, 6), 'ROOF', y=(8.9, 12), key=True, mirror=False, floor=2, hint='3rd level — exposed on all sides'),
    area('Inn', BLD['inn']['r'], 'INDOOR', 'Inn', y=(0, 3.9)), area('Inn Upstairs', BLD['inn']['r'], 'INDOOR', 'Inn Upstairs', y=(3.9, 8), floor=1),
    area('Bakery', BLD['bakery']['r'], 'INDOOR', 'Bakery', y=(0, 3.9)), area('Bakery Upstairs', BLD['bakery']['r'], 'INDOOR', 'Bakery Upstairs', y=(3.9, 8), floor=1),
    area('Tailor', BLD['tailor']['r'], 'INDOOR', 'Tailor', y=(0, 3.9)), area('Tailor Upstairs', BLD['tailor']['r'], 'INDOOR', 'Tailor Upstairs', y=(3.9, 8), floor=1, key=True),
    area('Terrace Walk', UPPER['terraceWalk'], 'HALL', 'Terrace Walk', y=(3.9, 8), floor=1), area('Terrace Walk', UPPER['walk2'], 'HALL', 'Terrace Walk', y=(3.9, 8), floor=1),
    area('Arch Room', UPPER['archRoom'], 'HALL', 'Arch Room', y=(3.9, 8), floor=1, key=True, hint='Bridge over the High Street'),
    area('Chemist', BLD['chemist']['r'], 'INDOOR', 'Chemist', y=(0, 3.9)), area('Chemist Upstairs', BLD['chemist']['r'], 'INDOOR', 'Chemist Upstairs', y=(3.9, 8), floor=1),
    area('Post Office', BLD['post']['r'], 'INDOOR', 'Post Office', y=(0, 3.9)), area('Post Office Upstairs', BLD['post']['r'], 'INDOOR', 'Post Office Upstairs', y=(3.9, 8), floor=1, key=True),
    area('South Walk', UPPER['southWalk'], 'HALL', 'South Walk', y=(3.9, 8), floor=1), area('Arcade', OUT['arcade'], 'HALL', 'Arcade', y=(0, 3.6)), area('Fish Lane', OUT['fishLane'], 'HALL', 'Fish Lane'),
    area('Town Hall', CENTRE['townhall'], 'INDOOR', y=(0, 3.9), mirror=False), area('Town Hall Upstairs', CENTRE['townhall'], 'INDOOR', y=(3.9, 8), mirror=False, floor=1, key=True),
    area('Canal Road', OUT['canalRoad'], 'LONG', 'Canal Road', key=True), area('Crane', (-34, 22, -22, 30), 'LONG', 'Crane'), area('Lock House', CENTRE['lock'], 'INDOOR', key=True, mirror=False),
]
SPAWNS = [dict(team=0, at=[x, 0, z], yaw=-45 if z <= 0 else -135) for (x, z) in ((-78, -4), (-78, 0), (-78, 4), (-72, -5), (-72, 5), (-69, -3), (-69, 3))]
ROUTES = {
    'alley': dict(kind='short', symmetric=True, pts=[[-71, 0, -20], [-62, 0, -33], [-50, 0, -27], [-39, 0, -33], [-29, 0, -28.5], [-13, 0, -35], [-3.5, 0, -31.8]]),
    'street': dict(kind='mid', symmetric=True, pts=[[-71, 0, -20], [-60, 0, -7.5], [-50, 0, -3], [-38, 0, -2], [-25, 0, 0], [-13, 0, -11]]),
    'canal': dict(kind='long', symmetric=True, pts=[[-71, 0, 20], [-60, 0, 26], [-45, 0, 27.5], [-36, 0, 23.5], [-18, 0, 26], [-7, 0, 23.5]]),
    'upper': dict(kind='mid', symmetric=True, pts=[[-60, 0, -7.5], [-49, 0, -18], [-49, 4, -20], [-38, 4, -21], [-38, 4, -6], [-38, 4, 2]]),
}
CONNECTORS = [[-42.5, 0, -19], [-38, 0, 16], [-15.5, 0, 16], [-49, 0, -18], [-25, 0, 16], [-38, 4, -2], [-28, 4, -20], [-50, 4, 18], [-14, 4, -20]]
TURRETS = [dict(team=0, at=[-64, 0, -10.5])]

data = dict(id='ashgrove', name='ASHGROVE', location='Limestone canal town · late morning',
            desc='Three lanes through a market town: Mill Alley up close, the High Street with its window duels, and the long Canal Road — all stitched together by doorways.',
            swatch=['#d9cfb8', '#7f9a7a', '#c9a24e', '#6f9e8a'], bounds=[-82, -42, 82, 40], symmetry='mirrorX',
            floors=[dict(name='Ground', y=0), dict(name='Upper', y=4), dict(name='Clock Top', y=CT)],
            theme=THEME, materials=MATS, geometry=E, areas=AREAS, spawns=SPAWNS, routes=ROUTES, connectors=CONNECTORS, turrets=TURRETS)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'maps', 'data', 'ashgrove.json')
with open(out, 'w') as f: json.dump(data, f, indent=1)
print(f'wrote {os.path.normpath(out)}: {len(E)} entities, {len(AREAS)} areas')
