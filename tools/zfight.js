// Finds coplanar (or near-coplanar) overlapping visible faces → z-fighting / flicker.
//   node tools/zfight.js <mapId> [tolerance m, default 0.02]
import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }) };
const { MapKit } = await import('../src/maps/kit.js');
const B = [];
const orig = MapKit.prototype.box;
MapKit.prototype.box = function (x0, y0, z0, x1, y1, z1, mat, o = {}) {
  if (o.visible !== false && mat) { const a = Math.min(x0, x1), b = Math.max(x0, x1); const fx0 = this.flip ? -b : a, fx1 = this.flip ? -a : b; B.push({ min: [fx0, y0 + this.yOff, Math.min(z0, z1)], max: [fx1, y1 + this.yOff, Math.max(z0, z1)], mat }); }
  return orig.call(this, x0, y0, z0, x1, y1, z1, mat, o);
};
const { MAPS, TEST_MAPS } = await import('../src/maps/index.js'); const { buildMap } = await import('../src/map.js');
const tex = new THREE.Texture(); const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
const id = process.argv[2] || 'ashgrove', tol = +(process.argv[3] || 0.02);
buildMap(new THREE.Scene(), T, [...MAPS, ...TEST_MAPS].find((m) => m.id === id));
// faces: axis a, sign s, plane coord c, 2D rect in the other two axes
const F = [];
B.forEach((b, i) => { for (let a = 0; a < 3; a++) { const o = [0, 1, 2].filter((k) => k !== a); for (const s of [-1, 1]) F.push({ i, a, s, c: s < 0 ? b.min[a] : b.max[a], u0: b.min[o[0]], u1: b.max[o[0]], v0: b.min[o[1]], v1: b.max[o[1]] }); } });
const inside = (p, b, e = 1e-3) => p[0] > b.min[0] + e && p[0] < b.max[0] - e && p[1] > b.min[1] + e && p[1] < b.max[1] - e && p[2] > b.min[2] + e && p[2] < b.max[2] - e;
const groups = new Map();
for (const f of F) { const k = `${f.a}${f.s}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
const hits = new Map();
for (const g of groups.values()) {
  g.sort((p, q) => p.c - q.c);
  for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length && g[y].c - g[x].c <= tol; y++) {
    const p = g[x], q = g[y]; if (p.i === q.i) continue;
    if (B[p.i].mat === B[q.i].mat && !process.env.SAME) continue;           // same material + world-space UVs → identical pixels
    if (p.a === 1 && p.s < 0 && p.c < 0.05) continue;                       // undersides on the ground: never seen
    const du = Math.min(p.u1, q.u1) - Math.max(p.u0, q.u0), dv = Math.min(p.v1, q.v1) - Math.max(p.v0, q.v0);
    if (du <= 0.01 || dv <= 0.01) continue;
    // sample the overlap centre; skip if the face is buried inside a third box
    const o = [0, 1, 2].filter((k) => k !== p.a), pt = [0, 0, 0];
    pt[p.a] = (p.c + q.c) / 2 + p.s * 0.002; pt[o[0]] = (Math.max(p.u0, q.u0) + Math.min(p.u1, q.u1)) / 2; pt[o[1]] = (Math.max(p.v0, q.v0) + Math.min(p.v1, q.v1)) / 2;
    if (B.some((b, k) => k !== p.i && k !== q.i && inside(pt, b))) continue;
    // a face nudged outward that ends up inside the other box is hidden by it
    const at = (f) => { const v = [...pt]; v[f.a] = f.c + f.s * 0.002; return v; };
    if (inside(at(p), B[q.i]) || inside(at(q), B[p.i])) continue;
    const key = `${B[p.i].mat}|${B[q.i].mat}|${'xyz'[p.a]}${p.s > 0 ? '+' : '-'}`;
    const h = hits.get(key) || { n: 0, area: 0, ex: pt.map((v) => +v.toFixed(2)), gap: q.c - p.c }; h.n++; h.area += du * dv; hits.set(key, h);
  }
}
const list = [...hits.entries()].sort((a, b) => b[1].area - a[1].area);
console.log(`${B.length} visible boxes · ${list.reduce((s, [, h]) => s + h.n, 0)} coplanar overlaps (tol ${tol} m)`);
for (const [k, h] of list.slice(0, 40)) console.log(`  ${k.padEnd(28)} ×${String(h.n).padStart(4)}  ${h.area.toFixed(1).padStart(7)} m²  gap ${h.gap.toFixed(3)}  e.g. (${h.ex})`);
