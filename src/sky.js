// Stylized sky dome (gradient + sun + procedural clouds + stars), colour grading pass, weather.
import * as THREE from 'three';

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FS = `
uniform vec3 top, horizon, bottom, sunColor, sunDir; uniform float time, clouds, stars;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n2(p); p*=2.03; a*=.5; } return v; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = h > 0. ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, pow(-h, 0.35));
  float sd = max(dot(d, normalize(sunDir)), 0.);
  col += sunColor * (pow(sd, 1200.)*12. + pow(sd, 24.)*0.45 + pow(sd, 4.)*0.18);
  if (h > 0.) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(time*0.006, time*0.002);
    float n = fbm(uv*1.4);
    float c = smoothstep(0.5 - clouds*0.25, 0.85, n) * clouds * smoothstep(0.0, 0.18, h);
    vec3 cc = mix(horizon, vec3(1.0), 0.45) + sunColor*0.35*pow(sd, 3.) ;
    cc *= mix(0.65, 1.05, smoothstep(0.4, 0.9, fbm(uv*1.4 + 0.3)));
    col = mix(col, cc, c*0.9);
    if (stars > 0.) { vec3 p = floor(d*420.); float s = hash(p); col += step(0.9982, s) * stars * (0.6 + 0.4*sin(time*3.+s*90.)) * (1.-c); }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSky(theme) {
  const s = theme.sky;
  const el = THREE.MathUtils.degToRad(s.elev), az = THREE.MathUtils.degToRad(s.az);
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(s.top) }, horizon: { value: new THREE.Color(s.horizon) }, bottom: { value: new THREE.Color(s.bottom) },
      sunColor: { value: new THREE.Color(s.sun) }, sunDir: { value: sunDir }, time: { value: 0 }, clouds: { value: s.clouds }, stars: { value: s.stars || 0 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), mat);
  mesh.renderOrder = -1; mesh.frustumCulled = false;
  return { mesh, sunDir, update(t, camPos) { mat.uniforms.time.value = t; mesh.position.copy(camPos); } };
}

// ── colour grading (runs after tone mapping, in display space) ──
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, sat: { value: 1.15 }, contrast: { value: 1.05 },
    lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) },
    vignette: { value: 0.3 }, time: { value: 0 }, grain: { value: 0.025 }, tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float sat, contrast, vignette, time, grain; uniform vec3 lift, gain, tint; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c = c * gain + lift * (1.0 - c);
      c *= tint;
      vec2 q = vUv - 0.5; c *= 1.0 - vignette * dot(q,q) * 2.2;
      float n = fract(sin(dot(vUv*vec2(1920.,1080.) + time*61.7, vec2(12.9898,78.233)))*43758.5453);
      c += (n - 0.5) * grain;
      gl_FragColor = vec4(clamp(c,0.,1.), 1.0);
    }`,
};

// ── weather particles that follow the camera (rain streaks / dust motes / sea mist) ──
export class Weather {
  constructor(scene, kind, quality = 1) {
    this.kind = kind;
    if (!kind || kind === 'none') return;
    const N = Math.round((kind === 'rain' ? 5000 : 1400) * quality);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const cfg = {
      rain: { box: [40, 24, 40], vel: [0.8, -22, 0.4], color: [0.6, 0.7, 1.0], size: 0.06, alpha: 0.5, stretch: 1 },
      dust: { box: [50, 14, 50], vel: [0.5, 0.05, 0.25], color: [1.0, 0.75, 0.5], size: 0.07, alpha: 0.55, stretch: 0 },
      mist: { box: [70, 8, 70], vel: [0.6, 0.0, 0.2], color: [1.0, 1.0, 1.0], size: 0.7, alpha: 0.018, stretch: 0 },
    }[kind];
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: kind === 'mist' ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: new THREE.Vector3(...cfg.box) }, vel: { value: new THREE.Vector3(...cfg.vel) },
        color: { value: new THREE.Vector3(...cfg.color) }, size: { value: cfg.size }, alpha: { value: cfg.alpha }, scale: { value: 600 }, stretch: { value: cfg.stretch } },
      vertexShader: `
        attribute float seed; uniform float time, size, scale; uniform vec3 cam, box, vel; varying float vA;
        void main(){
          vec3 p = position * box + vel * time * (0.7 + seed*0.6);
          p += vec3(sin(time*0.7+seed*30.)*0.6, 0., cos(time*0.5+seed*20.)*0.6);
          p = mod(p - cam + box*0.5, box) + cam - box*0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * scale / max(0.5, -mv.z);
          vA = smoothstep(size > 0.5 ? 14. : 0., size > 0.5 ? 24. : 6., -mv.z) * (1. - smoothstep(box.x*0.35, box.x*0.5, length(p.xz - cam.xz)));
        }`,
      fragmentShader: `
        uniform vec3 color; uniform float alpha, stretch; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = stretch > 0.5 ? max(abs(c.x)*6.0, abs(c.y)) : length(c);
          if (d > 0.5) discard; gl_FragColor = vec4(color, alpha * vA * (1.0 - d*2.0)); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 8;
    scene.add(this.points);
  }
  update(t, cam, scale) {
    if (!this.mat) return;
    this.mat.uniforms.time.value = t; this.mat.uniforms.cam.value.copy(cam.position); this.mat.uniforms.scale.value = scale;
  }
}
