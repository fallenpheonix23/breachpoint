// Map validator:  node tools/validate.js <mapId | path/to/map.json> [--stride N]
// Writes tools/out/<id>/report.txt, report.json and floor-*.svg (per-floor plans with overlays).
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }), documentElement: { style: { setProperty: noop } } };
const { MAPS, TEST_MAPS } = await import('../src/maps/index.js');
const { buildMap } = await import('../src/map.js');
const { L_SHOT, MAX_SLOPE_DEG } = await import('../src/physics.js');
const { DEFAULT_HFOV } = await import('../src/config.js');

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || 'testbed';
const strideArg = args.includes('--stride') ? +args[args.indexOf('--stride') + 1] : null;
let def = [...MAPS, ...TEST_MAPS].find((m) => m.id === target);
if (!def && fs.existsSync(target)) { const d = JSON.parse(fs.readFileSync(target, 'utf8')); def = { id: d.id, name: d.name, theme: d.theme, data: d }; }
if (!def) { console.error('unknown map', target); process.exit(1); }

const tex = new THREE.Texture();
const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
const t0 = performance.now();
const map = buildMap(new THREE.Scene(), T, def);
const nav = map.nav, world = map.world;
const BR = map.breach || null; if (BR) for (const gt of BR.gates) world.remove(gt.box);
const NN = nav.nodeCount;
const graph = nav.buildGraph();
const floors = map.floors && map.floors.length ? map.floors : [{ name: 'Ground', y: 0 }];
const floorOf = (h) => { let f = 0; for (let i = 0; i < floors.length; i++) if (h >= floors[i].y - 0.6) f = i; return f; };
const pos = (n) => { const [x, z] = nav.nodeXZ(n); return { x, y: nav.nh[n], z }; };
const zoneName = (p) => { const z = map.zoneAt(p.x, p.z, p.y); return z ? z.name : '—'; };
const fmt = (p) => `(${p.x.toFixed(0)}, ${p.y.toFixed(1)}, ${p.z.toFixed(0)}) ${zoneName(p)} [${floors[floorOf(p.y)].name}]`;
const out = []; const log = (s = '') => { out.push(s); console.log(s); };
const R = { map: def.id, name: map.name, errors: [], warnings: [] };

// ── summary ──
let drops = 0, jumps = 0; for (const e of graph) for (const [, k] of e) { if (k === 'drop') drops++; if (k === 'jump') jumps++; }
const perFloor = floors.map(() => 0); for (let n = 0; n < NN; n++) perFloor[floorOf(nav.nh[n])]++;
log(`MAP ${map.name} (${def.id}) — built in ${(performance.now() - t0).toFixed(0)} ms`);
log(`  bounds ${JSON.stringify(map.bounds)} · ${world.boxes.length} boxes · ${world.ramps.length} ramps · ${NN} nav nodes · ${drops} drop links · ${jumps} jump links`);
log(`  nodes per floor: ${floors.map((f, i) => `${f.name}@${f.y}m=${perFloor[i]}`).join('  ')}`);
for (const r of world.ramps) if (!r.walkable) { R.errors.push(`ramp steeper than ${MAX_SLOPE_DEG}°`); log(`  ✗ ramp at (${r.x0},${r.z0}) is ${r.slopeDeg.toFixed(1)}° > ${MAX_SLOPE_DEG}°`); }
for (const r of world.ramps) log(`  ramp (${r.x0},${r.z0})–(${r.x1},${r.z1}) ${r.y0}→${r.y1} m, ${r.slopeDeg.toFixed(1)}°`);

// ── 1. connectivity ──
log('\n1. WALKABLE CONNECTIVITY');
const spawnNodes = [0, 1].map((t) => map.spawns[t].map((p) => nav.nodeAt(p.x, p.y, p.z)));
const bfs = (seeds, rev) => {
  const seen = new Uint8Array(NN), st = [];
  const radj = rev ? (() => { const a = Array.from({ length: NN }, () => []); for (let n = 0; n < NN; n++) for (const [m] of graph[n]) a[m].push(n); return a; })() : null;
  for (const s of seeds) if (s >= 0 && !seen[s]) { seen[s] = 1; st.push(s); }
  while (st.length) { const n = st.pop(); for (const m of rev ? radj[n] : graph[n].map((e) => e[0])) if (!seen[m]) { seen[m] = 1; st.push(m); } }
  return seen;
};
const fwd = bfs([...spawnNodes[0], ...spawnNodes[1]]), back = bfs([...spawnNodes[0], ...spawnNodes[1]], true);
const fromBlue = bfs(spawnNodes[0]), fromRed = bfs(spawnNodes[1]);
const inArea = (p) => map.zones.some((z) => z.kind !== 'NEST' && p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1 && p.y >= z.y0 - 0.3 && p.y <= z.y1);
const cluster = (pred) => { // connected components (8-neighbour, same level) of nodes matching pred
  const lab = new Int32Array(NN).fill(-1), groups = [];
  for (let n = 0; n < NN; n++) {
    if (lab[n] >= 0 || !pred(n)) continue;
    const g = [], st = [n]; lab[n] = groups.length;
    while (st.length) { const c = st.pop(); g.push(c); nav.forEdges(c, (m, k) => { if (k === 'walk' && lab[m] < 0 && pred(m)) { lab[m] = groups.length; st.push(m); } }, true); }
    groups.push(g);
  }
  return groups.sort((a, b) => b.length - a.length);
};
const M2 = nav.cs * nav.cs;
const unreachable = cluster((n) => !fwd[n] && inArea(pos(n))).filter((g) => g.length * M2 >= 4);
const ignored = cluster((n) => !fwd[n] && !inArea(pos(n))).reduce((a, g) => a + g.length, 0);
const stuck = cluster((n) => fwd[n] && !back[n]).filter((g) => g.length * M2 >= 1);
const oneTeam = cluster((n) => fwd[n] && (!fromBlue[n] || !fromRed[n]) && inArea(pos(n)));
log(`  reachable nodes: ${fwd.reduce((a, v) => a + v, 0)} / ${NN}   (${ignored} unreachable nodes outside tagged areas — roofs/props, ignored)`);
log(unreachable.length ? `  ✗ ${unreachable.length} unreachable region(s) inside tagged areas:` : '  ✓ no unreachable regions inside tagged areas');
for (const g of unreachable.slice(0, 8)) { R.errors.push('unreachable region'); log(`     ${(g.length * M2).toFixed(0)} m² at ${fmt(pos(g[0]))}`); }
log(stuck.length ? `  ✗ ${stuck.length} stuck region(s) (reachable but no way back to a spawn):` : '  ✓ no stuck spots (every reachable node can return to a spawn)');
for (const g of stuck.slice(0, 8)) { R.errors.push('stuck region'); log(`     ${(g.length * M2).toFixed(0)} m² at ${fmt(pos(g[0]))}`); }
if (oneTeam.length) { log(`  ! ${oneTeam.length} region(s) reachable by only one team:`); for (const g of oneTeam.slice(0, 5)) log(`     ${(g.length * M2).toFixed(0)} m² at ${fmt(pos(g[0]))}`); }

// ── 2. travel times ──
log('\n2. SHORTEST TRAVEL TIME, spawn → key area (sprint 9.0 m/s · walk 6.2 m/s)');
const SPR = 9.0, WALK = 6.2, G = 22;
const dijkstra = (seeds) => {
  const t = new Float64Array(NN).fill(Infinity), L = new Float64Array(NN), X = new Float64Array(NN), done = new Uint8Array(NN);
  const heap = []; const push = (n, v) => { heap.push([v, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const s of seeds) if (s >= 0) { t[s] = 0; push(s, 0); }
  while (heap.length) {
    const [v, n] = pop(); if (done[n]) continue; done[n] = 1;
    for (const [m, kind] of graph[n]) {
      const a = pos(n), b = pos(m), hl = Math.hypot(b.x - a.x, b.z - a.z), dh = a.y - b.y;
      const extra = kind === 'drop' ? Math.sqrt((2 * Math.max(0, dh)) / G) : kind === 'jump' ? 0.4 : 0;
      const len = Math.hypot(hl, kind === 'walk' ? dh : 0);
      const nv = v + len / SPR + extra;
      if (nv < t[m]) { t[m] = nv; L[m] = L[n] + len; X[m] = X[n] + extra; push(m, nv); }
    }
  }
  return { t, L, X };
};
const D = [dijkstra(spawnNodes[0]), dijkstra(spawnNodes[1])];
const keyAreas = map.zones.filter((z) => z.key || z.tag === 'siteA' || z.tag === 'siteB');
R.travel = [];
const rows = [];
for (const z of keyAreas) {
  const best = [0, 1].map((t) => { let bt = Infinity, bn = -1; for (let n = 0; n < NN; n++) { const p = pos(n); if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1 && p.y >= z.y0 - 0.3 && p.y <= z.y1 && D[t].t[n] < bt) { bt = D[t].t[n]; bn = n; } } return bn; });
  const cell = (t) => { const n = best[t]; if (n < 0 || !isFinite(D[t].t[n])) { R.errors.push(`${z.name} unreachable from team ${t}`); return '   UNREACHABLE    '; } const L = D[t].L[n], X = D[t].X[n]; R.travel.push({ area: z.name, team: t, sprint: +(L / SPR + X).toFixed(1), walk: +(L / WALK + X).toFixed(1), metres: +L.toFixed(0) }); return `${(L / SPR + X).toFixed(1).padStart(5)} s / ${(L / WALK + X).toFixed(1).padStart(5)} s ${L.toFixed(0).padStart(4)} m`; };
  rows.push(`  ${z.name.padEnd(22)} ${(z.tag || '').padEnd(6)} BLUE ${cell(0)}   RED ${cell(1)}`);
}
log(rows.join('\n') || '  (no key areas tagged)');

// ── 3–6. sightlines ──
const stride = strideArg || (NN > 36000 ? 3 : 2); // metres
const sc = Math.max(1, Math.round(stride / nav.cs));
const samples = [];
for (let n = 0; n < NN; n++) { if (!fwd[n]) continue; const k = nav.ncell[n], i = k % nav.W, j = (k / nav.W) | 0; if (i % sc === 0 && j % sc === 0) samples.push(n); }
const S = samples.map(pos);
const spawnZone = BR
  ? (p) => { const z = map.zoneAt(p.x, p.z, p.y); if (!z || z.kind !== 'SPAWN') return -1; let best = -1, bd = Infinity; for (const t of [0, 1]) for (const q of map.spawns[t]) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = t; } } return best; }
  : (p) => { const z = map.zoneAt(p.x, p.z, p.y); return z && z.kind === 'SPAWN' ? (p.x < 0 ? 0 : 1) : -1; };
const hit = {}; const dir = new THREE.Vector3(), eye = new THREE.Vector3(), tgt = new THREE.Vector3();
const visible = (a, b) => { // eye of a → chest or head of b, bullet-blocking geometry only
  eye.set(a.x, a.y + 1.66, a.z);
  for (const hy of [1.1, 1.6]) { tgt.set(b.x, b.y + hy, b.z); dir.copy(tgt).sub(eye); const d = dir.length(); dir.multiplyScalar(1 / d); if (!world.raycast(eye, dir, d - 0.3, hit, L_SHOT)) return true; }
  return false;
};
const t1 = performance.now();
const maxVis = new Float32Array(S.length), maxFrom = new Int32Array(S.length).fill(-1);
const lines = [];
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
  const a = S[i], b = S[j], d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  if (d < 12) continue;
  if (!visible(a, b)) continue;
  if (d > maxVis[i]) { maxVis[i] = d; maxFrom[i] = j; } if (d > maxVis[j]) { maxVis[j] = d; maxFrom[j] = i; }
  lines.push([i, j, d]);
}
lines.sort((p, q) => q[2] - p[2]);
log(`\n3. LONGEST UNBROKEN SIGHTLINES (eye 1.66 m → chest/head, ${S.length} sample points every ${stride} m, ${(performance.now() - t1).toFixed(0)} ms)`);
const shown = [], seenPairs = new Set();
for (const [i, j, d] of lines) {
  const key = [zoneName(S[i]), zoneName(S[j])].sort().join('|');
  if (seenPairs.has(key)) continue; seenPairs.add(key); shown.push([i, j, d]);
  log(`  ${d.toFixed(1).padStart(5)} m  ${fmt(S[i])}  ↔  ${fmt(S[j])}`);
  if (shown.length >= 10) break;
}
// blocker hotspots: 2 m cells crossed by the most sightlines longer than the cap (HOT=<cap m>, west half only when MIRROR=1)
if (process.env.HOT) {
  const cap = +process.env.HOT, cnt = new Map(), seen = new Set();
  const long = lines.filter((l) => l[2] > cap);
  for (const [i, j] of long) {
    const a = S[i], b = S[j], n = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.5); seen.clear();
    for (let k = 0; k <= n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + 1.66 + (b.y + 1.1 - a.y - 1.66) * t;
      if (process.env.MIRROR && x > 0) continue;
      const key = `${Math.floor(x / 2) * 2},${Math.floor(z / 2) * 2},${y < 3.5 ? 'low' : 'high'}`; if (seen.has(key)) continue; seen.add(key); cnt.set(key, (cnt.get(key) || 0) + 1); }
  }
  log(`\n   HOTSPOTS: ${long.length} lines > ${cap} m; 2 m cells they cross most (x,z,height band):`);
  for (const [k, c] of [...cnt.entries()].sort((p, q) => q[1] - p[1]).slice(0, +(process.env.HOTN || 30))) { const [x, z] = k.split(',').map(Number); log(`     ${k.padEnd(16)} ${String(c).padStart(5)}   ${map.zoneAt(x + 1, z + 1, 0)?.name || '—'}`); }
}
const longest = lines.length ? lines[0][2] : 0;
R.longestSightline = +longest.toFixed(1);

log('\n4. SPAWN → ENEMY SPAWN SIGHTLINES (must be 0)');
const sp = [[], []]; for (let n = 0; n < NN; n++) { if (!fwd[n]) continue; const p = pos(n), t = spawnZone(p); if (t >= 0) sp[t].push(p); }
let spawnLines = 0, worst = null;
for (const a of sp[0]) for (const b of sp[1]) if (visible(a, b)) { spawnLines++; const d = Math.hypot(a.x - b.x, a.z - b.z); if (!worst || d < worst[2]) worst = [a, b, d]; }
log(spawnLines ? `  ✗ ${spawnLines} spawn-to-spawn sightlines, e.g. ${fmt(worst[0])} ↔ ${fmt(worst[1])}` : `  ✓ 0 (checked ${sp[0].length} × ${sp[1].length} spawn positions)`);
if (spawnLines) R.errors.push('spawn-to-spawn sightlines');
R.spawnSightlines = spawnLines;

log('\n5. ON-SCREEN ENEMY HEIGHT AT THE LONGEST SIGHTLINE (default FOV ' + DEFAULT_HFOV + '° horizontal, 1.8 m soldier)');
const px = (d, w, h) => { const vf = 2 * Math.atan(Math.tan((DEFAULT_HFOV * Math.PI) / 360) * (h / w)); return (1.8 * h) / (2 * d * Math.tan(vf / 2)); };
for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  const v = longest ? px(longest, w, h) : Infinity;
  const ok = v >= 25;
  log(`  ${w}×${h}: ${longest.toFixed(1)} m → ${isFinite(v) ? v.toFixed(0) : '—'} px tall ${ok ? '✓' : '✗ (< 25 px: shorten this sightline)'}`);
  if (!ok) R.warnings.push(`longest sightline ${longest.toFixed(0)} m is ${v.toFixed(0)} px at ${w}x${h}`);
}
R.px1366 = longest ? +px(longest, 1366, 768).toFixed(0) : null;

log('\n6. POSITIONS WHERE AN ENEMY CAN BE HIT FROM MORE THAN 30 m');
const exposed = []; for (let i = 0; i < S.length; i++) if (maxVis[i] > 30) exposed.push(i);
const byArea = {};
for (const i of exposed) { const k = `${zoneName(S[i])} [${floors[floorOf(S[i].y)].name}]`; (byArea[k] ||= { n: 0, max: 0, at: null, from: null }); byArea[k].n++; if (maxVis[i] > byArea[k].max) { byArea[k].max = maxVis[i]; byArea[k].at = S[i]; byArea[k].from = S[maxFrom[i]]; } }
log(`  ${exposed.length} of ${S.length} sample positions (${((100 * exposed.length) / Math.max(1, S.length)).toFixed(1)}%) are exposed beyond 30 m`);
for (const [k, v] of Object.entries(byArea).sort((a, b) => b[1].max - a[1].max)) log(`   ${k.padEnd(34)} ${String(v.n).padStart(4)} spots · up to ${v.max.toFixed(1)} m (e.g. ${fmt(v.at)} ← from ${fmt(v.from)})`);
R.exposed30 = Object.fromEntries(Object.entries(byArea).map(([k, v]) => [k, { spots: v.n, maxDist: +v.max.toFixed(1) }]));

// ── per-floor SVG plans ──
const dirOut = path.join('tools', 'out', def.id); fs.mkdirSync(dirOut, { recursive: true });
const SC = Math.max(6, Math.min(14, 1200 / (map.bounds.x1 - map.bounds.x0))), PX = SC * nav.cs, W = Math.round(nav.W * PX), H = Math.round(nav.H * PX);
const X = (x) => ((x - nav.x0) * SC).toFixed(1), Z = (z) => ((z - nav.z0) * SC).toFixed(1);
const kindFill = { SPAWN: '#3b5f8a', LONG: '#6b5e44', MID: '#4c5866', SHORT: '#6a4f44', HALL: '#7a6233', INDOOR: '#5a5a52', SITE: '#2f6b4a', ROOF: '#55505a' };
floors.forEach((f, fi) => {
  const lo = f.y - 0.6, hi = fi + 1 < floors.length ? floors[fi + 1].y - 0.6 : Infinity;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 56}" viewBox="0 0 ${W} ${H + 56}" font-family="sans-serif">`;
  svg += `<rect width="${W}" height="${H + 56}" fill="#15171c"/>`;
  for (let k = 0; k < nav.W * nav.H; k++) {
    let n = -1; for (let m = nav.start[k]; m < nav.start[k + 1]; m++) if (nav.nh[m] >= lo && nav.nh[m] < hi) n = m;
    const i = k % nav.W, j = (k / nav.W) | 0;
    if (n < 0) continue;
    const p = pos(n), zn = map.zoneAt(p.x, p.z, p.y);
    let fill = zn ? kindFill[zn.kind] || '#555' : '#505050';
    if (!fwd[n]) fill = '#2a2a2e'; else if (!back[n]) fill = '#a02020';
    const ramp = p.y - f.y > 0.15 && p.y - f.y < (hi - lo) - 0.2; // stairs / ramp cells between floors
    svg += `<rect x="${(i * PX).toFixed(1)}" y="${(j * PX).toFixed(1)}" width="${PX}" height="${PX}" fill="${fill}" ${ramp ? `opacity="${(0.55 + 0.45 * ((p.y - f.y) / Math.max(1, hi - lo))).toFixed(2)}"` : ''}/>`;
  }
  for (let n = 0; n < NN; n++) { // drop / jump links
    const p = pos(n); if (p.y < lo || p.y >= hi) continue;
    for (const [m, kind] of graph[n]) if (kind !== 'walk') { const q = pos(m); svg += `<line x1="${X(p.x)}" y1="${Z(p.z)}" x2="${X(q.x)}" y2="${Z(q.z)}" stroke="${kind === 'drop' ? '#ff9a2a' : '#c06bff'}" stroke-width="1" opacity="0.85" marker-end="url(#a)"/>`; }
  }
  for (const z of map.zones) if (z.y1 > f.y + 0.1 && z.y0 < hi && z.kind !== 'NEST') svg += `<rect x="${X(z.x0)}" y="${Z(z.z0)}" width="${((z.x1 - z.x0) * SC).toFixed(1)}" height="${((z.z1 - z.z0) * SC).toFixed(1)}" fill="none" stroke="${z.key ? '#ffd27a' : '#8a96a6'}" stroke-width="${z.key ? 1.6 : 0.8}" stroke-dasharray="4 3"/><text x="${(+X(z.x0) + 3).toFixed(1)}" y="${(+Z(z.z0) + 11).toFixed(1)}" fill="#e8ecf2" font-size="10">${z.name}</text>`;
  for (const [i, j, d] of shown) { const a = S[i], b = S[j]; if (floorOf(a.y) === fi || floorOf(b.y) === fi) svg += `<line x1="${X(a.x)}" y1="${Z(a.z)}" x2="${X(b.x)}" y2="${Z(b.z)}" stroke="#4ad3ff" stroke-width="1.4" opacity="0.8"/>`; }
  for (const i of exposed) if (floorOf(S[i].y) === fi) svg += `<circle cx="${X(S[i].x)}" cy="${Z(S[i].z)}" r="2.2" fill="#ff4a4a" opacity="0.8"/>`;
  for (const t of [0, 1]) for (const p of map.spawns[t]) if (floorOf(p.y) === fi) svg += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="4" fill="${t ? '#ff5a4a' : '#4ab0ff'}" stroke="#fff"/>`;
  svg += `<defs><marker id="a" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L4,2 L0,4 z" fill="#ffd27a"/></marker></defs>`;
  svg += `<text x="8" y="${H + 22}" fill="#fff" font-size="16" font-weight="bold">${map.name} — floor ${fi}: ${f.name} (${f.y} m)</text><text x="8" y="${H + 44}" fill="#b9c3d0" font-size="12">fill = area type (unlabelled grey = walkable) · dark = unreachable · red = stuck · faded = stairs/ramp · orange = drop · purple = jump · blue = longest sightlines · red dots = hittable from &gt;30 m · yellow dashed = key areas</text></svg>`;
  fs.writeFileSync(path.join(dirOut, `floor-${fi}-${f.name.toLowerCase().replace(/\W+/g, '-')}.svg`), svg);
});
if (BR) {
  log('\n7. BREACH (attack / defend) — per phase');
  const inZ = (p, z) => p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1 && p.y >= z.y0 && p.y <= z.y1;
  const seedsFor = (role, ph) => { for (let k = ph; k >= 0; k--) if (BR.spawns[role][k]?.length) return BR.spawns[role][k].map((q) => nav.nodeAt(q.x, q.y, q.z)); return []; };
  R.breach = [];
  BR.objectives.forEach((z, ph) => {
    const zn = []; for (let n = 0; n < NN; n++) if (fwd[n] && inZ(pos(n), z)) zn.push(n);
    const res = {};
    for (const role of ['attack', 'defend']) {
      const d = dijkstra(seedsFor(role, ph)); let bn = -1; for (const n of zn) if (bn < 0 || d.t[n] < d.t[bn]) bn = n;
      res[role] = bn >= 0 && isFinite(d.t[bn]) ? { s: d.L[bn] / SPR + d.X[bn], m: d.L[bn] } : null;
    }
    const f = (r) => r ? `${r.s.toFixed(1)} s (${r.m.toFixed(0)} m)` : 'UNREACHABLE';
    log(`  ${z.name.padEnd(14)} attackers ${f(res.attack).padEnd(16)} defenders ${f(res.defend).padEnd(16)}${ph === 0 ? ` (+${BR.setup} s setup head start for defenders)` : ''}`);
    if (!res.attack || !res.defend) R.errors.push(`${z.name} unreachable for a role`);
    // spawn rooms must not see capture zones (or vice versa)
    const spawnNodes2 = []; for (let n = 0; n < NN; n++) if (fwd[n] && spawnZone(pos(n)) >= 0) spawnNodes2.push(n);
    let lines = 0, ex = null; const zs = zn.filter((_, i) => i % 3 === 0), ss = spawnNodes2.filter((_, i) => i % 3 === 0);
    for (const a of ss) for (const b of zs) if (visible(pos(a), pos(b))) { lines++; ex ||= [pos(a), pos(b)]; }
    log(`    spawn ↔ ${z.id} zone sightlines: ${lines ? `✗ ${lines}, e.g. ${fmt(ex[0])} ↔ ${fmt(ex[1])}` : '✓ 0'}`);
    if (lines) R.errors.push(`spawn sees capture zone ${z.id}`);
    R.breach.push({ site: z.id, attack: res.attack && +res.attack.s.toFixed(1), defend: res.defend && +res.defend.s.toFixed(1), spawnLines: lines });
  });
  // setup seal: with the setup gates closed, attackers must not be able to walk to the first site
  const gr = BR.gates.filter((gt) => gt.opens === 'setup').map((gt) => gt.box);
  const blocked = (n) => { const p = pos(n); return gr.some((b) => p.x > b.min[0] - 0.4 && p.x < b.max[0] + 0.4 && p.z > b.min[2] - 0.4 && p.z < b.max[2] + 0.4); };
  const seen = new Uint8Array(NN), st = seedsFor('attack', 0).filter((n) => n >= 0);
  for (const n of st) seen[n] = 1;
  while (st.length) { const n = st.pop(); for (const [m] of graph[n]) if (!seen[m] && !blocked(m)) { seen[m] = 1; st.push(m); } }
  let leak = false; for (let n = 0; n < NN; n++) if (seen[n] && inZ(pos(n), BR.objectives[0])) { leak = true; break; }
  log(`  setup gates seal the attacker spawn: ${leak ? '✗ NO — attackers can walk out during setup' : '✓ yes'}`);
  if (leak) R.errors.push('setup gates do not seal the attacker spawn');
}
fs.writeFileSync(path.join(dirOut, 'report.txt'), out.join('\n'));
fs.writeFileSync(path.join(dirOut, 'report.json'), JSON.stringify(R, null, 2));
log(`\nwrote ${dirOut}/report.txt, report.json and ${floors.length} floor plan(s) · ${R.errors.length} error(s), ${R.warnings.length} warning(s)`);
