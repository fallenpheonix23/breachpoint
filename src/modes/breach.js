// BREACH — attack/defend objective mode with respawns (design: docs/maps/A_GULLHAVEN.md §1).
// Two halves; each team attacks once. Sites unlock in order; attackers capture by standing in the zone.
// The controller owns spawns, respawn delays, the clock, capture state, gates, bot objective goals and its HUD strip.
import * as THREE from 'three';
import { TEAM_NAMES, TEAM_CSS } from '../config.js';

export const BREACH = {
  respawn: { attack: 5, defend: [6, 8] },   // defenders: per active site index (later sites → longer wave)
  checkpoints: [1 / 3, 2 / 3], decayDelay: 3, decayRate: 0.01, overtimeGrace: 0.6, halftime: 4,
};

export class Breach {
  constructor(game) {
    this.g = game; this.d = game.map.breach;
    this.sites = this.d.objectives;
    this.firstAttack = game.player ? game.player.team : 0;    // the player's team attacks first
    this.results = [];                                          // per half: { team, captured, progress, timeUsed }
    this.epoch = [0, 0];                                        // per team: bumps make bots re-pick objective goals
    this.ui = null; this.markers = [];
    this.startHalf(0, true);
    this.buildMarkers();
  }

  // ── state ────────────────────────────────────────────────────────────────
  startHalf(half, first = false) {
    this.half = half; this.attackTeam = half === 0 ? this.firstAttack : 1 - this.firstAttack;
    this.phase = 0; this.progress = 0; this.floor = 0; this.emptyT = 0; this.otGrace = 0; this.overtime = false;
    this.setupT = this.d.setup; this.clock = this.d.clock[0]; this.used = 0; this.alarm = false; this.done = false; this.breakT = 0;
    for (const gt of this.d.gates) this.setGate(gt, false);
    for (const t of this.g.turrets) {                       // spawn sentries follow the spawn's role
      const spot = this.g.map.turretSpots.find((s) => s.pos.distanceTo(t.pos) < 0.5);
      if (spot?.role) { t.homeTeam = t.team = spot.role === 'attack' ? this.attackTeam : 1 - this.attackTeam; t.recolor?.(); }
    }
    this.bump(0); this.bump(1);
    if (!first) {
      for (const s of this.g.soldiers) { s.alive = true; this.g.respawn(s); s.spawnProtect = 2; }
      this.announce('SIDES SWAPPED', this.roleOf(this.g.player.team) === 'attack' ? 'You are ATTACKING' : 'You are DEFENDING');
    }
  }
  blockAbility(s) { return this.setupT > 0 && s.team === this.attackTeam; }
  roleOf(team) { return team === this.attackTeam ? 'attack' : 'defend'; }
  site() { return this.sites[this.phase] || null; }
  bump(team) { this.epoch[team]++; }
  epochFor(team) { return this.epoch[team]; }
  setGate(gt, open) {
    gt.open = open;
    if (open) this.g.world.remove(gt.box); else this.g.world.restore(gt.box);
    if (gt.mesh) gt.mesh.visible = !open;
  }
  openGates(event) { for (const gt of this.d.gates) if (gt.opens === event && !gt.open) this.setGate(gt, true); }
  inZone(s, z) { return s.alive && s.pos.x >= z.x0 && s.pos.x <= z.x1 && s.pos.z >= z.z0 && s.pos.z <= z.z1 && s.pos.y >= z.y0 && s.pos.y <= z.y1; }
  announce(text, sub = '') { this.g.hud?.medal?.(text, sub); }

  // ── spawns / respawn ─────────────────────────────────────────────────────
  spawnPoints(team) {
    const role = this.roleOf(team), byPhase = this.d.spawns[role];
    for (let ph = Math.min(this.phase, byPhase.length - 1); ph >= 0; ph--) if (byPhase[ph]?.length) return byPhase[ph];
    return this.g.map.spawns[team];
  }
  respawnDelay(s) {
    const r = BREACH.respawn;
    return this.roleOf(s.team) === 'attack' ? r.attack : r.defend[Math.min(this.phase, r.defend.length - 1)];
  }

  // ── tick ─────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.g;
    if (this.breakT > 0) {                                   // short pause between halves
      this.breakT -= dt; g.timeLeft = this.breakT;
      if (this.breakT <= 0) { if (this.half === 0) this.startHalf(1); else { this.done = true; g.endMatch(); } }
      this.updateUI(); return;
    }
    if (this.setupT > 0) {
      this.setupT -= dt; g.timeLeft = this.setupT;
      if (this.setupT <= 0) { this.openGates('setup'); this.bump(0); this.bump(1); this.announce(`${this.site().name.toUpperCase()} IS ACTIVE`, 'Attackers: capture it · Defenders: hold it'); }
      this.updateUI(); return;
    }
    const z = this.site();
    let att = 0, def = 0;
    for (const s of g.soldiers) if (this.inZone(s, z)) { if (s.team === this.attackTeam) att++; else def++; }
    const before = this.progress;
    if (att > 0 && def === 0) {
      this.progress = Math.min(1, this.progress + dt / z.capture[Math.min(att, 3) - 1]); this.emptyT = 0;
    } else if (att === 0) {
      this.emptyT += dt;
      if (this.emptyT > BREACH.decayDelay) this.progress = Math.max(this.floor, this.progress - BREACH.decayRate * dt);
    } else this.emptyT = 0;                                  // contested: frozen
    for (const c of BREACH.checkpoints) if (this.progress >= c && this.floor < c) { this.floor = c; this.announce(`CHECKPOINT ${Math.round(c * 100)}%`, z.name); }
    const rising = this.progress > before;
    if (rising && !this.alarm) { this.alarm = true; this.bump(1 - this.attackTeam); }
    if (!rising && att === 0 && this.alarm) { this.alarm = false; this.bump(1 - this.attackTeam); }
    if (this.progress >= 1) { this.capture(); this.updateUI(); return; }

    // clock + overtime (runs while attackers stand in an active zone with progress on it)
    this.used += dt;
    if (this.clock > 0) this.clock = Math.max(0, this.clock - dt);
    if (this.clock <= 0) {
      const ot = att > 0 && (this.progress > 0 || def > 0);
      if (ot) { this.overtime = true; this.otGrace = BREACH.overtimeGrace; }
      else if ((this.otGrace -= dt) <= 0) this.endHalf();
    }
    g.timeLeft = this.clock;
    this.updateUI();
  }
  capture() {
    const z = this.site();
    this.announce(`${z.name.toUpperCase()} CAPTURED`, this.roleOf(this.g.player.team) === 'attack' ? 'Push to the next site' : 'Fall back!');
    this.openGates(z.id);
    this.phase++; this.progress = 0; this.floor = 0; this.emptyT = 0; this.alarm = false; this.overtime = false;
    if (this.phase >= this.sites.length) { this.endHalf(); return; }
    this.clock += this.d.clock[1];
    this.bump(0); this.bump(1);
  }
  endHalf() {
    if (this.breakT > 0 || this.done) return;
    this.results[this.half] = { team: this.attackTeam, captured: this.phase, progress: this.phase < this.sites.length ? this.progress : 0, timeUsed: this.used };
    const r = this.results[this.half];
    this.announce(this.half === 0 ? 'HALF TIME' : 'MATCH OVER', `${TEAM_NAMES[r.team]} captured ${r.captured}/${this.sites.length}${r.captured < this.sites.length ? ` (+${Math.round(r.progress * 100)}%)` : ''}`);
    this.breakT = BREACH.halftime;
  }

  // ── result ───────────────────────────────────────────────────────────────
  // returns team index of the winner, or null for a draw
  winner() {
    const [a, b] = this.results; if (!a || !b) return null;
    if (a.captured !== b.captured) return a.captured > b.captured ? a.team : b.team;
    if (Math.abs(a.progress - b.progress) > 1e-3) return a.progress > b.progress ? a.team : b.team;
    if (a.captured === this.sites.length && Math.abs(a.timeUsed - b.timeUsed) > 0.5) return a.timeUsed < b.timeUsed ? a.team : b.team;
    return null;
  }
  summary() {
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    return this.results.filter(Boolean).map((r) => `<span style="color:${TEAM_CSS[r.team]}">${TEAM_NAMES[r.team]}</span> attacked: ${r.captured}/${this.sites.length} sites` +
      (r.captured < this.sites.length ? ` +${Math.round(r.progress * 100)}%` : ` in ${fmt(r.timeUsed)}`)).join(' · ');
  }

  // ── bots ─────────────────────────────────────────────────────────────────
  zonePoint(z, pad = 1.2) {
    return { x: z.x0 + pad + Math.random() * Math.max(0.1, z.x1 - z.x0 - 2 * pad), z: z.z0 + pad + Math.random() * Math.max(0.1, z.z1 - z.z0 - 2 * pad), y: Math.max(0, z.y0 + 0.5) };
  }
  // next goal for a bot: { x, y, z, kind: 'move'|'hold' }
  botGoal(brain) {
    const s = brain.s, role = this.roleOf(s.team), z = this.site();
    if (!z || this.breakT > 0) { const p = s.pos; return { x: p.x, y: p.y, z: p.z, kind: 'hold' }; }
    if (role === 'attack') {
      if (this.setupT > 0) {                                  // wait behind the gate
        const pts = this.spawnPoints(s.team), p = pts[Math.floor(Math.random() * pts.length)];
        return { x: p.x, y: p.y, z: p.z, kind: 'hold' };
      }
      if (!brain.objRoute) {
        const rs = this.d.routes.filter((r) => r.role === 'attack' && r.phase === this.phase);
        brain.objRoute = rs.length ? rs[Math.floor(Math.random() * rs.length)] : { pts: [] }; brain.objIdx = 0;
        // skip waypoints behind the bot (it may have spawned forward)
        const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2, dMe = Math.hypot(s.pos.x - cx, s.pos.z - cz);
        while (brain.objIdx < brain.objRoute.pts.length && Math.hypot(brain.objRoute.pts[brain.objIdx][0] - cx, brain.objRoute.pts[brain.objIdx][1] - cz) > dMe + 3) brain.objIdx++;
      }
      const inside = this.inZone(s, z);
      if (!inside && brain.objIdx < brain.objRoute.pts.length) {
        const [x, zz, y] = brain.objRoute.pts[brain.objIdx++];
        return { x: x + (Math.random() - 0.5) * 2, z: zz + (Math.random() - 0.5) * 2, y: y || 0, kind: 'move' };
      }
      return { ...this.zonePoint(z), kind: 'hold' };
    }
    // defenders: hold spots around the site; everyone retakes while the capture is rising
    if (this.alarm || this.overtime) return { ...this.zonePoint(z), kind: 'move' };
    const holds = this.d.holds.filter((h) => h.site === z.id);
    if (holds.length && Math.random() < 0.75) { const h = holds[Math.floor(Math.random() * holds.length)]; return { x: h.x, y: h.y, z: h.z, kind: 'hold' }; }
    return { ...this.zonePoint(z, 2), kind: 'hold' };
  }
  // ── HUD ──────────────────────────────────────────────────────────────────
  buildMarkers() {
    if (typeof window === 'undefined' || !document.body) return;
    for (const z of this.sites) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      x.font = 'bold 96px Rajdhani, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,.6)'; x.strokeText(z.id, 64, 68); x.fillStyle = '#fff'; x.fillText(z.id, 64, 68);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      sp.position.set((z.x0 + z.x1) / 2, z.y0 + 4.5, (z.z0 + z.z1) / 2); sp.scale.set(2.2, 2.2, 1); sp.renderOrder = 60;
      this.g.scene.add(sp); this.markers.push(sp);
    }
    const hud = document.getElementById('hud');
    if (hud) {
      this.ui = document.createElement('div'); this.ui.id = 'objective';
      this.ui.style.cssText = 'position:absolute;top:58px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;font:700 15px Rajdhani,sans-serif;color:#e9eef5;text-shadow:0 1px 2px #000;pointer-events:none;letter-spacing:.06em';
      hud.appendChild(this.ui);
    }
  }
  updateUI() {
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i], active = i === this.phase && this.breakT <= 0;
      m.material.color.set(i < this.phase ? 0x777777 : active ? (this.alarm ? 0xffd27a : 0xffffff) : 0x555555);
      m.material.opacity = i < this.phase ? 0.35 : active ? 1 : 0.4;
    }
    if (!this.ui) return;
    const me = this.g.player.team, role = this.roleOf(me);
    const chip = (z, i) => {
      const st = i < this.phase ? 'done' : i === this.phase ? 'active' : 'locked';
      const pct = st === 'done' ? 100 : st === 'active' ? Math.round(this.progress * 100) : 0;
      const col = st === 'locked' ? '#59606b' : TEAM_CSS[this.attackTeam];
      return `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:4px;background:rgba(8,10,14,.72);border:1px solid ${st === 'active' ? col : '#2b3140'}">
        <b style="font-size:18px;color:${st === 'locked' ? '#59606b' : '#fff'}">${z.id}</b>
        <span style="width:70px;height:6px;background:#232833;border-radius:3px;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:${col}"></span></span>
        ${st === 'locked' ? '🔒' : st === 'done' ? '✓' : `${pct}%`}</span>`;
    };
    const status = this.breakT > 0 ? (this.half === 0 ? 'HALF TIME' : 'MATCH OVER') : this.setupT > 0 ? 'SETUP' : this.overtime ? 'OVERTIME' : this.alarm ? (role === 'attack' ? 'CAPTURING' : 'CONTEST THE SITE!') : '';
    const html = `<span style="padding:3px 10px;border-radius:4px;background:${TEAM_CSS[me]};color:#0b0d12">${role === 'attack' ? 'ATTACK' : 'DEFEND'}</span>
      <span style="opacity:.8">HALF ${this.half + 1}/2</span>${this.sites.map(chip).join('')}<span style="color:#ffd27a">${status}</span>`;
    if (html !== this._html) { this._html = html; this.ui.innerHTML = html; }
  }
  dispose() { this.ui?.remove(); for (const m of this.markers) m.removeFromParent(); }
}
