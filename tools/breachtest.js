// Breach mode tests:  node tools/breachtest.js [mapId=breachtest]
//  1. capture rules (scripted soldiers): rate by attacker count, contest freeze, checkpoint floor + decay, overtime
//  2. full bot matches: setup gate holds attackers, sites fall in order, forward spawn + gates, half swap, result
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }) };
const { Game } = await import('../src/game.js');
const { buildMap } = await import('../src/map.js');
const { MAPS, TEST_MAPS } = await import('../src/maps/index.js');
const { Effects } = await import('../src/effects.js');
const { Abilities } = await import('../src/abilities.js');
const { Turret } = await import('../src/turret.js');
const { BotBrain } = await import('../src/bot.js');
const { DIFFICULTY } = await import('../src/config.js');
const id = process.argv[2] || 'breachtest';
const DEF = [...MAPS, ...TEST_MAPS].find((m) => m.id === id);
const tex = new THREE.Texture(); const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
let passes = 0, fails = 0;
const check = (name, ok, info = '') => { console.log(`  ${ok ? '✓' : '✗'} ${name}${info ? ' — ' + info : ''}`); ok ? passes++ : fails++; };

function makeGame() {
  const g = Object.create(Game.prototype);
  g.mapDef = DEF; g.theme = DEF.theme; g.opts = { weapon: 'ar', abilities: ['arc', 'pulse'], difficulty: 'veteran', name: 'P' };
  g.time = 0; g.timeLeft = 600; g.score = [0, 0]; g.respawnTime = 4.5; g.over = false;
  g.scene = new THREE.Scene(); g.camera = new THREE.PerspectiveCamera(78, 1.6, 0.1, 2000);
  g.map = buildMap(g.scene, T, DEF); g.world = g.map.world; g.fx = new Effects(g); g.audio = { play: noop };
  g.abilities = new Abilities(g, T); g.stasisFields = []; g.shieldWalls = []; g.decoys = []; g.targets = [];
  g.turrets = g.map.turretSpots.map((t) => new Turret(g, t.pos, t.team));
  g.input = { stance: 'stand' }; g.events = [];
  g.hud = new Proxy({}, { get: (t, k) => k === 'scoreboardHTML' ? () => '' : k === 'medal' ? (a, b) => g.events.push(`${g.time.toFixed(1)}s ${a}${b ? ' · ' + b : ''}`) : noop });
  g.vm = new Proxy({}, { get: () => noop }); g.shakeT = 0;
  g.createSoldiers(); const p = g.player; p.isPlayer = false; p.brain = new BotBrain(g, p, DIFFICULTY.veteran);
  g.initMode(); g.endMatch = () => { g.over = true; };
  for (const s of g.soldiers) g.respawn(s);
  return g;
}
function tick(g, dt, bots = true) {
  g.time += dt; g.pathBudget = 2;
  const TT = g.targets; TT.length = 0; for (const s of g.soldiers) if (s.alive) TT.push(s); for (const t of g.turrets) if (t.alive) TT.push(t);
  for (const s of g.soldiers) { s.timeScale = 1; s.inStasis = false; }
  g.abilities.update(dt);
  if (bots) for (const s of g.soldiers) {
    if (s.alive) { const inp = s.brain.update(dt); s.lastInput = inp; s.update(dt, inp); }
    else { s.respawnTimer -= dt; if (s.respawnTimer <= 0 && !g.over) g.respawn(s); }
  }
  for (const t of g.turrets) t.update(dt);
  g.mode.update(dt);
}

// ── 1. capture rules with scripted soldiers ──
console.log('1. capture rules (scripted)');
{
  const g = makeGame(), m = g.mode, z = m.sites[0];
  const atk = g.soldiers.filter((s) => s.team === m.attackTeam), def = g.soldiers.filter((s) => s.team !== m.attackTeam);
  const park = (list) => list.forEach((s, i) => s.pos.set(-20 + i, 0, -46));      // far away, out of every zone
  const into = (s) => s.pos.set((z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2);
  park(atk); park(def); for (const t of g.turrets) t.alive = false;
  const run = (secs) => { for (let i = 0; i < secs * 60; i++) tick(g, 1 / 60, false); };
  check('gates closed during setup', m.d.gates.every((gt) => g.world.boxes.includes(gt.box)));
  run(m.setupT + 0.1);
  check('setup gate opens when setup ends', g.world.boxes.indexOf(m.d.gates.find((x) => x.opens === 'setup').box) < 0);
  check('forward-spawn gate still closed', g.world.boxes.includes(m.d.gates.find((x) => x.opens === 'A').box));
  into(atk[0]); run(7);
  check('1 attacker: 14 s capture → ~50% after 7 s', Math.abs(m.progress - 0.5) < 0.03, `${(m.progress * 100).toFixed(1)}%`);
  into(def[0]); const p0 = m.progress; run(3);
  check('contested (defender inside) freezes progress', Math.abs(m.progress - p0) < 1e-6, `${(m.progress * 100).toFixed(1)}%`);
  park([def[0]]); park([atk[0]]); run(30);
  check('decays to the last checkpoint, not below', Math.abs(m.progress - 1 / 3) < 1e-3, `${(m.progress * 100).toFixed(1)}% (floor 33%)`);
  into(atk[0]); into(atk[1]); into(atk[2]); into(atk[3]); const t0 = g.time; while (m.phase === 0 && g.time - t0 < 20) run(0.1);
  check('3+ attackers: remaining 67% in ≈ 5.4 s (8 s full)', m.phase === 1 && Math.abs(g.time - t0 - 8 * (2 / 3)) < 0.5, `${(g.time - t0).toFixed(1)} s`);
  check('Site A capture opens the forward-spawn gate', g.world.boxes.indexOf(m.d.gates.find((x) => x.opens === 'A').box) < 0);
  const sp = m.spawnPoints(m.attackTeam);
  check('attackers now respawn at the forward spawn', sp.every((p) => p.phase === 1), `${sp.length} points`);
  check('clock extended on capture', m.clock > 150, `${m.clock.toFixed(0)} s`);
  check('defender respawn wave longer at Site B', m.respawnDelay(def[0]) === 8 && m.respawnDelay(atk[0]) === 5);
  // overtime: run the clock out with an attacker holding progress on B
  m.clock = 1; const zb = m.sites[1]; atk.slice(1).forEach((s) => park([s])); atk[0].pos.set((zb.x0 + zb.x1) / 2, 0, (zb.z0 + zb.z1) / 2); def[1].pos.copy(atk[0].pos);
  run(3);
  check('overtime holds the half open while the site is contested', m.overtime && !m.breakT, `clock ${m.clock.toFixed(1)}`);
  park([atk[0], def[1]]); run(1.5);
  check('half ends once the attackers leave in overtime', m.breakT > 0 && m.results[0]?.captured === 1);
  run(5);
  check('sides swap for half 2', m.half === 1 && m.attackTeam !== m.results[0].team);
  check('gates close again for half 2', m.d.gates.every((gt) => g.world.boxes.includes(gt.box)));
}

// ── 2. full bot matches ──
console.log('2. bot matches (2 halves each)');
const N = +(process.env.N || 4); let atkWins = 0, halves = 0, sitesTaken = 0, leaks = 0;
for (let k = 0; k < N; k++) {
  const g = makeGame(), m = g.mode;
  let maxSetupAdvance = -Infinity;
  for (let f = 0; f < 60 * 60 * 20 && !g.over; f++) {
    tick(g, 1 / 60);
    if (m.setupT > 0) for (const s of g.soldiers) if (s.alive && s.team === m.attackTeam) {   // attackers must stay behind the gate
      const sp = m.spawnPoints(s.team)[0]; const gate = m.d.gates.find((x) => x.opens === 'setup').box;
      const beyond = sp.z > gate.max[2] ? gate.min[2] - s.pos.z : s.pos.z - gate.max[2]; maxSetupAdvance = Math.max(maxSetupAdvance, beyond);
    }
  }
  if (maxSetupAdvance > 0.2) leaks++;
  for (const r of m.results) { halves++; sitesTaken += r.captured; if (r.captured === m.sites.length) atkWins++; }
  const w = m.winner();
  console.log(`   match ${k + 1}: ${g.over ? 'ended' : 'TIMEOUT'} at ${g.time.toFixed(0)} s · ${m.results.map((r) => `team ${r.team} took ${r.captured}/${m.sites.length}${r.captured < m.sites.length ? ` +${Math.round(r.progress * 100)}%` : ` in ${r.timeUsed.toFixed(0)} s`}`).join(' | ')} · winner ${w === null ? 'draw' : 'team ' + w} · kills ${g.score.join('-')}`);
  if (process.env.V) console.log(g.events.map((e) => '      ' + e).join('\n'));
}
check('every match finished both halves', halves === N * 2, `${halves}/${N * 2} halves`);
check('attackers never got past the setup gate', leaks === 0, `${leaks} leaks`);
check('bots capture sites (attack is viable)', sitesTaken > 0, `${sitesTaken} sites in ${halves} halves, full attacks ${atkWins}/${halves}`);
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
