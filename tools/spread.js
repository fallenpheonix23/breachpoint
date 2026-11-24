// Prints each gun's spread cone (degrees) in common states — compare with Valorant inaccuracy tables.
//   node tools/spread.js
import * as THREE from 'three';
const { WEAPONS, WEAPON_ORDER } = await import('../src/config.js');
const { Soldier } = await import('../src/soldier.js');
const deg = (r) => (r * 180 / Math.PI).toFixed(2).padStart(6);
const fake = (w, o = {}) => Object.assign(Object.create(Soldier.prototype), { weapon: WEAPONS[w], game: { time: 10 }, lastFire: o.lastFire ?? 0, bloom: o.bloom ?? 0, adsT: o.ads ?? 0,
  vel: new THREE.Vector3(o.speed ?? 0, 0, 0), onGround: !o.air, stance: o.stance ?? 'stand', scopedT: 9 });
console.log('gun        stand   ADS  crouch  spray10  sprayADS  walk(6.2)  sprint(9)  ADS+walk  air');
for (const w of WEAPON_ORDER) {
  const W = WEAPONS[w], b10 = Math.min(W.bloomMax, W.bloomPer * 10);
  console.log(w.padEnd(8), deg(fake(w).spreadNow()), deg(fake(w, { ads: 1 }).spreadNow()), deg(fake(w, { stance: 'crouch' }).spreadNow()),
    '  ', deg(fake(w, { bloom: b10, lastFire: 10 }).spreadNow()), '  ', deg(fake(w, { bloom: b10, lastFire: 10, ads: 1 }).spreadNow()),
    '    ', deg(fake(w, { speed: 6.2 }).spreadNow()), '    ', deg(fake(w, { speed: 9 }).spreadNow()), '  ', deg(fake(w, { speed: 6.2, ads: 1 }).spreadNow()), deg(fake(w, { air: true }).spreadNow()));
}
