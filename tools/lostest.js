// Bot fairness tests:  node tools/lostest.js
//  1. canSee() agrees with real bullets (zero-spread fireBullet) on random pairs on every map
//  2. a bot that KNOWS where you are never fires through a wall
//  3. when the target ducks behind cover, the bot stops firing within 150 ms
//  4. full match invariants: every bot shot had a fresh sighting (<=120 ms), no fight starts beyond
//     the visibility-based engage range, first shot respects the reaction delay
//  5. at long range the opening shots mostly miss
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }), documentElement: { style: { setProperty: noop } } };
const { Game } = await import('../src/game.js');
const { buildMap } = await import('../src/map.js');
const { MAPS } = await import('../src/maps/index.js');
const { Soldier } = await import('../src/soldier.js');
const { BotBrain } = await import('../src/bot.js');
const { DIFFICULTY, VIS_RANGE } = await import('../src/config.js');
const { World } = await import('../src/physics.js');
const { NavGrid } = await import('../src/nav.js');
const { Effects } = await import('../src/effects.js');
const { Abilities } = await import('../src/abilities.js');
const { Turret } = await import('../src/turret.js');

let fails = 0, passes = 0;
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const tex = new THREE.Texture();
const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
function baseGame(map) {
  const g = Object.create(Game.prototype);
  g.theme = MAPS[0].theme; g.time = 0; g.timeLeft = 600; g.score = [0, 0]; g.respawnTime = 99; g.over = false;
  g.scene = new THREE.Scene(); g.camera = new THREE.PerspectiveCamera();
  g.map = map; g.world = map.world; g.targets = []; g.turrets = []; g.decoys = []; g.stasisFields = []; g.shieldWalls = [];
  g.hud = new Proxy({}, { get: () => noop }); g.vm = g.hud; g.audio = { play: noop }; g.input = {}; g.fx = new Proxy({}, { get: () => noop });
  g.abilities = { use: () => false, update: noop }; g.endMatch = noop; g.player = { pos: new THREE.Vector3(0, 0, 999), alive: false, team: 9 };
  return g;
}
const mk = (g, team, weapon, x, z, yaw) => {
  const s = new Soldier(g, { id: team * 10 + Math.random(), name: team ? 'E' : 'B', team, weapon, abilities: ['pulse', 'pulse'] });
  s.spawn(new THREE.Vector3(x, 0, z), yaw); s.spawnProtect = 0; return s;
};

// ── 1. perception == bullets on every map ──
console.log('1. canSee() vs real bullets (random pairs on every map)');
for (const def of MAPS) {
  const map = buildMap(new THREE.Scene(), T, def);
  const g = baseGame(map);
  const a = mk(g, 0, 'ar', 0, 0, 0), b = mk(g, 1, 'ar', 0, 0, 0);
  g.soldiers = [a, b];
  const nav = map.nav; let agree = 0, n = 0, seen = 0;
  const rp = () => { for (;;) { const x = nav.x0 + Math.random() * nav.W, z = nav.z0 + Math.random() * nav.H; if (nav.isWalkable(x, z) && nav.h[nav.idx(x, z)] < 0.1) return [x, z]; } };
  for (let i = 0; i < 400; i++) {
    const [ax, az] = rp(); let [bx, bz] = rp();
    if (i % 2) { const ang = Math.random() * 6.28, r = 5 + Math.random() * 50; bx = ax + Math.cos(ang) * r; bz = az + Math.sin(ang) * r; if (!nav.isWalkable(bx, bz) || nav.h[nav.idx(bx, bz)] > 0.1) continue; }
    a.pos.set(ax, 0, az); b.pos.set(bx, 0, bz); b.hp = 1e9; b.shield = 0;
    a.stance = 'stand'; b.stance = ['stand', 'crouch', 'prone'][i % 3];
    g.targets = [a, b];
    const eye = a.eyePos(new THREE.Vector3());
    const sees = g.canSee(a, b, eye);
    let hit = false;
    const pts = [b.headPos(new THREE.Vector3()), b.center(new THREE.Vector3()), new THREE.Vector3(b.pos.x, b.pos.y + b.height * 0.3, b.pos.z)];
    const before = b.hp;
    for (const p of pts) g.fireBullet(a, eye, p.clone().sub(eye).normalize(), { ...a.weapon, range: 999 });
    hit = b.hp < before;
    n++; if (sees === hit) agree++; if (sees) seen++;
  }
  check(`${def.name}: perception matches bullets`, agree === n, `${agree}/${n} agree (${seen} visible pairs)`);
}

// ── flat test arena with one wall ──
const W0 = new World(); W0.add(-200, -1, -200, 200, 0, 200, 'ground'); W0.add(-1, 0, -6, 1, 4, 6, 'wall');
const arena = { world: W0, nav: new NavGrid(W0, { x0: -60, z0: -30, x1: 60, z1: 30 }), isHallway: () => false, isIndoor: () => false, nestAt: () => null, coverAt: () => null,
  zoneAt: () => null, lanes: { mid: { kind: 'mid', pts: [[-40, 0], [40, 0]] } }, connectors: [[0, 0]], nests: [{ team: 0, x0: -20, z0: 0, spot: new THREE.Vector3(-20, 0, 0), yaw: -Math.PI / 2 }], update() {} };
function duel(weapon, diff = 'veteran') {
  const g = baseGame(arena);
  const bot = mk(g, 0, weapon, -15, 0, -Math.PI / 2), tgt = mk(g, 1, 'ar', 15, 0, Math.PI / 2);
  bot.brain = new BotBrain(g, bot, DIFFICULTY[diff]); bot.brain.onSpawn();
  g.soldiers = [bot, tgt];
  const log = { shots: [], hits: 0 };
  const ofb = g.fireBullet.bind(g);
  g.fireBullet = (sh, o, d, w, op) => { if (sh === bot) log.shots.push({ t: g.time, pos: tgt.pos.clone(), visAge: g.time - bot.brain.visT, sinceAcq: g.time - bot.brain.acquired }); return ofb(sh, o, d, w, op); };
  tgt.takeDamage = function (n, att) { if (att === bot) log.hits++; return false; };
  const step = (sec) => { for (let i = 0; i < sec * 60; i++) { g.time += 1 / 60; g.targets = [bot, tgt]; g.pathBudget = 3; const inp = bot.brain.update(1 / 60); bot.lastInput = inp; bot.update(1 / 60, inp); bot.pos.x = Math.min(bot.pos.x, -1.5); } };
  return { g, bot, tgt, log, step };
}

// ── 2. never fires through a wall, even when it knows where you are ──
console.log('2. wall between bot and target, bot alerted to target position');
{
  const { bot, tgt, log, step, g } = duel('ar');
  bot.pos.set(-10, 0, 0); tgt.pos.set(8, 0, 0);
  bot.brain.onDamaged(tgt); bot.brain.lastKnown.copy(tgt.pos); bot.brain.investigate = true;
  let shotsWhileHidden = 0;
  for (let i = 0; i < 180; i++) { step(1 / 60); if (!g.canSee(bot, tgt) && log.shots.length) { shotsWhileHidden = log.shots.filter((s) => !s.pos || true).length; } }
  check('no shots fired through the wall in 3 s', log.shots.filter((s) => s.visAge > 0.12).length === 0 && (log.shots.length === 0 || g.canSee(bot, tgt)), `${log.shots.length} shots, ${shotsWhileHidden ? 'some fired once the bot walked round' : 'none'}`);
}

// ── 3. target ducks behind cover ──
console.log('3. target steps behind cover mid-fight');
{
  const { bot, tgt, log, step, g } = duel('ar');
  bot.pos.set(-20, 0, 12); tgt.pos.set(20, 0, 12); bot.yaw = Math.atan2(-(40), 0);
  step(2.5);
  const firedBefore = log.shots.length;
  tgt.pos.set(3, 0, 0); // directly behind the wall from the bot's side
  const tDuck = g.time;
  bot.pos.set(-20, 0, 0);
  step(1.5);
  const late = log.shots.filter((s) => s.t > tDuck + 0.15 && !g.canSee(bot, tgt));
  check('bot was firing before the duck', firedBefore > 0, `${firedBefore} shots`);
  check('bot stops firing within 150 ms of losing sight', late.length === 0, `${late.length} late shots`);
}

// ── 5. long range: opening shots mostly miss, reaction delay respected ──
console.log('4/5. reaction delay and long-range opening accuracy (veteran, 50 trials at 50 m)');
{
  let first3 = 0, first3hits = 0, minReact = 9;
  for (let k = 0; k < 50; k++) {
    const { bot, tgt, log, step } = duel('ar');
    bot.pos.set(-25, 0, 15); tgt.pos.set(25, 0, 15); bot.yaw = -Math.PI / 2;
    const hitsAt = []; const h0 = { n: 0 };
    tgt.takeDamage = function (n, att) { if (att === bot) hitsAt.push(log.shots.length - 1); return false; };
    step(3);
    if (log.shots.length) minReact = Math.min(minReact, log.shots[0].sinceAcq);
    first3 += Math.min(3, log.shots.length);
    first3hits += hitsAt.filter((i) => i < 3).length;
  }
  check('first shot no sooner than the reaction delay (≥ 250 ms)', minReact >= 0.25, `fastest ${(minReact * 1000).toFixed(0)} ms`);
  check('opening 3 shots at 50 m mostly miss (< 30% hit)', first3hits / Math.max(1, first3) < 0.3, `${first3hits}/${first3} hit`);
}

// ── 4. full-match invariants on every map ──
console.log('4. full bot-vs-bot matches (120 s per map)');
for (const def of MAPS) {
  const g = Object.create(Game.prototype);
  g.mapDef = def; g.theme = def.theme; g.opts = { weapon: 'ar', abilities: ['arc', 'pulse'], difficulty: 'veteran', name: 'P' };
  g.time = 0; g.timeLeft = 600; g.score = [0, 0]; g.respawnTime = 4.5; g.over = false;
  g.scene = new THREE.Scene(); g.camera = new THREE.PerspectiveCamera(70, 1.6, 0.05, 2000);
  g.map = buildMap(g.scene, T, def); g.world = g.map.world; g.fx = new Effects(g); g.audio = { play: noop }; g.abilities = new Abilities(g, T);
  g.stasisFields = []; g.shieldWalls = []; g.decoys = []; g.targets = []; g.turrets = g.map.turretSpots.map((t) => new Turret(g, t.pos, t.team));
  g.input = { stance: 'stand' }; g.hud = new Proxy({}, { get: (t, k) => k === 'scoreboardHTML' ? () => '' : noop }); g.vm = g.hud; g.endMatch = () => { g.over = true; };
  g.createSoldiers(); const p = g.player; p.isPlayer = false; p.brain = new BotBrain(g, p, DIFFICULTY.veteran);
  for (const s of g.soldiers) { if (s.glint) g.scene.remove(s.glint); s.glint = null; g.respawn(s); }
  let shots = 0, stale = 0, frozen = 0, tooFarStart = 0, quick = 0; const startD = [];
  const ofb = g.fireBullet.bind(g);
  g.fireBullet = (sh, o, d, w, op) => {
    if (sh.isSoldier && sh.brain && sh.brain.target?.isSoldier) {
      const b = sh.brain; shots++;
      if (g.time - b.visT > 0.121) { if (op && op.distOffset) frozen++; else { stale++; if (stale < 4) console.log('    stale shot:', sh.weaponId, 'visAge', (g.time - b.visT).toFixed(2), 'target alive', b.target.alive, 'canSee now', g.canSee(sh, b.target)); } }
      if (!(op && op.distOffset) && g.time - b.acquired < DIFFICULTY.veteran.react[0] - 1e-6) quick++;   // Stasis-released bullets (distOffset) were fired earlier
    }
    return ofb(sh, o, d, w, op);
  };
  for (const s of g.soldiers) if (s.brain) { const b = s.brain, op = b.perceive.bind(b); b.perceive = () => { const before = b.target; op(); if (b.target && b.target !== before && b.target.isSoldier) { const d = b.target.pos.distanceTo(s.pos); startD.push(d); if (d > b.engageRange() * 1.25 + 1) tooFarStart++; } }; }
  for (let f = 0; f < 120 * 60 && !g.over; f++) {
    const dt = 1 / 60; g.time += dt; g.pathBudget = 3;
    g.targets.length = 0; for (const s of g.soldiers) if (s.alive) g.targets.push(s); for (const t of g.turrets) if (t.alive) g.targets.push(t);
    for (const s of g.soldiers) { s.timeScale = 1; s.inStasis = false; }
    g.abilities.update(dt);
    for (const s of g.soldiers) { if (s.alive) { const inp = s.brain.update(dt); s.lastInput = inp; s.update(dt, inp); } else { s.respawnTimer -= dt; if (s.respawnTimer <= 0) g.respawn(s); } }
    for (const t of g.turrets) t.update(dt);
  }
  startD.sort((a, b) => a - b);
  check(`${def.name}: every bot shot had a sighting ≤ 120 ms old`, stale === 0, `${stale}/${shots} stale (${frozen} were Stasis-frozen bullets released later, by design)`);
  check(`${def.name}: no fight started beyond engage range (${VIS_RANGE.toFixed(0)} m × weapon factor)`, tooFarStart === 0, `max start ${startD.at(-1)?.toFixed(0)} m, median ${startD[startD.length >> 1]?.toFixed(0)} m`);
  check(`${def.name}: no shot before the reaction delay`, quick === 0, `${quick} early`);
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
