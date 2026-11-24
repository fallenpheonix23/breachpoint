// MapKit — authoring toolkit for hand-built maps: walls with door/window openings,
// enterable buildings, stairs, sniper nests, themed props, zones and bot routes.
// Everything authored for the blue (x<0) half can be mirrored to the red half with kit.mirror().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { World, L_ALL, L_MOVE, L_SHOT } from '../physics.js';
export const LAYERS = { all: L_ALL, move: L_MOVE, shot: L_SHOT, visual: 0 };
import { NavGrid } from '../nav.js';
import { signTexture } from '../textures.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const HALL_KINDS = new Set(['HALL', 'INDOOR']);

export class MapKit {
  constructor(scene, T, theme) {
    this.scene = scene; this.T = T; this.theme = theme;
    this.world = new World();
    this.buckets = new Map(); this.matDefs = {}; this.mats = {};
    this.flip = false;
    this.yOff = 0; // vertical offset for authoring on upper floors (see at())
    this.zones = []; this.nests = []; this.covers = []; this.turretSpots = []; this.spawns = [[], []];
    this.lanes = {}; this.connectors = []; this.extras = []; this.animated = []; this.pointLights = [];
    this.bounds = { x0: -86, z0: -58, x1: 86, z1: 58 };
    this.group = new THREE.Group();
    // default materials every map can use (maps override colours via defMat)
    this.defMat('trim', { tex: 'concrete', color: 0x5b5f66, scale: 2, rough: 0.7 });
    this.defMat('dark', { tex: 'metal', color: 0x2a2d33, scale: 2, rough: 0.6, metal: 0.4 });
    this.defMat('metal', { tex: 'metal', color: 0x9aa2ad, scale: 2, rough: 0.45, metal: 0.6 });
    this.defMat('wood', { tex: 'wood', color: 0xffffff, scale: 2, rough: 0.8 });
    this.defMat('crate', { tex: 'wood', color: 0xd7a26a, scale: 1.2, rough: 0.8 });
    this.defMat('glass', { color: 0x1d2b38, rough: 0.08, metal: 0.9, env: 1.2 });
    this.defMat('rubber', { color: 0x1a1a1c, rough: 0.9 });
    this.defMat('leaf', { color: 0x4f9a3c, rough: 0.8 });
    this.defMat('leaf2', { color: 0x6fbf3f, rough: 0.8 });
    this.defMat('bark', { tex: 'wood', color: 0x8a6a4a, scale: 1, rough: 0.9 });
    this.defMat('soil', { color: 0x4a3626, rough: 1 });
    this.defMat('sandbag', { tex: 'cloth', color: 0xb8a57a, scale: 1, rough: 1 });
    this.defMat('nestPad', { basic: C(0.6, 3.2, 1.8), transparent: true, opacity: 0.5 });
    this.defMat('lamp', { basic: C(6, 4.6, 2.8) });
    this.defMat('light', { basic: C(5, 5, 4.6) });
    this.defMat('bulb', { basic: C(6, 3.6, 1.4) });
    this.defMat('blue', { basic: C(0.5, 1.8, 6) });
    this.defMat('red', { basic: C(6, 0.6, 0.5) });
    this.defMat('stoneLight', { tex: 'stone', color: 0xe6dccb, scale: 2, rough: 0.9 });
    this.defMat('barrelA', { tex: 'metal', color: 0xc8463b, scale: 1, rough: 0.5, metal: 0.4 });
    this.defMat('barrelB', { tex: 'metal', color: 0x2f7fb8, scale: 1, rough: 0.5, metal: 0.4 });
    this.defMat('waterBasin', { basic: C(0.25, 0.9, 1.1) });
    this.defMat('flowerR', { color: 0xe8434f, rough: 0.7 });
    this.defMat('flowerY', { color: 0xf5c33b, rough: 0.7 });
    this.defMat('flowerP', { color: 0xc04ad8, rough: 0.7 });
  }

  // ── materials ─────────────────────────────────────────────────────────────
  defMat(name, o) { this.matDefs[name] = o; }
  material(name) {
    if (this.mats[name]) return this.mats[name];
    const o = this.matDefs[name];
    if (!o) throw new Error('unknown material ' + name);
    let m;
    if (o.basic) {
      m = new THREE.MeshBasicMaterial({ color: o.basic, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide, depthWrite: !o.transparent });
    } else {
      const tex = o.tex ? this.T[o.tex] : null;
      m = new THREE.MeshStandardMaterial({
        color: o.color ?? 0xffffff, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0,
        map: tex ? tex.map : null, normalMap: tex ? tex.normalMap : null,
        side: o.side || THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1,
      });
      if (tex) m.normalScale.set(o.normal ?? 0.8, o.normal ?? 0.8);
      if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
      m.userData.env = o.env ?? 0.4;
    }
    this.mats[name] = m;
    return m;
  }
  texScale(name) { return this.matDefs[name]?.scale ?? 2; }

  // ── geometry plumbing ─────────────────────────────────────────────────────
  X(x) { return this.flip ? -x : x; }
  team() { return this.flip ? 1 : 0; }
  at(y, fn) { const prev = this.yOff; this.yOff = prev + y; try { fn(this); } finally { this.yOff = prev; } }
  mirror(fn) { this.flip = false; fn(this, 0); this.flip = true; fn(this, 1); this.flip = false; }
  put(g, mat) {
    if (g.index) g = g.toNonIndexed();
    if (this.flip) {
      g.scale(-1, 1, 1);
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i += 3) { // fix winding
        for (const a of [p, n]) {
          const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
          a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
          a.setXYZ(i + 2, x, y, z);
        }
      }
    }
    if (this.yOff) g.translate(0, this.yOff, 0);
    const s = this.texScale(mat), p = g.attributes.position, n = g.attributes.normal;
    const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
      else if (ax >= az) uv.setXY(i, p.getZ(i) / s, p.getY(i) / s);
      else uv.setXY(i, p.getX(i) / s, p.getY(i) / s);
    }
    g.setAttribute('uv', uv);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
  }
  // axis-aligned box (pre-mirror coordinates)
  box(x0, y0, z0, x1, y1, z1, mat, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const fx0 = this.flip ? -x1 : x0, fx1 = this.flip ? -x0 : x1;
    const layer = typeof o.layer === 'string' ? LAYERS[o.layer] : (o.layer ?? L_ALL);
    if (o.collide !== false && layer) this.world.add(fx0, y0 + this.yOff, z0, fx1, y1 + this.yOff, z1, mat, layer);
    if (o.visible === false || !mat) return;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const r = Math.min(o.r || 0, w / 2.01, h / 2.01, d / 2.01);
    const g = r > 0.005 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.put(g, mat);
  }
  cbox(cx, cz, w, d, y0, y1, mat, o) { this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2, mat, o); }
  geo(g, mat) { this.put(g, mat); }
  cyl(cx, cz, r, y0, y1, mat, o = {}) {
    const g = new THREE.CylinderGeometry(o.rTop ?? r, r, y1 - y0, o.seg || 12);
    g.translate(cx, (y0 + y1) / 2, cz);
    this.put(g, mat);
    if (o.collide) this.world.add(this.X(cx) - r * 0.85, y0 + this.yOff, cz - r * 0.85, this.X(cx) + r * 0.85, y1 + this.yOff, cz + r * 0.85, mat);
  }
  sphere(cx, cy, cz, r, mat, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, 10, 7);
    g.scale(sx, sy, sz); g.translate(cx, cy, cz);
    this.put(g, mat);
  }
  // rotated thin box (visual only) — for awnings, fronds, slanted roofs
  slab(cx, cy, cz, w, h, d, rx, ry, rz, mat) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
    g.translate(cx, cy, cz);
    this.put(g, mat);
  }

  // ── architecture ──────────────────────────────────────────────────────────
  // Wall with openings [a, b, y0, y1] (a..b along the wall). Openings may overlap or stack
  // (door with a window above, etc.): the wall is split at every opening edge and each slice keeps
  // only the vertical ranges not covered by any opening.
  wallSpan(a0, a1, h, holes, emit) {
    const cuts = [...new Set([a0, a1, ...holes.flatMap(([a, b]) => [a, b])])].filter((v) => v >= a0 && v <= a1).sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {
      const c0 = cuts[i], c1 = cuts[i + 1], mid = (c0 + c1) / 2;
      const gaps = holes.filter(([a, b]) => mid > a && mid < b).map(([, , y0, y1]) => [Math.max(0, y0), Math.min(h, y1)]).sort((p, q) => p[0] - q[0]);
      let y = 0;
      for (const [g0, g1] of gaps) { if (g0 > y) emit(c0, c1, y, g0); y = Math.max(y, g1); }
      if (y < h) emit(c0, c1, y, h);
    }
  }
  wallX(x0, x1, z0, z1, h, mat, holes = [], o = {}) {
    this.wallSpan(x0, x1, h, holes, (a, b, y0, y1) => this.box(a, y0, z0, b, y1, z1, mat));
    if (o.frame) for (const [a, b, y0, y1] of holes) {
      const t = 0.08, e = 0.012;   // frames sit e proud of every wall face they touch (no coplanar faces → no z-fighting)
      this.box(a - t, y0, z0 - t, a + e, y1 + e, z1 + t, o.frame, { collide: false });
      this.box(b - e, y0, z0 - t, b + t, y1 + e, z1 + t, o.frame, { collide: false });
      this.box(a - t - e, y1 - e, z0 - t - e, b + t + e, y1 + t, z1 + t + e, o.frame, { collide: false });
      if (y0 > 0) this.box(a - t - e, y0 - t, z0 - 0.12, b + t + e, y0 + e, z1 + 0.12, o.frame, { collide: false });
    }
  }
  wallZ(z0, z1, x0, x1, h, mat, holes = [], o = {}) {
    this.wallSpan(z0, z1, h, holes, (a, b, y0, y1) => this.box(x0, y0, a, x1, y1, b, mat));
    if (o.frame) for (const [a, b, y0, y1] of holes) {
      const t = 0.08, e = 0.012;
      this.box(x0 - t, y0, a - t, x1 + t, y1 + e, a + e, o.frame, { collide: false });
      this.box(x0 - t, y0, b - e, x1 + t, y1 + e, b + t, o.frame, { collide: false });
      this.box(x0 - t - e, y1 - e, a - t - e, x1 + t + e, y1 + t, b + t + e, o.frame, { collide: false });
      if (y0 > 0) this.box(x0 - 0.12, y0 - t, a - t - e, x1 + 0.12, y0 + e, b + t + e, o.frame, { collide: false });
    }
  }
  // Enterable building. doors/windows: { n: [[a,b],...], s, e, w } (x ranges for n/s, z ranges for e/w)
  building(o) {
    const { x0, z0, x1, z1 } = o, h = o.h ?? 4.2, t = o.t ?? 0.35, mat = o.wall, frame = o.frame ?? 'trim';
    const D = (side) => (o.doors?.[side] || []).map(([a, b]) => [a, b, 0, o.doorH ?? 2.6]);
    const W = (side) => (o.windows?.[side] || []).map(([a, b]) => [a, b, o.sill ?? 1.15, o.winTop ?? 2.3]);
    this.wallX(x0, x1, z0, z0 + t, h, mat, [...D('n'), ...W('n')], { frame });
    this.wallX(x0, x1, z1 - t, z1, h, mat, [...D('s'), ...W('s')], { frame });
    this.wallZ(z0 + t, z1 - t, x0, x0 + t, h, mat, [...D('w'), ...W('w')], { frame });
    this.wallZ(z0 + t, z1 - t, x1 - t, x1, h, mat, [...D('e'), ...W('e')], { frame });
    for (const r of o.rooms || []) { // interior partitions
      if (r.axis === 'x') this.wallX(r.from, r.to, r.at - 0.15, r.at + 0.15, h, o.inner || mat, (r.doors || []).map(([a, b]) => [a, b, 0, 2.6]), { frame });
      else this.wallZ(r.from, r.to, r.at - 0.15, r.at + 0.15, h, o.inner || mat, (r.doors || []).map(([a, b]) => [a, b, 0, 2.6]), { frame });
    }
    if (o.roof !== false) {
      this.box(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.35, z1 + 0.25, o.roofMat || 'trim');
      const p = o.parapet ?? 0.6;
      if (p > 0) {
        const y = h + 0.35, pm = o.parapetMat || mat;
        this.box(x0 - 0.25, y, z0 - 0.25, x1 + 0.25, y + p, z0 + 0.05, pm);
        this.box(x0 - 0.25, y, z1 - 0.05, x1 + 0.25, y + p, z1 + 0.25, pm);
        this.box(x0 - 0.25, y, z0 + 0.05, x0 + 0.05, y + p, z1 - 0.05, pm);
        this.box(x1 - 0.05, y, z0 + 0.05, x1 + 0.25, y + p, z1 - 0.05, pm);
      }
      // ceiling lights
      if (o.lights !== false) {
        for (let x = x0 + 3; x < x1 - 1.5; x += 5) for (let z = z0 + 3; z < z1 - 1.5; z += 5)
          this.box(x - 0.5, h - 0.06, z - 0.18, x + 0.5, h - 0.01, z + 0.18, o.lightMat || 'light', { collide: false });
      }
      if (o.slopedRoof) { // decorative pitched tile roof sitting on top
        const cx = (x0 + x1) / 2, w = x1 - x0 + 0.8, d = z1 - z0 + 0.8, rise = Math.min(2.2, d * 0.25);
        const ang = Math.atan2(rise, d / 2);
        const len = Math.hypot(rise, d / 2) + 0.2;
        this.slab(cx, h + 0.35 + rise / 2, z0 - 0.4 + d / 4, w, 0.18, len, ang, 0, 0, o.slopedRoof);
        this.slab(cx, h + 0.35 + rise / 2, z1 + 0.4 - d / 4, w, 0.18, len, -ang, 0, 0, o.slopedRoof);
      }
    }
    // cornice + base trim (visual)
    if (o.cornice !== false) {
      // ring around the outside only (a full slab hid the ceiling lights and shared faces with the roof)
      const c0 = h - 0.3, c1 = h + 0.02, e = 0.1, i = 0.02;
      this.box(x0 - e, c0, z0 - e, x1 + e, c1, z0 + i, frame, { collide: false });
      this.box(x0 - e, c0, z1 - i, x1 + e, c1, z1 + e, frame, { collide: false });
      this.box(x0 - e, c0, z0 + i, x0 + i, c1, z1 - i, frame, { collide: false });
      this.box(x1 - i, c0, z0 + i, x1 + e, c1, z1 - i, frame, { collide: false });
    }
    if (o.floor) this.box(x0 + t, 0, z0 + t, x1 - t, 0.02, z1 - t, o.floor, { collide: false });
    if (o.zone) this.zone(x0, z0, x1, z1, o.zone, 'INDOOR');
  }
  // solid, non-enterable block with fake windows on its faces
  block(x0, z0, x1, z1, h, mat, o = {}) {
    this.box(x0, 0, z0, x1, h, z1, mat);
    if (o.cornice !== false) this.box(x0 - 0.12, h - 0.35, z0 - 0.12, x1 + 0.12, h + 0.03, z1 + 0.12, o.trim || 'trim', { collide: false });   // caps the top (no shared face)
    if (o.base) this.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.5, z1 + 0.06, o.base, { collide: false });
    if (o.windows) {
      const wm = o.windowMat || 'glass', fm = o.frameMat || 'trim', sp = o.spacing || 3.2;
      const faces = o.faces || ['n', 's', 'e', 'w'];
      for (let y = o.firstFloor ?? 3.2; y < h - 1.4; y += 3.3) {
        if (faces.includes('n') || faces.includes('s')) for (let x = x0 + 1.6; x < x1 - 1; x += sp) {
          if (faces.includes('n')) { this.box(x - 0.6, y, z0 - 0.04, x + 0.6, y + 1.5, z0, wm, { collide: false }); this.box(x - 0.7, y - 0.12, z0 - 0.14, x + 0.7, y, z0, fm, { collide: false }); }
          if (faces.includes('s')) { this.box(x - 0.6, y, z1, x + 0.6, y + 1.5, z1 + 0.04, wm, { collide: false }); this.box(x - 0.7, y - 0.12, z1, x + 0.7, y, z1 + 0.14, fm, { collide: false }); }
        }
        if (faces.includes('e') || faces.includes('w')) for (let z = z0 + 1.6; z < z1 - 1; z += sp) {
          if (faces.includes('w')) { this.box(x0 - 0.04, y, z - 0.6, x0, y + 1.5, z + 0.6, wm, { collide: false }); this.box(x0 - 0.14, y - 0.12, z - 0.7, x0, y, z + 0.7, fm, { collide: false }); }
          if (faces.includes('e')) { this.box(x1, y, z - 0.6, x1 + 0.04, y + 1.5, z + 0.6, wm, { collide: false }); this.box(x1, y - 0.12, z - 0.7, x1 + 0.14, y, z + 0.7, fm, { collide: false }); }
        }
      }
    }
  }
  // stairs: bottom edge centred at (x, z), climbing toward dir ('+x','-x','+z','-z')
  stairs(x, z, dir, width, steps, mat, rise = 0.3, run = 0.5) {
    for (let i = 0; i < steps; i++) {
      const a = i * run, b = (i + 1) * run, y = (i + 1) * rise;
      if (dir === '+x') this.box(x + a, 0, z - width / 2, x + b, y, z + width / 2, mat);
      if (dir === '-x') this.box(x - b, 0, z - width / 2, x - a, y, z + width / 2, mat);
      if (dir === '+z') this.box(x - width / 2, 0, z + a, x + width / 2, y, z + b, mat);
      if (dir === '-z') this.box(x - width / 2, 0, z - b, x + width / 2, y, z - a, mat);
    }
  }
  ground(x0, z0, x1, z1, mat, y = 0) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.put(g, mat);
  }
  // Sniper nest facing +x (pre-mirror): front wall with crouch + prone slits, roof, open back
  nest(x0, z0, mat, lane) {
    const F = (a, b) => [x0 + a, x0 + b];
    const parts = [
      [...F(2.6, 3.0), 0, 0.25, z0 - 3, z0 + 3],
      [...F(2.6, 3.0), 0.25, 0.6, z0 - 3, z0 - 2], [...F(2.6, 3.0), 0.25, 0.6, z0 + 2, z0 + 3],
      [...F(2.6, 3.0), 0.6, 0.85, z0 - 3, z0 + 3],
      [...F(2.6, 3.0), 0.85, 1.25, z0 - 3, z0 - 1.2], [...F(2.6, 3.0), 0.85, 1.25, z0 + 1.2, z0 + 3],
      [...F(2.6, 3.0), 1.25, 2.8, z0 - 3, z0 + 3],
      [...F(-3, 3), 0, 2.8, z0 - 3, z0 - 2.6], [...F(-3, 3), 0, 2.8, z0 + 2.6, z0 + 3],
    ];
    for (const [a, b, y0, y1, c, d] of parts) this.box(a, y0, c, b, y1, d, mat);
    this.box(x0 - 3.3, 2.8, z0 - 3.3, x0 + 3.3, 3.1, z0 + 3.3, 'trim');
    this.box(x0 + 0.6, 0.01, z0 - 1.2, x0 + 2.4, 0.03, z0 + 1.2, 'nestPad', { collide: false });
    this.box(x0 - 2.4, 2.74, z0 - 0.15, x0 + 2.4, 2.8, z0 + 0.15, 'light', { collide: false });
    this.box(x0 - 3.2, 2.2, z0 - 3.05, x0 - 2.9, 2.6, z0 + 3.05, this.flip ? 'red' : 'blue', { collide: false });
    this.nests.push({
      team: this.team(), x0: this.X(x0), z0, lane,
      spot: new THREE.Vector3(this.X(x0 + 1.3), 0, z0),
      yaw: this.flip ? Math.PI / 2 : -Math.PI / 2,
    });
    this.zone(x0 - 3, z0 - 3, x0 + 3, z0 + 3, 'SNIPER NEST', 'NEST');
  }

  // sloped walkable ramp rising toward dir; solid wedge underneath (or a plank `thick` m thick)
  ramp(x0, z0, x1, z1, dir, y0, y1, mat, o = {}) {
    const axis = dir[1], sign = dir[0] === '-' ? -1 : 1;
    const fx0 = this.flip ? -x1 : x0, fx1 = this.flip ? -x0 : x1, fsign = axis === 'x' && this.flip ? -sign : sign;
    const layer = typeof o.layer === 'string' ? LAYERS[o.layer] : (o.layer ?? L_ALL);
    const r = this.world.addRamp({ x0: fx0, z0, x1: fx1, z1, axis, sign: fsign, y0: y0 + this.yOff, y1: y1 + this.yOff, thick: o.thick, bottom: o.bottom !== undefined ? o.bottom + this.yOff : undefined, layer });
    // render: build the wedge from its 8 corners
    const Y = (x, z) => this.world.rampSurface(r, x, z);
    const bot = (x, z) => (r.thick ? Y(x, z) - r.thick : r.bottom);
    const P = [[fx0, z0], [fx1, z0], [fx1, z1], [fx0, z1]].map(([x, z]) => [[x, bot(x, z), z], [x, Y(x, z), z]]);
    const quads = [[P[0][1], P[1][1], P[2][1], P[3][1]], [P[3][0], P[2][0], P[1][0], P[0][0]],
      [P[0][0], P[1][0], P[1][1], P[0][1]], [P[1][0], P[2][0], P[2][1], P[1][1]], [P[2][0], P[3][0], P[3][1], P[2][1]], [P[3][0], P[0][0], P[0][1], P[3][1]]];
    const pos = [];
    for (const [a, b, c, d] of quads) {
      // orient each quad outward: top/front use as listed; flip winding where needed by computing normal vs centre
      const tri = (p, q, s) => pos.push(...p, ...q, ...s);
      tri(a, c, b); tri(a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // fix winding so normals point away from the wedge centre
    const cx = (fx0 + fx1) / 2, cz = (z0 + z1) / 2, cy = (r.minY + r.maxY) / 2, pa = g.attributes.position;
    for (let i = 0; i < pa.count; i += 3) {
      const A = new THREE.Vector3().fromBufferAttribute(pa, i), B = new THREE.Vector3().fromBufferAttribute(pa, i + 1), Cc = new THREE.Vector3().fromBufferAttribute(pa, i + 2);
      const nrm = B.clone().sub(A).cross(Cc.clone().sub(A)), mid = A.clone().add(B).add(Cc).divideScalar(3).sub(new THREE.Vector3(cx, cy, cz));
      if (nrm.dot(mid) < 0) { pa.setXYZ(i + 1, Cc.x, Cc.y, Cc.z); pa.setXYZ(i + 2, B.x, B.y, B.z); }
    }
    g.computeVertexNormals();
    const yo = this.yOff, fl = this.flip; this.yOff = 0; this.flip = false;
    this.put(g, mat);
    this.yOff = yo; this.flip = fl;
    return r;
  }
  // horizontal floor slab (top at y) with rectangular holes (stairwells, drop-downs)
  floorSlab(x0, z0, x1, z1, y, t, mat, holes = [], o = {}) {
    const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]])])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b);
    const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h[1], h[3]])])].filter((v) => v >= z0 && v <= z1).sort((a, b) => a - b);
    const inHole = (cx, cz) => holes.some((h) => cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3]);
    for (let j = 0; j < zs.length - 1; j++) {
      let run = null;
      for (let i = 0; i < xs.length - 1; i++) {
        const solid = !inHole((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
        if (solid && run === null) run = xs[i];
        if ((!solid || i === xs.length - 2) && run !== null) {
          const end = solid ? xs[i + 1] : xs[i];
          this.box(run, y - t, zs[j], end, y, zs[j + 1], mat, o);
          run = null;
        }
      }
    }
  }
  // stairs from base height to top height (solid), bottom edge centred at (x, z), climbing toward dir
  stairsTo(x, z, dir, width, y0, y1, mat, o = {}) {
    const steps = Math.max(1, Math.ceil((y1 - y0) / (o.maxRise ?? 0.3) - 1e-6)), rise = (y1 - y0) / steps, run = o.run ?? 0.5;
    for (let i = 0; i < steps; i++) {
      const a = i * run, b = (i + 1) * run, top = y0 + (i + 1) * rise, bot = o.open ? top - 0.25 : y0;
      if (dir === '+x') this.box(x + a, bot, z - width / 2, x + b, top, z + width / 2, mat, o);
      if (dir === '-x') this.box(x - b, bot, z - width / 2, x - a, top, z + width / 2, mat, o);
      if (dir === '+z') this.box(x - width / 2, bot, z + a, x + width / 2, top, z + b, mat, o);
      if (dir === '-z') this.box(x - width / 2, bot, z - b, x + width / 2, top, z - a, mat, o);
    }
    return steps * run;
  }

  // ── gameplay markup ───────────────────────────────────────────────────────
  zone(x0, z0, x1, z1, name, kind, hint, o = {}) {
    const fx0 = this.flip ? -x1 : x0, fx1 = this.flip ? -x0 : x1;
    const y0 = o.y0 ?? -Infinity, y1 = o.y1 ?? Infinity;
    this.zones.push({ x0: Math.min(fx0, fx1), x1: Math.max(fx0, fx1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, name, kind, hint,
      tag: o.tag || null, key: !!o.key, floor: o.floor ?? null, area: Math.abs((x1 - x0) * (z1 - z0)) * (Number.isFinite(y1 - y0) ? 0.999 : 1) });
  }
  spawn(x, z, y = 0, team = this.team(), yaw = null) { const p = new THREE.Vector3(this.X(x), y + this.yOff, z); p.yaw = yaw; this.spawns[team].push(p); }
  cover(x, z, w = 0.9, d = 4.2, mat = 'sandbag', h = 1.1) {
    this.cbox(x, z, w, d, 0, h, mat, { r: 0.12 });
    this.covers.push({ pos: new THREE.Vector3(this.X(x), 0, z), team: this.team() });
  }
  turret(x, z) { this.turretSpots.push({ team: this.team(), pos: new THREE.Vector3(this.X(x), 0, z) }); }
  connector(x, z) { this.connectors.push([this.X(x), z]); }
  // lane points for the blue half (from blue spawn toward centre); mirrored automatically
  lane(name, kind, half) {
    const full = [...half, ...[...half].reverse().filter(([x]) => Math.abs(x) > 1).map(([x, z]) => [-x, z])];
    this.lanes[name] = { kind, pts: full };
  }

  // ── props ─────────────────────────────────────────────────────────────────
  crate(x, z, s = 1.1, stack = 1, mat = 'crate') {
    for (let i = 0; i < stack; i++) this.cbox(x + (i % 2) * 0.08, z, s, s, i * s, (i + 1) * s, mat, { r: 0.05 });
  }
  barrel(x, z, mat = 'barrelA') {
    this.cyl(x, z, 0.34, 0, 1.0, mat, { seg: 14 });
    this.cyl(x, z, 0.35, 0.3, 0.36, 'dark'); this.cyl(x, z, 0.35, 0.68, 0.74, 'dark');
    this.world.add(this.X(x) - 0.33, this.yOff, z - 0.33, this.X(x) + 0.33, 1.0 + this.yOff, z + 0.33, 'barrel');
  }
  container(x, z, axis, mat, y0 = 0) {
    const [w, d] = axis === 'x' ? [6.06, 2.44] : [2.44, 6.06];
    this.cbox(x, z, w, d, y0, y0 + 2.6, mat, { r: 0.06 });
    // door end + rails
    if (axis === 'x') this.cbox(x + 3.04, z, 0.06, 2.2, y0 + 0.15, y0 + 2.45, 'dark', { collide: false });
    else this.cbox(x, z + 3.04, 2.2, 0.06, y0 + 0.15, y0 + 2.45, 'dark', { collide: false });
  }
  car(x, z, axis, mat) {
    const L = 4.3, W = 1.85;
    const [w, d] = axis === 'x' ? [L, W] : [W, L];
    this.cbox(x, z, w, d, 0.3, 1.05, mat, { r: 0.22, collide: false });
    const [cw, cd] = axis === 'x' ? [2.2, 1.6] : [1.6, 2.2];
    this.cbox(x, z, cw, cd, 1.0, 1.55, 'glass', { r: 0.2, collide: false });
    this.cbox(x, z, cw - 0.2, cd - 0.15, 1.5, 1.6, mat, { r: 0.05, collide: false });
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const wx = axis === 'x' ? x + a * 1.35 : x + b * 0.85, wz = axis === 'x' ? z + b * 0.85 : z + a * 1.35;
      const g = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14);
      g.rotateZ(Math.PI / 2); if (axis !== 'x') g.rotateY(0); else g.rotateY(Math.PI / 2);
      g.translate(wx, 0.34, wz); this.put(g, 'rubber');
    }
    this.cbox(x, z, w, d, 0, 1.5, null, { visible: false });
  }
  palm(x, z, h = 6.5) {
    const segs = 6, lean = 0.06;
    for (let i = 0; i < segs; i++) {
      const y0 = (i * h) / segs, y1 = ((i + 1) * h) / segs;
      this.cyl(x + i * lean, z, 0.2 - i * 0.015, y0, y1 + 0.05, 'bark', { seg: 8, rTop: 0.19 - i * 0.015 });
    }
    const tx = x + segs * lean;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const fx = Math.cos(a), fz = Math.sin(a);
      this.slab(tx + fx * 1.4, h - 0.3, z + fz * 1.4, 0.7, 0.06, 3.0, 0.45, Math.atan2(fx, fz), 0, k % 2 ? 'leaf' : 'leaf2');
    }
    this.sphere(tx, h, z, 0.35, 'bark');
    this.world.add(this.X(x) - 0.25, this.yOff, z - 0.25, this.X(x) + 0.25, h + this.yOff, z + 0.25, 'tree');
  }
  tree(x, z, s = 1) {
    this.cyl(x, z, 0.22 * s, 0, 2.6 * s, 'bark', { seg: 8, rTop: 0.16 * s });
    this.sphere(x, 3.4 * s, z, 1.6 * s, 'leaf', 1, 0.85, 1);
    this.sphere(x + 0.9 * s, 3.0 * s, z + 0.3, 1.1 * s, 'leaf2', 1, 0.8, 1);
    this.sphere(x - 0.7 * s, 3.2 * s, z - 0.6, 1.1 * s, 'leaf', 1, 0.8, 1);
    this.world.add(this.X(x) - 0.25, this.yOff, z - 0.25, this.X(x) + 0.25, 3 * s + this.yOff, z + 0.25, 'tree');
  }
  planter(x, z, w, d, mat = 'stoneLight', flowers = 'flowerR') {
    this.cbox(x, z, w, d, 0, 0.7, mat, { r: 0.06 });
    this.cbox(x, z, w - 0.2, d - 0.2, 0.7, 0.72, 'soil', { collide: false });
    const n = Math.round(w * d * 2);
    for (let i = 0; i < n; i++) {
      const fx = x + ((i * 0.618) % 1 - 0.5) * (w - 0.4), fz = z + ((i * 0.381) % 1 - 0.5) * (d - 0.4);
      this.sphere(fx, 0.85, fz, 0.16, i % 3 === 0 ? 'leaf2' : flowers);
    }
  }
  lamp(x, z, h = 4.4) {
    this.cyl(x, z, 0.07, 0, h, 'dark', { seg: 8 });
    this.cbox(x + 0.35, z, 0.9, 0.1, h - 0.05, h + 0.05, 'dark', { collide: false });
    this.cbox(x + 0.7, z, 0.36, 0.26, h - 0.2, h - 0.05, 'lamp', { collide: false });
    this.world.add(this.X(x) - 0.1, this.yOff, z - 0.1, this.X(x) + 0.1, h + this.yOff, z + 0.1, 'pole');
  }
  bench(x, z, axis = 'x') {
    const [w, d] = axis === 'x' ? [1.8, 0.5] : [0.5, 1.8];
    this.cbox(x, z, w, d, 0.42, 0.5, 'wood', { collide: false });
    this.cbox(x, z, w * 0.9, d * 0.9, 0, 0.42, 'dark', { collide: false });
    this.cbox(x, z, w, d, 0, 0.5, null, { visible: false });
  }
  stall(x, z, axis, clothMat) {
    const [w, d] = axis === 'x' ? [2.8, 1.2] : [1.2, 2.8];
    this.cbox(x, z, w, d, 0, 1.0, 'wood', { r: 0.04 });
    for (const a of [-1, 1]) for (const b of [-1, 1]) this.cyl(x + a * (w / 2 - 0.08), z + b * (d / 2 - 0.08), 0.05, 1, 2.6, 'dark', { seg: 6 });
    this.slab(x, 2.65, z, w + 0.4, 0.05, d + 0.6, axis === 'x' ? 0.18 : 0, 0, axis === 'x' ? 0 : 0.18, clothMat);
    const fruit = ['flowerR', 'flowerY', 'leaf2', 'flowerP'];
    for (let i = 0; i < 10; i++) this.sphere(x + ((i * 0.37) % 1 - 0.5) * (w - 0.4), 1.1, z + ((i * 0.71) % 1 - 0.5) * (d - 0.3), 0.13, fruit[i % 4]);
  }
  awning(x0, x1, z, y, depth, mat, dir = 1) { // cloth canopy sloping away from a wall (along x)
    this.slab((x0 + x1) / 2, y - 0.25, z + (dir * depth) / 2, x1 - x0, 0.05, depth + 0.1, -dir * 0.28, 0, 0, mat);
  }
  railing(x0, z0, x1, z1, mat = 'dark') {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      this.cyl(x, z, 0.04, 0, 1.05, mat, { seg: 6 });
    }
    if (Math.abs(z1 - z0) < 0.01) this.box(x0, 0.98, z0 - 0.04, x1, 1.06, z0 + 0.04, mat, { collide: false });
    else this.box(x0 - 0.04, 0.98, z0, x0 + 0.04, 1.06, z1, mat, { collide: false });
    if (Math.abs(z1 - z0) < 0.01) this.box(x0, 0, z0 - 0.1, x1, 1.06, z0 + 0.1, null, { visible: false, layer: L_MOVE });
    else this.box(x0 - 0.1, 0, z0, x0 + 0.1, 1.06, z1, null, { visible: false, layer: L_MOVE });
  }
  stringLights(pts, mat = 'bulb') {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 0.9));
      for (let k = 0; k <= n; k++) {
        const t = k / n, sag = Math.sin(t * Math.PI) * Math.min(1.2, len * 0.06);
        this.sphere(ax + (bx - ax) * t, ay + (by - ay) * t - sag, az + (bz - az) * t, 0.07, mat);
      }
    }
  }
  fountain(x, z, r = 3, waterMat = 'waterBasin') {
    this.cyl(x, z, r, 0, 0.7, 'stoneLight', { seg: 24, collide: true });
    this.cyl(x, z, r - 0.3, 0.6, 0.66, waterMat, { seg: 24 });
    this.cyl(x, z, 0.5, 0.7, 2.0, 'stoneLight', { seg: 12 });
    this.cyl(x, z, 1.1, 2.0, 2.25, 'stoneLight', { seg: 16 });
    this.cyl(x, z, 0.2, 2.25, 2.9, 'stoneLight', { seg: 8 });
  }
  // unique-texture meshes (not merged)
  sign(x, y, z, w, h, text, color, facing, o = {}) {
    const tex = signTexture(text, color, o.bg || 'rgba(0,0,0,0)', o.pw || 512, o.ph || 128, o.font);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, color: new THREE.Color(o.boost ?? 2.2, o.boost ?? 2.2, o.boost ?? 2.2), depthWrite: false, side: THREE.DoubleSide,
    }));
    const fx = this.X(x);
    m.position.set(fx, y + this.yOff, z);
    const face = this.flip ? ({ e: 'w', w: 'e' }[facing] || facing) : facing;
    m.rotation.y = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[face];
    if (o.flicker) this.animated.push((t) => { m.material.opacity = Math.sin(t * 13 + x) > 0.97 ? 0.3 : 1; });
    this.extras.push(m);
    return m;
  }
  banner(x, y, z, w, h, mat, facing) {
    const g = new THREE.PlaneGeometry(w, h, 1, 6);
    const m = new THREE.Mesh(g, this.material(mat));
    m.material.side = THREE.DoubleSide;
    m.position.set(this.X(x), y + this.yOff, z);
    const face = this.flip ? ({ e: 'w', w: 'e' }[facing] || facing) : facing;
    m.rotation.y = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 }[face];
    const base = g.attributes.position.array.slice();
    this.animated.push((t) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const yy = base[i * 3 + 1], k = (h / 2 - yy) / h;
        p.setZ(i, Math.sin(t * 2 + yy * 2 + x) * 0.12 * k);
      }
      p.needsUpdate = true;
    });
    m.castShadow = true;
    this.extras.push(m);
  }
  water(x0, z0, x1, z1, y, color = 0x1aa7b8, deep = 0x0b4f6b) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.1, normalMap: this.T.waterNormal, transparent: true, opacity: 0.92 });
    mat.normalScale.set(0.6, 0.6);
    mat.userData.env = 1.2;
    mat.normalMap = this.T.waterNormal.clone(); mat.normalMap.needsUpdate = true;
    mat.normalMap.repeat.set((x1 - x0) / 12, (z1 - z0) / 12);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: deep }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, y - 3, (z0 + z1) / 2);
    this.extras.push(m, floor);
    this.animated.push((t) => { mat.normalMap.offset.set(t * 0.012, t * 0.02); });
  }
  pointLight(x, y, z, color, intensity = 6, dist = 14) {
    this.pointLights.push({ pos: new THREE.Vector3(this.X(x), y + this.yOff, z), color, intensity, dist });
  }

  // ── finish ────────────────────────────────────────────────────────────────
  finish(meta) {
    for (const [mat, geos] of this.buckets) {
      const g = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!g) continue;
      const m = new THREE.Mesh(g, this.material(mat));
      m.name = mat;
      const d = this.matDefs[mat];
      const emissive = !!d.basic;
      m.castShadow = !emissive && !d.noShadow;
      m.receiveShadow = !emissive;
      this.group.add(m);
    }
    for (const e of this.extras) this.group.add(e);
    for (const L of this.pointLights) {
      const l = new THREE.PointLight(L.color, L.intensity, L.dist, 2);
      l.position.copy(L.pos); this.group.add(l);
    }
    this.scene.add(this.group);
    const kit = this, zones = this.zones;
    const zoneAt = (x, z, y) => {
      let best = null;
      for (const zn of zones) {
        if (x < zn.x0 || x > zn.x1 || z < zn.z0 || z > zn.z1) continue;
        if (y !== undefined && (y < zn.y0 - 0.3 || y > zn.y1)) continue;
        if (!best || zn.area < best.area) best = zn;
      }
      return best;
    };
    const map = {
      ...meta, theme: this.theme, world: this.world, group: this.group, bounds: this.bounds,
      floors: this.floors || [{ name: 'Ground', y: 0 }],
      nests: this.nests, covers: this.covers, turretSpots: this.turretSpots, spawns: this.spawns,
      lanes: this.lanes, connectors: this.connectors, zones,
      zoneAt,
      isHallway(x, z, y) { const zn = zoneAt(x, z, y); return !!zn && HALL_KINDS.has(zn.kind); },
      isIndoor(x, z, y) { const zn = zoneAt(x, z, y); return !!zn && (zn.kind === 'INDOOR' || zn.kind === 'NEST'); },
      nestAt(x, z) { return kit.nests.find((n) => Math.abs(x - n.x0) < 2.8 && Math.abs(z - n.z0) < 2.6) || null; },
      coverAt(x, z) { return kit.covers.find((c) => Math.abs(x - c.pos.x) < 2.2 && Math.abs(z - c.pos.z) < 3) || null; },
      update(t) { for (const f of kit.animated) f(t); },
    };
    map.nav = new NavGrid(this.world, this.bounds);
    map.nav.markReachable([...this.spawns[0], ...this.spawns[1]].map((p) => map.nav.nodeAt(p.x, p.y, p.z)));
    return map;
  }
}
