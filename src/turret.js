// Team sentry turrets — targets for EMP and Hack Dart.
import * as THREE from 'three';
import { TEAM_COLORS } from './config.js';
import { rayAABB } from './physics.js';
import { buildTurretModel } from './models.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const WPN = { name: 'Sentry', dmg: 9, head: 1.3, falloff: [30, 60], minMult: 0.6, range: 70, tracer: [3.5, 1.4, 0.6], sound: 'turret' };

export class Turret {
  constructor(game, pos, team) {
    this.g = game; this.isTurret = true;
    this.homeTeam = team; this.team = team; this.name = 'Sentry';
    this.pos = pos.clone();
    this.maxHp = 260; this.hp = this.maxHp; this.alive = true;
    this.respawnT = 0; this.empT = 0; this.hackT = 0;
    this.yaw = team === 0 ? -Math.PI / 2 : Math.PI / 2; this.pitch = 0;
    this.target = null; this.scanT = 0; this.fireT = 0;
    this.model = buildTurretModel(team);
    this.model.root.position.copy(pos);
    game.scene.add(this.model.root);
    game.world.add(pos.x - 0.75, 0, pos.z - 0.75, pos.x + 0.75, 1.1, pos.z + 0.75, 'turret');
    this.weapon = WPN;
  }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.35, this.pos.z); }
  headPos(out) { return this.center(out); }
  hitTest(o, d, maxT) {
    const p = this.pos;
    const t = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, p.x - 0.5, p.y + 1.05, p.z - 0.5, p.x + 0.5, p.y + 1.7, p.z + 0.5, maxT);
    return t >= 0 && t < maxT ? { t, head: false } : null;
  }
  takeDamage(n, attacker) {
    if (!this.alive) return false;
    this.hp -= n;
    this.g.onTurretHit(this, attacker);
    if (this.hp <= 0) {
      this.alive = false; this.respawnT = 45; this.hackT = 0;
      this.g.explosion(this.center(_a), 3, 20, null, { weapon: 'Sentry', color: [4, 2, 0.6], noDamage: true });
      this.model.root.visible = false;
      this.g.onTurretDestroyed(this, attacker);
      return true;
    }
    return false;
  }
  emp(t) { this.empT = Math.max(this.empT, t); }
  hack(team, t) { this.team = team; this.hackT = t; this.target = null; this.recolor(); }
  recolor() {
    this.model.glow.color.copy(new THREE.Color(TEAM_COLORS[this.team]).multiplyScalar(this.empT > 0 ? 0.3 : 4));
  }
  update(dt) {
    const g = this.g;
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.alive = true; this.hp = this.maxHp; this.team = this.homeTeam; this.model.root.visible = true; this.recolor();
      }
      return;
    }
    if (this.hackT > 0) { this.hackT -= dt; if (this.hackT <= 0) { this.team = this.homeTeam; this.target = null; this.recolor(); } }
    if (this.empT > 0) {
      this.empT -= dt; this.recolor();
      if (Math.random() < 0.2) g.fx.spark(this.center(_a), [0.8, 2, 5], 2, 0.1, 0.3);
      this.model.head.rotation.x = -0.4;
      return;
    }
    const eye = this.center(_a);
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.3;
      let best = null, bd = 45;
      for (const t of g.targets) {
        if (!t.alive || t.team === this.team || t.isTurret) continue;
        if (t.isSoldier && t.spawnProtect > 0) continue;
        const c = t.center(_b), d = c.distanceTo(eye);
        if (d < bd && g.canSee(this, t, eye)) { bd = d; best = t; }
      }
      this.target = best;
      if (best && best.isSoldier) best.spotted = Math.max(best.spotted, 1);
    }
    if (this.target && this.target.alive) {
      const c = this.target.center(_b);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      let dyaw = wantYaw - this.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      this.yaw += Math.max(-3 * dt, Math.min(3 * dt, dyaw));
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 5);
      this.fireT -= dt;
      if (Math.abs(dyaw) < 0.08 && this.fireT <= 0) {
        this.fireT = 0.24;
        const d = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
        d.x += (Math.random() - 0.5) * 0.05; d.y += (Math.random() - 0.5) * 0.05; d.z += (Math.random() - 0.5) * 0.05; d.normalize();
        g.fireBullet(this, eye.clone().addScaledVector(d, 0.9), d, WPN);
        g.sfx('turret', this.pos, 0.7);
        g.fx.flash(eye.clone().addScaledVector(d, 1.1), [4, 2.4, 1], 5, 0.05);
      }
    } else {
      this.yaw += dt * 0.4 * Math.sin(g.time * 0.3);
      this.pitch *= 0.95;
    }
    this.model.head.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
