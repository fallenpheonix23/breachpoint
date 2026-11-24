// 3-step loadout (Mario-Kart style): 1) weapon turntable · 2) two ability wheels · 3) map reveal + deploy
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPONS, WEAPON_ORDER, ABILITIES } from './config.js';
import { buildGun, FINISH } from './guns.js';
import { MAPS, TEST_MAPS } from './maps/index.js';

const $ = (id) => document.getElementById(id);
const CAT_COLOR = { Offensive: '#ff5a4a', 'Crowd Control': '#b06bff', Movement: '#3ad1ff', Recon: '#6bff9a' };
const AB_IDS = Object.keys(ABILITIES);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

class Turntable {
  constructor(el) {
    this.el = el;
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.1;
    el.appendChild(this.r.domElement);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.cam = new THREE.PerspectiveCamera(30, 2, 0.05, 50);
    this.cam.position.set(0, 0.45, 2.6); this.cam.lookAt(0, 0.05, 0);
    this.key = new THREE.DirectionalLight(0xffffff, 2.5); this.key.position.set(2, 3, 2); this.scene.add(this.key);
    this.rimA = new THREE.PointLight(0xffffff, 6, 6); this.rimA.position.set(-1.5, 0.6, -1.2); this.scene.add(this.rimA);
    this.rimB = new THREE.PointLight(0xffffff, 3, 6); this.rimB.position.set(1.6, -0.2, -1); this.scene.add(this.rimB);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.5));
    // pedestal
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.008, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.38; this.scene.add(ring);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.8, 0.04, 64), new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.25, metalness: 0.8 }));
    disc.position.y = -0.41; this.scene.add(disc);
    this.spin = new THREE.Group(); this.scene.add(this.spin);
    this.cur = null; this.slide = 0; this.dir = 1; this.t = 0;
    this.resize();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.loop = this.loop.bind(this);
    this.running = true;
    requestAnimationFrame(this.loop);
  }
  resize() {
    const w = this.el.clientWidth || 800, h = this.el.clientHeight || 300;
    this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  show(id, dir) {
    const g = buildGun(id).group;
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    g.position.sub(c);
    const holder = new THREE.Group(); holder.add(g);
    holder.scale.setScalar(1.9 / Math.max(size.z, 0.6)); holder.position.y = 0.05;
    if (this.cur) { this.old = this.cur; }
    this.cur = holder; this.spin.add(holder);
    this.slide = 1; this.dir = dir || 1;
    const F = FINISH[id];
    this.ringMat.color.set(F.accent).multiplyScalar(3);
    this.rimA.color.set(F.accent); this.rimB.color.set(F.accent);
  }
  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (!this.el.offsetParent) return; // hidden step
    this.t += 0.016;
    this.slide = Math.max(0, this.slide - 0.06);
    const e = this.slide * this.slide;
    this.spin.rotation.y += 0.012;
    if (this.cur) { this.cur.position.set(e * 2.5 * this.dir, Math.sin(this.t * 1.6) * 0.03, 0); this.cur.rotation.z = Math.sin(this.t) * 0.04; }
    if (this.old) {
      this.old.position.set(-(1 - e) * 2.5 * this.dir, 0, 0);
      if (this.slide === 0) { this.spin.remove(this.old); this.old = null; }
    }
    // cancel the group's spin for the sliding offset so the slide reads left/right on screen
    if (this.cur) this.cur.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.spin.rotation.y);
    if (this.old) this.old.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.spin.rotation.y);
    this.r.render(this.scene, this.cam);
  }
  dispose() { this.running = false; removeEventListener('resize', this.onResize); this.r.dispose(); this.r.forceContextLoss(); this.r.domElement.remove(); }
}

export class Loadout {
  constructor(saved, onDeploy) {
    this.onDeploy = onDeploy;
    this.step = 0;
    this.wi = Math.max(0, WEAPON_ORDER.indexOf(saved.weapon));
    const ab = (saved.abilities || []).filter((a) => ABILITIES[a]);
    this.ai = [Math.max(0, AB_IDS.indexOf(ab[0] || 'arc')), Math.max(0, AB_IDS.indexOf(ab[1] || 'grapple'))];
    this.locked = [false, false];
    this.focus = 0;
    this.map = MAPS[Math.floor(Math.random() * MAPS.length)];
    if (saved.name) $('callsign').value = saved.name;
    for (const k of ['difficulty', 'quality', 'aimMode', 'highlight', 'fov', 'renderScale']) if (saved[k] != null) $(k).value = saved[k];
    const sync = () => { $('fovVal').textContent = $('fov').value + '°'; $('rsVal').textContent = $('renderScale').value + '%'; };
    $('fov').oninput = sync; $('renderScale').oninput = sync; sync();
    this.tt = new Turntable($('turntable'));
    this.buildWeaponUI();
    this.buildWheels();
    this.bind();
    this.go(0);
  }
  // ── step 1 ──
  buildWeaponUI() {
    $('wDots').innerHTML = WEAPON_ORDER.map((_, i) => `<i data-i="${i}"></i>`).join('');
    $('wDots').onclick = (e) => { const i = e.target.dataset.i; if (i != null) this.setWeapon(+i, +i > this.wi ? 1 : -1); };
    $('wStats').innerHTML = ['DAMAGE', 'FIRE RATE', 'RANGE', 'MOBILITY'].map((n, i) => `<div class="wstat"><span>${n}</span><div class="bar"><i data-s="${i}"></i></div></div>`).join('');
    this.setWeapon(this.wi, 1);
  }
  setWeapon(i, dir) {
    this.wi = (i + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    const id = WEAPON_ORDER[this.wi], w = WEAPONS[id], F = FINISH[id];
    this.tt.show(id, dir);
    $('wRole').textContent = w.role.toUpperCase();
    $('wName').textContent = w.short;
    $('wDesc').textContent = `${w.name} — ${w.desc}`;
    const st = [w.stats.dmg, w.stats.rate, w.stats.range, w.stats.mob];
    document.querySelectorAll('#wStats i').forEach((el, k) => { el.style.width = st[k] + '%'; });
    document.querySelectorAll('#wDots i').forEach((el, k) => el.classList.toggle('on', k === this.wi));
    const acc = hex(F.accent);
    document.documentElement.style.setProperty('--accent', acc);
    document.documentElement.style.setProperty('--accent-soft', acc + '40');
  }
  // ── step 2 ──
  buildWheels() {
    this.wheels = [...document.querySelectorAll('.wheel')];
    this.wheels.forEach((wh, slot) => {
      const [l, r] = wh.querySelectorAll('.arrow');
      l.onclick = () => this.spinWheel(slot, -1);
      r.onclick = () => this.spinWheel(slot, 1);
      wh.onmouseenter = () => this.setFocus(slot);
      const cb = wh.querySelector('input');
      cb.onchange = () => { this.locked[slot] = cb.checked; this.renderWheels(); };
      wh.querySelector('.track').onclick = (e) => {
        const card = e.target.closest('.acard2');
        if (card && card.dataset.off) this.spinWheel(slot, +card.dataset.off);
      };
    });
    this.renderWheels();
  }
  spinWheel(slot, d) {
    this.ai[slot] = (this.ai[slot] + d + AB_IDS.length) % AB_IDS.length;
    this.locked[slot] = false;
    this.setFocus(slot);
    this.renderWheels();
  }
  setFocus(slot) { this.focus = slot; this.wheels.forEach((w, i) => w.classList.toggle('focus', i === slot)); }
  renderWheels() {
    this.wheels.forEach((wh, slot) => {
      const track = wh.querySelector('.track');
      let h = '';
      for (let off = -2; off <= 2; off++) {
        const id = AB_IDS[(this.ai[slot] + off + AB_IDS.length * 2) % AB_IDS.length], a = ABILITIES[id];
        const dupe = off === 0 && id === AB_IDS[this.ai[1 - slot]];
        h += `<div class="acard2 ${off === 0 ? 'center' : Math.abs(off) === 2 ? 'far' : ''} ${dupe ? 'isdupe' : ''}" data-off="${off || ''}" style="--c:${CAT_COLOR[a.cat]}">
          <div class="emblem"><div class="ring"></div><div class="ring2"></div><div class="hex"></div><div class="ic">${a.icon}</div></div>
          <div class="ac2">${a.cat.toUpperCase()} · ${a.cd}s</div><div class="an2">${a.name}</div><div class="ad2">${a.desc}</div>
          <div class="dupe">Already equipped in the other slot</div></div>`;
      }
      track.innerHTML = h;
      const dupe = AB_IDS[this.ai[0]] === AB_IDS[this.ai[1]];
      const cb = wh.querySelector('input');
      if (dupe && this.locked[slot] && slot === 1) this.locked[slot] = false;
      cb.disabled = dupe && !this.locked[slot];
      cb.checked = this.locked[slot];
      wh.classList.toggle('locked', this.locked[slot]);
    });
    const ok = this.locked[0] && this.locked[1] && this.ai[0] !== this.ai[1];
    $('toDeploy').disabled = !ok;
    $('abHint').textContent = ok ? 'Both abilities locked in — Enter to continue' : 'W/S pick a wheel · A/D browse · Space to lock in';
  }
  // ── step 3 ──
  showMap(rolling) {
    const m = this.map, card = $('mapCard');
    const [a, b, c] = m.swatch;
    card.style.setProperty('--m1', a); card.style.setProperty('--m2', b); card.style.setProperty('--m3', c);
    $('mapName').textContent = m.name; $('mapLoc').textContent = `${m.location} · ${m.mode === 'breach' ? 'Breach — attack / defend' : 'Team deathmatch'}`.toUpperCase(); $('mapDesc').textContent = m.desc;
    card.classList.toggle('rolling', !!rolling);
  }
  rollMap() {
    let n = 0;
    const order = [...MAPS];
    const final = MAPS[Math.floor(Math.random() * MAPS.length)];
    clearInterval(this.rollT);
    this.rollT = setInterval(() => {
      n++;
      this.map = n < 12 ? order[n % order.length] : final;
      this.showMap(n < 12);
      if (n >= 12) clearInterval(this.rollT);
    }, 70 + n * 4);
  }
  summary() {
    const w = WEAPONS[WEAPON_ORDER[this.wi]];
    $('loSummary').innerHTML = `<span class="chip"><b>GUN</b>${w.short}</span>` +
      this.ai.map((i, s) => `<span class="chip"><b>${s ? 'E' : 'Q'}</b>${ABILITIES[AB_IDS[i]].icon} ${ABILITIES[AB_IDS[i]].name}</span>`).join('');
  }
  // ── flow ──
  go(step) {
    this.step = step;
    ['stepWeapon', 'stepAbilities', 'stepDeploy'].forEach((id, i) => $(id).classList.toggle('hidden', i !== step));
    document.querySelectorAll('.steps .st').forEach((el) => {
      const i = +el.dataset.step; el.classList.toggle('on', i === step); el.classList.toggle('done', i < step);
    });
    if (step === 0) requestAnimationFrame(() => this.tt.resize());
    if (step === 1) { this.setFocus(this.locked[0] ? 1 : 0); this.renderWheels(); }
    if (step === 2) { this.summary(); this.rollMap(); }
  }
  bind() {
    $('wPrev').onclick = () => this.setWeapon(this.wi - 1, -1);
    $('wNext').onclick = () => this.setWeapon(this.wi + 1, 1);
    $('toAbilities').onclick = () => this.go(1);
    $('backWeapon').onclick = () => this.go(0);
    $('toDeploy').onclick = () => this.go(2);
    $('backAbilities').onclick = () => this.go(1);
    $('reroll').onclick = () => this.rollMap();
    $('deployBtn').onclick = () => this.deploy();
    this.onKey = (e) => {
      if ($('loadout').classList.contains('hidden') || e.target.matches('input, select')) return;
      const k = e.code;
      if (this.step === 0) {
        if (k === 'ArrowLeft' || k === 'KeyA') this.setWeapon(this.wi - 1, -1);
        if (k === 'ArrowRight' || k === 'KeyD') this.setWeapon(this.wi + 1, 1);
        if (k === 'Enter') this.go(1);
      } else if (this.step === 1) {
        if (k === 'ArrowUp' || k === 'KeyW') this.setFocus(0);
        if (k === 'ArrowDown' || k === 'KeyS') this.setFocus(1);
        if (k === 'ArrowLeft' || k === 'KeyA') this.spinWheel(this.focus, -1);
        if (k === 'ArrowRight' || k === 'KeyD') this.spinWheel(this.focus, 1);
        if (k === 'Space') {
          e.preventDefault();
          const dupe = this.ai[0] === this.ai[1];
          if (!dupe || this.locked[this.focus]) { this.locked[this.focus] = !this.locked[this.focus]; this.renderWheels(); if (this.locked[this.focus] && this.focus === 0) this.setFocus(1); }
        }
        if (k === 'Enter' && !$('toDeploy').disabled) this.go(2);
        if (k === 'Escape' || k === 'Backspace') this.go(0);
      } else if (this.step === 2) {
        if (k === 'Enter') this.deploy();
        if (k === 'Escape' || k === 'Backspace') this.go(1);
      }
    };
    addEventListener('keydown', this.onKey);
  }
  result() {
    return {
      weapon: WEAPON_ORDER[this.wi], abilities: this.ai.map((i) => AB_IDS[i]), map: this.map.id,
      name: ($('callsign').value || 'Player').trim().slice(0, 14), difficulty: $('difficulty').value,
      quality: $('quality').value, aimMode: $('aimMode').value, highlight: $('highlight').value,
      fov: +$('fov').value, renderScale: +$('renderScale').value,
    };
  }
  deploy() { clearInterval(this.rollT); this.onDeploy(this.result()); }
  // start straight at a given step (used by "change loadout"/autostart)
  setFromOpts(o) {
    if (o.weapon) this.setWeapon(Math.max(0, WEAPON_ORDER.indexOf(o.weapon)), 1);
    if (o.abilities?.length === 2) { this.ai = o.abilities.map((a) => Math.max(0, AB_IDS.indexOf(a))); this.locked = [true, true]; this.renderWheels(); }
    if (o.map) this.map = [...MAPS, ...TEST_MAPS].find((m) => m.id === o.map) || this.map;
  }
}
