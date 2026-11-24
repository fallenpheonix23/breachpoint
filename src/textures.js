// Procedural PBR-ish textures: albedo + normal maps generated on canvases.
// Albedos are kept fairly light/neutral so each map can tint them with its own palette.
import * as THREE from 'three';

let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function mk(n = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}
// smooth value noise by upscaling a tiny random canvas
function noiseLayer(ctx, n, cells, alpha, light = true) {
  const [c, x] = mk(cells);
  const img = x.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = light ? 'overlay' : 'source-over';
  ctx.imageSmoothingEnabled = true;
  // draw 3x3 tiles so the result wraps
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) ctx.drawImage(c, a * n, b * n, n, n);
  ctx.restore();
}
function grain(ctx, n, amp) {
  const img = ctx.getImageData(0, 0, n, n), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * amp;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  ctx.putImageData(img, 0, 0);
}
function normalFrom(hc, strength = 2) {
  const n = hc.width, hx = hc.getContext('2d', { willReadFrequently: true });
  const h = hx.getImageData(0, 0, n, n).data;
  const [c, x] = mk(n);
  const out = x.createImageData(n, n), o = out.data;
  const H = (i, j) => h[(((j + n) % n) * n + ((i + n) % n)) * 4] / 255;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * strength;
    const dy = (H(i, j + 1) - H(i, j - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const k = (j * n + i) * 4;
    o[k] = (-dx / l * 0.5 + 0.5) * 255; o[k + 1] = (dy / l * 0.5 + 0.5) * 255; o[k + 2] = (1 / l * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return c;
}

export function makeTextures(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const wrap = (c, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const T = {};
  const add = (name, size, drawA, drawH, strength = 2) => {
    const [a, ax] = mk(size); drawA(ax, size);
    const [h, hx] = mk(size); drawH(hx, size);
    T[name] = { map: wrap(a), normalMap: wrap(normalFrom(h, strength), false) };
  };

  add('plaster', 256, (x, n) => {
    x.fillStyle = '#e9e4da'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 8, 0.5); noiseLayer(x, n, 32, 0.25); grain(x, n, 14);
  }, (x, n) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 64, 0.6, false); noiseLayer(x, n, 16, 0.3);
  }, 1.4);

  add('brick', 256, (x, n) => {
    x.fillStyle = '#cfc6b8'; x.fillRect(0, 0, n, n);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
      const ox = c * 64 + (r % 2) * 32, v = 170 + rnd() * 70;
      x.fillStyle = `rgb(${v},${v * 0.82},${v * 0.72})`;
      x.fillRect(ox + 2, r * 32 + 2, 60, 28);
    }
    noiseLayer(x, n, 32, 0.3); grain(x, n, 18);
  }, (x, n) => {
    x.fillStyle = '#303030'; x.fillRect(0, 0, n, n);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
      const ox = c * 64 + (r % 2) * 32;
      x.fillStyle = '#d0d0d0'; x.beginPath(); x.roundRect(ox + 3, r * 32 + 3, 58, 26, 4); x.fill();
    }
    noiseLayer(x, n, 64, 0.25);
  }, 3);

  add('stone', 256, (x, n) => {
    x.fillStyle = '#b9b2a6'; x.fillRect(0, 0, n, n);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
      const v = 150 + rnd() * 80;
      x.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
      x.beginPath(); x.roundRect(i * 43 + 3 + rnd() * 4, j * 43 + 3 + rnd() * 4, 36 + rnd() * 4, 36 + rnd() * 4, 10); x.fill();
    }
    noiseLayer(x, n, 32, 0.3); grain(x, n, 20);
  }, (x, n) => {
    x.fillStyle = '#202020'; x.fillRect(0, 0, n, n);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
      const g = x.createRadialGradient(i * 43 + 22, j * 43 + 22, 4, i * 43 + 22, j * 43 + 22, 24);
      g.addColorStop(0, '#f0f0f0'); g.addColorStop(1, '#808080');
      x.fillStyle = g; x.beginPath(); x.roundRect(i * 43 + 4, j * 43 + 4, 36, 36, 10); x.fill();
    }
  }, 3.5);

  add('tiles', 256, (x, n) => {
    x.fillStyle = '#d8d4cc'; x.fillRect(0, 0, n, n);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const v = 210 + rnd() * 40; x.fillStyle = `rgb(${v},${v},${v * 0.97})`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
    noiseLayer(x, n, 16, 0.15); grain(x, n, 8);
  }, (x, n) => {
    x.fillStyle = '#404040'; x.fillRect(0, 0, n, n);
    x.fillStyle = '#c8c8c8'; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 3, j * 64 + 3, 58, 58);
  }, 2);

  add('wood', 256, (x, n) => {
    for (let i = 0; i < 8; i++) {
      const v = 150 + rnd() * 60; x.fillStyle = `rgb(${v},${v * 0.72},${v * 0.48})`; x.fillRect(0, i * 32, n, 32);
      x.strokeStyle = 'rgba(60,35,15,0.25)';
      for (let k = 0; k < 6; k++) { x.beginPath(); const y = i * 32 + 4 + rnd() * 24; x.moveTo(0, y); for (let px = 0; px <= n; px += 16) x.lineTo(px, y + Math.sin(px * 0.05 + k) * 2); x.stroke(); }
      x.fillStyle = 'rgba(30,15,5,0.6)'; x.fillRect(0, i * 32 + 30, n, 2);
      x.fillRect(((i * 97) % 5) * 51, i * 32, 2, 32);
    }
    grain(x, n, 14);
  }, (x, n) => {
    x.fillStyle = '#b0b0b0'; x.fillRect(0, 0, n, n);
    x.fillStyle = '#303030';
    for (let i = 0; i < 8; i++) { x.fillRect(0, i * 32 + 30, n, 2); x.fillRect(((i * 97) % 5) * 51, i * 32, 2, 32); }
    noiseLayer(x, n, 64, 0.2);
  }, 2.5);

  add('concrete', 256, (x, n) => {
    x.fillStyle = '#c4c2bd'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 8, 0.4); noiseLayer(x, n, 48, 0.2); grain(x, n, 18);
    x.strokeStyle = 'rgba(60,60,60,0.5)'; x.lineWidth = 2; x.strokeRect(1, 1, n - 2, n - 2);
    x.fillStyle = 'rgba(50,50,50,0.5)';
    for (const [px, py] of [[16, 16], [n - 16, 16], [16, n - 16], [n - 16, n - 16]]) { x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill(); }
  }, (x, n) => {
    x.fillStyle = '#909090'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 64, 0.3);
    x.strokeStyle = '#303030'; x.lineWidth = 3; x.strokeRect(1, 1, n - 2, n - 2);
    x.fillStyle = '#404040'; for (const [px, py] of [[16, 16], [n - 16, 16], [16, n - 16], [n - 16, n - 16]]) { x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
  }, 2);

  add('metal', 128, (x, n) => {
    x.fillStyle = '#c9ccd1'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 16, 0.2); grain(x, n, 10);
    x.strokeStyle = 'rgba(40,40,45,0.6)'; x.lineWidth = 2; x.strokeRect(1, 1, n - 2, n - 2);
  }, (x, n) => {
    x.fillStyle = '#a0a0a0'; x.fillRect(0, 0, n, n);
    x.strokeStyle = '#303030'; x.lineWidth = 3; x.strokeRect(1, 1, n - 2, n - 2);
    x.fillStyle = '#ffffff'; for (let i = 8; i < n; i += 24) { x.beginPath(); x.arc(i, 6, 2.5, 0, 7); x.fill(); x.beginPath(); x.arc(i, n - 6, 2.5, 0, 7); x.fill(); }
  }, 2);

  add('plate', 128, (x, n) => { // diamond plate floor
    x.fillStyle = '#9aa0a8'; x.fillRect(0, 0, n, n); grain(x, n, 12);
  }, (x, n) => {
    x.fillStyle = '#606060'; x.fillRect(0, 0, n, n);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      x.save(); x.translate(i * 16 + 8 + (j % 2) * 8, j * 16 + 8); x.rotate(j % 2 ? 0.8 : -0.8);
      x.fillStyle = '#ffffff'; x.fillRect(-5, -1.5, 10, 3); x.restore();
    }
  }, 3);

  add('corrugated', 128, (x, n) => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < 16; i++) {
      const g = x.createLinearGradient(i * 8, 0, i * 8 + 8, 0);
      g.addColorStop(0, '#b0b0b0'); g.addColorStop(0.5, '#f4f4f4'); g.addColorStop(1, '#b0b0b0');
      x.fillStyle = g; x.fillRect(i * 8, 0, 8, n);
    }
    noiseLayer(x, n, 8, 0.25); grain(x, n, 10);
  }, (x, n) => {
    for (let i = 0; i < n; i++) { const v = 128 + Math.sin(i / 8 * Math.PI * 2) * 120; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, 0, 1, n); }
  }, 2);

  add('roof', 256, (x, n) => { // terracotta barrel tiles
    x.fillStyle = '#c9714a'; x.fillRect(0, 0, n, n);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const g = x.createLinearGradient(c * 32, 0, c * 32 + 32, 0);
      const v = 0.85 + rnd() * 0.3;
      g.addColorStop(0, `rgba(120,50,30,${0.5})`); g.addColorStop(0.5, `rgba(255,${180 * v},${130 * v},0.5)`); g.addColorStop(1, 'rgba(120,50,30,0.5)');
      x.fillStyle = g; x.fillRect(c * 32 + (r % 2) * 16, r * 32, 32, 32);
    }
    grain(x, n, 16);
  }, (x, n) => {
    for (let i = 0; i < n; i++) { const v = 128 + Math.sin(((i % 32) / 32) * Math.PI) * 120; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, 0, 1, n); }
    x.fillStyle = 'rgba(0,0,0,0.5)'; for (let r = 0; r < 8; r++) x.fillRect(0, r * 32, n, 3);
  }, 3);

  add('asphalt', 256, (x, n) => {
    x.fillStyle = '#56585c'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 16, 0.35); grain(x, n, 40);
  }, (x, n) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, n, n); grain(x, n, 120);
  }, 1.2);

  add('sand', 256, (x, n) => {
    x.fillStyle = '#e2c9a0'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 8, 0.4); noiseLayer(x, n, 32, 0.25); grain(x, n, 24);
  }, (x, n) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
    for (let i = 0; i < n; i++) { const v = 128 + Math.sin(i * 0.12 + Math.sin(i * 0.03) * 3) * 40; x.fillStyle = `rgba(${v},${v},${v},0.6)`; x.fillRect(0, i, n, 1); }
    grain(x, n, 60);
  }, 1.5);

  add('grass', 256, (x, n) => {
    x.fillStyle = '#7fae4f'; x.fillRect(0, 0, n, n);
    noiseLayer(x, n, 8, 0.5); noiseLayer(x, n, 64, 0.35); grain(x, n, 30);
  }, (x, n) => { x.fillStyle = '#808080'; x.fillRect(0, 0, n, n); grain(x, n, 140); }, 1.2);

  add('cloth', 128, (x, n) => { // awning stripes (tinted)
    for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#bdbdbd'; x.fillRect(i * 32, 0, 32, n); }
    grain(x, n, 10);
  }, (x, n) => { x.fillStyle = '#808080'; x.fillRect(0, 0, n, n); grain(x, n, 30); }, 1);

  { // hex grid for hard-light / holograms
    const [c, x] = mk(128);
    x.clearRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2;
    const r = 12, h = Math.sqrt(3) * r;
    for (let j = -1; j < 8; j++) for (let i = -1; i < 7; i++) {
      const cx = i * r * 3 + (j % 2) * r * 1.5, cy = j * h / 2;
      x.beginPath();
      for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      x.stroke();
    }
    T.hex = wrap(c, false);
  }
  { // water normal map
    const [h, hx] = mk(256);
    const img = hx.createImageData(256, 256);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const p = Math.PI * 2 / 256;
      const v = Math.sin(i * p * 3 + Math.sin(j * p * 2) * 2) + Math.sin(j * p * 5 + i * p * 2) * 0.6 + Math.sin((i + j) * p * 9) * 0.25;
      const k = (j * 256 + i) * 4; const c = 128 + v * 50;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = c; img.data[k + 3] = 255;
    }
    hx.putImageData(img, 0, 0);
    T.waterNormal = wrap(normalFrom(h, 3), false);
  }
  return T;
}

// Text texture for neon signs / billboards
export function signTexture(text, color = '#ff3df0', bg = 'rgba(0,0,0,0)', w = 512, h = 128, font = 'bold 84px Rajdhani, sans-serif') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 18; x.fillStyle = color;
  x.fillText(text, w / 2, h / 2 + 4);
  x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
