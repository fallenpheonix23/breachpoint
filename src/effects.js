// GPU particles, tracers, flashes, lightning, shockwaves, decals.
import * as THREE from 'three';
import { TEAM_COLORS } from './config.js';

const VS = `
attribute float size; attribute vec4 pcolor; uniform float uScale; varying vec4 vC;
void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `
varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }`;

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3); this.size0 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.grow = new Float32Array(max); this.alpha0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol); g.setAttribute('size', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    scene.add(this.points);
  }
  spawn(p, v, c, size, life, grav, drag, grow = 0, alpha = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.base[i * 3] = c[0]; this.base[i * 3 + 1] = c[1]; this.base[i * 3 + 2] = c[2];
    this.size0[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag;
    this.grow[i] = grow; this.alpha0[i] = alpha;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          for (const [arr, k] of [[this.pos, 3], [this.vel, 3], [this.base, 3]]) for (let q = 0; q < k; q++) arr[i * k + q] = arr[j * k + q];
          this.size0[i] = this.size0[j]; this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
          this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.grow[i] = this.grow[j]; this.alpha0[i] = this.alpha0[j];
        }
        continue;
      }
      const k = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - t));
      this.col[i * 4] = this.base[i * 3]; this.col[i * 4 + 1] = this.base[i * 3 + 1]; this.col[i * 4 + 2] = this.base[i * 3 + 2];
      this.col[i * 4 + 3] = this.alpha0[i] * Math.min(1, t * 1.6);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

export class Effects {
  constructor(game) {
    this.g = game;
    const scene = game.scene;
    this.add = new Particles(scene, 4000, true);
    this.smoke = new Particles(scene, 1200, false);
    // tracers
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, 0.5);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.tracers.push({ m, life: 0, max: 0 });
    }
    this.ti = 0;
    // pooled lights (fixed count avoids shader recompiles)
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l); this.lights.push({ l, life: 0, max: 1, power: 0 });
    }
    this.li = 0;
    // decals
    this.decals = [];
    const dg = new THREE.PlaneGeometry(0.14, 0.14);
    const dm = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    for (let i = 0; i < 120; i++) { const m = new THREE.Mesh(dg, dm); m.visible = false; scene.add(m); this.decals.push(m); }
    this.di = 0;
    // transient meshes (lightning, shockwaves, cones)
    this.transients = [];
    this.shockGeo = new THREE.SphereGeometry(1, 24, 16);
    this.ringGeo = new THREE.TorusGeometry(1, 0.03, 6, 48);
  }
  particle(p, v, c, size, life, grav = 0, drag = 0, grow = 0) { this.add.spawn(p, v, c, size, life, grav, drag, grow); }
  spark(p, c, speed, size, life) {
    this.add.spawn(p, { x: (Math.random() - 0.5) * speed, y: (Math.random() - 0.5) * speed, z: (Math.random() - 0.5) * speed }, c, size, life, 0, 1);
  }
  sparks(p, c, n, speed, grav = 9) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.3 + Math.random()));
      this.add.spawn(p, v, c, 0.05 + Math.random() * 0.06, 0.25 + Math.random() * 0.35, grav, 2);
    }
  }
  puff(p, c, n, speed, size, life) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * Math.random());
      v.y = Math.abs(v.y) * 0.6;
      this.smoke.spawn(p, v, c, size * (0.6 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.6), -0.4, 1.5, 1.6, 0.55);
    }
  }
  tracer(a, b, c, life = 0.07, width = 0.022) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    const len = a.distanceTo(b);
    if (len < 0.05) return;
    t.m.position.copy(a);
    t.m.lookAt(b);
    t.m.scale.set(width, width, len);
    t.m.material.color.setRGB(c[0], c[1], c[2]);
    t.m.material.opacity = 1;
    t.m.visible = true; t.life = life; t.max = life;
  }
  flash(p, c, power, life) {
    const L = this.lights[this.li++ % this.lights.length];
    L.l.position.copy(p); L.l.color.setRGB(Math.min(1, c[0] / 4), Math.min(1, c[1] / 4), Math.min(1, c[2] / 4));
    L.power = power; L.l.intensity = power; L.l.distance = 6 + power; L.life = life; L.max = life;
  }
  decal(p, n) {
    const m = this.decals[this.di++ % this.decals.length];
    m.position.set(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    m.visible = true;
  }
  impact(p, n, wall) {
    const c = [3, 2.2, 1.2];
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3(n.x, n.y, n.z).multiplyScalar(3 + Math.random() * 4).add(new THREE.Vector3().randomDirection().multiplyScalar(2.5));
      this.add.spawn(p, v, c, 0.04 + Math.random() * 0.04, 0.15 + Math.random() * 0.2, 12, 2);
    }
    this.puff(p, [0.55, 0.52, 0.48], 2, 0.8, 0.35, 0.6);
    if (wall) this.decal(p, n);
  }
  blood(p, shielded) {
    const c = shielded ? [0.8, 2.2, 4] : [2.8, 0.3, 0.2];
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1.5 + Math.random() * 2.5);
      this.add.spawn(p, v, c, 0.05 + Math.random() * 0.05, 0.25 + Math.random() * 0.2, 6, 2);
    }
  }
  explosion(p, r, c = [4, 2.2, 0.8]) {
    this.flash(p, c, 30, 0.3);
    for (let i = 0; i < 50; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(r * (1 + Math.random() * 2));
      this.add.spawn(p, v, c, 0.12 + Math.random() * 0.15, 0.3 + Math.random() * 0.4, 6, 3);
    }
    for (let i = 0; i < 26; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(r * 0.8 * Math.random());
      this.add.spawn(p, v, [c[0] * 0.6, c[1] * 0.5, c[2] * 0.4], r * 0.35, 0.35, -1, 2, 1.5);
    }
    this.puff(p, [0.25, 0.24, 0.23], 16, r * 0.7, r * 0.6, 1.6);
    this.shockwave(p, r * 1.2, c, 0.3);
  }
  lightning(a, b, c) {
    const pts = [a.clone()];
    const n = 8;
    for (let i = 1; i < n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.add(new THREE.Vector3().randomDirection().multiplyScalar(0.35));
      pts.push(p);
    }
    pts.push(b.clone());
    for (let i = 0; i < pts.length - 1; i++) this.tracer(pts[i], pts[i + 1], c, 0.22, 0.035);
    for (let i = 0; i < 8; i++) this.spark(b, c, 6, 0.08, 0.3);
  }
  shockwave(p, r, c, life = 0.5) {
    const m = new THREE.Mesh(this.shockGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * 0.35, c[1] * 0.35, c[2] * 0.35), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p); m.scale.setScalar(0.1);
    this.g.scene.add(m);
    this.transients.push({ m, life, max: life, kind: 'grow', r });
  }
  cone(p, dir, c) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(p); m.lookAt(p.clone().add(dir));
      this.g.scene.add(m);
      this.transients.push({ m, life: 0.35, max: 0.35, kind: 'cone', dir: dir.clone(), delay: i * 0.05, origin: p.clone() });
    }
    for (let i = 0; i < 40; i++) {
      const v = dir.clone().multiplyScalar(14 + Math.random() * 10).add(new THREE.Vector3().randomDirection().multiplyScalar(5));
      this.add.spawn(p, v, c, 0.08, 0.35, 0, 3);
    }
  }
  phaseTrail(a, b, team) {
    const c = new THREE.Color(TEAM_COLORS[team]).multiplyScalar(3).toArray();
    for (let i = 0; i <= 20; i++) {
      const p = a.clone().lerp(b, i / 20); p.y += 0.3 + Math.random() * 1.4;
      this.add.spawn(p, new THREE.Vector3().randomDirection().multiplyScalar(0.6), c, 0.12, 0.5, 0, 1);
    }
  }
  update(dt, camera, height) {
    const s = height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    this.add.mat.uniforms.uScale.value = s; this.smoke.mat.uniforms.uScale.value = s;
    this.add.update(dt); this.smoke.update(dt);
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.m.visible = false; else t.m.material.opacity = t.life / t.max;
    }
    for (const L of this.lights) {
      if (L.life <= 0) { L.l.intensity = 0; continue; }
      L.life -= dt; L.l.intensity = L.power * Math.max(0, L.life / L.max);
    }
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const t = this.transients[i];
      if (t.delay > 0) { t.delay -= dt; t.m.visible = false; continue; }
      t.m.visible = true;
      t.life -= dt;
      const k = 1 - Math.max(0, t.life / t.max);
      if (t.kind === 'grow') { t.m.scale.setScalar(Math.max(0.1, t.r * k)); t.m.material.opacity = 0.6 * (1 - k); }
      else if (t.kind === 'cone') {
        t.m.position.copy(t.origin).addScaledVector(t.dir, k * 8);
        t.m.scale.setScalar(0.3 + k * 4); t.m.material.opacity = 0.8 * (1 - k);
      }
      if (t.life <= 0) { this.g.scene.remove(t.m); t.m.material.dispose(); this.transients.splice(i, 1); }
    }
  }
}
