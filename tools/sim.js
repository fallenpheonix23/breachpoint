// Headless bot-vs-bot simulation for logic testing: node tools/sim.js [seconds]
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }) };
const { Game } = await import('../src/game.js');
const { buildMap } = await import('../src/map.js');
const { MAPS, TEST_MAPS } = await import('../src/maps/index.js');
const { Effects } = await import('../src/effects.js');
const { Abilities } = await import('../src/abilities.js');
const { Turret } = await import('../src/turret.js');
const { BotBrain } = await import('../src/bot.js');
const { DIFFICULTY } = await import('../src/config.js');

const g = Object.create(Game.prototype);
const MAPDEF = [...MAPS, ...TEST_MAPS].find((m) => m.id === (process.env.MAP || 'ashgrove'));
g.mapDef = MAPDEF; g.theme = MAPDEF.theme;
g.opts = { weapon: process.argv[3] || 'sniper', abilities: ['arc', 'grapple'], difficulty: 'veteran', name: 'P' };
g.time = 0; g.timeLeft = 600; g.score = [0, 0]; g.respawnTime = 4.5; g.over = false;
g.scene = new THREE.Scene();
g.camera = new THREE.PerspectiveCamera(78, 1.6, 0.05, 2000);
const tex = new THREE.Texture();
const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
let t0 = performance.now();
g.map = buildMap(g.scene, T, MAPDEF);
console.log('map+nav build ms', (performance.now() - t0).toFixed(0), 'boxes', g.map.world.boxes.length);
g.world = g.map.world;
g.fx = new Effects(g);
g.audio = { play: noop };
g.abilities = new Abilities(g, T);
g.stasisFields = []; g.shieldWalls = []; g.decoys = []; g.targets = [];
g.turrets = g.map.turretSpots.map((t) => new Turret(g, t.pos, t.team));
g.input = { stance: 'stand' };
const stats = { abil: {}, kills: {}, melee: 0, slams: 0, bounces: 0 };
g.hud = new Proxy({}, { get: (t, k) => k === 'scoreboardHTML' ? () => '' : noop });
g.vm = new Proxy({}, { get: () => noop });
g.createSoldiers();
const p = g.player; p.isPlayer = false; p.brain = new BotBrain(g, p, DIFFICULTY.veteran);
g.shakeT = 0;
const onKill = g.onKill.bind(g);
g.onKill = (v, k, info) => { if (process.env.KILLS) console.log('KILL', (g.time).toFixed(1), k ? `${k.team?'R':'B'}:${k.name}@${k.pos.x.toFixed(0)},${k.pos.z.toFixed(0)}` : '-', '->', `${v.team?'R':'B'}:${v.name}@${v.pos.x.toFixed(0)},${v.pos.z.toFixed(0)}`, info && info.weapon, k && k.pos ? k.pos.distanceTo(v.pos).toFixed(0)+'m' : '', 'vtgt', v.brain && v.brain.target ? v.brain.target.name : '-'); stats.kills[info?.weapon || '?'] = (stats.kills[info?.weapon || '?'] || 0) + 1; onKill(v, k, info); };
const oau = g.onAbilityUsed.bind(g); g.onAbilityUsed = (s, id) => { stats.abil[id] = (stats.abil[id] || 0) + 1; oau(s, id); };
const owb = g.onWallBounce.bind(g); g.onWallBounce = (s) => { stats.bounces++; owb(s); };
const ows = g.onWallSlam.bind(g); g.onWallSlam = (v, b) => { stats.slams++; ows(v, b); };
g.endMatch = () => { g.over = true; };
let bad = 0; const acc = {};
const ofb = g.fireBullet.bind(g);
g.fireBullet = (sh, o, d, w, op) => { if (sh.isSoldier) { const a = acc[w.name] ||= { shots: 0, hits: 0, dist: 0 }; a.shots++; const tg = sh.brain && sh.brain.target; if (tg) a.dist += tg.pos.distanceTo(sh.pos); } return ofb(sh, o, d, w, op); };
const SoldierProto = Object.getPrototypeOf(g.player);
const origTD = SoldierProto.takeDamage;
SoldierProto.takeDamage = function (amt, att, info) {
  if (att && att.isSoldier && info && info.kind === 'gun') { const a = acc[info.weapon]; if (a) a.hits++; }
  if (att && att.isSoldier && info && info.kind === 'gun' && bad < 5) {
    const e = att.eyePos(new THREE.Vector3()), c = this.center(new THREE.Vector3());
    if (!g.los(e, c, -1) && !g.los(e, this.headPos(new THREE.Vector3()), -1)) { bad++; console.log('THROUGH-WALL', att.name, e.toArray().map(v=>v.toFixed(1)), '->', this.name, this.pos.toArray().map(v=>v.toFixed(1)), 'aim', att.aimDir(new THREE.Vector3()).toArray().map(v=>v.toFixed(2)), new Error().stack.split('\n').slice(2,5).join(' | ')); }
  }
  return origTD.call(this, amt, att, info);
};
for (const s of g.soldiers) g.respawn(s);

const secs = +(process.argv[2] || 120), dt = 1 / 60;
const zoneTime = {}; let frames = 0, worst = 0;
t0 = performance.now();
for (let f = 0; f < secs * 60 && !g.over; f++) {
  const fs = performance.now();
  g.time += dt; g.timeLeft -= dt; g.pathBudget = 1;
  const TT = g.targets; TT.length = 0;
  for (const s of g.soldiers) if (s.alive) TT.push(s);
  for (const d of g.decoys) if (d.alive) TT.push(d);
  for (const t of g.turrets) if (t.alive) TT.push(t);
  for (const s of g.soldiers) { s.timeScale = 1; s.inStasis = false; }
  g.abilities.update(dt);
  for (const s of g.soldiers) {
    if (s.alive) { const inp = s.brain.update(dt); s.lastInput = inp; s.update(dt, inp); }
    else { s.respawnTimer -= dt; if (s.respawnTimer <= 0) g.respawn(s); }
    if (s.alive) { globalThis.ENG ||= { t: 0, eng: 0, d: 0, wait: 0, nopath: 0 }; ENG.t += dt; if (s.brain.target) { ENG.eng += dt; ENG.d += dt * s.brain.target.pos.distanceTo(s.pos); } if (s.brain.waitT > 0) ENG.wait += dt; if (!s.brain.path) { ENG.nopath += dt; if (process.env.NPLOG) { const k = `${s.pos.x.toFixed(0)},${s.pos.y.toFixed(1)},${s.pos.z.toFixed(0)} goal ${s.brain.goal ? `${s.brain.goal.x.toFixed(0)},${(s.brain.goal.y ?? 0).toFixed(1)},${s.brain.goal.z.toFixed(0)} ${s.brain.goalKind}` : '-'}`; (globalThis.NP ||= {})[k] = (NP[k] || 0) + dt; } } }
    if (s.alive) { const z = g.map.zoneAt(s.pos.x, s.pos.z); const k = z ? z.kind : 'NONE'; zoneTime[k] = (zoneTime[k] || 0) + dt; }
    if (s.alive && (isNaN(s.pos.x) || isNaN(s.pos.y))) { console.log('NaN pos', s.name); process.exit(1); }
  }
  for (const t of g.turrets) t.update(dt);
  g.fx.update(dt, g.camera, 900);
  frames++; worst = Math.max(worst, performance.now() - fs);
  if (process.env.ALL && f % 300 === 0) console.log((f/60).toFixed(0).padStart(3), g.soldiers.map((s) => `${s.team?"R":"B"}${s.weaponId.slice(0,2)}${s.alive?"":"x"}(${s.pos.x.toFixed(0)},${s.pos.z.toFixed(0)}${s.brain.target?"*":""}${s.brain.path?"":"!"})`).join(" "));
  if (process.env.TRACE && f % 120 === 0) { const s = g.soldiers.find((x) => x.name === process.env.TRACE) || g.soldiers[6]; const b = s.brain; console.log(f/60, s.name, s.alive, s.pos.x.toFixed(1), s.pos.y.toFixed(1), s.pos.z.toFixed(1), "goal", b.goal && b.goal.x.toFixed(0), b.goal && b.goal.z.toFixed(0), b.goalKind, "path", b.path ? b.pi + "/" + b.path.length : null, "tgt", b.target && b.target.name, "inv", b.investigate, "wait", b.waitT.toFixed(1), "stuck", b.stuckN, "fwd", s.lastInput.forward.toFixed(2), s.lastInput.right.toFixed(2)); }
}
const ms = performance.now() - t0;
console.log(`sim ${secs}s in ${(ms / 1000).toFixed(1)}s real, avg ${(ms / frames).toFixed(2)} ms/frame, worst ${worst.toFixed(1)} ms`);
console.log('score', g.score, 'zone soldier-seconds', Object.fromEntries(Object.entries(zoneTime).map(([k, v]) => [k, Math.round(v)])));
if (globalThis.NP) console.log(Object.entries(NP).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `  ${v.toFixed(1)}s @ ${k}`).join('\n'));
console.log('engaged %', (100*ENG.eng/ENG.t).toFixed(1), 'avg eng dist', (ENG.d/ENG.eng).toFixed(0), 'waiting %', (100*ENG.wait/ENG.t).toFixed(1), 'no path %', (100*ENG.nopath/ENG.t).toFixed(1));
console.log('kills by weapon', stats.kills);
for (const [k, a] of Object.entries(acc)) console.log(k.padEnd(24), 'shots', a.shots, 'hit%', (100 * a.hits / a.shots).toFixed(1), 'avg dist', (a.dist / a.shots).toFixed(0));
console.log('abilities used', stats.abil, 'wall bounces', stats.bounces, 'slams', stats.slams);
for (const s of g.soldiers) console.log(`${s.team ? 'RED ' : 'BLUE'} ${s.name.padEnd(8)} ${s.weaponId.padEnd(8)} K${s.kills} D${s.deaths} A${s.assists} dmg ${Math.round(s.damageDealt)} role ${s.brain.role} pos ${s.pos.x.toFixed(0)},${s.pos.z.toFixed(0)} stance ${s.stance}`);
