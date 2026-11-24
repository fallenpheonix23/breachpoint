// First-person weapon + gloved hands, rendered in its own scene on top of the world.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEAM_COLORS } from './config.js';
import { buildGun } from './guns.js';

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,235,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,220,150,0.6)';
  for (let i = 0; i < 6; i++) { x.save(); x.translate(32, 32); x.rotate((i * Math.PI) / 3); x.fillRect(-2, -30, 4, 30); x.restore(); }
  return new THREE.CanvasTexture(c);
}

export class Viewmodel {
  constructor(weaponId, team) {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3228, 1.3); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff2dd, 2.4); this.key.position.set(1, 2, 0.5); this.scene.add(this.key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.9); rim.position.set(-1, 0.5, -1); this.scene.add(rim);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.gun = new THREE.Group(); this.root.add(this.gun);
    const built = buildGun(weaponId);
    this.model = built; this.gun.add(built.group);
    this.sightY = built.sightY; this.muzzle = built.muzzle;
    const glove = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.75 });
    const knuckle = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.5, metalness: 0.3 });
    const sleeve = new THREE.MeshStandardMaterial({ color: team ? 0x5a2a2c : 0x24405e, roughness: 0.8 });
    const band = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_COLORS[team]).multiplyScalar(3) });
    const rb = (w, h, d, m, x, y, z, parent, r = 0.015) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), m);
      mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    const hand = (x, y, z, rx, ry, len) => {
      const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.set(rx, ry, 0); this.gun.add(h);
      rb(0.06, 0.075, 0.09, glove, 0, 0, 0, h, 0.02);
      rb(0.062, 0.02, 0.06, knuckle, 0, 0.035, -0.01, h, 0.008);
      rb(0.07, 0.07, len, sleeve, 0, -0.01, len / 2 + 0.04, h, 0.025);
      rb(0.072, 0.016, 0.03, band, 0, 0.026, 0.08, h, 0.005);
      return h;
    };
    const fore = { ar: -0.32, smg: -0.2, hmg: -0.2, shotgun: -0.34, sniper: -0.3 }[weaponId] ?? -0.3;
    hand(0.012, -0.075, 0.1, 0.45, 0, 0.16);
    hand(-0.02, -0.055, fore, 0.7, 0.35, 0.18);
    built.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.24); this.flash.position.copy(this.muzzle); this.flash.visible = false;
    this.gun.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2, 2); this.flashLight.position.copy(this.muzzle); this.gun.add(this.flashLight);
    this.fist = new THREE.Group(); this.scene.add(this.fist);
    rb(0.095, 0.095, 0.12, glove, 0, 0, 0, this.fist, 0.03);
    rb(0.097, 0.03, 0.07, knuckle, 0, 0.035, -0.02, this.fist, 0.01);
    rb(0.085, 0.085, 0.4, sleeve, 0, -0.01, 0.25, this.fist, 0.03);
    rb(0.088, 0.02, 0.05, band, 0, 0.044, 0.1, this.fist, 0.006);
    this.fist.visible = false;
    this.gun.scale.setScalar(0.6);
    this.hip = new THREE.Vector3(0.15, -0.16, -0.46);
    this.adsPos = new THREE.Vector3(0, -this.sightY * 0.6, -0.3);
    this.t = 0; this.kick = 0; this.kickRot = 0; this.swayX = 0; this.swayY = 0; this.bob = 0; this.punchT = 0; this.flashT = 0;
    this.pump = 0; this.reloadK = 0; this.sprintK = 0; this.landK = 0;
  }
  setLighting(theme) {
    this.hemi.color.set(theme.hemi.sky); this.hemi.groundColor.set(theme.hemi.ground);
    this.hemi.intensity = 0.9 + theme.hemi.intensity * 0.5;
    this.key.color.set(theme.sun.color); this.key.intensity = 0.9 + theme.sun.intensity * 0.5;
  }
  resize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
  onFire(s) {
    const heavy = s.weapon.id === 'shotgun' || s.weapon.id === 'sniper';
    this.kick = Math.min(0.09, this.kick + (heavy ? 0.08 : 0.025));
    this.kickRot = Math.min(0.3, this.kickRot + (s.weapon.id === 'sniper' ? 0.22 : s.weapon.id === 'shotgun' ? 0.18 : 0.04));
    this.flashT = 0.05; this.flash.material.rotation = Math.random() * Math.PI;
    if (heavy) this.pump = 1;
  }
  onPunch() { this.punchT = 0.3; }
  onLand(v) { this.landK = Math.min(0.08, v * 0.006); }
  update(dt, s, look) {
    this.t += dt;
    const ads = s.adsT;
    const sp = Math.hypot(s.vel.x, s.vel.z);
    if (s.onGround) this.bob += dt * sp * 1.25;
    const bobAmt = Math.min(1, sp / 6) * (1 - ads * 0.9) * (s.onGround ? 1 : 0.2);
    this.swayX += (-look.dx * 0.0009 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (look.dy * 0.0009 - this.swayY) * Math.min(1, dt * 10);
    this.kick *= Math.exp(-dt * 14); this.kickRot *= Math.exp(-dt * 12);
    this.landK *= Math.exp(-dt * 8);
    this.reloadK += ((s.reloading ? 1 : 0) - this.reloadK) * Math.min(1, dt * 8);
    this.sprintK += ((s.sprinting ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    this.punchT -= dt;
    this.pump = Math.max(0, this.pump - dt * 1.4);
    const pos = this.hip.clone().lerp(this.adsPos, ads);
    pos.x += Math.sin(this.bob) * 0.014 * bobAmt + this.swayX * (1 - ads * 0.7);
    pos.y += Math.abs(Math.cos(this.bob)) * 0.014 * bobAmt + this.swayY * (1 - ads * 0.7) - this.landK;
    pos.y += Math.sin(this.t * 1.6) * 0.002 * (1 - ads);
    pos.z += this.kick;
    pos.y -= this.reloadK * 0.08; pos.x += this.sprintK * 0.04;
    const rx = this.kickRot - this.reloadK * 0.5 - this.sprintK * 0.25;
    const ry = this.sprintK * 0.7 + this.swayX * 2;
    let rz = this.reloadK * 0.4 + this.sprintK * 0.15;
    if (this.punchT > 0) {
      const k = 1 - this.punchT / 0.3;
      const jab = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
      pos.x += jab * 0.08; pos.y -= jab * 0.12; rz -= jab * 0.4;
      this.fist.visible = true;
      this.fist.position.set(-0.12 + jab * 0.08, -0.2 + jab * 0.1, -0.15 - jab * 0.38);
      this.fist.rotation.set(0.1, -0.15 * (1 - jab), 0);
    } else this.fist.visible = false;
    this.gun.position.copy(pos);
    this.gun.rotation.set(rx, ry, rz);
    const M = this.model;
    if (M.pump) M.pump.position.z = -0.34 + Math.sin(Math.min(1, this.pump * 1.6) * Math.PI) * 0.07 * (this.pump > 0.35 ? 1 : 0);
    if (M.bolt) M.bolt.position.z = 0.06 + (this.pump > 0.3 ? Math.sin(((this.pump - 0.3) / 0.7) * Math.PI) * 0.08 : 0);
    if (M.barrels) M.barrels.rotation.z += dt * s.spin * 40;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = this.flashT > 0 ? 3 : 0;
    this.root.visible = !(s.weapon.scope && ads > 0.85);
  }
}
