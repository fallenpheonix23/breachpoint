// Game orchestrator: rendering, match rules, bullets, explosions, events.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Breach } from './modes/breach.js';
import { DEFAULT_HFOV, WEAPONS, ABILITIES, BOT_NAMES, DIFFICULTY, KILL_LIMIT, MATCH_TIME, RESPAWN_TIME, TEAM_NAMES, TEAM_CSS, TEAM_COLORS } from './config.js';
import { buildMap } from './map.js';
import { makeTextures } from './textures.js';
import { Soldier } from './soldier.js';
import { BotBrain } from './bot.js';
import { PlayerController } from './player.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { HUD } from './hud.js';
import { Viewmodel } from './viewmodel.js';
import { Abilities } from './abilities.js';
import { Turret } from './turret.js';
import { raySphere, L_SHOT, L_ALL } from './physics.js';
import { setHighlight } from './models.js';
import { mapById } from './maps/index.js';
import { makeSky, GradeShader, Weather } from './sky.js';

export const QUALITY = {
  low: { shadows: false, shadowSize: 1024, bloom: false, weather: 0.4, aa: false },
  medium: { shadows: true, shadowSize: 1024, bloom: true, weather: 0.7, aa: true },
  high: { shadows: true, shadowSize: 2048, bloom: true, weather: 1, aa: true },
};

const RR = {};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3();
const _l = new THREE.Vector3(), _f = new THREE.Vector3();
const _l2 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _d1 = new THREE.Vector3();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Game {
  constructor(opts, callbacks) {
    this.opts = opts; this.cb = callbacks;
    this.time = 0; this.timeLeft = MATCH_TIME; this.score = [0, 0]; this.respawnTime = RESPAWN_TIME;
    this.over = false; this.paused = true; this.disposed = false;
    this.mapDef = mapById(opts.map);
    this.theme = this.mapDef.theme;
    this.autoQuality = opts.quality === 'auto';
    this.Q = QUALITY[this.autoQuality ? 'medium' : opts.quality] || QUALITY.medium;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: this.Q.aa, powerPreference: 'high-performance' }));
    // internal render resolution: 100% of native pixels by default (user can lower it)
    this.maxPR = Math.min(devicePixelRatio, 2) * Math.min(1, Math.max(0.5, (opts.renderScale ?? 100) / 100));
    this.renderScale = this.maxPR;
    r.setPixelRatio(this.renderScale);
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = this.Q.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = this.theme.exposure ?? 1;
    document.getElementById('app').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.15, 1500)   // near 0.15: 3× the depth precision → no far-distance z-flicker;
    this.camera.rotation.order = 'YXZ';
    this.hfov = opts.fov || DEFAULT_HFOV; // horizontal FOV (PC convention); three.js wants vertical
    this.baseFov = this.vfovFor(this.hfov);
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    this.setupWorldLighting();
    this.T = makeTextures(r);
    this.map = buildMap(this.scene, this.T, this.mapDef);
    this.weather = new Weather(this.scene, this.theme.weather, this.Q.weather);
    this.world = this.map.world;
    this.fx = new Effects(this);
    this.audio = new Sfx(); this.audio.volume = opts.volume ?? 0.6;
    this.abilities = new Abilities(this, this.T);
    this.stasisFields = []; this.shieldWalls = []; this.decoys = []; this.targets = [];
    this.turrets = this.map.turretSpots.map((t) => new Turret(this, t.pos, t.team));
    setHighlight(opts.highlight);
    this.createSoldiers();
    this.initMode();
    this.hud = new HUD(this);
    this.hud.setup(this.player);
    this.vm = new Viewmodel(this.player.weaponId, this.player.team);
    this.vm.scene.environment = this.scene.environment;
    this.vm.setLighting(this.theme);
    this.input = new PlayerController(this, r.domElement);
    this.input.sens = opts.sens ?? 1;
    const envK = this.theme.env ?? 0.4;
    this.scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = (o.material.userData.env ?? 0.8) * envK; });

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), this.theme.bloom ?? 0.4, 0.45, 1.4);
    this.bloom.enabled = this.Q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    const gr = this.theme.grade || {};
    const gu = this.grade.uniforms;
    gu.sat.value = gr.sat ?? 1.15; gu.contrast.value = gr.contrast ?? 1.05; gu.vignette.value = Math.min(0.18, gr.vignette ?? 0.18); gu.grain.value = 0.008;
    if (gr.lift) gu.lift.value.set(...gr.lift); if (gr.gain) gu.gain.value.set(...gr.gain);
    this.composer.addPass(this.grade);
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60; this.dynT = 0;

    const uiScale = () => document.documentElement.style.setProperty('--ui', Math.max(0.72, Math.min(1.1, Math.min(innerWidth / 1600, innerHeight / 900))).toFixed(3));
    uiScale();
    this.onResize = () => {
      uiScale();
      r.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight); this.composer.setPixelRatio(this.renderScale);
      this.camera.aspect = innerWidth / innerHeight; this.baseFov = this.vfovFor(this.hfov); this.camera.updateProjectionMatrix(); this.vm.resize();
    };
    addEventListener('resize', this.onResize);
    this.pauseEl = document.getElementById('pause');
    this.onPauseClick = (e) => {
      if (e.target.closest('input, button, label')) return;
      this.audio.init(); this.input.lock();
    };
    this.pauseEl.addEventListener('click', this.onPauseClick);
    this.pauseEl.querySelector('.pause-msg').textContent = 'CLICK TO DEPLOY';
    this.pauseEl.classList.remove('hidden');
    r.domElement.addEventListener('click', () => { if (!this.over) { this.audio.init(); this.input.lock(); } });

    this.shakeT = 0; this.camBob = 0; this.stepAcc = 0; this.wasGround = true; this.prevVy = 0;
    this.killCam = null; this.lastKillT = -10; this.multi = 0;
    for (const s of this.soldiers) this.respawn(s);
    this.clock = new THREE.Clock();
    if (new URLSearchParams(location.search).has('debug')) { this.paused = false; this.started = true; this.pauseEl.classList.add('hidden'); window.game = this; }
    this.renderer.compile(this.scene, this.camera);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  vfovFor(hfov) { return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) / (innerWidth / innerHeight))); }
  setupWorldLighting() {
    const th = this.theme;
    this.sky = makeSky(th);
    this.scene.add(this.sky.mesh);
    this.sunDir = this.sky.sunDir.clone();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.scene.fog = new THREE.Fog(th.fog.color, th.fog.near, th.fog.far);
    this.scene.background = new THREE.Color(th.fog.color);
    this.hemi = new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity));
    sun.castShadow = this.Q.shadows;
    sun.shadow.mapSize.set(this.Q.shadowSize, this.Q.shadowSize);
    const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 50; sc.far = 450;
    // normalBias ≈ one shadow texel (110 m / map size) — anything smaller gives striped 'acne' on sunlit walls
    sun.shadow.bias = -0.0002; sun.shadow.normalBias = 1.1 * 110 / this.Q.shadowSize;
    this.scene.add(sun); this.scene.add(sun.target);
  }

  // objective modes (map JSON "mode"): Breach = attack/defend; otherwise Team Deathmatch
  initMode() { this.mode = this.map.breach ? new Breach(this) : null; }
  respawnDelay(s) { return this.mode ? this.mode.respawnDelay(s) : this.respawnTime; }

  createSoldiers() {
    const o = this.opts, diff = DIFFICULTY[o.difficulty] || DIFFICULTY.veteran;
    const names = shuffle([...BOT_NAMES]);
    const abIds = Object.keys(ABILITIES);
    this.soldiers = [];
    this.player = new Soldier(this, { id: 0, name: o.name || 'Player', team: 0, isPlayer: true, weapon: o.weapon, abilities: o.abilities });
    this.soldiers.push(this.player);
    let id = 1;
    for (const team of [0, 1]) {
      const n = team === 0 ? 4 : 5;
      let snipers = team === 0 && o.weapon === 'sniper' ? 1 : 0;
      const pool = shuffle(['ar', 'ar', 'smg', 'smg', 'hmg', 'shotgun', 'sniper', 'sniper', 'ar', 'hmg', 'shotgun']);
      for (let i = 0; i < n; i++) {
        let w = pool[i];
        if (w === 'sniper') { if (snipers >= 2) w = 'ar'; else snipers++; }
        const abs = shuffle([...abIds]).slice(0, 2);
        const s = new Soldier(this, { id: id++, name: names.pop(), team, weapon: w, abilities: abs });
        s.brain = new BotBrain(this, s, diff);
        this.soldiers.push(s);
      }
    }
    // scope glint: enemy snipers flash when their scope points at you (fair warning at range)
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    { const x = gc.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,200,0.8)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(0, 30, 64, 4); x.fillRect(30, 0, 4, 64); }
    const glintTex = new THREE.CanvasTexture(gc);
    for (const s of this.soldiers) {
      if (s.team === this.player.team || s.weaponId !== 'sniper') continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color: new THREE.Color(3, 2.8, 2.4), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: false, transparent: true }));
      sp.visible = false; sp.renderOrder = 25; this.scene.add(sp); s.glint = sp;
    }
    // ally nametags + enemy x-ray silhouettes for Pulse Scanner reveals
    const xrayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.3), transparent: true, opacity: 0.45, depthTest: false, depthWrite: false });
    const capsule = new THREE.CapsuleGeometry(0.38, 1.0, 4, 8);
    for (const s of this.soldiers) {
      if (s.isPlayer) continue;
      if (s.team === this.player.team) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const x = c.getContext('2d');
        x.font = 'bold 34px Rajdhani, sans-serif'; x.textAlign = 'center'; x.fillStyle = TEAM_CSS[s.team];
        x.shadowColor = '#000'; x.shadowBlur = 6; x.fillText(`${s.name} · ${s.weapon.short}`, 128, 44);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
        sp.scale.set(2.2, 0.55, 1); sp.position.y = 2.25; sp.renderOrder = 20;
        s.model.root.add(sp); s.tag = sp;
      } else {
        const m = new THREE.Mesh(capsule, xrayMat); m.renderOrder = 30; m.visible = false; m.frustumCulled = false;
        this.scene.add(m); s.xray = m;
      }
    }
  }

  respawn(s) {
    const pts = this.mode ? this.mode.spawnPoints(s.team) : this.map.spawns[s.team];
    let best = pts[0], bd = -1;
    for (const p of pts) {
      let md = 1e9;
      for (const e of this.soldiers) if (e.alive && e.team !== s.team) md = Math.min(md, e.pos.distanceTo(p));
      md += Math.random() * 25;
      if (!this.soldiers.some((o) => o !== s && o.alive && o.pos.distanceTo(p) < 1.2) && md > bd) { bd = md; best = p; }
    }
    s.spawn(best, best.yaw != null ? (best.yaw * Math.PI) / 180 : s.team === 0 ? -Math.PI / 2 : Math.PI / 2);
    if (s.brain) s.brain.onSpawn();
    if (s.isPlayer) { this.hud?.hideDeath(); this.input.stance = 'stand'; this.killCam = null; }
  }

  // ── core queries ──────────────────────────────────────────────────────────
  los(a, b, team) {
    _l.copy(b).sub(a);
    const d = _l.length();
    if (d < 0.01) return true;
    _l.multiplyScalar(1 / d);
    if (this.world.raycast(a, _l, d - 0.05, RR, L_SHOT)) return false;
    if (team >= 0) for (const w of this.shieldWalls) if (w.alive && w.team !== team && w.rayTest(a, _l, d) >= 0) return false;
    return true;
  }
  stasisFactor(p) {
    for (const f of this.stasisFields) if (f.alive && f.contains(p)) return 0.03;
    return 1;
  }
  sfx(name, pos, vol = 1) { this.audio.play(name, pos, vol); }
  shake(a) { this.shakeT = Math.min(1, this.shakeT + a); }

  muzzleFor(s, origin, out) {
    if (s.isPlayer && s.alive) {
      const k = 1 - s.adsT;
      out.set(0.17 * k, -0.13 * k - 0.03, -0.7).applyQuaternion(this.camera.quaternion).add(this.camera.position);
      return out;
    }
    if (s.isSoldier) {
      const f = s.aimDir(_f);
      out.copy(origin).addScaledVector(f, 0.6);
      out.x += Math.cos(s.yaw) * 0.18; out.z -= Math.sin(s.yaw) * 0.18; out.y -= 0.22;
      return out;
    }
    return out.copy(origin);
  }

  // ONE trace used by both bullets and bot vision: world geometry, enemy hard-light walls,
  // stasis fields (bullets freeze there) and every live enemy hitbox. Returns the first thing hit.
  trace(shooter, origin, dir, maxT, opts = {}) {
    const T = this._trace || (this._trace = { t: 0, kind: null, obj: null, head: false, n: new THREE.Vector3() });
    let t = maxT, kind = null, obj = null, head = false;
    if (this.world.raycast(origin, dir, maxT, RR, L_SHOT)) { t = RR.t; kind = 'world'; T.n.set(RR.nx, RR.ny, RR.nz); }
    for (const w of this.shieldWalls) {
      if (!w.alive || w.team === shooter.team) continue;
      const tt = w.rayTest(origin, dir, t);
      if (tt >= 0 && tt < t) { t = tt; kind = 'shieldwall'; obj = w; }
    }
    for (const tg of this.targets) {
      if (!tg.alive || tg.team === shooter.team || tg === shooter) continue;
      const h = tg.hitTest(origin, dir, t);
      if (h && h.t < t) { t = h.t; kind = 'target'; obj = tg; head = h.head; }
    }
    if (!opts.ignoreAllStasis) for (const f of this.stasisFields) {
      if (!f.alive || f === opts.ignoreStasis || f.contains(origin)) continue;
      const ts = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, f.pos.x, f.pos.y, f.pos.z, f.r);
      if (ts >= 0 && ts < t) { t = ts; kind = 'stasis'; obj = f; head = false; }
    }
    T.t = t; T.kind = kind; T.obj = obj; T.head = head;
    return T;
  }
  // Can `viewer` see `target`? True only if a bullet fired from the viewer's eye at the target's
  // head or chest would hit that target first (same trace as fireBullet).
  canSee(viewer, target, eye) {
    eye = eye || viewer.eyePos(_l2);
    const pts = target.isSoldier ? [target.headPos(_p1), target.center(_p2), _p3.set(target.pos.x, target.pos.y + target.height * 0.3, target.pos.z)] : [target.center(_p1)];
    for (const pt of pts) {
      _d1.copy(pt).sub(eye); const d = _d1.length(); if (d < 0.01) return true;
      _d1.multiplyScalar(1 / d);
      const tr = this.trace(viewer, eye, _d1, d + 0.6);
      if (tr.kind === 'target' && tr.obj === target) return true;
    }
    return false;
  }
  fireBullet(shooter, origin, dir, wpn, opts = {}) {
    const maxT = opts.maxRange ?? wpn.range;
    const tr = this.trace(shooter, origin, dir, maxT, { ignoreAllStasis: true });
    let t = tr.t, kind = tr.kind, obj = tr.obj, head = tr.head;
    if (kind === 'world') _n.copy(tr.n);
    const start = opts.distOffset ? _b.copy(origin) : this.muzzleFor(shooter, origin, _b);
    for (const f of this.stasisFields) {
      if (!f.alive || f === opts.ignoreStasis || f.contains(origin)) continue;
      const ts = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, f.pos.x, f.pos.y, f.pos.z, f.r);
      if (ts >= 0 && ts < t) {
        const p = origin.clone().addScaledVector(dir, ts);
        this.fx.tracer(start.clone(), p, wpn.tracer, 0.08);
        f.freezeBullet(shooter, p, dir, wpn, maxT - ts, (opts.distOffset || 0) + ts);
        return;
      }
    }
    const end = _e.copy(origin).addScaledVector(dir, t);
    const sniper = wpn.scope;
    if (!shooter.isPlayer || shooter.weapon.pellets === 1 || Math.random() < 0.5)
      this.fx.tracer(start.clone(), end.clone(), wpn.tracer, sniper ? 0.35 : 0.07, sniper ? 0.035 : 0.022);
    if (kind === 'target') {
      const dist = t + (opts.distOffset || 0);
      const [f0, f1] = wpn.falloff;
      let m = 1;
      if (dist > f0) m = Math.max(wpn.minMult, 1 - (1 - wpn.minMult) * Math.min(1, (dist - f0) / (f1 - f0)));
      const dmg = wpn.dmg * m * (head ? wpn.head : 1);
      const shielded = (obj.shield || 0) > 0;
      obj.takeDamage(dmg, shooter, { head, weapon: wpn.name, kind: 'gun', dist });
      this.fx.blood(end, shielded);
    } else if (kind === 'shieldwall') {
      obj.damage(wpn.dmg);
      this.fx.sparks(end, new THREE.Color(TEAM_COLORS[obj.team]).multiplyScalar(3).toArray(), 6, 3);
    } else if (kind === 'world') {
      this.fx.impact(end, _n, true);
    }
  }

  explosion(p, r, dmg, owner, opts = {}) {
    const c = opts.color || [4, 2.2, 0.8];
    this.fx.explosion(p, r, c);
    if (!opts.quiet) this.sfx('explode', p, 1);
    const pd = this.player.pos.distanceTo(p);
    if (pd < r * 4) this.shake(0.6 * (1 - pd / (r * 4)));
    if (opts.noDamage) return;
    for (const t of this.targets) {
      if (!t.alive || (owner && t.team === owner.team)) continue;
      const c2 = t.center(_a);
      const d = c2.distanceTo(p);
      if (d > r || !this.los(p, c2, -1)) continue;
      if (t.isSoldier) {
        _b.copy(c2).sub(p).setY(0).normalize();
        t.vel.x += _b.x * 6; t.vel.z += _b.z * 6; t.vel.y += 3; t.onGround = false;
      }
      t.takeDamage(dmg * (1 - 0.6 * d / r), owner, { weapon: opts.weapon || 'Explosion', kind: 'explosive' });
    }
  }

  // ── events ───────────────────────────────────────────────────────────────
  onFire(s) {
    const w = s.weapon;
    this.sfx(w.sound, s.isPlayer ? null : s.pos, s.isPlayer ? 0.5 : 0.9);
    if (s.isPlayer) {
      this.vm.onFire(s);
      this.shake(w.scope ? 0.25 : w.id === 'shotgun' ? 0.2 : 0.035);
      this.fx.flash(this.muzzleFor(s, null, _a), [4, 2.6, 1.2], 4, 0.05);
    } else if (Math.random() < 0.5) {
      this.fx.flash(this.muzzleFor(s, s.eyePos(_e), _a), [4, 2.6, 1.2], 4, 0.05);
      this.fx.spark(this.muzzleFor(s, s.eyePos(_e), _a), [4, 2.8, 1.2], 1, 0.25, 0.05);
    }
  }
  onDamage(victim, amount, attacker, info) {
    if (attacker && attacker.isPlayer && victim !== attacker) {
      const kill = victim.hp <= 0;
      this.hud.hitmarker(info.head, kill);
      if (!info.dot) this.sfx(info.head ? 'headshot' : 'hit', null, 0.5);
      this.hud.damageNumber(victim.headPos(_a).setY(victim.headPos(_a).y + 0.4), amount, info.head, victim.shield > 0);
    }
    if (victim.isPlayer) {
      this.hud.hurt(attacker && attacker.pos ? attacker.pos : null, amount);
      if (!info.dot) {
        this.sfx('hitTaken', null, 0.7);                                     // thump on you
        if (attacker && attacker.pos && info.kind === 'gun') this.sfx('crack', attacker.pos, 1.4); // crack from the shooter's side
      }
      this.shake(Math.min(0.3, amount / 120));
    }
    if (victim.brain) victim.brain.onDamaged(attacker);
  }
  onShieldBreak(victim, attacker) {
    if ((attacker && attacker.isPlayer) || victim.isPlayer) this.sfx('shieldbreak', null, 0.5);
    this.fx.sparks(victim.center(_a), [0.8, 2.2, 4.5], 18, 4);
  }
  onKill(victim, killer, info = {}) {
    const self = !killer || killer === victim;
    if (!self && killer.team !== victim.team) this.score[killer.team]++;
    else if (self) this.score[1 - victim.team]++;
    if (killer && killer.isSoldier && !self) { killer.kills++; killer.streak++; }
    for (const [s, t] of victim.damagers) {
      if (s !== killer && s.isSoldier && s.team !== victim.team && this.time - t < 8) s.assists++;
    }
    this.hud.killfeed(self ? null : killer, victim, info.weapon || '', info.head);
    if (killer === this.player && !self) {
      this.sfx('kill', null, 0.6);
      const multi = this.time - this.lastKillT < 4 ? this.multi + 1 : 1;
      this.multi = multi; this.lastKillT = this.time;
      const meleeNames = { 'BOUNCE PUNCH': 'BOUNCE PUNCH KO', 'WALL SLAM': 'WALL SLAM KO', 'AIR PUNCH': 'AIR PUNCH KO', 'CHARGE PUNCH': 'CHARGE PUNCH KO', 'PUNCH': 'KNOCKOUT' };
      let title = info.head ? 'HEADSHOT' : info.melee ? meleeNames[info.melee] || 'KNOCKOUT' : 'ELIMINATED';
      if (multi === 2) title = 'DOUBLE KILL'; else if (multi === 3) title = 'TRIPLE KILL'; else if (multi >= 4) title = 'RAMPAGE';
      const sub = `${victim.name.toUpperCase()}${info.dist > 150 ? ` · ${Math.round(info.dist)} m` : ''}`;
      this.hud.medal(title, sub);
      if (killer.streak === 5) setTimeout(() => this.hud.medal('KILLING SPREE', '5 in a row'), 600);
      if (killer.streak === 10) setTimeout(() => this.hud.medal('UNSTOPPABLE', '10 in a row'), 600);
    }
    if (victim === this.player) {
      const dist = !self && killer?.pos ? killer.pos.distanceTo(victim.pos) : 0;
      this.hud.showDeath(self ? null : killer, info, dist);
      this.killCam = self ? null : killer;
      this.deathPos = victim.pos.clone();
      this.deathEye = victim.eyePos(new THREE.Vector3());
      this.deathT = 0;
      if (killer && killer.isSoldier && !self) { killer.revealed = this.respawnTime + 0.5; killer.revealedBy = victim.team; killer.spotted = this.respawnTime; }
    }
    if (victim.xray) victim.xray.visible = false;
    if (!this.mode && (this.score[0] >= KILL_LIMIT || this.score[1] >= KILL_LIMIT)) setTimeout(() => this.endMatch(), 1200);
  }
  onPunch(s, target, kind, label) {
    const big = kind !== 'PUNCH';
    this.sfx(target ? (big ? 'bigpunch' : 'punch') : 'whiff', s.isPlayer ? null : s.pos, s.isPlayer ? 0.7 : 1);
    if (s.isPlayer) {
      this.vm.onPunch();
      if (target) {
        this.shake(big ? 0.45 : 0.15);
        if (big || label.startsWith('COMBO')) this.hud.medal(label);
      }
    }
    if (target) {
      const c = target.center(_a);
      this.fx.sparks(c, big ? [4, 2.6, 0.8] : [3, 3, 3], big ? 26 : 10, big ? 7 : 4);
      if (big) this.fx.shockwave(c, 1.6, [4, 2.6, 0.8], 0.25);
      if (target.isPlayer) this.shake(big ? 0.6 : 0.25);
    }
  }
  onWallBounce(s) {
    this.sfx('walljump', s.isPlayer ? null : s.pos, 0.8);
    this.fx.sparks(_a.set(s.pos.x, s.pos.y + 0.8, s.pos.z), [3, 2.4, 1.2], 10, 3);
    if (s.isPlayer) this.shake(0.08);
  }
  onWallSlam(victim, by) {
    this.sfx('slam', victim.pos, 1);
    const c = victim.center(_a);
    this.fx.puff(c, [0.5, 0.48, 0.45], 10, 2.5, 0.8, 1.2);
    this.fx.sparks(c, [4, 3, 1.5], 20, 6);
    if (by && by.isPlayer) this.hud.medal('WALL SLAM', '+bonus damage');
    if (victim.isPlayer) this.shake(0.7);
  }
  onAbilityUsed(s, id) { if (s.isPlayer) this.sfx('ability', null, 0.4); }
  onDecoyHit(decoy, attacker) {
    if (attacker && attacker.isPlayer) { this.hud.hitmarker(false, false); this.sfx('hit', null, 0.4); }
  }
  onTurretHit(t, attacker) {
    if (attacker && attacker.isPlayer) { this.hud.hitmarker(false, t.hp <= 0); this.sfx('hit', null, 0.4); }
    this.fx.sparks(t.center(_a), [4, 3, 1.5], 4, 4);
  }
  onTurretDestroyed(t, attacker) {
    if (attacker && attacker.isPlayer) this.hud.medal('SENTRY DESTROYED');
  }
  onLockChange(locked) {
    if (this.over || this.disposed) return;
    this.paused = !locked;
    this.pauseEl.classList.toggle('hidden', locked);
    if (!locked) this.pauseEl.querySelector('.pause-msg').textContent = 'PAUSED — click to resume';
    if (locked) this.audio.startAmbient(this.theme.ambient);
    if (!locked) { /* paused */ } else if (!this.started) { this.started = true; this.sfx('start', null, 0.6); this.hud.medal('MATCH START', this.mode ? (this.mode.roleOf(this.player.team) === 'attack' ? 'BREACH · You are ATTACKING — wait for the gates' : 'BREACH · You are DEFENDING — set up!') : `First team to ${KILL_LIMIT} eliminations`); }
  }

  endMatch() {
    if (this.over) return;
    this.over = true; this.paused = true;
    document.exitPointerLock?.();
    this.pauseEl.classList.add('hidden');
    const won = this.mode ? this.mode.winner() : this.score[0] === this.score[1] ? null : this.score[0] > this.score[1] ? 0 : 1;
    const mvp = [...this.soldiers].sort((a, b) => (b.kills * 2 + b.assists) - (a.kills * 2 + a.assists))[0];
    const el = document.getElementById('endscreen');
    el.innerHTML = `<h1 style="color:${won === null ? '#fff' : TEAM_CSS[won]}">${won === null ? 'DRAW' : won === this.player.team ? 'VICTORY' : 'DEFEAT'}</h1>
      ${this.mode ? `<div class="mvp">${this.mode.summary()}</div>` : ''}<div class="mvp">${TEAM_NAMES[0]} ${this.score[0]} — ${this.score[1]} ${TEAM_NAMES[1]} · MVP: <b>${mvp.name}</b> (${mvp.kills} / ${mvp.deaths} / ${mvp.assists})</div>
      <div class="sb">${this.hud.scoreboardHTML()}</div>
      <div style="display:flex;gap:14px"><button id="againBtn">PLAY AGAIN</button><button id="changeBtn" style="background:#3a4250;color:#fff">CHANGE LOADOUT</button></div>`;
    el.classList.remove('hidden');
    el.querySelector('#againBtn').onclick = () => { el.classList.add('hidden'); this.cb.restart(); };
    el.querySelector('#changeBtn').onclick = () => { el.classList.add('hidden'); this.cb.quit(); };
  }

  dispose() {
    this.disposed = true;
    this.mode?.dispose();
    removeEventListener('resize', this.onResize);
    this.pauseEl.removeEventListener('click', this.onPauseClick);
    this.input.dispose();
    document.exitPointerLock?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.audio.stopAmbient();
    if (this.audio.ctx) this.audio.ctx.close();
    document.getElementById('hud').classList.add('hidden');
    for (const id of ['killfeed', 'medals', 'dmgnums', 'dmgdirs']) document.getElementById(id).innerHTML = '';
    this.hud.hideDeath();
  }

  // ── frame ────────────────────────────────────────────────────────────────
  loop() {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.paused && !this.over) this.step(dt);
    else this.updateCamera(0);
    this.dynamicResolution(dt);
    this.render();
  }
  step(dt) {
    this.time += dt; this.pathBudget = 1;
    if (this.mode) { this.mode.update(dt); if (this.over) return; }
    else { this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); return; } }
    const T = this.targets; T.length = 0;
    for (const s of this.soldiers) if (s.alive) T.push(s);
    for (const d of this.decoys) if (d.alive) T.push(d);
    for (const t of this.turrets) if (t.alive) T.push(t);
    for (const s of this.soldiers) { s.timeScale = 1; s.inStasis = false; }
    this.abilities.update(dt);

    const p = this.player;
    const pin = this.input.get(p);
    p.lastInput = pin;
    const vyBefore = p.vel.y;
    if (p.alive) p.update(dt, pin);
    if (p.alive) {
      if (!this.wasGround && p.onGround && vyBefore < -6) { this.vm.onLand(-vyBefore); this.sfx('land', null, 0.4); }
      this.wasGround = p.onGround;
      if (p.weapon.spinup && pin.fire && p.spin < 1 && Math.random() < 0.3) this.sfx('spin', null, 0.3);
    }
    for (const s of this.soldiers) {
      if (s.isPlayer) continue;
      if (s.alive) {
        const inp = s.brain.update(dt);
        s.lastInput = inp;
        s.update(dt, inp);
      }
    }
    for (const s of this.soldiers) {
      if (!s.alive) { s.respawnTimer -= dt; if (s.respawnTimer <= 0 && !this.over) this.respawn(s); }
      if (!s.isPlayer || this.thirdPerson || !s.alive) s.model.update(dt);
      if (s.tag) s.tag.visible = s.alive;
      if (s.glint) {
        let k = 0;
        if (s.alive && p.alive && s.adsT > 0.5) {
          const e = s.eyePos(_a), d = _b.copy(this.camera.position).sub(e); const dist = d.length(); d.multiplyScalar(1 / dist);
          k = Math.pow(Math.max(0, s.aimDir(_e).dot(d)), 60) * (this.canSee(s, p, e) ? 1 : 0);
          s.glint.position.copy(e).addScaledVector(d, 0.4);
        }
        s.glint.visible = k > 0.05; s.glint.scale.setScalar(0.03 + 0.05 * k); s.glint.material.opacity = Math.min(1, k * 1.5);
      }
      if (s.xray) {
        const show = s.alive && s.revealed > 0 && s.revealedBy === p.team;
        s.xray.visible = show;
        if (show) { s.xray.position.set(s.pos.x, s.pos.y + s.height / 2, s.pos.z); s.xray.scale.set(1, s.height / 1.8, 1); }
      }
    }
    for (const t of this.turrets) t.update(dt);
    this.map.update(this.time);
    this.fx.update(dt, this.camera, this.renderer.domElement.height / this.renderer.getPixelRatio());
    this.updateCamera(dt);
    this.vm.update(dt, p, { dx: this.input.lookDx, dy: this.input.lookDy });
    this.hud.update(dt, this.input.showBoard);
    this.audio.setListener(this.camera.position, p.yaw);
    this.audio.updateAmbient();
    _a.copy(p.alive ? p.pos : this.camera.position);
    // snap the shadow frustum to whole shadow texels in light space → shadow edges don't shimmer/crawl while moving
    if (!this._shR) { const f = this.sunDir.clone().negate(); this._shR = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(); this._shU = new THREE.Vector3().crossVectors(this._shR, f).normalize(); }
    const tx = 110 / this.Q.shadowSize; _a.y = 0;
    const cr = _a.dot(this._shR), cu = _a.dot(this._shU), dr = Math.round(cr / tx) * tx - cr, du = Math.round(cu / tx) * tx - cu;
    _a.addScaledVector(this._shR, dr).addScaledVector(this._shU, du);
    this.sun.position.set(_a.x + this.sunDir.x * 250, _a.y + this.sunDir.y * 250, _a.z + this.sunDir.z * 250);
    this.sun.target.position.copy(_a);
    this.sky.update(this.time, this.camera.position);
    this.weather.update(this.time, this.camera, this.renderer.domElement.height / this.renderer.getPixelRatio() / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.grade.uniforms.time.value = this.time;
    this.grade.uniforms.tint.value.set(...(p.inStasis ? [0.85, 1.05, 1.15] : [1, 1, 1]));
  }
  // ── noise & hearing ──
  noise(pos, radius, src) {
    for (const s of this.soldiers) {
      if (!s.alive || !s.brain || s.team === src.team) continue;
      if (s.pos.distanceTo(pos) < radius) s.brain.hear(pos, src);
    }
  }
  onFootstep(s, loud) {
    const indoor = this.map.isIndoor(s.pos.x, s.pos.z, s.pos.y);
    const surface = indoor ? 'stepTile' : 'step_' + (this.theme.stepOut || 'stone');
    if (s.isPlayer) this.sfx(surface, null, loud * 0.9);
    else if (s.pos.distanceTo(this.player.pos) < (loud >= 1 ? 40 : 22)) this.sfx(surface, s.pos, loud * 2.2);
    if (loud >= 0.5) this.noise(s.pos, loud >= 1 ? 26 : 13, s);
  }
  onCover(s, entered) {
    if (!s.isPlayer) return;
    this.sfx(entered ? 'cover' : 'step_' + (this.theme.stepOut || 'stone'), null, 0.6);
    this.input.aimOn = false;
  }
  updateCamera(dt) {
    const p = this.player, cam = this.camera;
    const tp = p.alive && p.cover && p.cover.peekK < 0.5;
    if (tp !== this.thirdPerson) { this.thirdPerson = tp; p.model.setVisible(tp || !p.alive); }
    if (tp) {
      // over-the-shoulder cover camera
      const pivot = _a.set(p.pos.x, p.pos.y + (p.cover.low ? 1.15 : 1.55), p.pos.z);
      const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const want = _b.set(pivot.x - fx * 3.1 + rx * 0.95, pivot.y - fy * 3.1 + 0.35, pivot.z - fz * 3.1 + rz * 0.95);
      _e.copy(want).sub(pivot); const d = _e.length(); _e.multiplyScalar(1 / d);
      if (this.world.raycast(pivot, _e, d + 0.2, RR)) want.copy(pivot).addScaledVector(_e, Math.max(0.3, RR.t - 0.25));
      if (!this.tpCamInit) { cam.position.copy(want); this.tpCamInit = true; } else cam.position.lerp(want, Math.min(1, dt * 14 || 1));
      cam.rotation.set(p.pitch, p.yaw, 0);
      if (Math.abs(cam.fov - this.baseFov) > 0.01) { cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
    } else if (p.alive) {
      this.tpCamInit = false;
      p.eyePos(cam.position);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (p.onGround) this.camBob += dt * sp * 1.25;
      const bobA = Math.min(1, sp / 6) * 0.03 * (1 - p.adsT * 0.9) * (p.onGround ? 1 : 0);
      cam.position.y += Math.abs(Math.sin(this.camBob)) * bobA;
      const roll = -(p.lastInput?.right || 0) * 0.012 * (1 - p.adsT);
      cam.rotation.set(p.pitch + p.swayPitch, p.yaw + p.swayYaw, roll);
      const w = p.weapon;
      let fov = this.baseFov;
      const adsV = this.baseFov * (w.adsFov / 78);
      if (w.scope) fov = p.adsT < 0.85 ? this.baseFov - (this.baseFov - this.baseFov * 0.77) * (p.adsT / 0.85) : adsV;
      else fov = this.baseFov + (adsV - this.baseFov) * p.adsT;
      if (p.sprinting) fov += 5;
      if (p.inStasis) fov -= 6;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov += (fov - cam.fov) * (w.scope && p.adsT >= 0.85 ? 1 : Math.min(1, dt * 18 || 1));
        cam.updateProjectionMatrix();
      }
    } else if (this.deathPos && this.killCam && this.killCam.pos) {
      // KILL CAM: hold your last viewpoint and zoom onto the killer (they're highlighted through walls)
      this.deathT = (this.deathT || 0) + dt;
      const k = this.killCam, tgt = k.center ? k.center(_a) : _a.copy(k.pos);
      const want = _b.copy(this.deathEye).add(_e.set(0, 0.25 + Math.min(1.2, this.deathT * 0.6), 0));
      cam.position.lerp(want, Math.min(1, dt * 4 || 1));
      cam.lookAt(tgt);
      const dist = cam.position.distanceTo(tgt);
      const zoom = Math.max(8, Math.min(this.baseFov, THREE.MathUtils.radToDeg(2 * Math.atan(3.2 / Math.max(1, dist)))));
      const f = this.baseFov + (zoom - this.baseFov) * Math.min(1, this.deathT / 0.6);
      if (Math.abs(cam.fov - f) > 0.05) { cam.fov = f; cam.updateProjectionMatrix(); }
    } else if (this.deathPos) {
      const k = this.killCam && this.killCam.alive ? this.killCam : null;
      const target = k ? k.center(_a) : _a.copy(this.deathPos).setY(this.deathPos.y + 0.5);
      const want = _b.copy(this.deathPos).add(_e.set(0, 3.2, 0));
      if (k) want.addScaledVector(_e.copy(this.deathPos).sub(k.pos).setY(0).normalize(), 2.5);
      cam.position.lerp(want, Math.min(1, dt * 3));
      cam.lookAt(target);
      if (cam.fov !== this.baseFov) { cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
    }
    if (this.shakeT > 0 && dt > 0) {
      const a = this.shakeT * this.shakeT * 0.035;
      cam.rotation.x += (Math.random() - 0.5) * a; cam.rotation.y += (Math.random() - 0.5) * a;
      this.shakeT = Math.max(0, this.shakeT - dt * 1.8);
    }
  }
  dynamicResolution(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc < 1.5) return;
    this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
    if (!this.autoQuality || this.paused) return;
    let s = this.renderScale;
    if (this.fps < 45) s = Math.max(0.55, s - 0.1);
    else if (this.fps > 58) s = Math.min(this.maxPR, s + 0.05);
    if (this.fps < 30 && this.bloom.enabled) this.bloom.enabled = false;
    if (Math.abs(s - this.renderScale) > 0.001) {
      this.renderScale = s;
      this.renderer.setPixelRatio(s); this.composer.setPixelRatio(s);
      this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
    }
  }
  render() {
    const r = this.renderer;
    this.composer.render();
    if (this.player.alive && !this.thirdPerson) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vm.scene, this.vm.cam);
      r.autoClear = true;
    }
  }
}
