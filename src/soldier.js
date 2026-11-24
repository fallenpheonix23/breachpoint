// Soldier: shared by the human player and bots. Movement, stances, weapons,
// shields, wall-bouncing and hand-to-hand combat.
import * as THREE from 'three';
import { WEAPONS, ABILITIES } from './config.js';
import { moveBody, overlapsAny, rayAABB, raySphere, L_ALL, L_SHOT, L_MOVE } from './physics.js';
import { SoldierModel } from './models.js';

export const STANCES = {
  stand: { h: 1.8, eye: 1.66, speed: 1.0 },
  crouch: { h: 1.2, eye: 1.08, speed: 0.5 },
  prone: { h: 0.6, eye: 0.42, speed: 0.22 },
};
const R = 0.35, GRAVITY = 22, BASE_SPEED = 6.2, JUMP_V = 7.4;
const PUNCH = {
  'CORNER TAKEDOWN': { dmg: 150, knock: 9, range: 3.4 },
  'PUNCH': { dmg: 28, knock: 7, range: 2.6 },
  'CHARGE PUNCH': { dmg: 38, knock: 11, range: 2.8 },
  'AIR PUNCH': { dmg: 44, knock: 10, range: 2.8 },
  'BOUNCE PUNCH': { dmg: 82, knock: 17, range: 3.4 },
};
const COMBO = [1, 1.2, 1.45];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const hitRes = { t: 0, head: false };
const RR = {};
const _q = [];
const _hp = new THREE.Vector3();

export class Soldier {
  constructor(game, o) {
    this.game = game;
    this.isSoldier = true;
    this.id = o.id; this.name = o.name; this.team = o.team; this.isPlayer = !!o.isPlayer;
    this.weaponId = o.weapon; this.weapon = WEAPONS[o.weapon];
    this.abilities = o.abilities.map((id) => ({ id, cd: 0 }));
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.swayYaw = 0; this.swayPitch = 0; this.recoilPitch = 0;
    this.maxHp = 100; this.maxShield = 50;
    this.kills = 0; this.deaths = 0; this.assists = 0; this.damageDealt = 0; this.streak = 0;
    this.alive = false; this.respawnTimer = 1;
    this.model = new SoldierModel(game, this);
    this.model.setVisible(false);
    this.reset();
  }
  reset() {
    this.hp = this.maxHp; this.shield = this.maxShield;
    this.stance = 'stand'; this.eyeH = STANCES.stand.eye; this.onGround = true;
    this.ammo = this.weapon.mag; this.reloading = false; this.reloadT = 0; this.fireCd = 0;
    this.bloom = 0; this.spin = 0; this.adsT = 0; this.ads = false; this.triggerHeld = false;
    this.sprinting = false; this.lastFire = -10; this.lastHurt = -10;
    this.punchCd = 0; this.punchAnim = 0; this.wallBounceT = 0; this.wallJumps = 0; this.comboN = 0; this.comboT = 0;
    this.knockT = 0; this.slamBy = null; this.slamBonus = 35;
    this.empT = 0; this.phaseT = 0; this.spawnProtect = 0; this.spotted = 0; this.revealed = 0; this.revealedBy = -1;
    this.timeScale = 1; this.inStasis = false; this.grapple = null; this.padCd = 0;
    this.breath = 3; this.damagers = new Map(); this.proneFwd = 0;
    this.recoilPitch = 0; this.vel.set(0, 0, 0);
    this.cover = null; this.stepAcc = 0; this.noise = 0;
    for (const a of this.abilities) a.cd = 0;
  }
  spawn(p, yaw) {
    this.reset();
    this.pos.copy(p); this.yaw = yaw; this.pitch = 0;
    this.alive = true; this.spawnProtect = 2.0;
    this.model.setVisible(!this.isPlayer);
    this.model.deathT = 0;
  }
  get height() { return STANCES[this.stance].h; }
  eyePos(out = new THREE.Vector3()) {
    out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
    if (this.stance === 'prone' && this.proneFwd > 0) {
      out.x -= Math.sin(this.yaw) * this.proneFwd; out.z -= Math.cos(this.yaw) * this.proneFwd;
    }
    return out;
  }
  aimDir(out = new THREE.Vector3()) {
    const y = this.yaw + this.swayYaw, p = this.pitch + this.swayPitch;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }
  fwdH(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z); }
  headPos(out = new THREE.Vector3()) {
    if (this.stance === 'prone') {
      return out.set(this.pos.x - Math.sin(this.yaw) * 0.75, this.pos.y + 0.32, this.pos.z - Math.cos(this.yaw) * 0.75);
    }
    return out.set(this.pos.x, this.pos.y + (this.stance === 'crouch' ? 1.02 : 1.6), this.pos.z);
  }
  // ray vs head sphere + body box
  hitTest(o, d, maxT) {
    if (!this.alive) return null;
    const p = this.pos;
    let best = maxT, head = false, found = false;
    const hp = this.headPos(_hp);
    const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, hp.x, hp.y, hp.z, 0.22);
    if (th >= 0 && th < best) { best = th; head = true; found = true; }
    let tb;
    if (this.stance === 'prone') {
      const cx = p.x - Math.sin(this.yaw) * 0.1, cz = p.z - Math.cos(this.yaw) * 0.1;
      tb = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, cx - 0.6, p.y, cz - 0.6, cx + 0.6, p.y + 0.42, cz + 0.6, best);
    } else {
      const top = this.stance === 'crouch' ? 0.86 : 1.42;
      tb = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, p.x - R, p.y, p.z - R, p.x + R, p.y + top, p.z + R, best);
    }
    if (tb >= 0 && tb < best) { best = tb; head = false; found = true; }
    if (!found) return null;
    hitRes.t = best; hitRes.head = head;
    return hitRes;
  }

  takeDamage(amount, attacker, info = {}) {
    if (!this.alive || amount <= 0) return false;
    if (this.spawnProtect > 0 || this.phaseT > 0) return false;
    const g = this.game;
    this.lastHurt = g.time;
    let dmg = amount;
    if (this.shield > 0) {
      const ab = Math.min(this.shield, dmg);
      this.shield -= ab; dmg -= ab;
      if (this.shield <= 0 && ab > 0) g.onShieldBreak(this, attacker);
    }
    this.hp -= dmg;
    if (attacker && attacker !== this) {
      this.damagers.set(attacker, g.time);
      if (attacker.isSoldier) attacker.damageDealt += amount;
    }
    g.onDamage(this, amount, attacker, info);
    if (this.hp <= 0) { this.die(attacker, info); return true; }
    return false;
  }
  die(killer, info) {
    this.alive = false; this.hp = 0;
    this.deaths++; this.streak = 0;
    this.respawnTimer = this.game.respawnDelay ? this.game.respawnDelay(this) : this.game.respawnTime;
    this.grapple = null; this.cover = null;
    this.model.setVisible(true);
    this.game.onKill(this, killer, info);
  }

  canStand(st) {
    return !overlapsAny(this.game.world, this.pos.x, this.pos.y + 0.05, this.pos.z, R, STANCES[st].h - 0.05);
  }

  update(dt, inp) {
    const g = this.game, w = this.weapon;
    if (!this.alive) return;
    const sdt = dt * this.timeScale;
    // ── timers ──
    this.punchCd -= sdt; this.punchAnim -= sdt; this.wallBounceT -= sdt; this.comboT -= sdt;
    this.knockT -= sdt; this.empT -= dt; this.phaseT -= dt; this.spawnProtect -= dt; this.padCd -= dt;
    this.spotted -= dt; this.revealed -= dt;
    if (this.comboT <= 0) this.comboN = 0;
    for (const a of this.abilities) a.cd = Math.max(0, a.cd - dt);
    // regen
    if (g.time - this.lastHurt > 4 && this.empT <= 0 && this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + 30 * dt);
    if (g.time - this.lastHurt > 6 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 14 * dt);

    // ── look ──
    const lookScale = this.inStasis ? 0.08 : 1;
    this.yaw += inp.dYaw * lookScale;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + inp.dPitch * lookScale));
    // recoil recovery
    if (this.recoilPitch > 0) {
      const r = this.recoilPitch * Math.min(1, dt * 7);
      this.pitch -= r; this.recoilPitch -= r;
    }

    // ── stance ──
    let want = inp.stance;
    if (want !== this.stance) {
      const order = { prone: 0, crouch: 1, stand: 2 };
      if (order[want] < order[this.stance] || this.canStand(want)) this.stance = want;
      else if (want === 'stand' && this.stance === 'prone' && this.canStand('crouch')) this.stance = 'crouch';
    }
    const st = STANCES[this.stance];
    this.eyeH += (st.eye - this.eyeH) * Math.min(1, dt * 12);
    if (this.stance === 'prone') {
      _b.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _a.set(this.pos.x, this.pos.y + 0.42, this.pos.z);
      const rr = {};
      const hit = g.world.raycast(_a, _b, 1.0, rr, L_MOVE);
      this.proneFwd = hit ? Math.max(0, Math.min(0.6, rr.t - 0.25)) : 0.6;
    } else this.proneFwd = 0;

    // ── movement ──
    this.sprinting = inp.sprint && inp.forward > 0.3 && this.stance === 'stand' && !this.ads && this.onGround
      && g.time - this.lastFire > 0.25 && !this.reloading;
    let speed = BASE_SPEED * st.speed * w.move;
    if (this.sprinting) speed *= 1.45;
    if (this.ads) speed *= 0.62;
    if (w.id === 'hmg' && this.spin > 0.1) speed *= 0.8;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * inp.forward + cy * inp.right, wz = -cy * inp.forward - sy * inp.right;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    wx *= speed; wz *= speed;

    const wasInCover = !!this.cover;
    if (this.cover) {
      this.updateCover(sdt, inp);
    } else if (this.grapple) {
      // grapple object drives velocity
    } else if (this.onGround && this.knockT <= 0) {
      const k = Math.min(1, 14 * sdt);
      this.vel.x += (wx - this.vel.x) * k; this.vel.z += (wz - this.vel.z) * k;
    } else if (wl > 0.1 && this.knockT <= 0) {
      const k = Math.min(1, 2.2 * sdt);
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.vel.x += (wx - this.vel.x) * k; this.vel.z += (wz - this.vel.z) * k;
      // don't let air control kill momentum from bounces / pads
      const ns = Math.hypot(this.vel.x, this.vel.z);
      if (ns < hs && hs > speed) { this.vel.x *= hs / ns; this.vel.z *= hs / ns; }
    } else if (this.onGround) {
      const k = Math.min(1, 3 * sdt); this.vel.x -= this.vel.x * k; this.vel.z -= this.vel.z * k;
    }
    if (!this.grapple) this.vel.y -= GRAVITY * sdt;

    if (inp.coverPressed && !wasInCover && this.timeScale > 0.5) this.tryEnterCover();
    if (inp.jumpPressed && this.timeScale > 0.5 && !this.cover) {
      if (this.grapple) this.grapple.release(true);
      else if (this.onGround) {
        if (this.stance !== 'stand') { if (this.canStand('stand')) this.stance = 'stand'; }
        else { this.vel.y = JUMP_V; this.onGround = false; g.sfx('jump', this.pos, 0.4); }
      } else this.tryWallJump();
    }

    const wasGround = this.onGround;
    const res = moveBody(g.world, this.pos, this.vel, sdt, R, st.h, wasGround);
    this.onGround = res.ground;
    if (this.onGround) { this.wallJumps = 0; if (!wasGround && this.vel.y <= 0) this.knockT = Math.min(this.knockT, 0.05); }
    // wall slam from knockback
    if (this.knockT > 0 && res.wallSpeed > 6 && this.slamBy) {
      const mult = g.map.isHallway(this.pos.x, this.pos.z, this.pos.y) ? 1.3 : 1;
      const by = this.slamBy; this.slamBy = null; this.knockT = 0;
      g.onWallSlam(this, by);
      this.takeDamage(this.slamBonus * mult, by, { weapon: 'WALL SLAM', kind: 'melee', melee: 'WALL SLAM' });
      if (!this.alive) return;
    }
    if (this.pos.y < -20) this.takeDamage(999, null, { weapon: 'Fell' });
    this.footsteps(sdt);
    this.noise = Math.max(0, this.noise - dt * 1.5);

    this.updateSway(dt, inp);
    this.updateWeapon(sdt, inp);
    if (inp.punchPressed && this.punchCd <= 0 && this.timeScale > 0.5) this.punch();
    for (let i = 0; i < 2; i++) {
      if (!inp.ability[i]) continue;
      const a = this.abilities[i];
      if (a.cd > 0 || this.empT > 0 || this.timeScale < 0.5) { if (this.isPlayer) g.hud.flashAbility(i); continue; }
      if (g.abilities.use(this, a.id, inp.abilityTarget)) a.cd = ABILITIES[a.id].cd;
    }
  }

  // ── footsteps / noise ─────────────────────────────────────────────────────
  footsteps(dt) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (!this.onGround || sp < 1.2 || this.cover) return;
    this.stepAcc += dt * sp;
    const stride = this.sprinting ? 3.1 : this.stance === 'stand' ? 2.5 : 1.6;
    if (this.stepAcc < stride) return;
    this.stepAcc = 0;
    const loud = this.sprinting ? 1 : this.stance === 'stand' ? 0.55 : 0.08;
    this.noise = Math.max(this.noise, loud);
    this.game.onFootstep(this, loud);
  }

  // ── corner cover (Arkham-style) ──────────────────────────────────────────
  pointSolid(x, y, z) {
    this.game.world.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01, _q, L_ALL);
    for (const b of _q) if (b.layer === L_ALL && y > b.min[1] && y < b.max[1]) return true;
    return false;
  }
  coverProbe() {
    if (!this.onGround || this.stance === 'prone' || this.grapple) return null;
    const W = this.game.world;
    const o = _a.set(this.pos.x, this.pos.y + 0.75, this.pos.z);
    const lx = -Math.sin(this.yaw), lz = -Math.cos(this.yaw);
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!W.raycast(o, _c.set(dx, 0, dz), 1.3, RR, L_SHOT) || RR.ny !== 0 || !RR.box || RR.box.layer !== L_ALL) continue;
      const score = RR.t - (dx * lx + dz * lz) * 0.6;
      if (!best || score < best.score) best = { score, dx, dz, t: RR.t };
    }
    if (!best) return null;
    const hi = W.raycast(_a.set(this.pos.x, this.pos.y + 1.55, this.pos.z), _c.set(best.dx, 0, best.dz), best.t + 0.4, RR, L_SHOT);
    return { ...best, low: !hi };
  }
  tryEnterCover() {
    const pr = this.coverProbe();
    if (!pr) { if (this.isPlayer) this.game.hud.toast('No cover here — get next to a wall or low cover'); return false; }
    const axis = pr.dx !== 0 ? 'x' : 'z', tAxis = axis === 'x' ? 'z' : 'x';
    const dir = pr.dx || pr.dz;
    this.cover = {
      axis, tAxis, n: -dir, plane: this.pos[axis] + dir * (pr.t), low: pr.low, edge: 0, peek: false, peekK: 0,
      t: this.pos[tAxis], yaw: Math.atan2(-pr.dx, -pr.dz),
    };
    this.vel.x = 0; this.vel.z = 0; // keep vel.y so ground contact is still detected this frame
    this.sprinting = false;
    this.airT = 0;
    this.stance = pr.low ? 'crouch' : 'stand';
    this.game.onCover(this, true);
    return true;
  }
  exitCover() {
    if (!this.cover) return;
    const c = this.cover;
    this.pos[c.tAxis] = c.t;
    this.cover = null;
    this.game.onCover(this, false);
  }
  wallBehind(t) {
    const c = this.cover;
    const y = this.pos.y + (c.low ? 0.55 : 1.3);
    const a = c.plane - c.n * 0.12;
    return c.axis === 'x' ? this.pointSolid(a, y, t) : this.pointSolid(t, y, a);
  }
  cornerTarget() {
    const c = this.cover;
    if (!c || c.edge === 0) return null;
    const g = this.game;
    let best = null, bd = 3.4;
    for (const t of g.targets) {
      if (!t.alive || t.team === this.team || t.isTurret) continue;
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (d > bd || Math.abs(t.pos.y - this.pos.y) > 1.5) continue;
      const along = (t.pos[c.tAxis] - c.t) * c.edge;           // beyond the corner?
      const side = (t.pos[c.axis] - c.plane) * c.n;            // roughly on our side of the wall
      if (along > 0.3 && side > -2.5) { bd = d; best = t; }
    }
    return best;
  }
  updateCover(dt, inp) {
    const c = this.cover;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const mx = -sy * inp.forward + cy * inp.right, mz = -cy * inp.forward - sy * inp.right;
    const nx = c.axis === 'x' ? c.n : 0, nz = c.axis === 'z' ? c.n : 0;
    this.airT = this.onGround ? 0 : (this.airT || 0) + dt;
    if (inp.jumpPressed || inp.coverPressed || inp.sprint && (mx * nx + mz * nz) > 0.3 || (mx * nx + mz * nz) > 0.8 || this.airT > 0.2) {
      this.exitCover();
      return;
    }
    const along = c.axis === 'x' ? mz : mx;
    const want = Math.abs(along) > 0.3 ? Math.sign(along) : 0;
    if (want !== 0 && c.peekK < 0.05) {
      const nt = c.t + want * 2.8 * dt;
      if (this.wallBehind(nt + want * 0.3)) { c.t = nt; c.edge = 0; }
      else c.edge = want;
    }
    if (c.edge !== 0 && this.wallBehind(c.t + c.edge * 0.45)) c.edge = 0;
    c.peek = (inp.ads || inp.fire) && (c.low || c.edge !== 0);
    c.peekK += ((c.peek ? 1 : 0) - c.peekK) * Math.min(1, dt * 10);
    this.stance = c.low ? (c.peekK > 0.5 ? 'stand' : 'crouch') : 'stand';
    let lean = c.low ? 0 : c.edge * 0.75 * c.peekK;
    if (lean !== 0) {
      const tx = c.axis === 'x' ? c.plane + c.n * 0.42 : c.t + lean, tz = c.axis === 'x' ? c.t + lean : c.plane + c.n * 0.42;
      if (overlapsAny(this.game.world, tx, this.pos.y + 0.05, tz, R, this.height - 0.1)) lean = 0;
    }
    this.pos[c.axis] = c.plane + c.n * 0.42;
    this.pos[c.tAxis] = c.t + lean;
    this.vel.x = 0; this.vel.z = 0;
  }

  tryWallJump() {
    if (this.wallJumps >= 2) return false;
    const g = this.game, h = this.height;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const lx = -Math.sin(this.yaw), lz = -Math.cos(this.yaw);
    let best = null, bestScore = -Infinity;
    for (const [dx, dz] of dirs) {
      if (overlapsAny(g.world, this.pos.x + dx * 0.55, this.pos.y + 0.3, this.pos.z + dz * 0.55, R, h - 0.4)) {
        const nx = -dx, nz = -dz; // normal points away from wall
        const score = nx * lx + nz * lz;
        if (score > bestScore) { bestScore = score; best = [nx, nz]; }
      }
    }
    if (!best) return false;
    this.wallJumps++;
    const [nx, nz] = best;
    this.vel.x = nx * 6 + lx * 7.5; this.vel.z = nz * 6 + lz * 7.5; this.vel.y = 7.2;
    this.wallBounceT = 1.1; this.knockT = 0;
    g.onWallBounce(this);
    return true;
  }

  updateSway(dt, inp) {
    const w = this.weapon;
    if (w.scope && this.adsT > 0.5) {
      let amp = this.stance === 'prone' ? 0.0012 : this.stance === 'crouch' ? 0.003 : 0.0055;
      if (this.game.map.nestAt(this.pos.x, this.pos.z) && this.stance !== 'stand') amp *= 0.4; // braced in nest
      if (inp.holdBreath && this.breath > 0) { amp *= 0.12; this.breath -= dt; }
      else { this.breath = Math.min(3, this.breath + dt * 0.6); if (this.breath <= 0.05) amp *= 2.5; }
      const t = this.game.time;
      const ty = (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.4) * amp;
      const tp = (Math.sin(t * 1.7 + 1) * 0.8 + Math.sin(t * 0.7) * 0.4) * amp;
      this.swayYaw += (ty - this.swayYaw) * Math.min(1, dt * 6);
      this.swayPitch += (tp - this.swayPitch) * Math.min(1, dt * 6);
    } else {
      this.swayYaw *= 0.8; this.swayPitch *= 0.8;
    }
  }

  updateWeapon(dt, inp) {
    const w = this.weapon, g = this.game;
    this.fireCd -= dt;
    this.bloom = Math.max(0, this.bloom - dt * (w.recover ?? 0.1) * (g.time - this.lastFire > 0.15 ? 1 : 0.35));
    if (g.time - this.lastFire > 0.3) this.burst = 0;
    this.scopedT = this.adsT >= 0.95 ? (this.scopedT || 0) + dt : 0;
    const wantAds = inp.ads && !this.sprinting && this.punchAnim <= 0 && !this.grapple && (!this.cover || this.cover.peekK > 0.6);
    this.ads = wantAds && !(this.reloading && w.id !== 'shotgun');
    this.adsT = Math.max(0, Math.min(1, this.adsT + (this.ads ? dt : -dt) / w.adsTime));
    if (inp.reloadPressed && this.ammo < w.mag && !this.reloading) this.startReload();
    if (this.reloading) {
      if (w.id === 'shotgun') {
        if (inp.fire && this.ammo > 0) this.reloading = false;
        else {
          this.reloadT -= dt;
          if (this.reloadT <= 0) {
            this.ammo++; g.sfx('shell', this.pos, 0.4);
            if (this.ammo >= w.mag) this.reloading = false; else this.reloadT = w.shellReload;
          }
        }
      } else {
        this.reloadT -= dt;
        if (this.reloadT <= 0) { this.ammo = w.mag; this.reloading = false; }
      }
    }
    if (w.spinup) {
      if (inp.fire && !this.reloading && this.punchAnim <= 0) this.spin = Math.min(1, this.spin + dt / w.spinup);
      else this.spin = Math.max(0, this.spin - dt / 0.8);
    }
    const can = inp.fire && this.fireCd <= 0 && !this.reloading && this.punchAnim <= 0 && !this.grapple && (!this.cover || this.cover.peekK > 0.6)
      && (!w.spinup || this.spin >= 1) && (w.auto || !this.triggerHeld);
    if (can) {
      if (this.ammo <= 0) this.startReload();
      else this.fire();
    }
    this.triggerHeld = inp.fire;
  }
  startReload() {
    const w = this.weapon;
    if (this.reloading || this.ammo >= w.mag) return;
    this.reloading = true;
    this.reloadT = w.id === 'shotgun' ? w.shellReload + 0.2 : w.reload;
    this.game.sfx('reload', this.pos, 0.5);
  }
  spreadNow() {
    const w = this.weapon, g = this.game;
    let s = w.hip + (w.ads - w.hip) * this.adsT;
    s += this.bloom * (1 - this.adsT * (1 - (w.adsBloom ?? 1)));
    // first-shot accuracy: tapping after a short pause is precise
    if (g && g.time - this.lastFire > 0.35 && this.bloom < 0.002) s *= w.firstShot ?? 1;
    const sp = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 6);
    s += sp * (w.moveSpread ?? 0.015) * (1 - this.adsT * 0.7);   // (w.move is the movement-speed multiplier — the old key collided with it)
    if (!this.onGround) s += w.air ?? 0.04;
    const braced = w.braced ?? 0.6;
    if (this.stance === 'crouch') s *= 0.5 + braced * 0.4; else if (this.stance === 'prone') s *= braced * 0.9;
    if (w.scope) {
      if (this.adsT < 0.95) s = Math.max(s, w.hip * (1 - this.adsT)); // no-scopes are a gamble
      else if ((this.scopedT || 0) < w.settle) s += w.settleSpread * (1 - this.scopedT / w.settle); // quick-scope penalty
    }
    return s;
  }
  fire() {
    const w = this.weapon, g = this.game;
    this.ammo--; this.fireCd = 60 / w.rpm; this.lastFire = g.time; this.spotted = Math.max(this.spotted, 1.2);
    const spread = this.spreadNow();
    const eye = this.eyePos(_a), aim = this.aimDir(_b);
    if (w.pellets > 1) { // whole shotgun pattern drifts a little each shot
      const j = spread * 0.25;
      aim.x += (Math.random() - 0.5) * j; aim.y += (Math.random() - 0.5) * j; aim.z += (Math.random() - 0.5) * j; aim.normalize();
    }
    for (let i = 0; i < w.pellets; i++) {
      const d = _c.copy(aim);
      if (spread > 0) {
        const r = spread * Math.pow(Math.random(), w.center ?? 0.5) * (w.patternJitter ? 1 - w.patternJitter * 0.5 + Math.random() * w.patternJitter : 1);
        const th = Math.random() * Math.PI * 2;
        const up = Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const ux = new THREE.Vector3().crossVectors(d, up).normalize();
        const uy = new THREE.Vector3().crossVectors(ux, d).normalize();
        d.addScaledVector(ux, Math.cos(th) * r).addScaledVector(uy, Math.sin(th) * r).normalize();
      }
      g.fireBullet(this, eye, d, w);
    }
    this.bloom = Math.min(w.bloomMax, this.bloom + w.bloomPer);
    this.burst = (this.burst || 0) + 1;
    const stF = this.stance === 'prone' ? 0.4 : this.stance === 'crouch' ? 0.7 : 1;
    const climb = 1 + Math.min(1, this.burst / 12) * (w.climb ?? 0);
    const early = this.burst <= (w.tapShots ?? 0) ? 0.25 : 1;   // Valorant-style: the first few bullets of a burst barely kick, then the spray climbs
    const kick = w.recoil * (this.ads ? 0.65 : 1) * stF * climb * early;
    this.pitch += kick; this.recoilPitch += kick * 0.75; // only ~75% of the climb recovers on its own
    const yk = (w.yawKick ?? 0.005) * stF * (this.ads ? 0.75 : 1) * early;
    this.yaw -= ((w.yawBias ?? 0) + (Math.random() - 0.5) * 2) * yk;
    this.noise = 1;
    g.noise(this.pos, w.scope ? 120 : w.id === 'shotgun' ? 55 : 70, this);
    g.onFire(this);
  }

  punch() {
    const g = this.game;
    this.punchCd = 0.5; this.punchAnim = 0.28;
    g.noise(this.pos, 10, this);
    let kind = 'PUNCH';
    const ct = this.cornerTarget();
    if (ct) kind = 'CORNER TAKEDOWN';
    else if (this.wallBounceT > 0) { kind = 'BOUNCE PUNCH'; this.wallBounceT = 0; }
    else if (!this.onGround) kind = 'AIR PUNCH';
    else if (this.sprinting) kind = 'CHARGE PUNCH';
    const P = PUNCH[kind];
    this.comboN = this.comboT > 0 ? Math.min(2, this.comboN + 1) : 0;
    this.comboT = 1.1;
    const hall = g.map.isHallway(this.pos.x, this.pos.z, this.pos.y);
    const dmg = P.dmg * COMBO[this.comboN];
    const knock = P.knock * (hall ? 1.35 : 1);
    const eye = this.eyePos(new THREE.Vector3()), dir = this.aimDir(new THREE.Vector3());
    let best = ct, bd = ct ? 0 : Infinity;
    for (const t of ct ? [] : g.targets) {
      if (!t.alive || t.team === this.team) continue;
      const c = t.center(_a);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > P.range + (t.isTurret ? 0.5 : 0)) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / Math.max(0.01, d);
      if (dot < 0.5 && d > 1.0) continue;
      if (d < bd) { bd = d; best = t; }
    }
    if (best) {
      if (best.isSoldier) {
        const dx = best.pos.x - this.pos.x, dz = best.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
        best.vel.set((dx / l) * knock, kind === 'BOUNCE PUNCH' ? 5 : 3.5, (dz / l) * knock);
        best.knockT = 0.5; best.slamBy = this; best.slamBonus = kind === 'BOUNCE PUNCH' ? 45 : 35; best.onGround = false;
        if (best.cover) best.exitCover();
        if (best.grapple) best.grapple.release(false);
      }
      const label = this.comboN > 0 && kind === 'PUNCH' ? `COMBO x${this.comboN + 1}` : kind;
      best.takeDamage(dmg, this, { weapon: label, kind: 'melee', melee: kind });
      g.onPunch(this, best, kind, label);
    } else g.onPunch(this, null, kind, kind);
  }
}
