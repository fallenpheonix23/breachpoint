// HUD: vitals, ammo, abilities, crosshair, minimap, killfeed, medals, scoreboard.
import * as THREE from 'three';
import { ABILITIES, TEAM_CSS, TEAM_NAMES, KILL_LIMIT } from './config.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class HUD {
  constructor(game) {
    this.g = game;
    this.el = {};
    for (const id of ['hud', 'vignette', 'stasisTint', 'phaseFlash', 'empTint', 'scope', 'breath', 'crosshair', 'hitmarker', 'dmgdirs', 'dmgnums',
      'scoreBlue', 'scoreRed', 'blueBar', 'redBar', 'timer', 'killfeed', 'minimap', 'zoneLabel', 'zoneHint', 'playerName', 'shieldFill',
      'hpFill', 'hpText', 'stanceText', 'abilities', 'weaponName', 'ammo', 'mag', 'reloadBar', 'prompt', 'medals', 'toast', 'death',
      'deathKiller', 'deathTimer', 'scoreboard', 'noise', 'fps']) this.el[id] = $(id);
    this.cache = {};
    this.hitT = 0; this.vigT = 0; this.phaseT = 0; this.toastT = 0;
    this.dirs = []; this.nums = [];
    this.buildMinimap();
  }
  setup(player) {
    this.p = player;
    this.el.hud.classList.remove('hidden');
    this.el.playerName.textContent = player.name.toUpperCase();
    this.el.playerName.style.color = TEAM_CSS[player.team];
    this.el.weaponName.textContent = player.weapon.name.toUpperCase();
    const ab = this.el.abilities; ab.innerHTML = '';
    player.abilities.forEach((a, i) => {
      const d = ABILITIES[a.id];
      const div = document.createElement('div');
      div.className = 'ab';
      div.innerHTML = `<div class="box">${d.icon}<div class="cd"></div><div class="cdt"></div></div><div class="k">${i ? 'E' : 'Q'}</div><div class="n">${d.name}</div>`;
      ab.appendChild(div);
      a.el = div;
    });
    const p = document.createElement('div');
    p.className = 'ab punch';
    p.innerHTML = `<div class="box">👊<div class="cd"></div><div class="cdt"></div></div><div class="k">F</div><div class="n">MELEE</div>`;
    ab.appendChild(p);
    this.punchEl = p;
  }
  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    el[prop] = val;
  }
  floorIndex(y) { const fl = this.g.map.floors || [{ y: 0 }]; let f = 0; for (let i = 0; i < fl.length; i++) if (y >= fl[i].y - 0.6) f = i; return f; }
  buildMinimap(floor = 0) {
    const map = this.g.map, nav = map.nav;
    const W = nav.W, H = nav.H;
    const fl = map.floors || [{ y: 0 }], lo = fl[floor].y - 0.6, hi = floor + 1 < fl.length ? fl[floor + 1].y - 0.6 : Infinity;
    this.mmBgs = this.mmBgs || [];
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const x = off.getContext('2d');
    const img = x.createImageData(W, H), d = img.data;
    const KIND = { LONG: [128, 112, 86], MID: [86, 94, 106], SHORT: [116, 92, 80], HALL: [170, 130, 64], INDOOR: [150, 140, 120], NEST: [80, 150, 110] };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const wx = nav.x0 + (i + 0.5) * nav.cs, wz = nav.z0 + (j + 0.5) * nav.cs, k = j * W + i;
      let c;
      let n = -1;
      for (let m = nav.start[k]; m < nav.start[k + 1]; m++) if (nav.reach[m] && nav.nh[m] >= lo && nav.nh[m] < hi) { n = m; break; }
      if (n < 0) c = [22, 25, 31];
      else {
        const z = map.zoneAt(wx, wz, nav.nh[n]);
        c = z ? (z.kind === 'SPAWN' ? (wx < 0 ? [40, 74, 118] : [118, 46, 46]) : KIND[z.kind] || [90, 90, 90]) : [70, 70, 74];
      }
      const q = k * 4; d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    this.mmBgs[floor] = off; this.mmBg = off; this.mmFloor = floor;
    const c = this.el.minimap;
    this.mmScale = Math.min(1.5, 260 / W);
    c.width = Math.round(W * this.mmScale); c.height = Math.round(H * this.mmScale);
    this.mmCtx = c.getContext('2d');
  }
  drawMinimap() {
    const g = this.g, nav = g.map.nav;
    const fl = this.floorIndex(this.p.alive ? this.p.pos.y : 0);
    if (fl !== this.mmFloor) { if (this.mmBgs[fl]) { this.mmBg = this.mmBgs[fl]; this.mmFloor = fl; } else this.buildMinimap(fl); }
    const ctx = this.mmCtx, s = this.mmScale;
    const X = (x) => ((x - nav.x0) / nav.cs) * s, Z = (z) => ((z - nav.z0) / nav.cs) * s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mmBg, 0, 0, this.mmBg.width * s, this.mmBg.height * s);
    ctx.font = 'bold 9px Rajdhani'; ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.textAlign = 'center';
    const lanes = g.map.lanes;
    for (const L of Object.values(lanes)) { const p = L.pts[Math.floor(L.pts.length / 2)]; ctx.fillText(L.kind.toUpperCase(), X(0), Z(p[1]) + 3); }
    for (const n of g.map.nests) { ctx.fillStyle = n.team ? 'rgba(255,90,90,.6)' : 'rgba(90,170,255,.6)'; ctx.fillRect(X(n.x0) - 2, Z(n.z0) - 2, 4, 4); }
    for (const t of g.turrets) {
      if (!t.alive) continue;
      ctx.fillStyle = TEAM_CSS[t.team]; ctx.fillRect(X(t.pos.x) - 2.5, Z(t.pos.z) - 2.5, 5, 5);
    }
    for (const o of g.soldiers) {
      if (!o.alive || o === this.p) continue;
      const ally = o.team === this.p.team;
      if (!ally && !(o.spotted > 0 || (o.revealed > 0 && o.revealedBy === this.p.team))) continue;
      ctx.fillStyle = ally ? TEAM_CSS[o.team] : '#ff4a4a';
      ctx.beginPath(); ctx.arc(X(o.pos.x), Z(o.pos.z), ally ? 2.6 : 3, 0, 7); ctx.fill();
    }
    const p = this.p;
    if (p.alive) {
      ctx.save(); ctx.translate(X(p.pos.x), Z(p.pos.z)); ctx.rotate(-p.yaw);
      ctx.fillStyle = '#ffb84a'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(0, 2); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  hitmarker(head, kill) {
    const h = this.el.hitmarker;
    h.className = kill ? 'kill' : head ? 'head' : '';
    this.hitT = kill ? 0.35 : 0.18;
  }
  hurt(fromPos, amount = 10) {
    this.vigT = Math.min(0.9, 0.35 + amount / 60);
    if (!fromPos) return;
    let div = this.dirs.find((d) => d.t <= 0);
    if (!div) {
      if (this.dirs.length > 6) div = this.dirs[0];
      else { const el = document.createElement('div'); el.className = 'dmgdir'; el.innerHTML = '<i></i>'; this.el.dmgdirs.appendChild(el); div = { el, t: 0 }; this.dirs.push(div); }
    }
    div.t = 1.8; div.from = fromPos.clone(); div.k = Math.min(1, 0.45 + amount / 40);
  }
  damageNumber(pos, amount, head, shield) {
    let n = this.nums.find((x) => x.t <= 0);
    if (!n) {
      if (this.nums.length > 24) return;
      const el = document.createElement('div'); el.className = 'dnum'; this.el.dmgnums.appendChild(el);
      n = { el, t: 0, p: new THREE.Vector3() }; this.nums.push(n);
    }
    n.t = 0.8; n.p.copy(pos); n.p.x += (Math.random() - 0.5) * 0.4;
    n.el.textContent = Math.round(amount);
    n.el.className = 'dnum' + (head ? ' head' : shield ? ' shield' : '');
  }
  toast(msg, kind = '') {
    const t = this.el.toast;
    t.textContent = msg; t.className = kind; t.style.opacity = 1; this.toastT = 2.2;
  }
  medal(text, sub = '') {
    const m = document.createElement('div');
    m.className = 'medal'; m.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    this.el.medals.appendChild(m);
    setTimeout(() => m.remove(), 1600);
    while (this.el.medals.children.length > 3) this.el.medals.firstChild.remove();
    this.g.sfx('medal', null, 0.6);
  }
  killfeed(killer, victim, weapon, head) {
    const kf = document.createElement('div');
    kf.className = 'kf' + (killer === this.p || victim === this.p ? ' me' : '');
    const kn = killer ? (killer.isTurret ? `${TEAM_NAMES[killer.team]} SENTRY` : killer.name) : '';
    const kc = killer ? TEAM_CSS[killer.team] : '#aaa';
    kf.innerHTML = (killer && killer !== victim ? `<span style="color:${kc}">${kn}</span>` : '') +
      `<span class="w">[${weapon}${head ? ' ✦HEAD' : ''}]</span><span style="color:${TEAM_CSS[victim.team]}">${victim.name}</span>`;
    this.el.killfeed.prepend(kf);
    setTimeout(() => kf.remove(), 6000);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
  }
  flashAbility(i) {
    const a = this.p.abilities[i];
    if (!a || !a.el) return;
    a.el.classList.add('flash');
    clearTimeout(a.ft); a.ft = setTimeout(() => a.el.classList.remove('flash'), 200);
    if (!this.lastDenied || this.g.time - this.lastDenied > 0.3) { this.g.sfx('denied', null, 0.5); this.lastDenied = this.g.time; }
  }
  phaseFlash() { this.phaseT = 0.25; }
  showDeath(killer, info, dist) {
    this.el.death.classList.remove('hidden');
    const kn = killer ? (killer.isTurret ? `${TEAM_NAMES[killer.team]} SENTRY` : killer.name) : 'the map';
    const hp = killer && killer.isSoldier && killer.alive ? ` · they had <b>${Math.ceil(killer.hp + killer.shield)}</b> HP left` : '';
    this.el.deathKiller.innerHTML = killer === this.p || !killer ? 'You eliminated yourself' :
      `Killed by <b style="color:${TEAM_CSS[killer.team]}">${kn}</b> with ${info?.weapon || 'unknown'}${info?.head ? ' · <b>HEADSHOT</b>' : ''}<br>from <b>${Math.round(dist)} m</b>${hp}`;
  }
  hideDeath() { this.el.death.classList.add('hidden'); }
  scoreboardHTML() {
    const g = this.g;
    let h = '';
    for (const team of [0, 1]) {
      const rows = g.soldiers.filter((s) => s.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      h += `<table class="sbt"><tr><th class="tname" style="color:${TEAM_CSS[team]}">${TEAM_NAMES[team]} · ${g.score[team]}</th><th>WEAPON</th><th>ABILITIES</th><th>K</th><th>D</th><th>A</th><th>DMG</th></tr>`;
      for (const s of rows) {
        h += `<tr class="${s === this.p ? 'me' : ''} ${s.alive ? '' : 'dead'}"><td style="color:${TEAM_CSS[team]}">${s.name}</td><td>${s.weapon.short}</td>` +
          `<td>${s.abilities.map((a) => ABILITIES[a.id].icon).join(' ')}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td><td>${Math.round(s.damageDealt)}</td></tr>`;
      }
      h += '</table>';
    }
    return h;
  }
  update(dt, showBoard) {
    const g = this.g, p = this.p, el = this.el;
    // score + timer
    this.set('sb', el.scoreBlue, String(g.score[0])); this.set('sr', el.scoreRed, String(g.score[1]));
    this.set('bb', el.blueBar.style, `${(g.score[0] / KILL_LIMIT) * 100}%`, 'width');
    this.set('rb', el.redBar.style, `${(g.score[1] / KILL_LIMIT) * 100}%`, 'width');
    const tl = Math.max(0, Math.ceil(g.timeLeft));
    this.set('tm', el.timer, `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`);
    // vitals
    this.set('sf', el.shieldFill.style, `${(p.shield / p.maxShield) * 100}%`, 'width');
    this.set('hf', el.hpFill.style, `${(Math.max(0, p.hp) / p.maxHp) * 100}%`, 'width');
    this.set('ht', el.hpText, String(Math.max(0, Math.ceil(p.hp))));
    this.set('hl', el.hpFill, p.hp < 35 ? 'low' : '', 'className');
    const st = p.stance === 'stand' ? (p.sprinting ? 'SPRINTING' : 'STANDING') : p.stance === 'crouch' ? 'CROUCHED' : 'PRONE';
    this.set('st', el.stanceText, st + (p.empT > 0 ? ' · EMP!' : '') + (p.spawnProtect > 0 ? ' · SPAWN SHIELD' : ''));
    // ammo
    const w = p.weapon;
    this.set('am', el.ammo, String(p.ammo));
    this.set('al', el.ammo, p.ammo <= Math.ceil(w.mag * 0.2) ? 'low' : '', 'className');
    this.set('mg', el.mag, `/ ${w.mag}` + (w.spinup && p.spin > 0 && p.spin < 1 ? '  SPIN' : ''));
    el.reloadBar.style.visibility = p.reloading ? 'visible' : 'hidden';
    if (p.reloading) {
      const total = w.id === 'shotgun' ? w.shellReload : w.reload;
      el.reloadBar.firstChild.style.width = w.id === 'shotgun' ? `${(p.ammo / w.mag) * 100}%` : `${(1 - p.reloadT / total) * 100}%`;
    }
    // abilities
    p.abilities.forEach((a) => {
      const d = ABILITIES[a.id];
      const ready = a.cd <= 0 && p.empT <= 0;
      a.el.classList.toggle('ready', ready);
      const box = a.el.firstChild;
      box.children[0].style.setProperty('--p', p.empT > 0 ? '100%' : `${(a.cd / d.cd) * 100}%`);
      box.children[1].textContent = p.empT > 0 ? 'EMP' : a.cd > 0 ? Math.ceil(a.cd) : '';
    });
    this.punchEl.classList.toggle('bounce', p.wallBounceT > 0);
    this.punchEl.querySelector('.n').textContent = p.wallBounceT > 0 ? 'BOUNCE PUNCH!' : p.comboN > 0 && p.comboT > 0 ? `COMBO x${p.comboN + 1}` : 'MELEE';
    this.punchEl.querySelector('.cd').style.setProperty('--p', `${Math.max(0, p.punchCd / 0.5) * 100}%`);
    // crosshair / scope
    const scoped = w.scope && p.adsT > 0.85 && p.alive;
    el.scope.style.display = scoped ? 'block' : 'none';
    if (scoped) el.breath.style.setProperty('--b', `${(p.breath / 3) * 100}%`);
    const spread = p.spreadNow();
    const fovR = THREE.MathUtils.degToRad(g.camera.fov) / 2;
    const gap = 4 + (Math.tan(spread) / Math.tan(fovR)) * (innerHeight / 2);
    const ch = el.crosshair;
    ch.style.display = scoped || !p.alive || (p.adsT > 0.6 && w.id !== 'shotgun') ? 'none' : 'block';
    const c = ch.children;
    c[0].style.left = `${-gap - 9}px`; c[1].style.left = `${gap}px`; c[2].style.top = `${-gap - 9}px`; c[3].style.top = `${gap}px`;
    // hitmarker / vignette / tints
    this.hitT -= dt; el.hitmarker.style.opacity = this.hitT > 0 ? 1 : 0;
    this.vigT -= dt;
    const lowHp = p.alive && p.hp < 35 ? 0.35 + Math.sin(g.time * 6) * 0.1 : 0;
    el.vignette.style.opacity = Math.max(lowHp, Math.max(0, this.vigT));
    el.stasisTint.style.opacity = p.inStasis ? 1 : 0;
    el.empTint.style.opacity = p.empT > 0 ? 1 : 0;
    this.phaseT -= dt; el.phaseFlash.style.opacity = Math.max(0, this.phaseT * 4);
    this.toastT -= dt; if (this.toastT <= 0) el.toast.style.opacity = 0;
    // damage direction arcs
    for (const d of this.dirs) {
      d.t -= dt;
      if (d.t <= 0) { d.el.style.display = 'none'; continue; }
      d.el.style.display = 'block';
      const dx = d.from.x - p.pos.x, dz = d.from.z - p.pos.z;
      const ang = Math.atan2(-dx, -dz) - p.yaw;
      d.el.style.transform = `rotate(${-ang}rad) scale(${0.9 + 0.3 * d.k})`;
      d.el.style.opacity = Math.min(1, d.t) * d.k;
    }
    // floating damage numbers
    for (const n of this.nums) {
      if (n.t <= 0) { n.el.style.display = 'none'; continue; }
      n.t -= dt; n.p.y += dt * 1.2;
      _v.copy(n.p).project(g.camera);
      if (_v.z > 1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = 'block';
      n.el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`; n.el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
      n.el.style.opacity = Math.min(1, n.t * 2.5);
    }
    // zone + prompts
    const z = g.map.zoneAt(p.pos.x, p.pos.z, p.pos.y);
    this.set('zl', el.zoneLabel, z ? z.name : '');
    this.set('zh', el.zoneHint, z ? z.hint : '');
    let prompt = '';
    this.coverT = (this.coverT || 0) - dt;
    if (this.coverT <= 0 && p.alive && !p.cover) { this.coverT = 0.2; this.canCover = !!p.coverProbe(); }
    if (p.alive && p.cover) {
      const c = p.cover;
      if (p.cornerTarget()) prompt = '<b>F — CORNER TAKEDOWN</b>';
      else if (c.peekK > 0.5) prompt = c.low ? 'Popped up — release aim to duck' : 'Peeking — release aim to return to cover';
      else if (c.low) prompt = '<b>LOW COVER</b> — aim [RMB / Tab / Caps] to pop up · A/D slide · X leave';
      else if (c.edge !== 0) prompt = '<b>CORNER</b> — aim [RMB / Tab / Caps] to peek · F takedown enemies rounding the corner · X leave';
      else prompt = '<b>IN COVER</b> — A/D slide to an edge to peek · X leave';
    } else if (p.alive) {
      const nest = g.map.nestAt(p.pos.x, p.pos.z);
      const cover = !nest && g.map.coverAt(p.pos.x, p.pos.z);
      if (nest) prompt = p.stance === 'stand' ? '<b>SNIPER NEST</b> — <b>Z</b> go prone · <b>C</b> crouch — peek through the slits' : '<b>SNIPER NEST</b> · braced — aim sway reduced';
      else if (cover && p.stance === 'stand') prompt = '<b>COVER SPOT</b> — <b>C</b> crouch behind the sandbags';
      else if (p.wallBounceT > 0) prompt = '<b>BOUNCE PUNCH READY</b> — hit <b>F</b>';
      else if (this.canCover && p.onGround && Math.hypot(p.vel.x, p.vel.z) < 4) prompt = '<b>X</b> — take cover';
    }
    this.set('pr', el.prompt, prompt, 'innerHTML');
    el.prompt.style.display = prompt ? 'block' : 'none';
    // scoreboard
    if (showBoard) {
      el.scoreboard.classList.remove('hidden');
      this.sbT = (this.sbT || 0) - dt;
      if (this.sbT <= 0) { el.scoreboard.innerHTML = this.scoreboardHTML(); this.sbT = 0.5; }
    } else { el.scoreboard.classList.add('hidden'); this.sbT = 0; }
    if (!p.alive) this.set('dt', el.deathTimer, `Respawning in ${Math.max(0, p.respawnTimer).toFixed(1)}s`);
    const nz = p.alive ? p.noise : 0;
    const lvl = p.cover || (nz < 0.15) ? 'SILENT' : nz < 0.7 ? 'QUIET' : 'LOUD';
    const bars = [0, 1, 2, 3, 4].map((k) => `<i class="${k < Math.ceil(nz * 5) ? 'on' : ''}"></i>`).join('');
    this.set('nz', el.noise, `<span class="nl ${lvl.toLowerCase()}">${lvl}</span>${bars}`, 'innerHTML');
    this.set('fps', el.fps, `${Math.round(g.fps)} FPS · ${Math.round(g.renderScale * 100)}%`);
    this.drawMinimap();
  }
}
