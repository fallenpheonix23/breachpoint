// Validates every map: builds geometry, nav, and checks reachability of spawns / routes / nests / connectors.
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : (k === 'measureText' ? () => ({ width: 10 }) : noop), set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }) };
const { MAPS } = await import('../src/maps/index.js');
const { buildMap } = await import('../src/map.js');
const tex = new THREE.Texture();
const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
let fails = 0;
for (const def of MAPS) {
  const t0 = performance.now();
  const m = buildMap(new THREE.Scene(), T, def);
  const nav = m.nav;
  let walk = 0; for (const v of nav.walk) walk += v;
  console.log(`\n${def.name}: ${m.world.boxes.length} boxes, nav ${walk}/${nav.walk.length} walkable, ${(performance.now() - t0).toFixed(0)} ms, meshes ${m.group.children.length}`);
  const bad = (label, x, z) => { fails++; console.log('  ✗', label, x.toFixed(1), z.toFixed(1), 'walk', nav.isWalkable(x, z)); };
  const reach = (label, a, b) => { const p = nav.findPath(a[0], a[1], b[0], b[1]); if (!p) bad(label + ' NO PATH to', b[0], b[1]); return p; };
  for (const team of [0, 1]) for (const s of m.spawns[team]) if (!nav.isWalkable(s.x, s.z)) bad(`spawn t${team} not walkable`, s.x, s.z);
  const s0 = [m.spawns[0][4].x, m.spawns[0][4].z], s1 = [m.spawns[1][4].x, m.spawns[1][4].z];
  reach('blue spawn → red spawn', s0, s1);
  for (const [name, lane] of Object.entries(m.lanes)) {
    for (const [x, z] of lane.pts) if (!nav.isWalkable(x, z)) bad(`lane ${name} pt not walkable`, x, z);
    for (const p of lane.pts) reach(`spawn → lane ${name}`, s0, p);
  }
  for (const n of m.nests) reach(`spawn t${n.team} → nest`, n.team ? s1 : s0, [n.spot.x, n.spot.z]);
  for (const c of m.connectors) reach('spawn → connector', s0, c);
  for (const t of m.turretSpots) { const q = []; m.world.query(t.pos.x - 0.8, t.pos.z - 0.8, t.pos.x + 0.8, t.pos.z + 0.8, q); if (q.some((b) => b.max[1] > 0.1 && b.min[1] < 1.5)) bad('turret overlaps geometry', t.pos.x, t.pos.z); }
  console.log('  zones:', m.zones.length, 'nests', m.nests.length, 'covers', m.covers.length, 'turrets', m.turretSpots.length, 'lanes', Object.keys(m.lanes).join(','));
}
console.log(fails ? `\n${fails} problems` : '\nall maps OK');
