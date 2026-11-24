# Brief A (Saltmarsh Signal Station) layout rectangles -> ASCII sketch. x -50..50 (east), z -52..58 (south). 1 char = 2 m.
G = [  # (rect, char, label)  later entries paint over earlier ones
 # ── terrace (upper town, solid plateau with walkable top at 4.5 m) ──
 ((-50, -52, 50, -14), '^', 'terrace top 4.5 m (walkable only where opened below)'),
 # ── harbour level (y 0) ──
 ((-14, 48, 14, 58), 'S', 'Attacker spawn: Slipway'), ((-4, 40, 4, 48), '.', 'slip gate'),
 ((-34, 44, -14, 50), '.', 'Boat Lane'), ((14, 44, 32, 50), '.', 'Quay'),
 ((-46, 6, -34, 50), '.', 'Net Lofts alley'), ((-12, 18, 12, 40), '.', 'Fish Market'), ((32, 6, 46, 50), '.', 'Breakwater'),
 ((-34, 20, -12, 34), ':', 'Boathouse (2 floors)'), ((20, 10, 26, 16), '.', 'Garage Lane (opens phase 2)'), ((20, 16, 32, 30), 'F', 'Coastguard Garage (attacker forward spawn, phase 2)'),
 ((-12, 14, 12, 18), '.', 'Harbour Front'), ((-34, 0, -12, 8), '.', 'Net Yard'), ((12, -2, 32, 10), '.', 'Tank Yard'),
 ((-12, -2, 12, 14), ':', 'SITE A: Pumping Station'), ((-6, 2, 6, 10), 'A', 'capture zone A'),
 ((-46, -14, -34, 6), '.', 'Lighthouse Path (lower)'),
 # ── climbs ──
 ((-4, -12, 4, -2), '/', 'Cliff Stair (0→4.5)'), ((16, -26, 22, -2), '=', 'Pipe Gallery tunnel + ramp'), ((-46, -26, -40, -14), '/', 'Lighthouse ramp (0→4.5)'),
 # ── terrace areas (y 4.5) ──
 ((-14, -24, 14, -12), '+', 'Signal Garden'), ((2, -40, 26, -26), '+', 'Generator Yard'), ((8, -26, 12, -24), '+', 'Cable Cut'), ((-18, -44, -14, -40), '+', 'West Gate'), ((-40, -40, -18, -26), '+', "Keeper's Lane"),
 ((-46, -40, -40, -26), '+', 'Lighthouse foot'), ((-46, -46, -38, -40), 'L', 'Lighthouse (gallery 9 m)'),
 ((-18, -38, 2, -24), ':', 'SITE B: Transmitter Hall'), ((-14, -34, -4, -28), 'B', 'capture zone B'),
 ((-14, -52, 14, -42), 'D', 'Defender spawn: Relay Barracks'), ((-6, -42, 2, -38), '+', 'barracks gate'), ((14, -42, 26, -40), '+', 'yard link'),
]
cells = {}
for (x0, z0, x1, z1), ch, _ in G:
    for z in range(z0, z1, 2):
        for x in range(x0, x1, 2): cells[(x, z)] = ch
for z in range(-52, 58, 2):
    print(f'{z:4d} ' + ''.join(cells.get((x, z), '#') for x in range(-50, 50, 2)))
