// Weapon models with a distinct colour identity per gun. Used by the first-person
// viewmodel and the loadout turntable. Local space: barrel points -Z, origin at the grip.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const FINISH = {
  ar:      { body: 0x2b2f36, poly: 0xc9b08a, accent: 0x19c3b4, metal: 0x3a4048, glow: [0.4, 3.6, 3.2] },
  smg:     { body: 0xeceef2, poly: 0x24262b, accent: 0xff3d9a, metal: 0x3a3e46, glow: [4.5, 0.6, 2.6] },
  hmg:     { body: 0x5d6b3a, poly: 0x2c2f25, accent: 0xff7a1a, metal: 0x4a4e52, glow: [4.5, 1.8, 0.3] },
  shotgun: { body: 0x2a3140, poly: 0x7a4a2a, accent: 0xd8a640, metal: 0x3a4250, glow: [4.2, 2.6, 0.6] },
  sniper:  { body: 0x1f3a5f, poly: 0x15202e, accent: 0xd4a53c, metal: 0x2a2f38, glow: [0.6, 3.4, 5.0] },
};

export function buildGun(id) {
  const F = FINISH[id] || FINISH.ar;
  const M = {
    body: new THREE.MeshStandardMaterial({ color: F.body, roughness: 0.42, metalness: 0.55 }),
    poly: new THREE.MeshStandardMaterial({ color: F.poly, roughness: 0.6, metalness: 0.05 }),
    accent: new THREE.MeshStandardMaterial({ color: F.accent, roughness: 0.35, metalness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: F.metal, roughness: 0.3, metalness: 0.85 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(...F.glow) }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0c1a24, roughness: 0.05, metalness: 0.9, emissive: new THREE.Color(...F.glow).multiplyScalar(0.06) }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.5, 0.3) }),
  };
  const g = new THREE.Group();
  const rb = (w, h, d, mat, x, y, z, r = 0.012, rx = 0) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), mat);
    m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m;
  };
  const cyl = (r, len, mat, x, y, z, parent = g, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    m.rotation.x = Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m;
  };
  const out = { group: g, mats: M };
  if (id === 'ar') {
    rb(0.064, 0.085, 0.36, M.body, 0, 0, -0.04);                 // upper receiver
    rb(0.058, 0.06, 0.2, M.body, 0, -0.06, 0.02);                // lower
    rb(0.07, 0.072, 0.26, M.poly, 0, 0.0, -0.33, 0.02);          // handguard
    for (let i = 0; i < 4; i++) rb(0.072, 0.012, 0.03, M.accent, 0, 0.0, -0.24 - i * 0.055, 0.004); // vents
    cyl(0.011, 0.2, M.metal, 0, 0.005, -0.55); cyl(0.018, 0.06, M.body, 0, 0.005, -0.66);
    rb(0.042, 0.15, 0.075, M.poly, 0, -0.12, -0.07, 0.01, 0.22);  // mag
    rb(0.044, 0.02, 0.075, M.accent, 0, -0.195, -0.09, 0.006, 0.22);
    rb(0.05, 0.08, 0.2, M.poly, 0, -0.02, 0.24, 0.02);           // stock
    rb(0.054, 0.09, 0.03, M.accent, 0, -0.02, 0.35, 0.01);
    rb(0.038, 0.1, 0.045, M.poly, 0, -0.1, 0.09, 0.01, -0.3);     // grip
    rb(0.022, 0.012, 0.34, M.metal, 0, 0.049, -0.12, 0.003);      // rail
    rb(0.046, 0.05, 0.075, M.body, 0, 0.08, -0.03, 0.01);         // red-dot housing
    rb(0.05, 0.008, 0.08, M.accent, 0, 0.106, -0.03, 0.003);
    const lens = rb(0.036, 0.032, 0.004, M.lens, 0, 0.082, -0.068, 0.002); lens.material = M.lens;
    rb(0.005, 0.005, 0.002, M.red, 0, 0.082, -0.071, 0.001);
    out.sightY = 0.082; out.muzzle = new THREE.Vector3(0, 0.005, -0.7);
  } else if (id === 'smg') {
    rb(0.056, 0.085, 0.3, M.body, 0, 0, -0.03, 0.02);
    rb(0.06, 0.03, 0.3, M.accent, 0, 0.05, -0.03, 0.01);
    rb(0.062, 0.05, 0.12, M.poly, 0, -0.005, -0.23, 0.015);
    cyl(0.016, 0.1, M.metal, 0, 0.012, -0.32); cyl(0.024, 0.07, M.poly, 0, 0.012, -0.39);
    rb(0.036, 0.2, 0.045, M.poly, 0, -0.14, -0.07, 0.008, 0.08);
    rb(0.038, 0.02, 0.047, M.accent, 0, -0.24, -0.06, 0.005, 0.08);
    rb(0.036, 0.095, 0.042, M.poly, 0, -0.085, 0.07, 0.01, -0.25);
    rb(0.016, 0.05, 0.18, M.poly, 0, -0.01, 0.2, 0.006); rb(0.03, 0.07, 0.016, M.accent, 0, -0.01, 0.29, 0.006);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 24), M.accent); ring.position.set(0, 0.09, -0.05); g.add(ring);
    rb(0.006, 0.006, 0.002, M.red, 0, 0.09, -0.05, 0.001);
    out.sightY = 0.09; out.muzzle = new THREE.Vector3(0, 0.012, -0.43);
  } else if (id === 'hmg') {
    rb(0.11, 0.13, 0.46, M.body, 0, 0, -0.02, 0.03);
    rb(0.112, 0.02, 0.3, M.accent, 0, 0.066, -0.05, 0.006);
    out.barrels = new THREE.Group(); out.barrels.position.set(0, -0.005, -0.28); g.add(out.barrels);
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; cyl(0.011, 0.5, M.metal, Math.cos(a) * 0.03, Math.sin(a) * 0.03, -0.25, out.barrels, 10); }
    cyl(0.048, 0.05, M.body, 0, 0, -0.08, out.barrels); cyl(0.048, 0.04, M.accent, 0, 0, -0.46, out.barrels);
    rb(0.13, 0.13, 0.16, M.poly, -0.12, -0.06, 0.02, 0.02);       // ammo can
    rb(0.132, 0.03, 0.162, M.accent, -0.12, 0.0, 0.02, 0.008);
    rb(0.03, 0.03, 0.22, M.metal, 0, 0.1, -0.03, 0.01);           // carry handle
    rb(0.05, 0.05, 0.05, M.body, 0, 0.1, -0.02, 0.01);
    rb(0.007, 0.007, 0.002, M.red, 0, 0.1, -0.046, 0.001);
    rb(0.05, 0.12, 0.06, M.poly, 0, -0.11, 0.12, 0.012, -0.2);
    rb(0.045, 0.12, 0.05, M.poly, 0, -0.11, -0.2, 0.012, 0.15);   // front grip
    out.sightY = 0.1; out.muzzle = new THREE.Vector3(0, 0, -0.78);
  } else if (id === 'shotgun') {
    rb(0.06, 0.08, 0.3, M.body, 0, 0, -0.02, 0.015);
    cyl(0.016, 0.52, M.metal, 0, 0.022, -0.42); cyl(0.013, 0.44, M.body, 0, -0.016, -0.38);
    out.pump = rb(0.07, 0.056, 0.17, M.poly, 0, -0.018, -0.34, 0.02);
    for (let i = 0; i < 5; i++) rb(0.072, 0.006, 0.01, M.accent, 0, -0.018, -0.28 - i * 0.03, 0.002);
    rb(0.052, 0.1, 0.28, M.poly, 0, -0.025, 0.25, 0.025);          // walnut stock
    rb(0.056, 0.104, 0.03, M.body, 0, -0.025, 0.4, 0.01);
    rb(0.04, 0.1, 0.05, M.poly, 0, -0.08, 0.1, 0.012, -0.3);
    rb(0.062, 0.012, 0.12, M.accent, 0, 0.044, -0.02, 0.004);      // brass receiver plate
    rb(0.008, 0.012, 0.008, M.glow, 0, 0.045, -0.67, 0.002);
    rb(0.03, 0.014, 0.02, M.metal, 0, 0.048, 0.03, 0.004);
    out.sightY = 0.05; out.muzzle = new THREE.Vector3(0, 0.022, -0.7);
  } else { // sniper
    rb(0.062, 0.082, 0.42, M.body, 0, 0, -0.04, 0.02);
    rb(0.064, 0.016, 0.42, M.accent, 0, -0.035, -0.04, 0.005);
    cyl(0.014, 0.62, M.metal, 0, 0.012, -0.55); cyl(0.024, 0.08, M.body, 0, 0.012, -0.88);
    for (let i = 0; i < 3; i++) rb(0.05, 0.01, 0.012, M.accent, 0, 0.012, -0.85 - i * 0.02, 0.003);
    cyl(0.027, 0.3, M.poly, 0, 0.088, -0.06, g, 20); cyl(0.034, 0.06, M.poly, 0, 0.088, -0.24, g, 20); cyl(0.031, 0.05, M.poly, 0, 0.088, 0.11, g, 20);
    const ringA = cyl(0.03, 0.012, M.accent, 0, 0.088, -0.2, g, 20); const ringB = cyl(0.03, 0.012, M.accent, 0, 0.088, 0.07, g, 20);
    const lens = cyl(0.03, 0.004, M.lens, 0, 0.088, -0.272, g, 20); lens.material = M.lens;
    rb(0.02, 0.03, 0.03, M.metal, 0, 0.058, -0.06, 0.005);
    rb(0.052, 0.12, 0.34, M.poly, 0, -0.03, 0.31, 0.03);
    rb(0.056, 0.03, 0.12, M.accent, 0, 0.04, 0.28, 0.01);           // cheek rest
    rb(0.04, 0.1, 0.05, M.poly, 0, -0.08, 0.1, 0.012, -0.3);
    out.bolt = rb(0.014, 0.014, 0.06, M.accent, 0.05, 0.02, 0.06, 0.006);
    rb(0.045, 0.11, 0.07, M.body, 0, -0.1, -0.06, 0.012);
    for (const s of [-1, 1]) { const leg = rb(0.012, 0.012, 0.22, M.metal, s * 0.02, -0.03, -0.62, 0.004); leg.rotation.z = s * 0.15; }
    out.sightY = 0.088; out.muzzle = new THREE.Vector3(0, 0.012, -0.93);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return out;
}
