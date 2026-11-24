// Investigation: for every bot shot in a headless match, record distance, LOS freshness,
// whether rendered geometry (what a human sees) blocks the line, and on-screen target size.
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }), documentElement: { style: { setProperty: noop } } };
const { Game } = await import('../src/game.js');
const { buildMap } = await import('../src/map.js');
const { Effects } = await import('../src/effects.js');
const { Abilities } = await import('../src/abilities.js');
const { Turret } = await import('../src/turret.js');
const { BotBrain } = await import('../src/bot.js');
const { DIFFICULTY } = await import('../src/config.js');
const { MAPS } = await import('../src/maps/index.js');

const VFOV = +(process.env.VFOV || 78), SCREEN_H = 768;
const pxTall = (d) => (1.8 * SCREEN_H) / (2 * d * Math.tan(THREE.MathUtils.degToRad(VFOV) / 2));
const report = {};
for (const def of MAPS) {
  const g = Object.create(Game.prototype);
  g.mapDef = def; g.theme = def.theme;
  g.opts = { weapon: 'ar', abilities: ['arc', 'pulse'], difficulty: process.env.DIFF || 'veteran', name: 'P' };
  g.time = 0; g.timeLeft = 600; g.score = [0, 0]; g.respawnTime = 4.5; g.over = false;
  g.scene = new THREE.Scene(); g.camera = new THREE.PerspectiveCamera(78, 1.6, 0.05, 2000);
  const tex = new THREE.Texture(); const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
  g.map = buildMap(g.scene, T, def); g.world = g.map.world;
  g.fx = new Effects(g); g.audio = { play: noop }; g.abilities = new Abilities(g, T);
  g.stasisFields = []; g.shieldWalls = []; g.decoys = []; g.targets = [];
  g.turrets = g.map.turretSpots.map((t) => new Turret(g, t.pos, t.team));
  g.input = { stance: 'stand' }; g.hud = new Proxy({}, { get: (t, k) => k === 'scoreboardHTML' ? () => '' : noop }); g.vm = g.hud;
  g.createSoldiers(); g.shakeT = 0; g.endMatch = () => { g.over = true; };
  const p = g.player; p.isPlayer = false; p.brain = new BotBrain(g, p, DIFFICULTY[g.opts.difficulty]);
  for (const s of g.soldiers) { if (s.glint) g.scene.remove(s.glint); s.glint = null; g.respawn(s); }
  // visual meshes for "what a human sees" raycasts (scenery only)
  g.scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(); const meshes = []; g.map.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) { m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox(); }
  const blockers = {};
  const visBlocked = (a, b) => { const d = b.clone().sub(a); const L = d.length(); ray.set(a, d.normalize()); ray.far = L - 0.3; const hit = ray.intersectObjects(meshes, false)[0]; if (hit) {
      // is the visual hit point on/inside a collision box? (then it's a corner graze, not visual-only geometry)
      const q = []; const P = hit.point; g.world.query(P.x - 0.12, P.z - 0.12, P.x + 0.12, P.z + 0.12, q);
      const onBox = q.some((b) => P.y > b.min[1] - 0.12 && P.y < b.max[1] + 0.12);
      const n = (onBox ? 'graze:' : 'VISUAL-ONLY:') + (hit.object.name || hit.object.material?.type || '?');
      if (!onBox) { (globalThis.VO ||= []).push(`${hit.object.name}@${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)}`); } blockers[n] = (blockers[n] || 0) + 1; } return !!hit; };
  const shots = []; let cur = null;
  const ofb = g.fireBullet.bind(g);
  g.fireBullet = (sh, o, d, w, op) => {
    if (sh.isSoldier && sh.brain && sh.brain.target && sh.brain.target.isSoldier) {
      const t = sh.brain.target, eye = sh.eyePos(new THREE.Vector3());
      const c = t.center(new THREE.Vector3()), h = t.headPos(new THREE.Vector3());
      const dist = eye.distanceTo(c);
      cur = { dist, stale: g.time - sh.brain.lastSeen, hit: false, dmg: 0,
        losNow: g.los(eye, c, sh.team) || g.los(eye, h, sh.team), sinceAcq: g.time - sh.brain.acquired, target: t };
      if (shots.length % 3 === 0) cur.vis = !(visBlocked(eye, c) && visBlocked(eye, h));
      shots.push(cur);
    } else cur = null;
    ofb(sh, o, d, w, op);
    cur = null;
  };
  const SP = Object.getPrototypeOf(p), otd = SP.takeDamage;
  const src = {};
  SP.takeDamage = function (n, att, info) { if (this.alive && n > 0) { const k = !att ? 'world' : att.isTurret ? 'sentry turret' : info?.kind === 'gun' ? 'bot gunfire' : info?.kind === 'melee' ? 'melee' : 'abilities'; src[k] = (src[k] || 0) + n; } if (cur && this === cur.target && info?.kind === 'gun') { cur.hit = true; cur.dmg += n; } return otd.call(this, n, att, info); };
  const dt = 1 / 60;
  for (let f = 0; f < 240 * 60 && !g.over; f++) {
    g.time += dt; g.timeLeft -= dt; g.pathBudget = 3;
    const TT = g.targets; TT.length = 0;
    for (const s of g.soldiers) if (s.alive) TT.push(s);
    for (const t of g.turrets) if (t.alive) TT.push(t);
    for (const s of g.soldiers) { s.timeScale = 1; s.inStasis = false; }
    g.abilities.update(dt);
    for (const s of g.soldiers) {
      if (s.alive) { const inp = s.brain.update(dt); s.lastInput = inp; s.update(dt, inp); }
      else { s.respawnTimer -= dt; if (s.respawnTimer <= 0) g.respawn(s); }
    }
    for (const t of g.turrets) t.update(dt);
  }
  SP.takeDamage = otd;
  const buckets = [[0, 20], [20, 40], [40, 60], [60, 90], [90, 130], [130, 999]];
  const fog = def.theme.fog;
  console.log(`\n=== ${def.name}  (fog ${fog.near}–${fog.far} m) — ${shots.length} bot shots at soldiers`);
  console.log('range m    shots  %ofDmg  hit%   staleLOS%  visualBlocked%  px-tall@768  fog%');
  const totalDmg = shots.reduce((a, s) => a + s.dmg, 0);
  for (const [a, b] of buckets) {
    const S = shots.filter((s) => s.dist >= a && s.dist < b); if (!S.length) continue;
    const V = S.filter((s) => s.vis !== undefined);
    const mid = Math.min((a + b) / 2, 160), fogK = Math.max(0, Math.min(1, (mid - fog.near) / (fog.far - fog.near)));
    console.log(`${String(a).padStart(3)}-${String(b === 999 ? '+' : b).padEnd(4)}  ${String(S.length).padStart(6)}  ${(100 * S.reduce((x, s) => x + s.dmg, 0) / totalDmg).toFixed(0).padStart(5)}%  ${(100 * S.filter((s) => s.hit).length / S.length).toFixed(0).padStart(4)}%  ${(100 * S.filter((s) => !s.losNow).length / S.length).toFixed(1).padStart(8)}%  ${(V.length ? 100 * V.filter((s) => !s.vis).length / V.length : 0).toFixed(1).padStart(12)}%  ${pxTall(mid).toFixed(0).padStart(10)}  ${(100 * fogK).toFixed(0).padStart(4)}%`);
  }
  console.log('visual blockers (first mesh hit on blocked lines):', Object.entries(blockers).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join('  '));
  const vo = {}; for (const k of globalThis.VO || []) { const kk = k.replace(/(-?\d+)\.\d/g, '$1'); vo[kk] = (vo[kk] || 0) + 1; } globalThis.VO = [];
  console.log('top visual-only spots:', Object.entries(vo).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ×${v}`).join(' | '));
  const tot = Object.values(src).reduce((a, b) => a + b, 0);
  console.log('damage by source:', Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(' · '));
  const quick = shots.filter((s) => s.sinceAcq < 0.25);
  console.log(`shots fired <250 ms after first sighting: ${quick.length} (${(100 * quick.length / shots.length).toFixed(1)}%), their hit%: ${(100 * quick.filter((s) => s.hit).length / Math.max(1, quick.length)).toFixed(0)}%`);
  const far = shots.filter((s) => s.dist > 60), farFirst = far.filter((s) => s.sinceAcq < 1);
  console.log(`>60 m: first-second-of-engagement hit% ${(100 * farFirst.filter((s) => s.hit).length / Math.max(1, farFirst.length)).toFixed(0)}%  (n=${farFirst.length})`);
}
