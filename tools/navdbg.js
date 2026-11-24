import * as THREE from 'three';
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' || k === 'createImageData') ? (a, b, w = 4, h = 4) => ({ data: new Uint8ClampedArray(w * h * 4) }) : (typeof k === 'string' && k.startsWith('create')) ? () => ({ addColorStop: noop }) : noop, set: () => true });
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => ctx2d }) };
const { MAPS } = await import('../src/maps/index.js');
const { buildMap } = await import('../src/map.js');
const tex = new THREE.Texture();
const T = new Proxy({}, { get: (_, k) => (k === 'waterNormal' || k === 'hex') ? tex : { map: tex, normalMap: tex } });
const m = buildMap(new THREE.Scene(), T, MAPS.find((d) => d.id === process.argv[2]));
const [x0, z0, x1, z1] = process.argv.slice(3, 7).map(Number);
for (let z = z0; z <= z1; z++) { let row = ''; for (let x = x0; x <= x1; x++) { const k = m.nav.idx(x + 0.5, z + 0.5); row += !m.nav.walk[k] ? '#' : m.nav.h[k] > 0.1 ? '^' : m.nav.cost[k] >= 5 ? ':' : '.'; } console.log(String(z).padStart(4), row); }
if (process.argv[7]) { const [a, b, c, d] = process.argv.slice(7).map(Number); console.log('path', JSON.stringify(m.nav.findPath(a, b, c, d))); }
