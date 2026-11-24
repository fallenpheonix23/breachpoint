// Data-driven maps: builds a JSON map definition (see docs/MAP_FORMAT.md) with MapKit.
import * as THREE from 'three';
import { MapKit } from './kit.js';
import { L_ALL } from '../physics.js';

const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const dirOf = (v) => Object.keys(DIRS).find((k) => DIRS[k][0] === v[0] && DIRS[k][1] === v[1]);

// symmetry transforms on the XZ plane
function makeXf(kind) {
  if (kind === 'mirrorX') return { pt: ([x, z]) => [-x, z], dir: (d) => dirOf([-DIRS[d][0], DIRS[d][1]]) };
  if (kind === 'rotate180') return { pt: ([x, z]) => [-x, -z], dir: (d) => dirOf([-DIRS[d][0], -DIRS[d][1]]) };
  return null;
}
const rect = (r, xf) => { const [a, b] = [xf.pt([r[0], r[1]]), xf.pt([r[2], r[3]])]; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };

// returns a transformed copy of an entity (or null if it opts out of symmetry)
function transform(e, xf) {
  if (e.mirror === false) return null;
  const o = JSON.parse(JSON.stringify(e));
  if (o.rect) o.rect = rect(o.rect, xf);
  if (o.min && o.max) { const [a, b] = [xf.pt([o.min[0], o.min[2]]), xf.pt([o.max[0], o.max[2]])]; o.min = [Math.min(a[0], b[0]), o.min[1], Math.min(a[1], b[1])]; o.max = [Math.max(a[0], b[0]), o.max[1], Math.max(a[1], b[1])]; }
  if (o.holes) o.holes = o.holes.map((h) => rect(h, xf));
  if (Array.isArray(o.from)) o.from = xf.pt(o.from);
  if (Array.isArray(o.to)) o.to = xf.pt(o.to);
  if (Array.isArray(o.at)) { const [x, z] = xf.pt([o.at[0], o.at[2]]); o.at = [x, o.at[1], z]; }
  if (o.dir) o.dir = xf.dir(o.dir);
  if (o.facing) o.facing = xf.dir({ n: '-z', s: '+z', e: '+x', w: '-x' }[o.facing]).replace('-z', 'n').replace('+z', 's').replace('+x', 'e').replace('-x', 'w');
  if (o.axis && xf.dir('+x') === '-x' && xf.dir('+z') === '+z') { /* mirror keeps axis */ }
  if (o.team !== undefined) o.team = 1 - o.team;
  if (o.mirrorName) o.name = o.mirrorName;
  if (o.yaw !== undefined) o.yaw = xf.dir('+z') === '-z' ? o.yaw + 180 : -o.yaw;
  return o;
}

function buildEntity(kit, e) {
  const L = { layer: e.layer || 'all' };
  const vis = e.layer === 'visual' ? { collide: false } : {};
  switch (e.type) {
    case 'box': kit.box(e.min[0], e.min[1], e.min[2], e.max[0], e.max[1], e.max[2], e.mat, { ...L, ...vis, r: e.round || 0 }); break;
    case 'ground': kit.at(e.y || 0, () => kit.ground(...e.rect, e.mat)); break;
    case 'floor': kit.floorSlab(...e.rect, e.y, e.t ?? 0.3, e.mat, e.holes || [], { ...L, ...vis }); break;
    case 'ramp': kit.ramp(...e.rect, e.dir, e.y0, e.y1, e.mat, { ...L, thick: e.thick }); break;
    case 'stairs': kit.stairsTo(e.from[0], e.from[1], e.dir, e.w ?? 2, e.y ?? 0, e.to, e.mat, { ...L, open: e.open, run: e.run }); break;
    case 'wall': {
      const [ax, az] = e.from, [bx, bz] = e.to, y = e.y || 0, h = e.h ?? 4, t = e.t ?? 0.3, alongX = Math.abs(az - bz) < 1e-6;
      const a0 = alongX ? ax : az, a1 = alongX ? bx : bz, sgn = Math.sign(a1 - a0) || 1;
      const holes = [], grates = [];
      for (const op of e.openings || []) {
        const c = a0 + sgn * op.at, w = op.w ?? (op.kind === 'window' ? 1.4 : 1.4);
        const oy = op.y ?? (op.kind === 'window' ? 1.1 : 0), oh = op.h ?? (op.kind === 'window' ? 1.1 : 2.4);
        holes.push([c - w / 2, c + w / 2, oy, oy + oh]);
        if (op.kind === 'grate') grates.push([c - w / 2, c + w / 2, oy, oy + oh]);
      }
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      kit.at(y, (k) => {
        if (alongX) k.wallX(lo, hi, az - t / 2, az + t / 2, h, e.mat, holes, { frame: e.frame });
        else k.wallZ(lo, hi, ax - t / 2, ax + t / 2, h, e.mat, holes, { frame: e.frame });
        for (const [g0, g1, gy0, gy1] of grates) { // see/shoot through, can't walk through
          if (alongX) k.box(g0, gy0, az - 0.05, g1, gy1, az + 0.05, null, { visible: false, layer: 'move' });
          else k.box(ax - 0.05, gy0, g0, ax + 0.05, gy1, g1, null, { visible: false, layer: 'move' });
          for (let v = g0 + 0.15; v < g1; v += 0.3) {
            if (alongX) k.box(v - 0.02, gy0, az - 0.02, v + 0.02, gy1, az + 0.02, 'dark', { collide: false });
            else k.box(ax - 0.02, gy0, v - 0.02, ax + 0.02, gy1, v + 0.02, 'dark', { collide: false });
          }
        }
      });
      break;
    }
    case 'railing': kit.at(e.y || 0, (k) => k.railing(e.from[0], e.from[1], e.to[0], e.to[1], e.mat || 'dark')); break;
    case 'cover': kit.at(e.at[1], (k) => k.cover(e.at[0], e.at[2], e.w ?? 0.9, e.d ?? 3, e.mat || 'sandbag', e.h ?? 1.1)); break;
    case 'nest': kit.at(e.at[1], (k) => { const f = k.flip; k.flip = e.dir === '-x'; k.nest(e.dir === '-x' ? -e.at[0] : e.at[0], e.at[2], e.mat || 'trim', e.lane || ''); k.flip = f; }); break;
    case 'prop': kit.at(e.at[1] || 0, (k) => {
      const [x, , z] = e.at;
      if (e.kind === 'crate') k.crate(x, z, e.size ?? 1.1, e.stack ?? 1, e.mat);
      else if (e.kind === 'barrel') k.barrel(x, z, e.mat);
      else if (e.kind === 'container') k.container(x, z, e.axis || 'x', e.mat || 'contA', e.y0 || 0);
      else if (e.kind === 'car') k.car(x, z, e.axis || 'x', e.mat || 'metal');
      else if (e.kind === 'tree') k.tree(x, z, e.scale ?? 1);
      else if (e.kind === 'palm') k.palm(x, z, e.h ?? 6.5);
      else if (e.kind === 'lamp') k.lamp(x, z, e.h ?? 4.4);
      else if (e.kind === 'bench') k.bench(x, z, e.axis || 'x');
      else if (e.kind === 'planter') k.planter(x, z, e.w ?? 2, e.d ?? 1, e.mat || 'stoneLight', e.flowers || 'flowerR');
      else if (e.kind === 'stall') k.stall(x, z, e.axis || 'x', e.mat || 'cloth');
      else if (e.kind === 'fountain') k.fountain(x, z, e.r ?? 3);
      else throw new Error('unknown prop kind ' + e.kind);
    }); break;
    case 'sign': kit.at(e.at[1], (k) => k.sign(e.at[0], 0, e.at[2], e.w, e.h, e.text, e.color || '#ffffff', e.facing || 's', { boost: e.boost })); break;
    case 'light': kit.pointLight(e.at[0], e.at[1], e.at[2], e.color ?? 0xffe0b0, e.intensity ?? 5, e.dist ?? 14); break;
    case 'water': kit.water(...e.rect, e.y ?? -1, e.color, e.deep); break;
    case 'lightstrip': kit.box(e.min[0], e.min[1], e.min[2], e.max[0], e.max[1], e.max[2], e.mat || 'light', { collide: false }); break;
    default: throw new Error('unknown entity type ' + e.type);
  }
}

export function buildFromData(scene, T, data) {
  const kit = new MapKit(scene, T, data.theme);
  if (data.bounds) { const [x0, z0, x1, z1] = data.bounds; kit.bounds = { x0, z0, x1, z1 }; }
  for (const [name, m] of Object.entries(data.materials || {})) {
    const o = { ...m };
    if (typeof o.color === 'string') o.color = new THREE.Color(o.color).getHex();
    if (o.basic) o.basic = new THREE.Color(...o.basic);
    kit.defMat(name, o);
  }
  kit.floors = data.floors || [{ name: 'Ground', y: 0 }];
  const xf = makeXf(data.symmetry);
  const all = (list) => { const out = [...(list || [])]; if (xf) for (const e of list || []) { const t = transform(e, xf); if (t) out.push(t); } return out; };
  for (const e of all(data.geometry)) buildEntity(kit, e);
  for (const a of all(data.areas)) {
    const [x0, z0, x1, z1] = a.rect;
    kit.zone(x0, z0, x1, z1, a.name, a.kind || 'AREA', a.hint || '', { y0: a.y?.[0], y1: a.y?.[1], tag: a.tag, key: a.key, floor: a.floor });
  }
  // Breach (attack/defend) spawns carry role + phase; team 0/1 lists still get them so nav reachability works
  const roleTeam = (o) => (o.role ? (o.role === 'attack' ? 0 : 1) : o.team);
  for (const s of all(data.spawns)) { kit.spawn(s.at[0], s.at[2], s.at[1], roleTeam(s), s.yaw ?? null); const p = kit.spawns[roleTeam(s)].at(-1); p.role = s.role; p.phase = s.phase ?? 0; }
  for (const t of all(data.turrets)) kit.turretSpots.push({ team: roleTeam(t), role: t.role, pos: new THREE.Vector3(t.at[0], t.at[1], t.at[2]) });
  for (const c of all((data.connectors || []).map((at) => ({ at })))) kit.connectors.push([c.at[0], c.at[2], c.at[1]]);
  for (const [name, r] of Object.entries(data.routes || {})) {
    let pts = r.pts.map(([x, y, z]) => [x, z, y]);
    if (xf && r.symmetric) pts = [...pts, ...[...pts].reverse().map(([x, z, y]) => { const [a, b] = xf.pt([x, z]); return [a, b, y]; })];
    kit.lanes[name] = { kind: r.kind || 'mid', pts, role: r.role, phase: r.phase };
  }
  const map = kit.finish({ id: data.id, name: data.name, location: data.location, data });
  if (data.mode === 'breach') map.breach = buildBreach(scene, map, data);
  return map;
}

// Breach mode data: objectives (capture zones, in order), gates (blockers that open at a phase), spawns by role/phase,
// defender hold points, role/phase routes. Gates are added AFTER the nav grid is built, so bots treat them as open.
function buildBreach(scene, map, data) {
  const objectives = (data.objectives || []).map((o, i) => ({ id: o.id, name: o.name || `Site ${o.id}`, order: o.order ?? i,
    x0: o.rect[0], z0: o.rect[1], x1: o.rect[2], z1: o.rect[3], y0: o.y?.[0] ?? -0.5, y1: o.y?.[1] ?? 3.5, capture: o.capture || [14, 10, 8] })).sort((a, b) => a.order - b.order);
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const gates = (data.gates || []).map((gd) => {
    const [x0, y0, z0] = gd.min, [x1, y1, z1] = gd.max;
    const box = map.world.add(x0, y0, z0, x1, y1, z1, 'gate', L_ALL);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), gateMat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); scene.add(mesh);
    return { id: gd.id, opens: gd.opens || 'setup', box, mesh, open: false };
  });
  const spawns = { attack: [], defend: [] };
  for (const t of [0, 1]) for (const p of map.spawns[t]) if (p.role) (spawns[p.role][p.phase] ||= []).push(p);
  const holds = (data.holds || []).map((h) => ({ site: h.site, x: h.at[0], y: h.at[1], z: h.at[2] }));
  const routes = Object.values(map.lanes).filter((l) => l.role).map((l) => ({ role: l.role, phase: l.phase ?? 0, pts: l.pts }));
  return { objectives, gates, spawns, holds, routes, setup: data.setup ?? 20, clock: data.clock || [210, 150] };
}
