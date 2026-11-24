// Drives a real bot (physics + path following) from a spawn to every key area of a map.
//   node tools/navtest.js [mapId]
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }), documentElement: { style: { setProperty: noop } } };
const { Game } = await import('../src/game.js');
const { buildMap } = await import('../src/map.js');
const { MAPS, TEST_MAPS } = await import('../src/maps/index.js');
const { Soldier } = await import('../src/soldier.js');
const { BotBrain } = await import('../src/bot.js');
const { DIFFICULTY } = await import('../src/config.js');

const id = process.argv[2] || 'testbed';
const def = [...MAPS, ...TEST_MAPS].find((m) => m.id === id);
const tex = new THREE.Texture(); const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
const map = buildMap(new THREE.Scene(), T, def);
let fails = 0;
for (const team of [0, 1]) for (const z of map.zones.filter((z) => z.key)) {
  const g = Object.create(Game.prototype);
  Object.assign(g, { theme: def.theme, time: 0, score: [0, 0], respawnTime: 99, scene: new THREE.Scene(), map, world: map.world, targets: [], turrets: [], decoys: [], stasisFields: [], shieldWalls: [],
    hud: new Proxy({}, { get: () => noop }), audio: { play: noop }, input: {}, fx: new Proxy({}, { get: () => noop }), abilities: { use: () => false, update: noop }, endMatch: noop, player: { pos: new THREE.Vector3(0, 0, 999) } });
  g.vm = g.hud;
  const sp = map.spawns[team][1];
  const s = new Soldier(g, { id: 1, name: 'B', team, weapon: 'ar', abilities: ['pulse', 'pulse'] });
  s.spawn(sp, team ? Math.PI / 2 : -Math.PI / 2); s.spawnProtect = 0;
  s.brain = new BotBrain(g, s, DIFFICULTY.veteran); g.soldiers = [s];
  // goal: centre-most reachable node inside the area
  const nav = map.nav; let goal = null, bd = Infinity;
  const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2;
  for (let n = 0; n < nav.nodeCount; n++) {
    if (!nav.reach[n]) continue; const [x, zz] = nav.nodeXZ(n), y = nav.nh[n];
    if (x < z.x0 || x > z.x1 || zz < z.z0 || zz > z.z1 || y < z.y0 - 0.3 || y > z.y1) continue;
    const d = Math.hypot(x - cx, zz - cz); if (d < bd && nav.ncost[n] === 1) { bd = d; goal = { x, y, z: zz }; }
  }
  if (!goal) { console.log(`  ? ${z.name}: no open node`); continue; }
  const b = s.brain; b.role = 'test'; b.setGoal(goal.x, goal.z, 'test', goal.y); b.nextGoal = () => {}; b.pickRole = () => {};
  let t = 0, ok = false, maxY = 0, drops = 0, prevY = 0;
  for (; t < 40 && !ok; t += 1 / 60) {
    g.time = t; g.pathBudget = 3;
    const inp = b.update(1 / 60); s.lastInput = inp; s.update(1 / 60, inp);
    if (process.env.DBG && s.pos.y > 4.5 && maxY <= 4.5) console.log('    climbed above 4.5 at t', t.toFixed(2), 'pos', s.pos.toArray().map((v) => v.toFixed(1)).join(','), 'path', b.pi, '/', b.path?.length, b.path?.slice(Math.max(0, b.pi - 1), b.pi + 2).map((q) => `${q.kind}(${q.x.toFixed(1)},${q.y.toFixed(1)},${q.z.toFixed(1)})`).join(' '), 'stuckN', b.stuckN, 'unstick', b.unstickT.toFixed(2));
    if (process.env.TRACE && z.name === process.env.TRACE && Math.round(t * 60) % 20 === 0 && s.pos.y > 4.5) console.log(`    t ${t.toFixed(2)} pos ${s.pos.x.toFixed(2)},${s.pos.y.toFixed(2)},${s.pos.z.toFixed(2)} pi ${b.pi}/${b.path?.length} next ${b.path && b.path[b.pi] ? `${b.path[b.pi].kind}(${b.path[b.pi].x.toFixed(2)},${b.path[b.pi].y.toFixed(2)},${b.path[b.pi].z.toFixed(2)})` : '-'} stuck ${b.stuckN} unst ${b.unstickT.toFixed(2)} fwd ${s.lastInput.forward.toFixed(2)} r ${s.lastInput.right.toFixed(2)} yaw ${s.yaw.toFixed(2)}`);
    maxY = Math.max(maxY, s.pos.y); if (prevY - s.pos.y > 1) drops++; prevY = s.pos.y;
    if (Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 1.2 && Math.abs(s.pos.y - goal.y) < 0.8) ok = true;
  }
  if (!ok) fails++;
  console.log(`  ${ok ? '✓' : '✗'} ${team ? 'RED ' : 'BLUE'} → ${z.name.padEnd(20)} ${ok ? `arrived in ${t.toFixed(1)} s` : `FAILED (ended at ${s.pos.x.toFixed(1)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(1)}, ${map.zoneAt(s.pos.x, s.pos.z, s.pos.y)?.name || '—'})`}  · goal y ${goal.y.toFixed(1)} · max height ${maxY.toFixed(1)}`);
}
console.log(fails ? `\n${fails} failed` : '\nall areas reached by a real bot');
process.exit(fails ? 1 : 0);
