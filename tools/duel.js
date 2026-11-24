import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(4) }) : (k.startsWith && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => ctx2d }) };
const { Game } = await import('../src/game.js');
const { buildMap } = await import('../src/map.js');
const { MAPS } = await import('../src/maps/index.js');
const { Effects } = await import('../src/effects.js');
const { Abilities } = await import('../src/abilities.js');
const { Soldier } = await import('../src/soldier.js');
const { BotBrain } = await import('../src/bot.js');
const { DIFFICULTY } = await import('../src/config.js');
const W = process.argv[2] || 'ar', D = +(process.argv[3] || 40);
const g = Object.create(Game.prototype);
g.time = 0; g.score = [0, 0]; g.respawnTime = 99; g.scene = new THREE.Scene(); g.camera = new THREE.PerspectiveCamera();
const tex = new THREE.Texture(); const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
g.theme = MAPS[0].theme;
const { World } = await import('../src/physics.js'); const { NavGrid } = await import('../src/nav.js');
const W0 = new World(); W0.add(-200, -1, -200, 200, 0, 200, 'ground');
const bounds = { x0: -100, z0: -40, x1: 100, z1: 40 };
g.map = { world: W0, nav: new NavGrid(W0, bounds), isHallway: () => false, isIndoor: () => false, nestAt: () => null, coverAt: () => null, zoneAt: () => null,
  lanes: { mid: { kind: 'mid', pts: [[-50, 0], [50, 0]] } }, connectors: [[0, 0]], nests: [{ team: 0, x0: -50, z0: 0, spot: new THREE.Vector3(-50, 0, 0), yaw: -Math.PI / 2 }], update() {} }; g.world = g.map.world; g.fx = new Effects(g); g.audio = { play: noop };
g.abilities = new Abilities(g, T); g.stasisFields = []; g.shieldWalls = []; g.decoys = []; g.targets = []; g.turrets = [];
g.hud = new Proxy({}, { get: () => noop }); g.vm = g.hud; g.input = {}; g.endMatch = noop;
g.player = { pos: new THREE.Vector3(0, 0, 999) }; g.noise = () => {}; g.onFootstep = () => {};
const a = new Soldier(g, { id: 1, name: 'A', team: 0, weapon: W, abilities: ['pulse', 'pulse'] });
const b = new Soldier(g, { id: 2, name: 'B', team: 1, weapon: 'ar', abilities: ['pulse', 'pulse'] });
a.brain = new BotBrain(g, a, DIFFICULTY.veteran);
g.soldiers = [a, b];
a.spawn(new THREE.Vector3(-50, 0, 0), -Math.PI / 2); b.spawn(new THREE.Vector3(-50 + D, 0, 0), Math.PI / 2);
a.spawnProtect = b.spawnProtect = 0;
a.brain.onSpawn(); a.brain.alert = b; a.brain.alertT = 0;
let shots = 0, hits = 0, dmg = 0, errSum = 0; const of = g.fireBullet.bind(g);
g.fireBullet = (...x) => { if (x[0] === a) { shots++; const o = x[1], dv = x[2], c = b.center(new THREE.Vector3()), to = c.sub(o).normalize(); errSum += Math.acos(Math.min(1, to.dot(dv))); } return of(...x); };
const ot = b.takeDamage.bind(b); b.takeDamage = (n, ...r) => { hits++; dmg += n; b.hp = 100; b.shield = 50; return false; };
for (let f = 0; f < 600; f++) {
  if (!process.env.V) {}
  g.time += 1 / 60; g.targets = [a, b]; g.pathBudget = 3;
  const inp = a.brain.update(1 / 60); a.lastInput = inp; a.update(1 / 60, inp);
  if (process.env.V && f % 6 === 0 && f < 240) console.log(f / 60, 'tgt', !!a.brain.target, 'yaw', a.yaw.toFixed(2), 'pitch', a.pitch.toFixed(3), 'ads', a.adsT.toFixed(1), 'fire', inp.fire, 'ammo', a.ammo, 'bloom', a.bloom.toFixed(3), 'pos', a.pos.x.toFixed(1), a.pos.z.toFixed(1), 'spd', Math.hypot(a.vel.x, a.vel.z).toFixed(1), 'spread°', (a.spreadNow() * 57.3).toFixed(2), 'burstT', a.brain.burstT?.toFixed(2), 'planted', a.brain.planted, 'aimErr', Math.hypot(a.brain.errX, a.brain.errY).toFixed(4));
}
console.log(W, 'dist', D, 'shots', shots, 'hits', hits, 'hit%', (100 * hits / shots).toFixed(1), 'dmg/s', (dmg / 10).toFixed(0), 'mean shot err°', (errSum / shots * 57.3).toFixed(2), 'body half-width°', (Math.atan2(0.35, D) * 57.3).toFixed(2));
