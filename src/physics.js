// Collision world: axis-aligned boxes + sloped ramps, collision layers, grid-accelerated raycasts,
// body movement with step-up / ramp walking / ground snapping.
//
// Layers:  L_MOVE  blocks bodies (movement)        e.g. railings, grates, invisible bounds
//          L_SHOT  blocks bullets and line of sight e.g. foliage screens, hanging cloth
//          L_ALL   blocks both (default: walls, floors, crates)
export const L_MOVE = 1, L_SHOT = 2, L_ALL = 3;
export const MAX_STEP = 0.62;          // tallest ledge a body steps onto without jumping (m)
export const MAX_SLOPE_DEG = 40;       // steepest walkable ramp

export class World {
  constructor() {
    this.boxes = []; this.ramps = [];
    this.cs = 8;
    this.hash = new Map();
    this.stamp = 1;
  }
  key(i, k) { return (i + 512) * 2048 + (k + 512); }
  add(minx, miny, minz, maxx, maxy, maxz, tag = 'solid', layer = L_ALL) {
    const b = { min: [minx, miny, minz], max: [maxx, maxy, maxz], tag, layer, mark: 0 };
    this.boxes.push(b);
    const cs = this.cs;
    for (let i = Math.floor(minx / cs); i <= Math.floor(maxx / cs); i++)
      for (let k = Math.floor(minz / cs); k <= Math.floor(maxz / cs); k++) {
        const key = this.key(i, k);
        let arr = this.hash.get(key);
        if (!arr) this.hash.set(key, (arr = []));
        arr.push(b);
      }
    return b;
  }
  // remove a box added with add() (gates that open mid-match); returns true if it was present
  remove(b) {
    const i = this.boxes.indexOf(b); if (i < 0) return false;
    this.boxes.splice(i, 1);
    const cs = this.cs;
    for (let x = Math.floor(b.min[0] / cs); x <= Math.floor(b.max[0] / cs); x++)
      for (let k = Math.floor(b.min[2] / cs); k <= Math.floor(b.max[2] / cs); k++) {
        const arr = this.hash.get(this.key(x, k)); if (!arr) continue;
        const j = arr.indexOf(b); if (j >= 0) arr.splice(j, 1);
      }
    return true;
  }
  // re-insert a removed box (gates closing again at half-time)
  restore(b) {
    if (this.boxes.includes(b)) return;
    this.boxes.push(b);
    const cs = this.cs;
    for (let x = Math.floor(b.min[0] / cs); x <= Math.floor(b.max[0] / cs); x++)
      for (let k = Math.floor(b.min[2] / cs); k <= Math.floor(b.max[2] / cs); k++) {
        const key = this.key(x, k); let arr = this.hash.get(key); if (!arr) this.hash.set(key, (arr = [])); arr.push(b);
      }
  }
  // Ramp rising along `axis` ('x'|'z') in direction `sign` (+1/-1) from height y0 at the low edge to y1
  // at the high edge. Solid down to `bottom` (default: the low end), or a plank `thick` metres thick.
  addRamp(o) {
    const axis = o.axis === 'z' ? 2 : 0, sign = o.sign < 0 ? -1 : 1;
    const len = axis === 0 ? o.x1 - o.x0 : o.z1 - o.z0;
    const m = (o.y1 - o.y0) / len; // rise per metre along the rising direction
    const low = sign > 0 ? (axis === 0 ? o.x0 : o.z0) : (axis === 0 ? o.x1 : o.z1);
    const r = {
      x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, axis, sign, y0: o.y0, y1: o.y1, m, low,
      thick: o.thick || 0, bottom: o.thick ? null : (o.bottom ?? Math.min(o.y0, o.y1)),
      layer: o.layer ?? L_ALL, tag: o.tag || 'ramp',
      slopeDeg: (Math.atan(Math.abs(m)) * 180) / Math.PI,
    };
    r.walkable = r.slopeDeg <= MAX_SLOPE_DEG;
    // half-spaces n·p <= d  (top plane, bottom plane, 4 sides)
    const ms = m * sign, top = axis === 0 ? [-ms, 1, 0] : [0, 1, -ms], c = o.y0 - ms * low;
    r.planes = [{ n: top, d: c }];
    if (r.thick) r.planes.push({ n: top.map((v) => -v), d: -c + r.thick });
    else r.planes.push({ n: [0, -1, 0], d: -r.bottom });
    r.planes.push({ n: [1, 0, 0], d: o.x1 }, { n: [-1, 0, 0], d: -o.x0 }, { n: [0, 0, 1], d: o.z1 }, { n: [0, 0, -1], d: -o.z0 });
    r.minY = r.thick ? Math.min(o.y0, o.y1) - r.thick : r.bottom; r.maxY = Math.max(o.y0, o.y1);
    this.ramps.push(r);
    return r;
  }
  rampSurface(r, x, z) {
    const s = r.axis === 0 ? x : z;
    return r.y0 + r.m * r.sign * (s - r.low);
  }
  // highest ramp surface under a square footprint (and the ramp's underside there)
  rampUnder(r, x, z, rad) {
    const fx0 = Math.max(r.x0, x - rad), fx1 = Math.min(r.x1, x + rad), fz0 = Math.max(r.z0, z - rad), fz1 = Math.min(r.z1, z + rad);
    if (fx0 >= fx1 || fz0 >= fz1) return null;
    const hiS = r.sign > 0 ? (r.axis === 0 ? fx1 : fz1) : (r.axis === 0 ? fx0 : fz0);
    const loS = r.sign > 0 ? (r.axis === 0 ? fx0 : fz0) : (r.axis === 0 ? fx1 : fz1);
    const top = r.y0 + r.m * r.sign * (hiS - r.low), topLo = r.y0 + r.m * r.sign * (loS - r.low);
    return { top, under: r.thick ? topLo - r.thick : r.bottom };
  }
  query(minx, minz, maxx, maxz, out, mask = L_ALL) {
    out.length = 0;
    const s = ++this.stamp, cs = this.cs;
    const i0 = Math.floor(minx / cs), i1 = Math.floor(maxx / cs);
    const k0 = Math.floor(minz / cs), k1 = Math.floor(maxz / cs);
    for (let i = i0; i <= i1; i++)
      for (let k = k0; k <= k1; k++) {
        const arr = this.hash.get(this.key(i, k));
        if (!arr) continue;
        for (const b of arr) {
          if (b.mark === s) continue;
          b.mark = s;
          if ((b.layer & mask) && b.max[0] > minx && b.min[0] < maxx && b.max[2] > minz && b.min[2] < maxz) out.push(b);
        }
      }
    return out;
  }
  rampsIn(minx, minz, maxx, maxz, mask = L_ALL) {
    return this.ramps.filter((r) => (r.layer & mask) && r.x1 > minx && r.x0 < maxx && r.z1 > minz && r.z0 < maxz);
  }
  // first hit along o + d·t (d normalised). Grid traversal over the spatial hash, then ramps.
  // out receives {t, nx, ny, nz, box|ramp}
  raycast(o, d, maxT, out, mask = L_ALL) {
    const ox = o.x, oy = o.y, oz = o.z;
    const dx = Math.abs(d.x) < 1e-9 ? 1e-9 : d.x;
    const dy = Math.abs(d.y) < 1e-9 ? 1e-9 : d.y;
    const dz = Math.abs(d.z) < 1e-9 ? 1e-9 : d.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let best = maxT, hb = null, hr = null, ax = -1, sg = 0, rn = null;
    const s = ++this.stamp, cs = this.cs;
    let ci = Math.floor(ox / cs), ck = Math.floor(oz / cs);
    const stepI = dx > 0 ? 1 : -1, stepK = dz > 0 ? 1 : -1;
    const tdI = Math.abs(cs / dx), tdK = Math.abs(cs / dz);
    let tmI = (dx > 0 ? (ci + 1) * cs - ox : ox - ci * cs) / Math.abs(dx);
    let tmK = (dz > 0 ? (ck + 1) * cs - oz : oz - ck * cs) / Math.abs(dz);
    let tCell = 0, guard = 0;
    while (tCell <= best && guard++ < 4096) {
      const arr = this.hash.get(this.key(ci, ck));
      if (arr) for (let n = 0; n < arr.length; n++) {
        const b = arr[n];
        if (b.mark === s) continue;
        b.mark = s;
        if (!(b.layer & mask)) continue;
        let tmin, tmax, a, sgn, t1, t2;
        t1 = (b.min[0] - ox) * ix; t2 = (b.max[0] - ox) * ix;
        if (t1 < t2) { tmin = t1; a = 0; sgn = -1; tmax = t2; } else { tmin = t2; a = 0; sgn = 1; tmax = t1; }
        t1 = (b.min[1] - oy) * iy; t2 = (b.max[1] - oy) * iy;
        if (t1 < t2) { if (t1 > tmin) { tmin = t1; a = 1; sgn = -1; } if (t2 < tmax) tmax = t2; }
        else { if (t2 > tmin) { tmin = t2; a = 1; sgn = 1; } if (t1 < tmax) tmax = t1; }
        if (tmax < tmin) continue;
        t1 = (b.min[2] - oz) * iz; t2 = (b.max[2] - oz) * iz;
        if (t1 < t2) { if (t1 > tmin) { tmin = t1; a = 2; sgn = -1; } if (t2 < tmax) tmax = t2; }
        else { if (t2 > tmin) { tmin = t2; a = 2; sgn = 1; } if (t1 < tmax) tmax = t1; }
        if (tmax < tmin || tmin < 0 || tmin >= best) continue; // origin inside a box: ignored
        best = tmin; hb = b; ax = a; sg = sgn;
      }
      if (tmI < tmK) { tCell = tmI; tmI += tdI; ci += stepI; } else { tCell = tmK; tmK += tdK; ck += stepK; }
      if (tCell > maxT) break;
    }
    for (const r of this.ramps) {
      if (!(r.layer & mask)) continue;
      let tmin = 0, tmax = best, nIn = null, entered = false, miss = false;
      for (const P of r.planes) {
        const den = P.n[0] * dx + P.n[1] * dy + P.n[2] * dz;
        const dist = P.d - (P.n[0] * ox + P.n[1] * oy + P.n[2] * oz);
        if (Math.abs(den) < 1e-12) { if (dist < 0) { miss = true; break; } continue; }
        const t = dist / den;
        if (den < 0) { if (t > tmin) { tmin = t; nIn = P.n; entered = true; } }
        else if (t < tmax) tmax = t;
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || !entered || tmin >= best) continue;
      best = tmin; hr = r; hb = null; rn = nIn;
    }
    if (!hb && !hr) return false;
    if (out) {
      out.t = best; out.box = hb; out.ramp = hr;
      if (hb) { out.nx = ax === 0 ? sg : 0; out.ny = ax === 1 ? sg : 0; out.nz = ax === 2 ? sg : 0; }
      else { const l = Math.hypot(rn[0], rn[1], rn[2]); out.nx = rn[0] / l; out.ny = rn[1] / l; out.nz = rn[2] / l; }
    }
    return true;
  }
}

const _q = [];
export function overlapsAny(world, x, y, z, r, h, mask = L_MOVE) {
  world.query(x - r, z - r, x + r, z + r, _q, mask);
  for (let i = 0; i < _q.length; i++) {
    const b = _q[i];
    if (y < b.max[1] - 1e-3 && y + h > b.min[1] + 1e-3) return b;
  }
  for (const rp of world.ramps) {
    if (!(rp.layer & mask)) continue;
    const u = world.rampUnder(rp, x, z, r);
    if (u && y < u.top - 1e-3 && y + h > u.under + 1e-3) return { ramp: rp, max: [0, u.top, 0], min: [0, u.under, 0], isRamp: true, u };
  }
  return null;
}

// Moves a vertical box body (feet at p, half-width r, height h). Mutates p and v.
export function moveBody(world, p, v, dt, r, h, canStep) {
  const res = { ground: false, ceil: false, wallSpeed: 0, wallAxis: -1, wallSign: 0, stepped: false };
  const maxD = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
  const n = Math.max(1, Math.ceil(maxD / 0.22));
  const sdt = dt / n;
  for (let s = 0; s < n; s++) {
    // vertical
    const prevY = p.y;
    p.y += v.y * sdt;
    if (p.y <= 1e-4 && v.y <= 0) { p.y = Math.max(0, p.y); v.y = 0; res.ground = true; }
    let b = overlapsAny(world, p.x, p.y, p.z, r, h), guard = 0;
    while (b && guard++ < 4) {
      if (v.y <= 0 && prevY >= b.max[1] - MAX_STEP - 0.05) { p.y = b.max[1]; v.y = 0; res.ground = true; }
      else if (v.y > 0) { p.y = b.min[1] - h - 1e-3; v.y = 0; res.ceil = true; }
      else { p.y = b.max[1]; v.y = 0; res.ground = true; }
      b = overlapsAny(world, p.x, p.y, p.z, r, h);
    }
    // horizontal axes
    for (let ai = 0; ai < 2; ai++) {
      const key = ai === 0 ? 'x' : 'z', bi = ai === 0 ? 0 : 2;
      const dv = v[key] * sdt;
      if (dv === 0) continue;
      p[key] += dv;
      let hit = overlapsAny(world, p.x, p.y, p.z, r, h), g2 = 0;
      while (hit && g2++ < 4) {
        const stepH = hit.max[1] - p.y;
        const walkable = !hit.isRamp || hit.ramp.walkable;
        if ((canStep || res.ground) && walkable && stepH > 0 && stepH <= MAX_STEP &&
            !overlapsAny(world, p.x, hit.max[1] + 0.002, p.z, r, h)) {
          p.y = hit.max[1] + 0.001; res.stepped = true;
        } else {
          if (hit.isRamp) p[key] -= dv;
          else p[key] = dv > 0 ? hit.min[bi] - r - 1e-4 : hit.max[bi] + r + 1e-4;
          const sp = Math.abs(v[key]);
          if (sp > res.wallSpeed) { res.wallSpeed = sp; res.wallAxis = ai; res.wallSign = dv > 0 ? -1 : 1; }
          v[key] = 0;
          break;
        }
        hit = overlapsAny(world, p.x, p.y, p.z, r, h);
      }
    }
  }
  // ground snap: keep walking bodies glued to ramps / stairs going down instead of hopping
  if (canStep && !res.ground && v.y <= 0 && p.y > 0) {
    let snap = -Infinity;
    world.query(p.x - r, p.z - r, p.x + r, p.z + r, _q, L_MOVE);
    for (const b of _q) if (b.max[1] <= p.y + 1e-3 && b.max[1] >= p.y - 0.4) snap = Math.max(snap, b.max[1]);
    for (const rp of world.ramps) {
      if (!(rp.layer & L_MOVE) || !rp.walkable) continue;
      const u = world.rampUnder(rp, p.x, p.z, r);
      if (u && u.top <= p.y + 1e-3 && u.top >= p.y - 0.4) snap = Math.max(snap, u.top);
    }
    if (p.y < 0.4) snap = Math.max(snap, 0);
    if (snap > -Infinity && !overlapsAny(world, p.x, snap + 0.002, p.z, r, h)) { p.y = snap; v.y = 0; res.ground = true; }
  }
  return res;
}

export function rayAABB(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz, maxT) {
  const ix = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx);
  const iy = 1 / (Math.abs(dy) < 1e-9 ? 1e-9 : dy);
  const iz = 1 / (Math.abs(dz) < 1e-9 ? 1e-9 : dz);
  let t1 = (minx - ox) * ix, t2 = (maxx - ox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (miny - oy) * iy; t2 = (maxy - oy) * iy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (minz - oz) * iz; t2 = (maxz - oz) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < Math.max(tmin, 0) || tmin > maxT) return -1;
  return Math.max(tmin, 0);
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < 0 || b > 0) return -1;
  return -b - Math.sqrt(disc);
}

// squared distance between segments p1-q1 and p2-q2 (Ericson)
export function segSegDist2(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t);
  const cy = p1.y + d1y * s - (p2.y + d2y * t);
  const cz = p1.z + d1z * s - (p2.z + d2z * t);
  return { d2: cx * cx + cy * cy + cz * cz, s, t };
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
