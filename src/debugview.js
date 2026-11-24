// Map debug view:  index.html?mapdebug=<mapId>[&view=<floor#>]
//   0 = free-fly 3D (click to look, WASD move, Space/C up/down, Shift fast)
//   1..N = top-down cut-away of floor N (everything above the floor's ceiling is clipped)
//   N = nav nodes + drop (orange) / jump (purple) links · G = tagged areas · L = collision layers
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { buildMap } from './map.js';
import { mapById } from './maps/index.js';
import { makeSky } from './sky.js';
import { L_MOVE, L_SHOT, L_ALL } from './physics.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function runDebugView(id, startView = 0) {
  const def = mapById(id);
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(innerWidth, innerHeight);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.localClippingEnabled = true;
  document.getElementById('app').appendChild(r.domElement);
  const scene = new THREE.Scene();
  const th = def.theme;
  const sky = makeSky(th); scene.add(sky.mesh);
  scene.add(new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity + 0.3));
  const sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity); sun.position.copy(sky.sunDir).multiplyScalar(200); scene.add(sun);
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const map = buildMap(scene, makeTextures(r), def);
  const nav = map.nav, floors = map.floors;
  const b = map.bounds, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;

  // overlays
  const navGroup = new THREE.Group(), areaGroup = new THREE.Group(), layerGroup = new THREE.Group();
  scene.add(navGroup, areaGroup, layerGroup);
  const floorOf = (h) => { let f = 0; for (let i = 0; i < floors.length; i++) if (h >= floors[i].y - 0.6) f = i; return f; };
  const FC = [0x4ad3ff, 0x7dffb0, 0xffd27a, 0xff7ad3];
  const navFloors = [];
  { const c = new THREE.Color();
    for (let f = 0; f < floors.length; f++) {
      const P = [], C = [];
      for (let n = 0; n < nav.nodeCount; n++) { if (floorOf(nav.nh[n]) !== f) continue; const [x, z] = nav.nodeXZ(n); P.push(x, nav.nh[n] + 0.06, z); c.set(nav.reach && !nav.reach[n] ? 0x553333 : FC[f % 4]); C.push(c.r, c.g, c.b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, depthTest: false }));
      navGroup.add(pts); navFloors.push(pts);
    }
    const L = { drop: [], jump: [] };
    for (let n = 0; n < nav.nodeCount; n++) nav.forEdges(n, (m, kind) => { if (kind === 'walk') return; const [x, z] = nav.nodeXZ(n), [x2, z2] = nav.nodeXZ(m); L[kind].push(x, nav.nh[n] + 0.1, z, x2, nav.nh[m] + 0.1, z2); });
    for (const [k, col] of [['drop', 0xff9a2a], ['jump', 0xc06bff]]) { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(L[k], 3)); navGroup.add(new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ color: col, depthTest: false }))); }
  }
  const label = (text, x, y, z, col = '#ffd27a') => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x2 = c.getContext('2d');
    x2.font = 'bold 34px Rajdhani, sans-serif'; x2.fillStyle = 'rgba(0,0,0,.55)'; x2.fillRect(0, 0, 512, 64); x2.fillStyle = col; x2.textAlign = 'center'; x2.fillText(text, 256, 44);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(8, 1, 1); s.position.set(x, y, z); s.renderOrder = 50; return s;
  };
  for (const z of map.zones) {
    if (z.kind === 'NEST') continue;
    const y0 = Number.isFinite(z.y0) ? z.y0 : 0, y1 = Number.isFinite(z.y1) ? Math.min(z.y1, y0 + 4) : 4;
    const box = new THREE.Box3(new THREE.Vector3(z.x0, y0, z.z0), new THREE.Vector3(z.x1, y1, z.z1));
    const h = new THREE.Box3Helper(box, z.key ? 0xffd27a : 0x8a96a6); h.material.depthTest = false; areaGroup.add(h);
    areaGroup.add(label(z.name + (z.tag ? ` [${z.tag}]` : ''), (z.x0 + z.x1) / 2, y0 + 2.6, (z.z0 + z.z1) / 2, z.key ? '#ffd27a' : '#cfd8e3'));
  }
  for (const t of [0, 1]) for (const p of map.spawns[t]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 8), new THREE.MeshBasicMaterial({ color: t ? 0xff5a4a : 0x4ab0ff, depthTest: false })); m.position.set(p.x, p.y + 0.6, p.z); m.rotation.x = Math.PI; areaGroup.add(m); }
  for (const bx of map.world.boxes) {
    if (bx.layer === L_ALL) continue;
    const box = new THREE.Box3(new THREE.Vector3(...bx.min), new THREE.Vector3(...bx.max));
    layerGroup.add(new THREE.Box3Helper(box, bx.layer === L_MOVE ? 0x3dff7a : 0xff8a2a));
  }
  layerGroup.visible = false; areaGroup.visible = true; navGroup.visible = startView > 0;

  // cameras
  const persp = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 3000); persp.rotation.order = 'YXZ';
  persp.position.set(b.x0 + 6, 18, cz); persp.rotation.set(-0.45, -Math.PI / 2, 0);
  const span = Math.max(b.x1 - b.x0, (b.z1 - b.z0) * (innerWidth / innerHeight)) / 2 + 2;
  const ortho = new THREE.OrthographicCamera(-span, span, span * innerHeight / innerWidth, -span * innerHeight / innerWidth, 0.1, 500);
  ortho.position.set(cx, 200, cz); ortho.up.set(0, 0, -1); ortho.lookAt(cx, 0, cz);
  let view = startView;
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:12px;top:12px;z-index:60;background:rgba(8,10,14,.82);color:#e9eef5;font:600 14px Rajdhani,sans-serif;padding:10px 14px;border-radius:6px;line-height:1.45;max-width:420px';
  document.body.appendChild(panel);
  const setView = (v) => {
    view = Math.max(0, Math.min(floors.length, v));
    navFloors.forEach((p, i) => { p.visible = view === 0 || i === view - 1; });
    if (view === 0) { r.clippingPlanes = []; sky.mesh.visible = true; }
    else { const f = floors[view - 1], top = view < floors.length ? floors[view].y - 0.35 : f.y + 3.2; clip.constant = top; r.clippingPlanes = [clip]; sky.mesh.visible = false; scene.background = new THREE.Color(0x15171c); }
  };
  setView(startView);
  const keys = new Set(); let locked = false;
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (/^Digit\d$/.test(e.code)) setView(+e.code.slice(5));
    if (e.code === 'KeyN') navGroup.visible = !navGroup.visible;
    if (e.code === 'KeyG') areaGroup.visible = !areaGroup.visible;
    if (e.code === 'KeyL') layerGroup.visible = !layerGroup.visible;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  r.domElement.addEventListener('click', () => { if (view === 0) r.domElement.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === r.domElement; });
  addEventListener('mousemove', (e) => { if (!locked) return; persp.rotation.y -= e.movementX * 0.002; persp.rotation.x = Math.max(-1.5, Math.min(1.5, persp.rotation.x - e.movementY * 0.002)); });
  addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); persp.aspect = innerWidth / innerHeight; persp.updateProjectionMatrix(); });
  const clock = new THREE.Clock();
  window.debugView = { setView, persp, map, nav };
  (function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta()), sp = (keys.has('ShiftLeft') ? 30 : 10) * dt;
    if (view === 0) {
      const f = new THREE.Vector3(-Math.sin(persp.rotation.y), 0, -Math.cos(persp.rotation.y)), rt = new THREE.Vector3(-f.z, 0, f.x);
      if (keys.has('KeyW')) persp.position.addScaledVector(f, sp); if (keys.has('KeyS')) persp.position.addScaledVector(f, -sp);
      if (keys.has('KeyD')) persp.position.addScaledVector(rt, sp); if (keys.has('KeyA')) persp.position.addScaledVector(rt, -sp);
      if (keys.has('Space')) persp.position.y += sp; if (keys.has('KeyC')) persp.position.y -= sp;
    }
    sky.update(clock.elapsedTime, persp.position);
    const p = persp.position, z = map.zoneAt(p.x, p.z, p.y);
    panel.innerHTML = `<b style="color:#ffb84a">MAP DEBUG · ${map.name}</b><br>` +
      `view: <b>${view === 0 ? 'free-fly 3D' : `top-down floor ${view}: ${floors[view - 1].name} (${floors[view - 1].y} m)`}</b><br>` +
      `0 = 3D fly (click, WASD, Space/C, Shift) · ${floors.map((f, i) => `${i + 1} = ${f.name}`).join(' · ')}<br>` +
      `N nav [${navGroup.visible ? 'on' : 'off'}] · G areas [${areaGroup.visible ? 'on' : 'off'}] · L layers [${layerGroup.visible ? 'on' : 'off'}] <span style="color:#3dff7a">move-only</span> <span style="color:#ff8a2a">shot-only</span><br>` +
      (view === 0 ? `cam (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) · ${z ? z.name : '—'}` : `nav nodes: ${nav.nodeCount} · <span style="color:#ff9a2a">drop</span> / <span style="color:#c06bff">jump</span> links`);
    r.render(scene, view === 0 ? persp : ortho);
  })();
}
