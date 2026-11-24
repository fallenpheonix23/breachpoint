// Bot AI: lane/role selection, A* navigation, perception, aiming with human-like
// error, weapon-specific spacing, sniper nests, hallway brawling and abilities.
import * as THREE from 'three';
import { wrapAngle } from './physics.js';
import { VIS_RANGE } from './config.js';

export function blankInput() {
  return {
    forward: 0, right: 0, sprint: false, jumpPressed: false, stance: 'stand', fire: false, ads: false,
    reloadPressed: false, punchPressed: false, coverPressed: false, ability: [false, false], abilityTarget: null,
    dYaw: 0, dPitch: 0, holdBreath: false,
  };
}
const PREF = { shotgun: 4, smg: 10, ar: 24, hmg: 30, sniper: 60 };
// max distance at which a bot will START a fight, as a fraction of the on-screen visibility range
const ENGAGE = { shotgun: 0.6, smg: 0.9, ar: 1, hmg: 1, sniper: 1.8 }; // snipers also show a scope glint
const _e = new THREE.Vector3(), _c = new THREE.Vector3(), _h = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class BotBrain {
  constructor(game, s, skill) {
    this.g = game; this.s = s; this.sk = skill;
    this.inp = blankInput();
    this.lastKnown = new THREE.Vector3(); this.lastPos = new THREE.Vector3();
    this.reset();
  }
  reset() {
    this.target = null; this.path = null; this.pi = 0; this.goal = null; this.goalKind = null;
    this.waitT = 0; this.percT = Math.random() * 0.2; this.repathT = 0; this.wantPath = null;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.errX = 0; this.errY = 0; this.errTX = 0; this.errTY = 0; this.errT = 0;
    this.acquired = 0; this.reactT = 0.4; this.lastSeen = -99; this.investigate = false;
    this.stuckT = 0; this.stuckN = 0; this.unstickT = 0; this.unstickDir = [0, 0];
    this.brawlT = 0; this.brawlPhase = 0; this.abilT = 1 + Math.random() * 2; this.burstT = 0;
    this.stance = 'stand'; this.alert = null; this.alertT = -99; this.nest = null; this.nestT = 0;
    this.crouchFight = false; this.aimHead = false; this.heardT = 0;
  }
  onSpawn() {
    this.reset();
    this.lastPos.copy(this.s.pos);
    this.pickRole();
  }
  onDamaged(att) {
    if (att && att.alive && att.team !== this.s.team && !att.isTurret) { this.alert = att; this.alertT = this.g.time; }
  }
  pickRole() {
    const s = this.s, w = s.weaponId, map = this.g.map;
    if (this.g.mode) { this.role = 'objective'; this.objRoute = null; this.objEpoch = this.g.mode.epochFor(s.team); this.nextGoal(); return; }
    if (w === 'sniper' && map.nests.some((n) => n.team === s.team)) {
      this.role = 'sniper';
      const free = map.nests.filter((n) => n.team === s.team && !this.g.soldiers.some((o) => o !== s && o.alive && o.brain && o.brain.nest === n));
      this.nest = pick(free.length ? free : map.nests.filter((n) => n.team === s.team));
      this.nestStance = Math.random() < 0.6 ? 'prone' : 'crouch';
      this.nestT = 0;
      this.setGoal(this.nest.spot.x, this.nest.spot.z, 'nest', this.nest.spot.y);
      return;
    }
    const close = w === 'smg' || w === 'shotgun';
    this.role = close && Math.random() < 0.3 && map.connectors.length ? 'flank' : 'lane';
    this.lane = w === 'sniper' ? (Object.keys(map.lanes).find((k) => map.lanes[k].kind === 'long') || this.pickLane(false)) : this.pickLane(close);
    const pts = map.lanes[this.lane].pts;
    this.laneIdx = s.team === 0 ? 0 : pts.length - 1;
    this.nextGoal();
  }
  pickLane(close) {
    const lanes = this.g.map.lanes, r = Math.random();
    const want = close ? (r < 0.55 ? 'short' : r < 0.85 ? 'mid' : 'long') : (r < 0.45 ? 'mid' : r < 0.75 ? 'long' : 'short');
    const key = Object.keys(lanes).find((k) => lanes[k].kind === want) || Object.keys(lanes)[0];
    return key;
  }
  hear(pos, src) {
    if (this.target || !this.s.alive) return;
    this.lastKnown.copy(pos); this.lastSeen = this.g.time - 0.8; this.investigate = true;
    if (this.g.pathBudget > 0) { this.requestPath(pos.x, pos.z, pos.y); this.repathT = 2; }
    // turn toward the sound
    this.heardYaw = Math.atan2(-(pos.x - this.s.pos.x), -(pos.z - this.s.pos.z)); this.heardT = 0.8;
  }
  nextGoal() {
    const s = this.s, map = this.g.map;
    if (this.role === 'objective') { const o = this.g.mode.botGoal(this); this.setGoal(o.x, o.z, o.kind, o.y); return; }
    if (this.role === 'sniper') { this.pickRole(); return; }
    if (!this.lane || !map.lanes[this.lane]) this.lane = this.pickLane(false);
    if (this.role === 'flank') {
      const c = pick(map.connectors);
      this.setGoal(c[0], c[1], 'hold', c[2]);
      return;
    }
    const pts = map.lanes[this.lane].pts;
    const dir = s.team === 0 ? 1 : -1;
    this.laneIdx += dir;
    if (this.laneIdx < 0 || this.laneIdx >= pts.length) {
      this.lane = this.pickLane(s.weaponId === 'smg' || s.weaponId === 'shotgun');
      const n = map.lanes[this.lane].pts.length;
      this.laneIdx = s.team === 0 ? 1 : n - 2;
    }
    const [x, z, y] = map.lanes[this.lane].pts[this.laneIdx];
    this.setGoal(x + (y ? 0 : (Math.random() - 0.5) * 3), z + (y ? 0 : (Math.random() - 0.5) * 3), 'hold', y);
  }
  setGoal(x, z, kind, y) {
    this.goal = { x, z, y }; this.goalKind = kind;
    this.requestPath(x, z, y);
  }
  requestPath(x, z, y) {
    if (this.g.pathBudget <= 0) { this.wantPath = { x, z, y }; return; }
    this.g.pathBudget--;
    this.wantPath = null;
    this.path = this.g.map.nav.findPath(this.s.pos.x, this.s.pos.z, x, z, this.s.pos.y, y);
    this.pi = 1;
  }
  followPath() {
    const s = this.s;
    while (this.path && this.pi < this.path.length) {
      const p = this.path[this.pi];
      const dx = p.x - s.pos.x, dz = p.z - s.pos.z, d = Math.hypot(dx, dz);
      const dy = p.y === undefined ? 0 : p.y - s.pos.y;
      if (d < 0.9 && (Math.abs(dy) < 1.3 || (p.kind === 'drop' && dy < 0))) { this.pi++; continue; }
      return { x: dx / Math.max(d, 1e-3), z: dz / Math.max(d, 1e-3), d, jump: p.kind === 'jump' && d < 1.6 && s.onGround };
    }
    return null;
  }

  perceive() {
    const s = this.s, g = this.g;
    const eye = s.eyePos(_e);
    const maxR = this.engageRange();
    let best = null, bs = Infinity;
    for (const t of g.targets) {
      if (!t.alive || t.team === s.team || t.isTurret) continue;
      if (t.isSoldier && t.spawnProtect > 0.5) continue;
      const c = t.center(_c);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      const alerted = t === this.alert && g.time - this.alertT < 3;
      const keep = t === this.target ? 1.2 : 1; // already fighting: allow a little drift past the start range
      if (d > maxR * keep * (alerted ? 1.25 : 1)) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - s.yaw));
      if (!alerted && d > 7 && ang > 1.35) continue;
      if (t.isSoldier && t.stance === 'prone' && d > 45 && g.time - t.lastFire > 2 && Math.random() < 0.55) continue;
      if (!g.canSee(s, t, eye)) continue; // identical trace to bullets
      const score = d * (t === this.target ? 0.6 : 1);
      if (score < bs) { bs = score; best = t; }
    }
    if (!best) { // shoot enemy sentries when nothing else is around
      for (const t of g.turrets) {
        if (!t.alive || t.team === s.team) continue;
        const c = t.center(_c);
        if (c.distanceTo(eye) < Math.min(50, maxR) && g.canSee(s, t, eye)) { best = t; break; }
      }
    }
    if (best !== this.target) {
      if (best) {
        this.acquired = g.time;
        const [r0, r1] = this.sk.react;
        this.reactT = r0 + Math.random() * (r1 - r0) + (s.weaponId === 'sniper' ? 0.35 : 0);
        this.aimHead = Math.random() < this.sk.headChance;
        this.errT = 0;
        this.crouchFight = (s.weaponId === 'ar' || s.weaponId === 'hmg') && Math.random() < 0.35;
      }
      this.target = best;
    }
    if (best) {
      this.visT = g.time;
      this.lastSeen = g.time; this.lastKnown.copy(best.pos); this.investigate = !best.isTurret;
      if (best.isSoldier) best.spotted = Math.max(best.spotted, 1.5);
    }
  }

  engageRange() { return VIS_RANGE * this.sk.engage * (ENGAGE[this.s.weaponId] || 1); }
  lookAt(x, y, z, dt, errScale = 0) {
    const s = this.s, eye = s.eyePos(_e), inp = this.inp;
    const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
    const yaw = Math.atan2(-dx, -dz) + this.errX * errScale;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + this.errY * errScale;
    const step = this.sk.turn * dt;
    const dyw = wrapAngle(yaw - s.yaw), dp = pitch - s.pitch;
    inp.dYaw = Math.max(-step, Math.min(step, dyw));
    inp.dPitch = Math.max(-step, Math.min(step, dp));
  }
  moveDir(mx, mz) {
    const s = this.s, inp = this.inp;
    const l = Math.hypot(mx, mz);
    if (l < 1e-3) { inp.forward = 0; inp.right = 0; return; }
    mx /= l; mz /= l;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    inp.forward = mx * -sy + mz * -cy;
    inp.right = mx * cy + mz * -sy;
  }

  update(dt) {
    const s = this.s, g = this.g, inp = this.inp, sk = this.sk;
    inp.jumpPressed = false; inp.punchPressed = false; inp.reloadPressed = false;
    inp.ability[0] = inp.ability[1] = false; inp.abilityTarget = null;
    inp.fire = false; inp.ads = false; inp.sprint = false; inp.dYaw = 0; inp.dPitch = 0;
    if (!s.alive) return inp;
    if (this.wantPath && g.pathBudget > 0) this.requestPath(this.wantPath.x, this.wantPath.z, this.wantPath.y);

    if (this.role === 'objective' && g.mode) { const ep = g.mode.epochFor(s.team); if (ep !== this.objEpoch) { this.objEpoch = ep; this.objRoute = null; this.waitT = 0; this.nextGoal(); } }
    this.percT -= dt;
    if (this.percT <= 0) { this.perceive(); this.percT = 0.16 + Math.random() * 0.1; }
    if (this.target && (!this.target.alive || g.time - this.lastSeen > 0.7)) this.target = null;
    this.repathT -= dt; this.strafeT -= dt; this.abilT -= dt; this.unstickT -= dt;

    // aim error drift
    this.errT -= dt;
    if (this.errT <= 0) {
      // angular error: settles over time on target, GROWS with distance, and the opening shots
      // at long range are deliberately off (firstMiss decays over sk.settle seconds)
      const td = this.target ? this.target.pos.distanceTo(s.pos) : 30;
      const onT = g.time - this.acquired;
      const base = Math.max(sk.minErr, sk.err * Math.exp(-onT * 1.8));
      const dist = 1 + td / sk.distK;
      const opening = 1 + sk.firstMiss * Math.min(1, td / 40) * Math.exp(-onT / sk.settle);
      const mag = base * dist * opening;
      const a = Math.random() * Math.PI * 2;
      this.errTX = Math.cos(a) * mag; this.errTY = Math.sin(a) * mag * 0.6;
      this.errT = 0.3 + Math.random() * 0.2;
    }
    this.errX += (this.errTX - this.errX) * Math.min(1, dt * 5);
    this.errY += (this.errTY - this.errY) * Math.min(1, dt * 5);

    let mx = 0, mz = 0, wantMove = false;
    const T = this.target, w = s.weaponId;
    const inNest = this.nest && s.pos.distanceTo(this.nest.spot) < 1.6;
    this.stance = 'stand';

    if (T) {
      const c = T.isSoldier && this.aimHead ? T.headPos(_h) : T.center(_h);
      const eye = s.eyePos(_e);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz), dh = Math.hypot(dx, dz) || 1;
      const errScale = w === 'sniper' ? 0.3 : 1;
      this.lookAt(c.x, c.y, c.z, dt, errScale);
      const trueYaw = Math.atan2(-dx, -dz), truePitch = Math.atan2(dy, dh);
      const angErr = Math.hypot(wrapAngle(trueYaw - s.yaw), truePitch - s.pitch);
      const tol = Math.max(sk.fireTol * errScale, Math.atan2(0.42, d)) * 1.6;
      const reacted = g.time - this.acquired > this.reactT;
      inp.ads = w === 'sniper' ? d > 12 : (d > 22 && w !== 'shotgun');
      // re-validate line of sight with the bullet trace every 100 ms; never fire on a stale sighting
      if (g.time - (this.visT || -9) > 0.1 && g.time - (this.visCheckT || -9) > 0.1) {
        this.visCheckT = g.time;
        if (g.canSee(s, T, eye)) { this.visT = g.time; this.lastSeen = g.time; this.lastKnown.copy(T.pos); }
      }
      const seeNow = g.time - (this.visT || -9) <= 0.12;
      let fire = reacted && seeNow && angErr < tol && d < this.engageRange() * 1.25;
      if (w === 'sniper') fire = fire && (d < 12 || (s.adsT > 0.95 && g.time - this.acquired > this.reactT + 0.45));
      if (w === 'shotgun' && d > 30) fire = false;
      if ((w === 'ar' && d > 22) || (w === 'smg' && d > 30)) { // burst at range so recoil resets (Valorant-style taps)
        this.burstT -= dt;
        if (this.burstT < -0.34) this.burstT = 0.3;   // ~3-shot burst, then a pause long enough for the recoil counter to reset
        if (this.burstT < 0) fire = false;
      }
      // counter-strafe (Valorant-style): rifles, HMG and sniper plant their feet for each burst/shot and only fire once slowed,
      // because running spread is large; SMG and shotgun can run-and-gun
      const plantW = w === 'ar' || w === 'hmg' || w === 'sniper';
      this.planted = plantW && reacted && seeNow && d > 8 && (w !== 'ar' || this.burstT >= 0 || d <= 22);
      if (plantW && d > 8 && Math.hypot(s.vel.x, s.vel.z) > 2.6) fire = false;
      if (w === 'hmg' && reacted && seeNow && angErr < 0.25) inp.fire = inp.fire || this.planted; // keep barrels spinning
      inp.fire = inp.fire || fire;
      if (!s.weapon.auto && s.triggerHeld) inp.fire = false; // semi-auto: release between shots
      if (s.ammo === 0 && !s.reloading) inp.reloadPressed = true;

      // melee + hallway brawling
      if (T.isSoldier || T.isDecoy) {
        if (d < 2.5 && (w !== 'shotgun' || s.reloading || s.ammo === 0)) { inp.punchPressed = true; inp.fire = false; }
        if (this.brawlT <= 0 && d < 8 && d > 3 && s.onGround && T.isSoldier && g.map.isHallway(s.pos.x, s.pos.z, s.pos.y) && Math.random() < sk.brawl * dt * 1.2) {
          this.brawlT = 1.2; this.brawlPhase = 0;
        }
      }
      if (this.brawlT > 0) {
        this.brawlT -= dt;
        const el = 1.2 - this.brawlT;
        if (this.brawlPhase === 0) { inp.jumpPressed = true; this.brawlPhase = 1; }
        else if (this.brawlPhase === 1 && el > 0.22) { inp.jumpPressed = true; this.brawlPhase = 2; }
        if (s.wallBounceT > 0 && d < 3.4) { inp.punchPressed = true; this.brawlT = 0; }
        mx = dx / dh; mz = dz / dh; wantMove = true; inp.fire = false;
      } else if (this.role === 'sniper' && inNest && d > 14) {
        this.stance = this.nestStance;
      } else {
        // spacing + strafing
        const pref = PREF[w];
        const tx = dx / dh, tz = dz / dh;
        if (d > pref * 1.5 && w !== 'sniper') {
          if (this.repathT <= 0) { this.requestPath(T.pos.x, T.pos.z, T.pos.y); this.repathT = 1.2; }
          const f = this.followPath();
          if (f && f.jump) inp.jumpPressed = true;
          if (f) { mx += f.x; mz += f.z; } else { mx += tx; mz += tz; }
        } else if (d < pref * 0.6 && w !== 'shotgun') { mx -= tx * 0.8; mz -= tz * 0.8; }
        if (this.strafeT <= 0) { this.strafe = Math.random() < 0.75 ? -this.strafe : 0; this.strafeT = 0.35 + Math.random() * 0.9; }
        const sf = this.crouchFight ? 0 : 0.9;
        mx += tz * this.strafe * sf; mz -= tx * this.strafe * sf;
        if (this.planted) { mx = 0; mz = 0; }   // stop dead to shoot, strafe again between bursts
        wantMove = true;
        if (this.crouchFight && d > 25) this.stance = 'crouch';
        if (w === 'sniper' && d > 30 && Math.random() < 0.3 * dt) this.stance = 'crouch';
        if (sk.brawl > 0.5 && d < 16 && s.onGround && Math.random() < dt * 0.4) inp.jumpPressed = true;
      }
      this.tryAbilities(dt, T, d);
    } else {
      // ── no target: navigate ──
      this.tryAbilities(dt, null, 0);
      if (this.investigate && g.time - this.lastSeen < 5) {
        if (this.repathT <= 0) { this.requestPath(this.lastKnown.x, this.lastKnown.z, this.lastKnown.y); this.repathT = 2; }
        if (s.pos.distanceTo(this.lastKnown) < 3) this.investigate = false;
      } else if (this.investigate) {
        this.investigate = false;
        if (this.goal) this.requestPath(this.goal.x, this.goal.z, this.goal.y);
      }
      // revealed enemies (pulse scan by a teammate)
      if (!this.investigate && this.role !== 'sniper') {
        for (const e of g.soldiers) {
          if (e.alive && e.team !== s.team && e.revealed > 0 && e.revealedBy === s.team && e.pos.distanceTo(s.pos) < 70) {
            this.lastKnown.copy(e.pos); this.lastSeen = g.time - 1; this.investigate = true;
            this.requestPath(e.pos.x, e.pos.z, e.pos.y); this.repathT = 2; break;
          }
        }
      }
      const f = this.followPath();
      if (f && f.jump) inp.jumpPressed = true;
      if (this.heardT > 0) {
        this.heardT -= dt;
        const yaw = this.heardYaw;
        this.lookAt(s.pos.x - Math.sin(yaw) * 10, s.pos.y + 1.5, s.pos.z - Math.cos(yaw) * 10, dt);
        if (f) { mx = f.x; mz = f.z; wantMove = true; }
      } else if (this.waitT > 0) {
        this.waitT -= dt;
        const yaw = s.yaw + Math.sin(g.time * 0.8) * 0.02;
        this.lookAt(s.pos.x - Math.sin(yaw) * 10, s.pos.y + 1.6, s.pos.z - Math.cos(yaw) * 10, dt);
        if (this.waitT <= 0) this.nextGoal();
      } else if (this.goalKind === 'nest' && inNest) {
        this.stance = this.nestStance;
        this.nestT += dt;
        const yaw = this.nest.yaw + Math.sin(g.time * 0.25) * 0.4;
        const tx = s.pos.x - Math.sin(yaw) * 50, tz = s.pos.z - Math.cos(yaw) * 50;
        this.lookAt(tx, s.pos.y + s.eyeH - 0.4, tz, dt);
        if (this.nestT > 70) this.pickRole();
      } else if (f) {
        mx = f.x; mz = f.z; wantMove = true;
        const la = this.path[Math.min(this.pi + 1, this.path.length - 1)];
        this.lookAt(la.x, s.pos.y + s.eyeH, la.z, dt);
        inp.sprint = f.d > 3 || this.pi < this.path.length - 1;
      } else if (this.goal) {
        const dx = this.goal.x - s.pos.x, dz = this.goal.z - s.pos.z;
        if (Math.hypot(dx, dz) < 3.5 || !this.path) {
          if (this.goalKind === 'nest') { mx = dx; mz = dz; wantMove = Math.hypot(dx, dz) > 0.6; }
          else this.waitT = this.goalKind === 'move' ? 0.05 : 1 + Math.random() * 2.5;
          if (!this.path && this.goalKind !== 'nest' && this.repathT <= 0) { this.nextGoal(); this.repathT = 1; }
        } else if (this.repathT <= 0) { this.requestPath(this.goal.x, this.goal.z, this.goal.y); this.repathT = 1; }
      } else this.pickRole();
      if (s.ammo < s.weapon.mag * 0.5 && !s.reloading) inp.reloadPressed = true;
    }

    // ── stuck handling ──
    this.stuckT += dt;
    if (this.stuckT > 1) {
      const moved = Math.hypot(s.pos.x - this.lastPos.x, s.pos.z - this.lastPos.z);
      this.lastPos.copy(s.pos); this.stuckT = 0;
      if (wantMove && moved < 0.5 && this.stance === 'stand') {
        this.stuckN++;
        this.unstickT = 0.5;
        const a = Math.random() * Math.PI * 2; this.unstickDir = [Math.cos(a), Math.sin(a)];
        inp.jumpPressed = true;
        if (this.stuckN % 3 === 0 && this.goal) this.requestPath(this.goal.x, this.goal.z, this.goal.y);
        if (this.stuckN >= 6) { this.stuckN = 0; this.nextGoal(); }
      } else this.stuckN = 0;
    }
    if (this.unstickT > 0) { mx = this.unstickDir[0]; mz = this.unstickDir[1]; wantMove = true; }

    this.moveDir(mx, mz);
    inp.stance = this.stance;
    return inp;
  }

  tryAbilities(dt, T, d) {
    if (this.abilT > 0) return;
    this.abilT = 0.8 + Math.random() * 0.7;
    if (Math.random() > this.sk.abilityRate) return;
    const s = this.s, g = this.g, w = s.weaponId, inp = this.inp;
    for (let i = 0; i < 2; i++) {
      const a = s.abilities[i];
      if (a.cd > 0) continue;
      let use = false;
      switch (a.id) {
        case 'arc': case 'singularity': use = T && !T.isTurret && d > 6 && d < 32; break;
        case 'swarm': use = T && d < 35; break;
        case 'disc': use = T && d < 26; break;
        case 'stasis': use = T && !T.isTurret && d > 5 && d < 22; break;
        case 'emp': use = T && d < 18; break;
        case 'sonic': use = T && d < 7; break;
        case 'hardlight': use = T && d > 10 && g.time - s.lastHurt < 1.5; break;
        case 'grapple': use = T && T.isSoldier && d > 6 && d < 24 && (w === 'smg' || w === 'shotgun'); break;
        case 'phase': use = T && (s.hp < 45 || (w === 'shotgun' && d > 6 && d < 12)); break;
        case 'jumppad': use = !T && Math.random() < 0.12 && s.onGround; break;
        case 'pulse': use = !T && g.time - this.lastSeen > 8 && Math.random() < 0.3; break;
        case 'decoy': use = T && d > 10; break;
        case 'hack': use = T && T.isTurret && d < 45; break;
        case 'tripmine': use = !T && g.map.isHallway(s.pos.x, s.pos.z, s.pos.y) && Math.random() < 0.35; break;
      }
      if (use) {
        inp.ability[i] = true;
        if (T) inp.abilityTarget = T.pos.clone();
        return;
      }
    }
  }
}
