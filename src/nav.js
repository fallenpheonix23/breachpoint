// Layered navigation grid (0.5 m cells, several standable levels per cell) + A*.
// Links between neighbouring nodes:
//   walk  |Δh| ≤ MAX_STEP (both ways)          stairs, ramps, flat floors
//   drop  one-way, down a ledge ≤ MAX_DROP      committal drop-downs
//   jump  one-way, up a ledge ≤ JUMP_UP          (bots press jump)
// Bridges/catwalks are just a second level above the floor in the same cells.
import { L_MOVE, MAX_STEP } from './physics.js';

export const MAX_DROP = 4.5, JUMP_UP = 1.15, CLEAR = 1.75;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class NavGrid {
  constructor(world, bounds, cs = 0.5) {
    this.world = world; this.cs = cs;
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.W = Math.ceil((bounds.x1 - bounds.x0) / cs); this.H = Math.ceil((bounds.z1 - bounds.z0) / cs);
    const hw = 0.33; // clearance half-width tested around each cell centre (body half-width 0.35)
    const N = this.W * this.H;
    const start = new Int32Array(N + 1), heights = [];
    const q = [];
    for (let k = 0; k < N; k++) {
      start[k] = heights.length;
      const i = k % this.W, j = (k / this.W) | 0;
      const x = this.x0 + (i + 0.5) * cs, z = this.z0 + (j + 0.5) * cs;
      // candidate floors: ground plane, tops of boxes under the cell centre (big enough to stand on), ramp surfaces
      const cand = [0];
      world.query(x - 0.02, z - 0.02, x + 0.02, z + 0.02, q, L_MOVE);
      for (const b of q) if (b.max[0] - b.min[0] > 0.32 && b.max[2] - b.min[2] > 0.32) cand.push(b.max[1]); // not wall tops (≤0.3 m)
      for (const r of world.ramps) if ((r.layer & L_MOVE) && r.walkable && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) cand.push(world.rampSurface(r, x, z));
      cand.sort((a, b) => a - b);
      world.query(x - hw, z - hw, x + hw, z + hw, q, L_MOVE);
      const ramps = world.rampsIn(x - hw, z - hw, x + hw, z + hw, L_MOVE);
      let last = -99;
      for (const h of cand) {
        if (h - last < 0.05) continue;
        let blocked = false;
        for (const b of q) if (b.max[1] > h + MAX_STEP && b.min[1] < h + CLEAR) { blocked = true; break; }
        if (!blocked) for (const r of ramps) {
          const u = world.rampUnder(r, x, z, hw);
          if (u && u.top > h + MAX_STEP && u.under < h + CLEAR) { blocked = true; break; }
        }
        // a "floor" buried inside a solid (e.g. ground under a raised platform) is not standable
        if (!blocked) for (const b of q) if (b.min[1] < h + 0.05 && b.max[1] > h + 0.05 && b.min[0] <= x && b.max[0] >= x && b.min[2] <= z && b.max[2] >= z) { blocked = true; break; }
        // …same for a floor inside a solid ramp wedge (ground under a ramp's foot): only the ramp surface is a floor there
        if (!blocked) for (const r of world.ramps) {
          if (!(r.layer & L_MOVE) || x <= r.x0 || x >= r.x1 || z <= r.z0 || z >= r.z1) continue;
          const u = world.rampUnder(r, x, z, 0.01);
          if (u && u.under < h + 0.05 && u.top > h + 0.05) { blocked = true; break; }
        }
        if (blocked) continue;
        heights.push(h); last = h;
      }
    }
    start[N] = heights.length;
    this.start = start; this.nh = Float32Array.from(heights);
    const NN = this.nh.length;
    this.ncell = new Int32Array(NN);
    for (let k = 0; k < N; k++) for (let n = start[k]; n < start[k + 1]; n++) this.ncell[n] = k;
    // compatibility views (lowest level per cell)
    this.walk = new Uint8Array(N); this.h = new Float32Array(N);
    for (let k = 0; k < N; k++) if (start[k + 1] > start[k]) { this.walk[k] = 1; this.h[k] = this.nh[start[k]]; }
    // edge-proximity cost: nodes next to walls / ledges cost more so paths keep to the middle
    this.ncost = new Float32Array(NN);
    for (let n = 0; n < NN; n++) {
      let open = 0;
      this.forEdges(n, (m, kind) => { if (kind === 'walk') open++; }, true);
      this.ncost[n] = open >= 8 ? 1 : open >= 6 ? 2 : 4;
    }
    this.cost = new Float32Array(N);
    for (let k = 0; k < N; k++) this.cost[k] = this.walk[k] ? this.ncost[start[k]] : 0;
    this.g = new Float32Array(NN); this.f = new Float32Array(NN);
    this.parent = new Int32Array(NN); this.pkind = new Uint8Array(NN);
    this.seen = new Uint32Array(NN); this.closed = new Uint32Array(NN);
    this.gen = 0; this.heap = new Int32Array(NN * 8 + 8); this.hn = 0;
  }
  get nodeCount() { return this.nh.length; }
  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cs), j = Math.floor((z - this.z0) / this.cs);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  }
  nodeXZ(n) { const k = this.ncell[n]; return [this.x0 + ((k % this.W) + 0.5) * this.cs, this.z0 + (((k / this.W) | 0) + 0.5) * this.cs]; }
  levelNear(k, h, tol = MAX_STEP) {
    let best = -1, bd = tol + 1e-6;
    for (let n = this.start[k]; n < this.start[k + 1]; n++) { const d = Math.abs(this.nh[n] - h); if (d <= bd) { bd = d; best = n; } }
    return best;
  }
  isWalkable(x, z) { const k = this.idx(x, z); return k >= 0 && this.walk[k] === 1; }
  // node a body standing at (x, y, z) is on (searches nearby cells if needed)
  nodeAt(x, y, z, radius = 10) {
    const k0 = this.idx(x, z);
    if (k0 >= 0) {
      let best = -1, bh = -Infinity;
      for (let n = this.start[k0]; n < this.start[k0 + 1]; n++) if (this.nh[n] <= y + 0.7 && this.nh[n] > bh) { bh = this.nh[n]; best = n; }
      if (best >= 0 && y - bh < 3) return best;
    }
    const i0 = Math.floor((x - this.x0) / this.cs), j0 = Math.floor((z - this.z0) / this.cs);
    let best = -1, bs = Infinity;
    for (let r = 0; r <= radius; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.W || j >= this.H) continue;
        const k = j * this.W + i;
        for (let n = this.start[k]; n < this.start[k + 1]; n++) {
          const s = Math.hypot(di, dj) * this.cs + Math.abs(this.nh[n] - y) * 2;
          if (s < bs) { bs = s; best = n; }
        }
      }
      if (best >= 0 && r >= 2) return best;
    }
    return best;
  }
  // visit outgoing links of node n: cb(m, kind, cost)
  forEdges(n, cb, walkOnly = false) {
    const W = this.W, k = this.ncell[n], ci = k % W, cj = (k / W) | 0, ha = this.nh[n];
    for (const [di, dj] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= this.H) continue;
      const kk = nj * W + ni, diag = di && dj, dist = (diag ? 1.414 : 1) * this.cs;
      const same = this.levelNear(kk, ha);
      if (same >= 0) {
        if (diag) { // no corner cutting
          const a = this.levelNear(cj * W + ni, ha), b = this.levelNear(nj * W + ci, ha);
          if (a < 0 || b < 0) continue;
        }
        cb(same, 'walk', dist);
        continue;
      }
      if (walkOnly || diag) continue;
      let drop = -1, dh = -Infinity, up = -1, uh = Infinity;
      for (let m = this.start[kk]; m < this.start[kk + 1]; m++) {
        const h = this.nh[m];
        if (h < ha - MAX_STEP && h >= ha - MAX_DROP && h > dh) { dh = h; drop = m; }
        if (h > ha + MAX_STEP && h <= ha + JUMP_UP && h < uh) { uh = h; up = m; }
      }
      if (drop >= 0 && this.dropClear(kk, ha)) cb(drop, 'drop', dist + 3);
      if (up >= 0) cb(up, 'jump', dist + 4);
    }
  }
  // a body standing at height ha can step out over cell kk (nothing in the way between ha and ha + CLEAR) — cached
  dropClear(kk, ha) {
    const key = kk * 64 + Math.round(ha * 4); (this._dc ||= new Map());
    let v = this._dc.get(key);
    if (v === undefined) {
      const W = this.W, x = this.x0 + ((kk % W) + 0.5) * this.cs, z = this.z0 + (((kk / W) | 0) + 0.5) * this.cs, h = 0.3, q = [];
      this.world.query(x - h, z - h, x + h, z + h, q, L_MOVE);
      v = !q.some((b) => b.max[1] > ha + MAX_STEP && b.min[1] < ha + CLEAR);
      this._dc.set(key, v);
    }
    return v;
  }
  push(n) {
    const h = this.heap, f = this.f;
    let i = this.hn++;
    h[i] = n;
    while (i > 0) { const p = (i - 1) >> 1; if (f[h[p]] <= f[h[i]]) break; const t = h[p]; h[p] = h[i]; h[i] = t; i = p; }
  }
  pop() {
    const h = this.heap, f = this.f, top = h[0];
    h[0] = h[--this.hn];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1; let m = i;
      if (l < this.hn && f[h[l]] < f[h[m]]) m = l;
      if (r < this.hn && f[h[r]] < f[h[m]]) m = r;
      if (m === i) break;
      const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
    }
    return top;
  }
  // a node on a prop top / ledge the walk graph can't reach (got there by grapple, jump pad…) → nearest reachable node
  // within 6 m (prefer lower ones: you can always step or fall off), so bots never strand themselves
  reachableNear(n) {
    if (n < 0 || !this.reach || this.reach[n]) return n;
    const k0 = this.ncell[n], W = this.W, i0 = k0 % W, j0 = (k0 / W) | 0, h0 = this.nh[n], R = Math.ceil(6 / this.cs);
    let best = -1, bs = Infinity;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= W || j >= this.H) continue;
      const k = j * W + i;
      for (let m = this.start[k]; m < this.start[k + 1]; m++) {
        if (!this.reach[m] || this.nh[m] > h0 + MAX_STEP) continue;
        const sc = Math.hypot(di, dj) * this.cs + (h0 - this.nh[m]) * 0.3; if (sc < bs) { bs = sc; best = m; }
      }
    }
    return best >= 0 ? best : n;
  }
  // A* between two world positions. sy/gy optional (start/goal heights). Returns [{x, y, z, kind}].
  findPath(sx, sz, gx, gz, sy = 0, gy) {
    const s = this.reachableNear(this.nodeAt(sx, sy, sz));
    const goal = this.reachableNear(this.nodeAt(gx, gy ?? 0, gz));
    if (s < 0 || goal < 0) return null;
    const raw = this.astar(s, goal);
    if (!raw) return null;
    const pts = raw.map(([n, kind]) => { const [x, z] = this.nodeXZ(n); return { x, z, y: this.nh[n], kind }; });
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 28);
      while (j > i + 1 && !(this.allWalk(pts, i, j) && this.lineClear(pts[i], pts[j]))) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
  allWalk(pts, i, j) { for (let k = i + 1; k <= j; k++) if (pts[k].kind !== 'walk') return false; return true; }
  astar(s, goal, maxExp = 400000, weight = 1.25) {
    this.hw = weight; // weighted A*: near-optimal paths with far fewer expansions
    const gen = ++this.gen, W = this.W;
    const gk = this.ncell[goal], gi = gk % W, gj = (gk / W) | 0, gh = this.nh[goal];
    const heur = (n) => {
      const k = this.ncell[n], dx = Math.abs((k % W) - gi), dz = Math.abs(((k / W) | 0) - gj);
      return ((Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * this.cs + Math.abs(this.nh[n] - gh) * 0.5) * this.hw;
    };
    this.hn = 0; this.g[s] = 0; this.f[s] = heur(s); this.seen[s] = gen; this.parent[s] = -1; this.pkind[s] = 0;
    this.push(s);
    let found = false, exp = 0;
    const KIND = { walk: 0, drop: 1, jump: 2 };
    while (this.hn > 0 && exp++ < maxExp) {
      const c = this.pop();
      if (this.closed[c] === gen) continue;
      this.closed[c] = gen;
      if (c === goal) { found = true; break; }
      this.forEdges(c, (m, kind, dist) => {
        if (this.closed[m] === gen) return;
        const ng = this.g[c] + dist * this.ncost[m];
        if (this.seen[m] === gen && ng >= this.g[m]) return;
        this.seen[m] = gen; this.g[m] = ng; this.f[m] = ng + heur(m); this.parent[m] = c; this.pkind[m] = KIND[kind];
        if (this.hn < this.heap.length) this.push(m);
      });
    }
    if (!found) return null;
    const NAMES = ['walk', 'drop', 'jump'], raw = [];
    for (let n = goal; n !== -1; n = this.parent[n]) raw.push([n, NAMES[this.pkind[n]]]);
    return raw.reverse();
  }
  lineClear(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cs * 0.8));
    let h = a.y;
    for (let s = 1; s <= steps; s++) {
      const k = this.idx(a.x + (dx * s) / steps, a.z + (dz * s) / steps);
      if (k < 0) return false;
      const n = this.levelNear(k, h);
      if (n < 0 || this.ncost[n] >= 4) return false;
      h = this.nh[n];
    }
    return Math.abs(h - b.y) <= MAX_STEP;
  }
  // Flood-fill from seed nodes (spawns) along walk/drop/jump links; refresh the compatibility views
  // so `walk`/`h` describe the lowest REACHABLE level (roofs you can't get onto don't count).
  markReachable(seeds) {
    const NN = this.nodeCount, reach = new Uint8Array(NN), stack = [];
    for (const s of seeds) if (s >= 0 && !reach[s]) { reach[s] = 1; stack.push(s); }
    while (stack.length) { const n = stack.pop(); this.forEdges(n, (m) => { if (!reach[m]) { reach[m] = 1; stack.push(m); } }); }
    this.reach = reach;
    const N = this.W * this.H;
    this.walk.fill(0);
    for (let k = 0; k < N; k++) for (let n = this.start[k]; n < this.start[k + 1]; n++) if (reach[n]) { this.walk[k] = 1; this.h[k] = this.nh[n]; this.cost[k] = this.ncost[n]; break; }
    return reach;
  }
  // full adjacency (for validation): out[n] = [[m, kind, cost], ...]
  buildGraph() {
    const out = new Array(this.nodeCount);
    for (let n = 0; n < this.nodeCount; n++) { const e = []; this.forEdges(n, (m, kind, c) => e.push([m, kind, c])); out[n] = e; }
    return out;
  }
}
