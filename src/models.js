// Third-person soldier + turret models (rounded armour, team colourways, real weapon models).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEAM_COLORS } from './config.js';
import { buildGun } from './guns.js';

let cache = {};
// Enemy-visibility highlight: 'standard' | 'strong' | 'off'. The player is always on team 0 (blue),
// so team 1 (red) is always the enemy. Soldier materials ignore distance fog.
let HIGHLIGHT = 'standard';
export function setHighlight(level) { HIGHLIGHT = level || 'standard'; cache = {}; }
function addRim(mat, color, strength, base) {
  if (strength <= 0 && base <= 0) return mat;
  const rim = new THREE.Color(color).multiplyScalar(strength), flat = new THREE.Color(color).multiplyScalar(base);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rim }; sh.uniforms.flatColor = { value: flat };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform vec3 flatColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))); totalEmissiveRadiance += rimColor * pow(rim, 2.0) + flatColor; }');
  };
  mat.customProgramCacheKey = () => `rim-${strength}-${base}-${color}`;
  return mat;
}
function mats(team) {
  if (cache[team]) return cache[team];
  const tc = new THREE.Color(TEAM_COLORS[team]);
  const enemy = team === 1;
  const lv = { standard: enemy ? [1.6, 0] : [0.6, 0], strong: enemy ? [3.2, 0.22] : [0.8, 0], off: [0, 0] }[HIGHLIGHT] || [1.6, 0];
  const R = (m) => { m.fog = false; return addRim(m, TEAM_COLORS[team], lv[0], lv[1]); };
  const m = {
    armor: R(new THREE.MeshStandardMaterial({ color: team ? 0x8c2a2a : 0x1f3f6a, roughness: 0.45, metalness: 0.3 })),
    plate: R(new THREE.MeshStandardMaterial({ color: team ? 0xff5a3a : 0x3f8ae0, roughness: 0.35, metalness: 0.35 })),
    cloth: R(new THREE.MeshStandardMaterial({ color: team ? 0x6a3a32 : 0x34485a, roughness: 0.9 })),
    under: R(new THREE.MeshStandardMaterial({ color: team ? 0x3a2020 : 0x1b2430, roughness: 0.8 })),
    gear: R(new THREE.MeshStandardMaterial({ color: team ? 0x8a5a40 : 0x5a6a58, roughness: 0.85 })),
    glow: new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(4.5), fog: false }),
    visor: R(new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 0.05, metalness: 0.9, emissive: tc.clone().multiplyScalar(0.8) })),
  };
  cache[team] = m;
  return m;
}
const G = {};
const rbox = (w, h, d, r) => { const k = `${w}|${h}|${d}|${r}`; return G[k] || (G[k] = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1))); };
const caps = (r, l) => { const k = `c${r}|${l}`; return G[k] || (G[k] = new THREE.CapsuleGeometry(r, l, 4, 10)); };

export class SoldierModel {
  constructor(game, s) {
    this.s = s;
    const M = mats(s.team);
    const add = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    this.root = new THREE.Group();
    this.pose = new THREE.Group(); this.root.add(this.pose);
    this.hips = new THREE.Group(); this.hips.position.y = 0.95; this.pose.add(this.hips);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    add(rbox(0.46, 0.6, 0.28, 0.1), M.cloth, 0, 0.32, 0, this.torso);
    add(rbox(0.5, 0.36, 0.32, 0.08), M.armor, 0, 0.42, 0, this.torso);       // vest
    add(rbox(0.4, 0.22, 0.06, 0.03), M.plate, 0, 0.46, -0.18, this.torso);   // chest plate
    add(rbox(0.3, 0.03, 0.02, 0.01), M.glow, 0, 0.36, -0.215, this.torso);
    for (const x of [-0.13, 0, 0.13]) add(rbox(0.1, 0.11, 0.06, 0.02), M.gear, x, 0.26, -0.18, this.torso); // pouches
    add(rbox(0.34, 0.4, 0.17, 0.06), M.gear, 0, 0.38, 0.22, this.torso);     // pack
    add(rbox(0.04, 0.26, 0.02, 0.01), M.glow, 0.11, 0.4, 0.31, this.torso);
    add(rbox(0.52, 0.1, 0.32, 0.04), M.under, 0, 0.05, 0, this.torso);       // belt
    for (const x of [-0.29, 0.29]) add(rbox(0.16, 0.12, 0.26, 0.05), M.plate, x, 0.6, 0, this.torso); // shoulder pads
    this.head = new THREE.Group(); this.head.position.y = 0.73; this.torso.add(this.head);
    add(rbox(0.22, 0.24, 0.24, 0.08), M.under, 0, -0.02, 0, this.head);
    add(rbox(0.28, 0.2, 0.3, 0.1), M.armor, 0, 0.06, 0.01, this.head);        // helmet
    add(rbox(0.29, 0.03, 0.31, 0.01), M.plate, 0, 0.0, 0.01, this.head);
    add(rbox(0.24, 0.08, 0.05, 0.025), M.visor, 0, -0.01, -0.13, this.head);
    add(rbox(0.2, 0.012, 0.02, 0.004), M.glow, 0, -0.01, -0.158, this.head);
    add(rbox(0.03, 0.14, 0.03, 0.01), M.under, 0.13, 0.15, 0.06, this.head);   // antenna
    this.armR = new THREE.Group(); this.armR.position.set(0.3, 0.56, 0); this.torso.add(this.armR);
    this.armL = new THREE.Group(); this.armL.position.set(-0.3, 0.56, 0); this.torso.add(this.armL);
    for (const a of [this.armR, this.armL]) {
      add(caps(0.065, 0.24), M.cloth, 0, -0.17, 0, a);
      add(rbox(0.12, 0.08, 0.12, 0.03), M.under, 0, -0.36, 0, a);
    }
    this.armR.rotation.set(-1.2, 0, 0.15); this.armL.rotation.set(-1.35, 0, -0.5);
    this.gun = new THREE.Group(); this.gun.position.set(0.1, 0.42, -0.36); this.torso.add(this.gun);
    const gm = buildGun(s.weaponId).group; gm.scale.setScalar(1.15); this.gun.add(gm);
    this.legs = [];
    for (const sx of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(0.13 * sx, 0, 0); this.hips.add(thigh);
      add(caps(0.09, 0.3), M.cloth, 0, -0.24, 0, thigh);
      add(rbox(0.15, 0.12, 0.08, 0.03), M.armor, 0, -0.42, -0.07, thigh);      // knee pad
      const shin = new THREE.Group(); shin.position.y = -0.48; thigh.add(shin);
      add(caps(0.075, 0.3), M.cloth, 0, -0.22, 0, shin);
      add(rbox(0.16, 0.12, 0.28, 0.05), M.under, 0, -0.43, -0.04, shin);      // boot
      this.legs.push({ thigh, shin });
    }
    this.walk = 0; this.deathT = 0;
    game.scene.add(this.root);
  }
  setVisible(v) { this.root.visible = v; }
  update(dt) {
    const s = this.s;
    this.root.position.copy(s.pos);
    this.root.rotation.y = s.cover ? s.cover.yaw : s.yaw;
    if (!s.alive) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT * 2.5);
      this.pose.rotation.x = k * k * (Math.PI / 2 - 0.1);
      this.pose.position.y = 0;
      this.root.visible = this.deathT < 3.2;
      return;
    }
    this.deathT = 0;
    const sp = Math.hypot(s.vel.x, s.vel.z);
    this.walk += dt * (2 + sp * 1.6);
    const amp = Math.min(1, sp / 6) * 0.7;
    const swing = Math.sin(this.walk) * amp;
    const st = s.stance;
    const lerp = (a, b) => a + (b - a) * Math.min(1, dt * 12);
    if (st === 'prone') {
      this.pose.rotation.x = lerp(this.pose.rotation.x, -Math.PI / 2);
      this.pose.position.y = 0.18; this.pose.position.z = lerp(this.pose.position.z, 0.85);
      this.hips.position.y = 0.95;
      for (let i = 0; i < 2; i++) { this.legs[i].thigh.rotation.x = swing * 0.3 * (i ? 1 : -1); this.legs[i].shin.rotation.x = 0; }
      this.torso.rotation.x = 0; this.head.rotation.x = 0.9;
    } else {
      this.pose.rotation.x = lerp(this.pose.rotation.x, 0);
      this.pose.position.y = 0; this.pose.position.z = lerp(this.pose.position.z, 0);
      const crouch = st === 'crouch';
      this.hips.position.y = lerp(this.hips.position.y, crouch ? 0.6 : 0.95);
      for (let i = 0; i < 2; i++) {
        const sg = i ? 1 : -1;
        const base = crouch ? (i ? 1.3 : 0.6) : 0;
        this.legs[i].thigh.rotation.x = base + swing * sg * (s.onGround ? 1 : 0.2);
        this.legs[i].shin.rotation.x = crouch ? (i ? -2.0 : -1.4) : -Math.max(0, -swing * sg) * 1.2;
      }
      if (!s.onGround) { this.legs[0].thigh.rotation.x = 0.5; this.legs[0].shin.rotation.x = -0.9; }
      this.torso.rotation.x = s.cover ? 0.15 : -s.pitch * 0.35;
      this.head.rotation.x = s.cover ? 0 : s.pitch * 0.4;
      this.torso.rotation.z = lerp(this.torso.rotation.z, s.cover && s.cover.peek ? -s.cover.edge * 0.25 : 0);
    }
    this.armR.rotation.x = -1.2 + (s.punchAnim > 0 ? -0.5 : 0);
    this.armL.rotation.x = s.punchAnim > 0 ? -1.75 : -1.35;
  }
  dispose(scene) { scene.remove(this.root); }
}

export function buildTurretModel(team) {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.5 });
  const paint = new THREE.MeshStandardMaterial({ color: team ? 0xb8392e : 0x2f74c8, roughness: 0.4, metalness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_COLORS[team]).multiplyScalar(4) });
  const add = (geo, mat, x, y, z, p = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
  add(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 16), metal, 0, 0.25, 0);
  add(new THREE.CylinderGeometry(0.25, 0.3, 0.8, 12), dark, 0, 0.9, 0);
  add(new THREE.TorusGeometry(0.72, 0.04, 6, 32), glow, 0, 0.5, 0).rotation.x = Math.PI / 2;
  const head = new THREE.Group(); head.position.y = 1.4; root.add(head);
  add(rbox(0.7, 0.45, 0.8, 0.12), paint, 0, 0, 0, head);
  add(rbox(0.72, 0.12, 0.6, 0.04), metal, 0, 0.2, 0.05, head);
  add(rbox(0.5, 0.08, 0.05, 0.02), glow, 0, 0.05, -0.42, head);
  const barrels = new THREE.Group(); barrels.position.set(0, -0.05, -0.4); head.add(barrels);
  for (const x of [-0.12, 0.12]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 10), dark, x, 0, -0.35, barrels).rotation.x = Math.PI / 2;
  return { root, head, glow };
}
