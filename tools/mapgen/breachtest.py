#!/usr/bin/env python3
"""Generates src/maps/data/breachtest.json — a small test fixture for the Breach (attack/defend) mode.
Attackers spawn south behind a setup gate; Site A mid-south; a forward attacker spawn (gate opens when A falls);
Site B north; defenders spawn north. In the map rotation (MAPS)."""
import json, os

E = []
def box(x0, y0, z0, x1, y1, z1, mat='wall', **kw): E.append(dict(type='box', min=[x0, y0, z0], max=[x1, y1, z1], mat=mat, **kw))
def wall(a, b, h=4, ops=(), mat='wall'): E.append(dict(type='wall', **{'from': list(a), 'to': list(b)}, y=0, h=h, t=0.4, mat=mat, frame='trim',
                                                     openings=[dict(at=at, w=w, y=0, h=2.6, kind='door') for (at, w) in ops]))

E.append(dict(type='ground', rect=[-26, -52, 26, 52], mat='floor'))
box(-26, 0, -52, -24, 6, 52); box(24, 0, -52, 26, 6, 52); box(-24, 0, -52, 24, 6, -50); box(-24, 0, 50, 24, 6, 52)   # boundary
# attacker spawn room (z 38…48) with the setup gate in its north wall
wall((-10, 38), (10, 38), ops=[(10, 8)]); wall((-10, 38), (-10, 50)); wall((10, 38), (10, 50))
# forward attacker spawn (phase 2) west of Site A; its east door is gated until A falls
wall((-24, 4), (-12, 4)); wall((-24, 13), (-12, 13)); wall((-12, 4), (-12, 13), ops=[(4.5, 2.4)])
# mid wall with an 8 m centre gap + side gaps, and cover
wall((-24, -5), (24, -5), ops=[(6, 4), (24, 8), (42, 4)])
for (x, z) in ((-8, 22), (7, 26), (-3, 5), (9, 12), (-9, -14), (6, -16), (-2, -34)): box(x - 1, 0, z - 1, x + 1, 1.1, z + 1, 'crate')
box(-14, 0, 18, -12, 3, 26); box(12, 0, 14, 14, 3, 22); box(-16, 0, -24, -13, 3, -18); box(13, 0, -28, 16, 3, -20)
# defender spawn room (z −48…−38), open to the south
wall((-10, -38), (10, -38), ops=[(10, 8)]); wall((-10, -50), (-10, -38)); wall((10, -50), (10, -38))

data = dict(
    id='breachtest', name='BREACH TEST', location='Training yard', desc='Attack/defend: hold the setup gate, take Site A to unlock the forward spawn, then push Site B.',
    swatch=['#9aa4b1', '#d8a64a', '#5a6270'], bounds=[-26, -52, 26, 52], symmetry='none', mode='breach', setup=20, clock=[210, 150],
    floors=[dict(name='Ground', y=0)],
    theme={'sky': {'top': '#7d93ad', 'horizon': '#dfe3e8', 'bottom': '#c9ccd2', 'sun': '#fff2d8', 'elev': 50, 'az': 150, 'clouds': 0.3, 'stars': 0},
           'sun': {'color': '#fff1dc', 'intensity': 2.3}, 'hemi': {'sky': '#e2e8f0', 'ground': '#a49a86', 'intensity': 1.1},
           'fog': {'color': '#dcdfe3', 'near': 120, 'far': 400}, 'exposure': 1.0, 'env': 0.4, 'grade': {'sat': 1.0, 'contrast': 1.02, 'vignette': 0.1},
           'bloom': 0.2, 'weather': 'none', 'ambient': 'town', 'stepOut': 'stone'},
    materials={'wall': dict(tex='concrete', color='#a7a197', scale=3, rough=0.9), 'floor': dict(tex='concrete', color='#8f8b84', scale=3, rough=0.95),
               'trim': dict(tex='metal', color='#6f7a55', scale=2, rough=0.6), 'crate': dict(tex='wood', color='#9a9486', scale=1.5, rough=0.8)},
    geometry=E,
    objectives=[dict(id='A', name='Site A', rect=[-6, 8, 6, 16], order=0), dict(id='B', name='Site B', rect=[-6, -30, 6, -22], order=1)],
    gates=[dict(id='spawnGate', min=[-4, 0, 37.6], max=[4, 3.5, 38.4], opens='setup'), dict(id='fwdGate', min=[-12.4, 0, 7.1], max=[-11.6, 3.5, 9.9], opens='A')],
    spawns=[*[dict(role='attack', phase=0, at=[x, 0, z], yaw=0) for (x, z) in ((-6, 42), (-2, 42), (2, 42), (6, 42), (-4, 46), (0, 46), (4, 46))],
            *[dict(role='attack', phase=1, at=[x, 0, z], yaw=-90) for (x, z) in ((-21, 6), (-21, 8.5), (-21, 11), (-17, 6), (-17, 11))],
            *[dict(role='defend', phase=0, at=[x, 0, z], yaw=180) for (x, z) in ((-6, -42), (-2, -42), (2, -42), (6, -42), (-4, -46), (0, -46), (4, -46))]],
    turrets=[dict(role='attack', at=[7.5, 0, 46]), dict(role='defend', at=[7.5, 0, -46])],
    holds=[dict(site='A', at=[x, 0, z]) for (x, z) in ((-8, 4), (8, 6), (0, 2), (-10, 14), (10, 18))] +
          [dict(site='B', at=[x, 0, z]) for (x, z) in ((-8, -34), (8, -34), (0, -36), (-10, -20), (10, -24))],
    routes={'atkA_west': dict(role='attack', phase=0, kind='mid', pts=[[0, 0, 36], [-8, 0, 28], [-4, 0, 18]]),
            'atkA_east': dict(role='attack', phase=0, kind='mid', pts=[[0, 0, 36], [8, 0, 30], [4, 0, 18]]),
            'atkB_mid':  dict(role='attack', phase=1, kind='mid', pts=[[-10, 0, 8.5], [-4, 0, 0], [0, 0, -8], [0, 0, -18]]),
            'atkB_east': dict(role='attack', phase=1, kind='long', pts=[[-10, 0, 8.5], [8, 0, 0], [14, 0, -8], [6, 0, -18]])},
    areas=[dict(name='Attacker Spawn', rect=[-10, 38, 10, 50], kind='SPAWN', tag='spawn'), dict(name='Forward Spawn', rect=[-24, 4, -12, 13], kind='SPAWN'),
           dict(name='Site A', rect=[-6, 8, 6, 16], kind='SITE', key=True), dict(name='Site B', rect=[-6, -30, 6, -22], kind='SITE', key=True),
           dict(name='Defender Spawn', rect=[-10, -50, 10, -38], kind='SPAWN', tag='spawn'), dict(name='Field', rect=[-24, -38, 24, 38], kind='MID', y=[-0.5, 0.95])],
)
out = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'maps', 'data', 'breachtest.json')
with open(out, 'w') as f: json.dump(data, f, indent=1)
print('wrote', os.path.normpath(out), len(E), 'entities')
