// All 15 abilities + their persistent world objects.
import * as THREE from 'three';
import { TEAM_COLORS } from './config.js';
import { raySphere, overlapsAny, moveBody, segSegDist2, L_MOVE, L_SHOT } from './physics.js';
import { SoldierModel } from './models.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const RR = {};
const teamGlow = (team, k = 4) => new THREE.Color(TEAM_COLORS[team]).multiplyScalar(k);

class Obj {
  constructor(ab, owner, kind) {
    this.ab = ab; this.g = ab.g; this.owner = owner; this.team = owner.team; this.kind = kind;
    this.alive = true; this.tech = true; this.age = 0;
    this.group = new THREE.Group();
    this.g.scene.add(this.group);
  }
  kill() { this.alive = false; }
  dispose() {
    this.g.scene.remove(this.group);
    this.group.traverse((o) => { if (o.material && o.userData.own) o.material.dispose(); });
  }
  onEmp() { this.kill(); this.g.fx.sparks(this.pos || this.group.position, [0.6, 1.4, 4], 14, 5); }
  onHack(team) { this.team = team; }
}

// ── thrown grenade ───────────────────────────────────────────────────────────
class Grenade extends Obj {
  constructor(ab, owner, o) {
    super(ab, owner, 'grenade');
    this.tech = false;
    this.o = o;
    this.pos = owner.eyePos(new THREE.Vector3());
    const aim = owner.aimDir(new THREE.Vector3());
    this.pos.addScaledVector(aim, 0.5);
    this.vel = ab.throwVel(owner, o.speed || 22, o.target);
    this.fuse = o.fuse ?? 1.5;
    this.bounces = 0;
    const m = new THREE.Mesh(ab.geo.sphere, new THREE.MeshBasicMaterial({ color: o.color }));
    m.userData.own = true; m.scale.setScalar(o.size || 0.14);
    this.group.add(m);
    this.group.position.copy(this.pos);
  }
  update(dt) {
    const g = this.g;
    dt *= g.stasisFactor(this.pos);
    this.age += dt; this.fuse -= dt;
    this.vel.y -= 18 * dt;
    const len = this.vel.length() * dt;
    if (len > 0) {
      _a.copy(this.vel).normalize();
      if (g.world.raycast(this.pos, _a, len + 0.12, RR)) {
        this.pos.addScaledVector(_a, Math.max(0, RR.t - 0.12));
        if (this.o.impact) return this.detonate(RR);
        const n = _b.set(RR.nx, RR.ny, RR.nz);
        this.vel.addScaledVector(n, -2 * this.vel.dot(n)).multiplyScalar(0.4);
        this.bounces++;
        if (this.bounces < 4) g.sfx('clink', this.pos, 0.3);
      } else this.pos.addScaledVector(this.vel, dt);
    }
    if (this.o.contact) {
      for (const t of g.targets) {
        if (t.alive && t.team !== this.team && t.center(_c).distanceTo(this.pos) < 1.0) return this.detonate(null);
      }
    }
    this.group.position.copy(this.pos);
    if (Math.random() < 0.5) g.fx.spark(this.pos, this.o.color.toArray ? this.o.color.toArray() : [2, 2, 2], 0.6, 0.12, 0.25);
    if (this.fuse <= 0) this.detonate(null);
  }
  detonate(hit) {
    if (!this.alive) return;
    this.kill();
    const p = this.pos.clone();
    if (hit) p.add(_b.set(hit.nx, hit.ny, hit.nz).multiplyScalar(0.3));
    this.o.onDetonate(p, hit);
  }
}

// ── singularity well ─────────────────────────────────────────────────────────
class Singularity extends Obj {
  constructor(ab, owner, pos) {
    super(ab, owner, 'singularity');
    this.tech = false;
    this.pos = pos.clone(); this.pos.y = Math.max(this.pos.y, 1.2);
    this.life = 3.5; this.r = 10; this.tick = 0;
    this.group.position.copy(this.pos);
    const core = new THREE.Mesh(ab.geo.sphere, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    core.scale.setScalar(0.55); core.userData.own = true; this.group.add(core);
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(ab.geo.torus, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.6, 4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.userData.own = true; r.scale.setScalar(1.1 + i * 0.5); r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.group.add(r); this.rings.push(r);
    }
    this.g.sfx('singularity', this.pos, 1);
  }
  update(dt) {
    const g = this.g;
    this.age += dt; this.tick += dt;
    this.rings.forEach((r, i) => { r.rotation.x += dt * (2 + i); r.rotation.y += dt * (1.5 - i * 0.4); });
    const pulse = 1 + Math.sin(this.age * 12) * 0.08;
    this.group.scale.setScalar(pulse * Math.min(1, this.age * 4) * (this.life - this.age < 0.3 ? (this.life - this.age) / 0.3 : 1));
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, rr = 3 + Math.random() * 6;
      const p = _a.set(this.pos.x + Math.cos(a) * rr, this.pos.y + (Math.random() - 0.5) * 4, this.pos.z + Math.sin(a) * rr);
      const v = _b.copy(this.pos).sub(p).multiplyScalar(2.2);
      g.fx.particle(p, v, [1.6, 0.5, 3.2], 0.15, 0.45, 0, 0);
    }
    const doTick = this.tick > 0.25;
    if (doTick) this.tick = 0;
    for (const s of g.soldiers) {
      if (!s.alive || s.team === this.team) continue;
      const c = s.center(_c);
      const d = c.distanceTo(this.pos);
      if (d > this.r || d < 0.01) continue;
      const pull = 42 * (1 - d / this.r * 0.5);
      _a.copy(this.pos).sub(c).normalize();
      s.vel.addScaledVector(_a, pull * dt);
      const hs = Math.hypot(s.vel.x, s.vel.z);
      if (hs > 14) { s.vel.x *= 14 / hs; s.vel.z *= 14 / hs; }
      if (d < 1.5) { s.vel.x *= 0.85; s.vel.z *= 0.85; }
      s.knockT = Math.max(s.knockT, 0.15); s.onGround = false;
      if (doTick) s.takeDamage(2.5, this.owner, { weapon: 'Singularity', kind: 'ability', dot: true });
    }
    if (this.age >= this.life) {
      this.kill();
      g.explosion(this.pos, 3.5, 30, this.owner, { weapon: 'Singularity', color: [2, 0.6, 4] });
    }
  }
}

// ── swarm drone ──────────────────────────────────────────────────────────────
class Drone extends Obj {
  constructor(ab, owner, pos, vel) {
    super(ab, owner, 'drone');
    this.hackable = true;
    this.pos = pos.clone(); this.vel = vel.clone();
    this.life = 7 + Math.random(); this.target = null; this.retarget = 0;
    this.mat = new THREE.MeshBasicMaterial({ color: teamGlow(this.team, 3) });
    const m = new THREE.Mesh(ab.geo.octa, this.mat); m.userData.own = true; m.scale.setScalar(0.13);
    this.group.add(m); this.m = m;
  }
  onHack(team) { this.team = team; this.mat.color.copy(teamGlow(team, 3)); this.target = null; }
  update(dt) {
    const g = this.g;
    dt *= g.stasisFactor(this.pos);
    this.age += dt; this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.25; this.target = null;
      let bd = 40;
      for (const t of g.targets) {
        if (!t.alive || t.team === this.team) continue;
        const d = t.center(_c).distanceTo(this.pos);
        if (d < bd) { bd = d; this.target = t; }
      }
    }
    if (this.target && this.target.alive) {
      const c = this.target.center(_c);
      _a.copy(c).sub(this.pos);
      const d = _a.length();
      if (d < 0.85) {
        this.target.takeDamage(11, this.owner, { weapon: 'Swarm Pod', kind: 'ability' });
        g.fx.sparks(this.pos, this.mat.color.toArray(), 8, 4);
        g.sfx('pop', this.pos, 0.5);
        return this.kill();
      }
      _a.multiplyScalar(15 / d);
      this.vel.lerp(_a, Math.min(1, dt * 4));
    } else this.vel.multiplyScalar(1 - dt * 0.5);
    const len = this.vel.length() * dt;
    if (len > 0) {
      _b.copy(this.vel).normalize();
      if (g.world.raycast(this.pos, _b, len + 0.1, RR)) {
        const n = _c.set(RR.nx, RR.ny, RR.nz);
        this.vel.addScaledVector(n, -2 * this.vel.dot(n)).multiplyScalar(0.6);
      } else this.pos.addScaledVector(this.vel, dt);
    }
    this.pos.y += Math.sin(this.age * 9 + this.life * 10) * 0.01;
    this.group.position.copy(this.pos);
    this.m.rotation.y += dt * 10;
    if (Math.random() < 0.35) g.fx.spark(this.pos, this.mat.color.toArray(), 0.3, 0.07, 0.2);
    if (this.age > this.life) { g.fx.sparks(this.pos, this.mat.color.toArray(), 5, 2); this.kill(); }
  }
}

// ── plasma tripmine ──────────────────────────────────────────────────────────
class Tripmine extends Obj {
  constructor(ab, owner, p, n, end) {
    super(ab, owner, 'tripmine');
    this.hackable = true;
    this.pos = p.clone(); this.n = n.clone(); this.end = end.clone();
    this.life = 60; this.armT = 1.0; this.trig = -1; this.trigPoint = new THREE.Vector3();
    this.mat = new THREE.MeshBasicMaterial({ color: teamGlow(this.team, 5), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const body = new THREE.Mesh(ab.geo.box, new THREE.MeshStandardMaterial({ color: 0x33363b, metalness: 0.7, roughness: 0.4 }));
    body.userData.own = true; body.scale.set(0.35, 0.35, 0.12);
    body.position.copy(p); body.lookAt(_a.copy(p).add(n)); this.group.add(body);
    const len = end.distanceTo(p);
    const beam = new THREE.Mesh(ab.geo.cyl, this.mat); beam.userData.own = true;
    beam.scale.set(0.025, len, 0.025);
    beam.position.copy(p).lerp(end, 0.5);
    beam.quaternion.setFromUnitVectors(_b.set(0, 1, 0), _a.copy(end).sub(p).normalize());
    this.group.add(beam); this.beam = beam;
    this.g.sfx('beep', p, 0.6);
  }
  onHack(team) { this.team = team; this.mat.color.copy(teamGlow(team, 5)); }
  update(dt) {
    const g = this.g;
    this.age += dt; this.armT -= dt;
    this.beam.visible = this.armT > 0 ? Math.sin(this.age * 30) > 0 : true;
    this.mat.opacity = 0.6 + Math.sin(this.age * 8) * 0.25;
    if (this.trig >= 0) {
      this.trig -= dt;
      if (this.trig < 0) {
        this.kill();
        g.explosion(this.trigPoint, 5, 95, this.owner, { weapon: 'Plasma Tripmine', color: teamGlow(this.team, 2).toArray() });
      }
      return;
    }
    if (this.armT > 0) return;
    for (const t of g.targets) {
      if (!t.alive || t.team === this.team || t.isTurret) continue;
      const h = t.isSoldier ? t.height : 1.8;
      _a.set(t.pos.x, t.pos.y + 0.1, t.pos.z); _b.set(t.pos.x, t.pos.y + h - 0.1, t.pos.z);
      const r = segSegDist2(this.pos, this.end, _a, _b);
      if (r.d2 < 0.45 * 0.45) {
        this.trig = 0.18;
        this.trigPoint.copy(this.pos).lerp(this.end, r.s);
        g.sfx('beep', this.pos, 1);
        break;
      }
    }
    if (this.age > this.life) this.kill();
  }
}

// ── ricochet disc ────────────────────────────────────────────────────────────
class Disc extends Obj {
  constructor(ab, owner) {
    super(ab, owner, 'disc');
    this.tech = false;
    this.pos = owner.eyePos(new THREE.Vector3());
    this.vel = owner.aimDir(new THREE.Vector3()).multiplyScalar(32);
    this.pos.addScaledVector(this.vel, 0.02);
    this.bounces = 0; this.hit = new Set(); this.life = 3.2;
    this.color = [3, 3.2, 3.6];
    const m = new THREE.Mesh(ab.geo.disc, new THREE.MeshBasicMaterial({ color: new THREE.Color(...this.color) }));
    m.userData.own = true; this.group.add(m); this.m = m;
    this.g.sfx('disc', this.pos, 0.8);
  }
  update(dt) {
    const g = this.g;
    dt *= g.stasisFactor(this.pos);
    this.age += dt;
    let remain = this.vel.length() * dt;
    let guard = 0;
    while (remain > 1e-4 && guard++ < 4 && this.alive) {
      const dir = _a.copy(this.vel).normalize();
      let wallT = remain + 1, nrm = null;
      if (g.world.raycast(this.pos, dir, remain, RR)) { wallT = RR.t; nrm = [RR.nx, RR.ny, RR.nz]; }
      // targets along this step (pierce)
      for (const t of g.targets) {
        if (!t.alive || t.team === this.team || this.hit.has(t)) continue;
        const h = t.hitTest(this.pos, dir, Math.min(wallT, remain) + 0.3);
        if (h) {
          this.hit.add(t);
          const dmg = 40 * (1 + 0.3 * this.bounces);
          t.takeDamage(dmg, this.owner, { weapon: this.bounces ? `Ricochet Disc ×${this.bounces}` : 'Ricochet Disc', kind: 'ability', head: false });
          g.fx.sparks(t.center(_c), [4, 1, 0.6], 10, 5);
        }
      }
      if (nrm && wallT <= remain) {
        this.pos.addScaledVector(dir, Math.max(0, wallT - 0.05));
        const n = _b.set(...nrm);
        this.vel.addScaledVector(n, -2 * this.vel.dot(n));
        this.bounces++;
        g.fx.sparks(this.pos, this.color, 10, 6);
        g.sfx('clink', this.pos, 0.7);
        remain -= wallT;
        if (this.bounces > 4) { this.kill(); break; }
        this.hit.clear(); // can hit the same target again after a bounce
      } else { this.pos.addScaledVector(dir, remain); remain = 0; }
    }
    this.group.position.copy(this.pos);
    this.m.rotation.y += dt * 30;
    g.fx.spark(this.pos, this.color, 0.2, 0.1, 0.2);
    if (this.age > this.life) this.kill();
  }
}

// ── stasis field ─────────────────────────────────────────────────────────────
class Stasis extends Obj {
  constructor(ab, owner, pos) {
    super(ab, owner, 'stasis');
    this.pos = pos.clone(); this.pos.y = Math.max(this.pos.y, 1.5);
    this.r = 6; this.life = 4.5; this.frozen = [];
    this.group.position.copy(this.pos);
    const sh = new THREE.Mesh(ab.geo.sphereHi, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.4, 2.2), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    sh.userData.own = true; sh.scale.setScalar(this.r); this.group.add(sh); this.shell = sh;
    const wire = new THREE.Mesh(ab.geo.ico, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3.5), wireframe: true, transparent: true, opacity: 0.35, depthWrite: false }));
    wire.userData.own = true; wire.scale.setScalar(this.r * 1.01); this.group.add(wire); this.wire = wire;
    this.g.stasisFields.push(this);
    this.g.sfx('stasis', this.pos, 1);
  }
  contains(p) { return p.distanceTo(this.pos) < this.r; }
  freezeBullet(shooter, p, dir, wpn, remaining, dist) {
    const m = new THREE.Mesh(this.ab.geo.cyl, new THREE.MeshBasicMaterial({ color: new THREE.Color(...wpn.tracer).multiplyScalar(1.4) }));
    m.userData.own = true; m.scale.set(0.02, 0.35, 0.02);
    m.position.copy(p); m.quaternion.setFromUnitVectors(_b.set(0, 1, 0), dir);
    this.g.scene.add(m);
    this.frozen.push({ shooter, p: p.clone(), dir: dir.clone(), wpn, remaining, dist, m });
  }
  update(dt) {
    const g = this.g;
    this.age += dt;
    const k = Math.min(1, this.age * 5) * (this.life - this.age < 0.25 ? Math.max(0, (this.life - this.age) / 0.25) : 1);
    this.group.scale.setScalar(Math.max(0.01, k));
    this.wire.rotation.y += dt * 0.1; this.wire.rotation.x += dt * 0.05;
    for (const s of g.soldiers) {
      if (!s.alive || s.team === this.team) continue;
      if (s.center(_c).distanceTo(this.pos) < this.r) { s.timeScale = 0.04; s.inStasis = true; }
    }
    for (const f of this.frozen) f.m.position.addScaledVector(f.dir, dt * 0.05);
    if (Math.random() < 0.6) {
      const p = _a.randomDirection().multiplyScalar(this.r * Math.random()).add(this.pos);
      g.fx.particle(p, _b.set(0, 0.05, 0), [0.6, 2, 3], 0.08, 1.2, 0, 0);
    }
    if (this.age >= this.life) this.collapse();
  }
  collapse() {
    if (!this.alive) return;
    this.kill();
    const g = this.g;
    g.stasisFields.splice(g.stasisFields.indexOf(this), 1);
    for (const f of this.frozen) {
      g.scene.remove(f.m); f.m.material.dispose();
      if (f.shooter.alive || f.shooter.isTurret) g.fireBullet(f.shooter, f.p, f.dir, f.wpn, { ignoreStasis: this, distOffset: f.dist, maxRange: f.remaining });
      else g.fireBullet(f.shooter, f.p, f.dir, f.wpn, { ignoreStasis: this, distOffset: f.dist, maxRange: f.remaining });
    }
    this.frozen.length = 0;
    g.sfx('stasisEnd', this.pos, 1);
  }
  onEmp() { this.collapse(); }
  dispose() {
    super.dispose();
    const i = this.g.stasisFields.indexOf(this);
    if (i >= 0) this.g.stasisFields.splice(i, 1);
  }
}

// ── hard-light wall ──────────────────────────────────────────────────────────
class HardLight extends Obj {
  constructor(ab, owner) {
    super(ab, owner, 'hardlight');
    const f = owner.fwdH(new THREE.Vector3());
    this.n = f.clone();
    this.t = new THREE.Vector3(-f.z, 0, f.x);
    this.pos = owner.pos.clone().addScaledVector(f, 2.6); this.pos.y = owner.pos.y + 1.6;
    this.hw = 3; this.hh = 1.6; this.hp = 350; this.life = 12;
    const col = teamGlow(this.team, 1.6);
    this.mat = new THREE.MeshBasicMaterial({ color: col, map: ab.T.hex, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mat.map.repeat.set(3, 1.6);
    const plane = new THREE.Mesh(ab.geo.plane, this.mat); plane.userData.own = true;
    plane.scale.set(this.hw * 2, this.hh * 2, 1);
    this.group.position.copy(this.pos);
    this.group.rotation.y = Math.atan2(f.x, f.z);
    this.group.add(plane);
    this.frameMat = new THREE.MeshBasicMaterial({ color: teamGlow(this.team, 5) });
    for (const [x, y, w, h] of [[0, this.hh, this.hw * 2, 0.06], [0, -this.hh, this.hw * 2, 0.06], [-this.hw, 0, 0.06, this.hh * 2], [this.hw, 0, 0.06, this.hh * 2]]) {
      const e = new THREE.Mesh(ab.geo.box, this.frameMat); e.userData.own = true; e.scale.set(w, h, 0.06); e.position.set(x, y, 0); this.group.add(e);
    }
    this.g.shieldWalls.push(this);
    this.g.sfx('wall', this.pos, 1);
    this.flash = 0;
  }
  rayTest(o, d, maxT) {
    const den = d.x * this.n.x + d.z * this.n.z;
    if (Math.abs(den) < 1e-5) return -1;
    const t = ((this.pos.x - o.x) * this.n.x + (this.pos.z - o.z) * this.n.z) / den;
    if (t < 0 || t > maxT) return -1;
    const px = o.x + d.x * t - this.pos.x, py = o.y + d.y * t - this.pos.y, pz = o.z + d.z * t - this.pos.z;
    const u = px * this.t.x + pz * this.t.z;
    if (Math.abs(u) > this.hw || Math.abs(py) > this.hh) return -1;
    return t;
  }
  damage(n) { this.hp -= n; this.flash = 0.08; if (this.hp <= 0) { this.kill(); this.g.fx.sparks(this.pos, teamGlow(this.team, 3).toArray(), 30, 6); this.g.sfx('shatter', this.pos, 1); } }
  update(dt) {
    this.age += dt; this.flash -= dt;
    const fade = this.life - this.age < 1 ? (Math.sin(this.age * 40) > 0 ? 0.2 : 0.45) : 0.45;
    this.mat.opacity = this.flash > 0 ? 0.9 : fade * Math.min(1, this.age * 6);
    if (this.age > this.life) this.kill();
  }
  dispose() {
    super.dispose();
    const i = this.g.shieldWalls.indexOf(this);
    if (i >= 0) this.g.shieldWalls.splice(i, 1);
  }
}

// ── grapple ──────────────────────────────────────────────────────────────────
class Grapple extends Obj {
  constructor(ab, owner, point, yankTarget) {
    super(ab, owner, 'grapple');
    this.tech = false;
    this.point = point.clone(); this.yank = yankTarget; this.life = yankTarget ? 0.3 : 1.5;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.6, 1.2) }));
    this.line.userData.own = true; this.line.frustumCulled = false;
    this.group.add(this.line);
    this.lastD = Infinity; this.noProgress = 0;
    if (!yankTarget) owner.grapple = this;
    this.g.sfx('grapple', owner.pos, 1);
  }
  release(jump) {
    if (!this.alive) return;
    this.kill();
    const o = this.owner;
    if (o.grapple === this) o.grapple = null;
    const hs = Math.hypot(o.vel.x, o.vel.z);
    if (hs > 13) { o.vel.x *= 13 / hs; o.vel.z *= 13 / hs; }
    if (jump) o.vel.y = Math.max(o.vel.y, 7);
  }
  update(dt) {
    const o = this.owner;
    this.age += dt;
    const hand = o.isPlayer ? this.g.camera.position.clone().add(_a.set(0.2, -0.3, 0).applyQuaternion(this.g.camera.quaternion)) : o.eyePos(_a).clone().setY(o.pos.y + 1.3);
    const end = this.yank && this.yank.alive ? this.yank.center(_c) : this.point;
    const pa = this.line.geometry.attributes.position;
    pa.setXYZ(0, hand.x, hand.y, hand.z); pa.setXYZ(1, end.x, end.y, end.z); pa.needsUpdate = true;
    if (this.yank) { if (this.age > this.life) this.kill(); return; }
    if (!o.alive) return this.release(false);
    _b.set(o.pos.x, o.pos.y + 1, o.pos.z);
    const to = _a.copy(this.point).sub(_b);
    const d = to.length();
    if (d < 2 || this.age > this.life) return this.release(false);
    if (d > this.lastD - 0.05) this.noProgress += dt; else this.noProgress = 0;
    this.lastD = d;
    if (this.noProgress > 0.2) return this.release(false);
    o.vel.copy(to.multiplyScalar(26 / d));
    o.onGround = false;
  }
  dispose() { super.dispose(); if (this.owner.grapple === this) this.owner.grapple = null; }
}

// ── jump pad ─────────────────────────────────────────────────────────────────
class JumpPad extends Obj {
  constructor(ab, owner, pos) {
    super(ab, owner, 'jumppad');
    this.hackable = true;
    this.pos = pos.clone(); this.life = 25;
    this.group.position.copy(this.pos);
    const base = new THREE.Mesh(ab.geo.padBase, new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.7, roughness: 0.4 }));
    base.userData.own = true; base.position.y = 0.06; this.group.add(base);
    this.mat = new THREE.MeshBasicMaterial({ color: teamGlow(this.team, 4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(ab.geo.ring, this.mat); r.userData.own = true;
      r.rotation.x = -Math.PI / 2; r.position.y = 0.14; this.group.add(r); this.rings.push(r);
    }
    this.g.sfx('ability', pos, 0.6);
  }
  onHack(team) { this.team = team; this.mat.color.copy(teamGlow(team, 4)); }
  update(dt) {
    const g = this.g;
    this.age += dt;
    this.rings.forEach((r, i) => {
      const k = ((this.age * 0.8 + i / 3) % 1);
      r.scale.setScalar(0.3 + k * 1.0); r.position.y = 0.14 + k * 0.8;
    });
    this.mat.opacity = 0.9;
    for (const s of g.soldiers) {
      if (!s.alive || s.team !== this.team || s.padCd > 0) continue;
      if (Math.hypot(s.pos.x - this.pos.x, s.pos.z - this.pos.z) < 1.3 && s.pos.y - this.pos.y > -0.3 && s.pos.y - this.pos.y < 0.6) {
        const f = s.fwdH(_a);
        s.vel.y = 16.5; s.vel.x += f.x * 4; s.vel.z += f.z * 4;
        s.onGround = false; s.padCd = 0.6; s.knockT = 0;
        g.sfx('pad', this.pos, 1);
        g.fx.sparks(this.pos, teamGlow(this.team, 3).toArray(), 16, 6);
      }
    }
    if (this.age > this.life) this.kill();
  }
}

// ── holo-decoy ───────────────────────────────────────────────────────────────
class Decoy extends Obj {
  constructor(ab, owner) {
    super(ab, owner, 'decoy');
    this.isDecoy = true; this.name = owner.name;
    this.weaponId = owner.weaponId;
    this.pos = owner.pos.clone().addScaledVector(owner.fwdH(_a), 1.2);
    this.vel = new THREE.Vector3(); this.yaw = owner.yaw; this.pitch = 0;
    this.stance = 'stand'; this.onGround = true; this.punchAnim = 0; this.spotted = 0; this.lastFire = 0;
    this.hp = 60; this.life = 9; this.height = 1.8;
    this.model = new SoldierModel(this.g, this);
    this.g.decoys.push(this);
    this.g.sfx('ability', this.pos, 0.6);
  }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.08, this.pos.z); }
  headPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }
  hitTest(o, d, maxT) {
    const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, this.pos.x, this.pos.y + 1.6, this.pos.z, 0.22);
    let best = -1, head = false;
    if (th >= 0 && th < maxT) { best = th; head = true; }
    const p = this.pos;
    // simple AABB
    const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
    let t1 = (p.x - 0.35 - o.x) * ix, t2 = (p.x + 0.35 - o.x) * ix;
    let tn = Math.min(t1, t2), tf = Math.max(t1, t2);
    t1 = (p.y - o.y) * iy; t2 = (p.y + 1.42 - o.y) * iy; tn = Math.max(tn, Math.min(t1, t2)); tf = Math.min(tf, Math.max(t1, t2));
    t1 = (p.z - 0.35 - o.z) * iz; t2 = (p.z + 0.35 - o.z) * iz; tn = Math.max(tn, Math.min(t1, t2)); tf = Math.min(tf, Math.max(t1, t2));
    if (tf >= Math.max(tn, 0) && tn < maxT && (best < 0 || tn < best)) { best = Math.max(0, tn); head = false; }
    return best >= 0 ? { t: best, head } : null;
  }
  takeDamage(n, attacker) {
    if (!this.alive) return false;
    this.hp -= n;
    this.g.onDecoyHit(this, attacker);
    if (this.hp <= 0) { this.kill(); this.g.fx.sparks(this.center(_c), teamGlow(this.team, 3).toArray(), 30, 4); this.g.sfx('shatter', this.pos, 0.8); }
    return false;
  }
  update(dt) {
    const g = this.g;
    dt *= g.stasisFactor(this.pos);
    this.age += dt;
    const f = _a.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.vel.x = f.x * 5.5; this.vel.z = f.z * 5.5; this.vel.y -= 22 * dt;
    const r = moveBody(g.world, this.pos, this.vel, dt, 0.35, 1.8, true);
    this.onGround = r.ground;
    if (r.wallSpeed > 0) this.yaw += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    this.model.update(dt);
    this.model.root.visible = !(this.life - this.age < 1 && Math.sin(this.age * 50) > 0.3);
    if (this.age > this.life) this.kill();
  }
  dispose() {
    this.model.dispose(this.g.scene);
    super.dispose();
    const i = this.g.decoys.indexOf(this);
    if (i >= 0) this.g.decoys.splice(i, 1);
  }
}

// ── manager ──────────────────────────────────────────────────────────────────
export class Abilities {
  constructor(game, T) {
    this.g = game; this.T = T; this.objects = [];
    this.geo = {
      sphere: new THREE.SphereGeometry(1, 12, 8), sphereHi: new THREE.SphereGeometry(1, 32, 20),
      torus: new THREE.TorusGeometry(1, 0.05, 6, 32), octa: new THREE.OctahedronGeometry(1),
      box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 6),
      disc: new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), ico: new THREE.IcosahedronGeometry(1, 2),
      plane: new THREE.PlaneGeometry(1, 1), padBase: new THREE.CylinderGeometry(0.9, 1.0, 0.12, 20),
      ring: new THREE.RingGeometry(0.85, 1.0, 32),
    };
  }
  update(dt) {
    for (const o of this.objects) if (o.alive) o.update(dt);
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (!o.alive) { o.dispose(); this.objects.splice(i, 1); }
    }
  }
  add(o) { this.objects.push(o); return o; }
  throwVel(owner, speed, target) {
    const aim = owner.aimDir(new THREE.Vector3());
    if (target) {
      const eye = owner.eyePos(new THREE.Vector3());
      const dx = target.x - eye.x, dz = target.z - eye.z, dy = target.y + 0.5 - eye.y;
      const dh = Math.hypot(dx, dz);
      const t = Math.max(0.35, dh / (speed * 0.85));
      return new THREE.Vector3(dx / t, (dy + 0.5 * 18 * t * t) / t, dz / t);
    }
    return aim.multiplyScalar(speed).add(new THREE.Vector3(0, 3, 0)).addScaledVector(owner.vel, 0.4);
  }
  enemiesNear(team, p, r) {
    return this.g.targets.filter((t) => t.alive && t.team !== team && t.center(_c).distanceTo(p) < r);
  }

  use(s, id, target) {
    const g = this.g;
    if (g.mode?.blockAbility?.(s)) return false;   // Breach: attackers can't use abilities behind the setup barrier
    switch (id) {
      case 'arc':
        this.add(new Grenade(this, s, { color: new THREE.Color(1.2, 2.4, 5), speed: 24, fuse: 1.4, contact: true, target, onDetonate: (p) => this.arcBlast(s, p) }));
        break;
      case 'singularity':
        this.add(new Grenade(this, s, { color: new THREE.Color(2, 0.6, 4), speed: 22, fuse: 1.6, impact: true, target, onDetonate: (p) => this.add(new Singularity(this, s, p)) }));
        break;
      case 'swarm': {
        const eye = s.eyePos(new THREE.Vector3()), aim = s.aimDir(new THREE.Vector3());
        eye.addScaledVector(aim, 0.8);
        for (let i = 0; i < 8; i++) {
          const v = aim.clone().multiplyScalar(11).add(new THREE.Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 3, (Math.random() - 0.5) * 7));
          this.add(new Drone(this, s, eye, v));
        }
        g.sfx('swarm', s.pos, 1);
        break;
      }
      case 'tripmine': {
        const eye = s.eyePos(new THREE.Vector3());
        const dirs = [s.aimDir(new THREE.Vector3())];
        if (!s.isPlayer) { const f = s.fwdH(new THREE.Vector3()); dirs.push(new THREE.Vector3(-f.z, 0, f.x), new THREE.Vector3(f.z, 0, -f.x)); }
        let placed = false;
        for (const d of dirs) {
          if (!g.world.raycast(eye, d, 6, RR) || Math.abs(RR.ny) > 0.5) continue;
          const p = eye.clone().addScaledVector(d, RR.t - 0.02);
          const n = new THREE.Vector3(RR.nx, RR.ny, RR.nz);
          const start = p.clone().addScaledVector(n, 0.05);
          const end = g.world.raycast(start, n, 25, RR) ? start.clone().addScaledVector(n, RR.t) : start.clone().addScaledVector(n, 25);
          const mine = this.objects.filter((o) => o.kind === 'tripmine' && o.owner === s && o.alive);
          if (mine.length >= 2) mine[0].kill();
          this.add(new Tripmine(this, s, p, n, end));
          placed = true; break;
        }
        if (!placed) { if (s.isPlayer) g.hud.toast('Aim at a wall within 6 m to place a tripmine'); return false; }
        break;
      }
      case 'disc': this.add(new Disc(this, s)); break;
      case 'sonic': this.sonic(s); break;
      case 'emp':
        this.add(new Grenade(this, s, { color: new THREE.Color(0.8, 2, 5), speed: 22, fuse: 1.3, impact: true, target, onDetonate: (p) => this.empBlast(s, p) }));
        break;
      case 'stasis':
        this.add(new Grenade(this, s, { color: new THREE.Color(0.6, 2.4, 3.5), speed: 22, fuse: 1.0, impact: true, target, size: 0.18, onDetonate: (p) => this.add(new Stasis(this, s, p)) }));
        break;
      case 'hardlight': this.add(new HardLight(this, s)); break;
      case 'grapple': return this.grapple(s);
      case 'phase': this.phase(s); break;
      case 'jumppad': {
        const p = s.pos.clone();
        if (!s.onGround) {
          if (g.world.raycast(new THREE.Vector3(p.x, p.y + 0.1, p.z), new THREE.Vector3(0, -1, 0), 30, RR, L_MOVE)) p.y -= RR.t - 0.1; else p.y = 0;
        }
        this.add(new JumpPad(this, s, p));
        break;
      }
      case 'pulse': this.pulse(s); break;
      case 'decoy': this.add(new Decoy(this, s)); break;
      case 'hack': this.hack(s); break;
      default: return false;
    }
    g.onAbilityUsed(s, id);
    return true;
  }

  arcBlast(owner, p) {
    const g = this.g;
    const hit = new Set();
    let from = p.clone(), dmg = 58, range = 7;
    for (let k = 0; k < 6; k++) {
      let best = null, bd = range;
      for (const t of g.targets) {
        if (!t.alive || t.team === owner.team || hit.has(t)) continue;
        const c = t.center(_c);
        const d = c.distanceTo(from);
        if (d < bd && g.los(from, c, -1)) { bd = d; best = t; }
      }
      if (!best) break;
      const c = best.center(new THREE.Vector3());
      g.fx.lightning(from, c, [1.2, 2.6, 6]);
      best.takeDamage(dmg, owner, { weapon: 'Arc Grenade', kind: 'ability' });
      hit.add(best);
      from = c; dmg *= 0.82; range = 8.5;
    }
    g.fx.flash(p, [1.2, 2.4, 6], 14, 0.25);
    g.fx.sparks(p, [1.2, 2.6, 6], 40, 9);
    for (let i = 0; i < 5; i++) g.fx.lightning(p, _a.randomDirection().multiplyScalar(2 + Math.random() * 2).add(p), [1, 2, 5]);
    g.sfx('arc', p, 1);
    if (!hit.size) g.explosion(p, 3, 22, owner, { weapon: 'Arc Grenade', color: [1, 2, 5], quiet: true });
  }
  empBlast(owner, p) {
    const g = this.g, R = 12;
    g.fx.shockwave(p, R, [0.8, 2, 5]);
    g.fx.sparks(p, [0.8, 2, 5], 50, 10);
    g.sfx('emp', p, 1);
    for (const s of g.soldiers) {
      if (!s.alive || s.team === owner.team || s.center(_c).distanceTo(p) > R) continue;
      if (s.shield > 0) g.fx.sparks(s.center(_c), [0.8, 2, 5], 20, 4);
      s.shield = 0; s.empT = 5; s.lastHurt = g.time;
      s.takeDamage(8, owner, { weapon: 'EMP', kind: 'ability' });
      if (s.isPlayer) g.hud.toast('EMP — shields down, abilities offline', 'bad');
    }
    for (const o of this.objects) if (o.alive && o.tech && o.team !== owner.team && o.pos && o.pos.distanceTo(p) < R) o.onEmp();
    for (const t of g.turrets) if (t.team !== owner.team && t.center(_c).distanceTo(p) < R + 2) t.emp(8);
  }
  sonic(s) {
    const g = this.g;
    const eye = s.eyePos(new THREE.Vector3()), f = s.aimDir(new THREE.Vector3());
    let hits = 0;
    for (const t of g.targets) {
      if (!t.alive || t.team === s.team || t.isTurret) continue;
      const c = t.center(_c);
      const to = _a.copy(c).sub(eye);
      const d = to.length();
      if (d > 9 || to.normalize().dot(f) < 0.72) continue;
      hits++;
      if (t.isSoldier) {
        const hx = to.x, hz = to.z, l = Math.hypot(hx, hz) || 1;
        t.vel.set((hx / l) * 21, 4.5, (hz / l) * 21);
        t.knockT = 0.6; t.slamBy = s; t.slamBonus = 45; t.onGround = false;
        if (t.grapple) t.grapple.release(false);
      }
      t.takeDamage(15, s, { weapon: 'Sonic Repulser', kind: 'ability' });
    }
    for (const o of this.objects) {
      if (o.alive && o.vel && o.pos && o.team !== s.team && o.pos.distanceTo(eye) < 9) o.vel.addScaledVector(f, 20);
    }
    g.fx.cone(eye, f, [2.5, 2.5, 3.2]);
    g.sfx('sonic', s.pos, 1);
    if (s.isPlayer) g.shake(0.25);
    return hits;
  }
  grapple(s) {
    const g = this.g;
    const eye = s.eyePos(new THREE.Vector3()), dir = s.aimDir(new THREE.Vector3());
    let wallT = 45, hasWall = false;
    if (g.world.raycast(eye, dir, 45, RR)) { wallT = RR.t; hasWall = true; }
    const wallN = new THREE.Vector3(RR.nx || 0, RR.ny || 0, RR.nz || 0);
    let best = null, bt = Math.min(30, wallT);
    for (const t of g.soldiers) {
      if (!t.alive || t.team === s.team) continue;
      const h = t.hitTest(eye, dir, bt);
      if (h) { bt = h.t; best = t; }
    }
    if (best) {
      const to = _a.copy(s.pos).sub(best.pos); to.y = 0; const l = to.length() || 1;
      best.vel.set((to.x / l) * 17, 5.5, (to.z / l) * 17);
      best.knockT = 0.5; best.slamBy = s; best.slamBonus = 35; best.onGround = false;
      if (best.grapple) best.grapple.release(false);
      best.takeDamage(10, s, { weapon: 'Grapple Line', kind: 'ability' });
      this.add(new Grapple(this, s, best.center(new THREE.Vector3()), best));
      if (s.isPlayer) g.hud.toast('YANKED ' + best.name.toUpperCase());
      g.onAbilityUsed(s, 'grapple');
      return true;
    }
    if (!hasWall) { if (s.isPlayer) g.hud.toast('No grapple point in range (45 m)'); return false; }
    if (s.grapple) s.grapple.release(false);
    const pt = eye.clone().addScaledVector(dir, wallT).addScaledVector(wallN, 0.6);
    this.add(new Grapple(this, s, pt, null));
    s.vel.y = Math.max(s.vel.y, 3); s.onGround = false;
    g.onAbilityUsed(s, 'grapple');
    return true;
  }
  phase(s) {
    const g = this.g;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    const inp = s.lastInput || { forward: 1, right: 0 };
    let dx = -sy * inp.forward + cy * inp.right, dz = -cy * inp.forward - sy * inp.right;
    const l = Math.hypot(dx, dz);
    if (l < 0.1) { dx = -sy; dz = -cy; } else { dx /= l; dz /= l; }
    const start = s.pos.clone();
    let last = s.pos.clone();
    const h = s.height;
    for (let d = 0.3; d <= 9; d += 0.3) {
      const x = start.x + dx * d, z = start.z + dz * d;
      if (!overlapsAny(g.world, x, start.y + 0.05, z, 0.35, h - 0.05)) last.set(x, start.y, z);
      else if (!overlapsAny(g.world, x, start.y + 0.65, z, 0.35, h - 0.05)) last.set(x, start.y + 0.6, z);
      else break;
    }
    g.fx.phaseTrail(start, last, s.team);
    s.pos.copy(last); s.phaseT = 0.4;
    if (s.isPlayer) g.hud.phaseFlash();
    g.sfx('phase', last, 1);
  }
  pulse(s) {
    const g = this.g;
    g.fx.shockwave(s.pos.clone().setY(s.pos.y + 1), 70, [1.2, 3, 1.6], 1.2);
    g.sfx('pulse', s.pos, 1);
    let n = 0;
    for (const e of g.soldiers) {
      if (!e.alive || e.team === s.team || e.pos.distanceTo(s.pos) > 70) continue;
      e.revealed = 4.5; e.revealedBy = s.team; n++;
    }
    if (s.isPlayer) g.hud.toast(n ? `PULSE: ${n} enem${n > 1 ? 'ies' : 'y'} revealed` : 'PULSE: no enemies within 70 m');
  }
  hack(s) {
    const g = this.g;
    const eye = s.eyePos(new THREE.Vector3()), dir = s.aimDir(new THREE.Vector3());
    let maxT = 50;
    if (g.world.raycast(eye, dir, 50, RR, L_SHOT)) maxT = RR.t;
    let best = null, bt = maxT;
    for (const t of g.targets) {
      if (!t.alive || t.team === s.team) continue;
      const h = t.hitTest(eye, dir, bt + (t.isTurret ? 1.5 : 0));
      if (h) { bt = Math.min(h.t, bt); best = t; }
    }
    // generous assist for turrets: nearest enemy turret within 3° of the aim line
    if (!best || !best.isTurret) {
      for (const t of g.turrets) {
        if (!t.alive || t.team === s.team) continue;
        const c = t.center(_c), to = _a.copy(c).sub(eye); const d = to.length();
        if (d < 50 && to.normalize().dot(dir) > 0.9985 && g.los(eye, c, -1)) { best = t; bt = d; }
      }
    }
    const end = eye.clone().addScaledVector(dir, bt);
    g.fx.tracer(eye.clone().add(new THREE.Vector3(0, -0.15, 0)), end, [0.8, 4, 1.2], 0.25);
    g.sfx('dart', s.pos, 0.8);
    let converted = 0;
    for (const o of this.objects) {
      if (!o.alive || !o.hackable || o.team === s.team || !o.pos) continue;
      const r = segSegDist2(eye, end, o.pos, o.pos);
      if (r.d2 < 2.5 * 2.5) { o.onHack(s.team); converted++; }
    }
    if (best) {
      if (best.isTurret) { best.hack(s.team, 15); if (s.isPlayer) g.hud.toast('SENTRY HACKED — fighting for you for 15 s', 'good'); }
      else if (best.isSoldier) {
        best.revealed = 6; best.revealedBy = s.team;
        best.takeDamage(10, s, { weapon: 'Hack Dart', kind: 'ability' });
        if (s.isPlayer) g.hud.toast(`${best.name.toUpperCase()} TAGGED`, 'good');
      } else best.takeDamage(999, s, { weapon: 'Hack Dart' });
    } else if (converted && s.isPlayer) g.hud.toast(`${converted} enemy device${converted > 1 ? 's' : ''} hacked`, 'good');
  }
}
