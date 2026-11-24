// Headless test of corner cover: slide to an edge, peek, corner takedown.
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }) };
const { Game } = await import('../src/game.js');
const { buildMap } = await import('../src/map.js');
const { MAPS } = await import('../src/maps/index.js'); // (cover test runs on Kilnworks)
const { Soldier } = await import('../src/soldier.js');
const { blankInput } = await import('../src/bot.js');
const g = Object.create(Game.prototype);
const def = MAPS.find((m) => m.id === 'kilnworks'); g.theme = def.theme; g.time = 0; g.score = [0, 0]; g.respawnTime = 5; g.scene = new THREE.Scene();
const tex = new THREE.Texture(); const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
g.map = buildMap(g.scene, T, def); g.world = g.map.world; g.targets = []; g.soldiers = []; g.turrets = []; g.decoys = []; g.stasisFields = []; g.shieldWalls = [];
g.hud = new Proxy({}, { get: () => noop }); g.audio = { play: noop }; g.input = {}; g.fx = new Proxy({}, { get: () => noop }); g.vm = g.hud;
g.abilities = { use: () => false }; g.player = { pos: new THREE.Vector3(0, 0, 999) }; g.endMatch = noop;
const p = new Soldier(g, { id: 0, name: 'P', team: 0, isPlayer: true, weapon: 'ar', abilities: ['arc', 'pulse'] });
const e = new Soldier(g, { id: 1, name: 'E', team: 1, weapon: 'ar', abilities: ['arc', 'pulse'] });
g.soldiers = [p, e];
// Kiln Shed west wall (face x = -32, solid section z ∈ [23, 27.6] south of its west door); stand west of it in Coal Alley
p.spawn(new THREE.Vector3(-32.8, 0, 26), Math.PI / 2); p.spawnProtect = 0;
e.spawn(new THREE.Vector3(-36, 0, 14), 0); e.spawnProtect = 0;
const step = (inp, n = 1) => { for (let i = 0; i < n; i++) { g.time += 1 / 60; g.targets = [p, e]; p.update(1 / 60, inp); } };
let inp = blankInput(); inp.stance = 'stand';
step(inp, 5);
p.yaw = -Math.PI / 2; // face +x (into the wall)
inp.coverPressed = true; step(inp, 1); inp.coverPressed = false;   // press X through the normal update path
step(inp, 30);
console.log('enter cover via X:', !!p.cover, p.cover && { axis: p.cover.axis, n: p.cover.n, plane: p.cover.plane, low: p.cover.low });
if (!p.cover) { console.log('FAIL: X did not keep the player in cover'); process.exit(1); }
// slide toward -z (north corner): with yaw facing +x, "left" (right = -1) is -z
inp.right = -1; step(inp, 120); inp.right = 0;
console.log('after slide: z', p.pos.z.toFixed(2), 'edge', p.cover.edge, 'x', p.pos.x.toFixed(2));
inp.ads = true; step(inp, 30);
console.log('peeking:', p.cover.peek, 'peekK', p.cover.peekK.toFixed(2), 'pos z', p.pos.z.toFixed(2));
inp.ads = false; step(inp, 30);
// enemy walks around the corner
e.pos.set(-32.6, 0, p.cover.t - 1.6);
const ct = p.cornerTarget();
console.log('corner target:', ct ? ct.name : null);
inp.punchPressed = true; step(inp, 1); inp.punchPressed = false;
console.log('enemy hp/shield after takedown:', Math.max(0, e.hp).toFixed(0), e.shield.toFixed(0), 'alive', e.alive);
inp.coverPressed = true; step(inp, 1);
console.log('left cover:', p.cover === null);
