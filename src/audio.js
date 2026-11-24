// Fully synthesized positional sound effects (Web Audio, no asset files).
export class Sfx {
  constructor() {
    this.ctx = null; this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.volume = 0.6;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  // ── per-map ambience: continuous beds + random one-shots ──
  startAmbient(kind) {
    if (!this.ctx || this.amb) return;
    const c = this.ctx, bus = c.createGain(); bus.gain.value = 0.0; bus.connect(this.master);
    bus.gain.linearRampToValueAtTime(1, c.currentTime + 3);
    this.amb = { bus, kind, nodes: [], next: c.currentTime + 2 };
    const bed = (f, q, vol, lfoHz = 0, lfoAmt = 0, type = 'lowpass') => {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = vol;
      src.connect(fl); fl.connect(g); g.connect(bus);
      if (lfoHz) { const l = c.createOscillator(), la = c.createGain(); l.frequency.value = lfoHz; la.gain.value = lfoAmt; l.connect(la); la.connect(g.gain); l.start(); this.amb.nodes.push(l); }
      src.start(); this.amb.nodes.push(src);
    };
    if (kind === 'harbor') { bed(420, 0.7, 0.16, 0.12, 0.1); bed(1800, 0.5, 0.025, 0.07, 0.02, 'bandpass'); }
    else if (kind === 'town') { bed(300, 0.6, 0.08, 0.05, 0.05); bed(5200, 6, 0.012, 0.9, 0.01, 'bandpass'); }
    else if (kind === 'city') { bed(2600, 0.4, 0.09, 0.3, 0.02, 'highpass'); bed(110, 1, 0.12); const o = c.createOscillator(); o.frequency.value = 60; const g = c.createGain(); g.gain.value = 0.012; o.connect(g); g.connect(bus); o.start(); this.amb.nodes.push(o); }
  }
  updateAmbient() {
    const a = this.amb;
    if (!a || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < a.next) return;
    a.next = t + 2 + Math.random() * 6;
    const g = this.ctx.createGain(); g.gain.value = 0.5; g.connect(a.bus);
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; g.disconnect(); g.connect(p); p.connect(a.bus); }
    if (a.kind === 'harbor') { // gull + creak
      if (Math.random() < 0.6) for (let i = 0; i < 3; i++) this.tone(g, t + i * 0.16, 0.14, 1700 + Math.random() * 300, 1100, 0.06, 'sawtooth');
      else this.noiseHit(g, t, 0.6, 300, 180, 8, 0.12, 'bandpass');
    } else if (a.kind === 'town') { // bell / bird chirps
      if (Math.random() < 0.25) { this.tone(g, t, 3.5, 620, 618, 0.05, 'sine'); this.tone(g, t, 3.5, 1240, 1236, 0.02, 'sine'); }
      else for (let i = 0; i < 4; i++) this.tone(g, t + i * 0.09, 0.06, 3200 + Math.random() * 900, 2800, 0.025, 'sine');
    } else if (a.kind === 'city') { // distant siren / horn / train rumble
      const r = Math.random();
      if (r < 0.35) { const o = this.ctx.createOscillator(), gg = this.ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(700, t);
        for (let i = 0; i < 6; i++) o.frequency.linearRampToValueAtTime(i % 2 ? 700 : 950, t + 0.5 * (i + 1));
        gg.gain.setValueAtTime(0.0, t); gg.gain.linearRampToValueAtTime(0.025, t + 0.5); gg.gain.linearRampToValueAtTime(0, t + 3); o.connect(gg); gg.connect(g); o.start(t); o.stop(t + 3.1); }
      else if (r < 0.6) this.tone(g, t, 0.5, 330, 328, 0.04, 'square');
      else this.noiseHit(g, t, 2.5, 160, 60, 1, 0.12);
    }
  }
  stopAmbient() { if (!this.amb) return; for (const n of this.amb.nodes) try { n.stop(); } catch { /* already stopped */ } this.amb = null; }
  setListener(p, yaw) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; this.listener.yaw = yaw; }
  bus(pos, vol) {
    const c = this.ctx;
    const g = c.createGain();
    let gain = vol, pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dy, dz);
      gain *= 1 / (1 + d / 14);
      if (d > 220) return null;
      const yaw = this.listener.yaw;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
    }
    if (gain < 0.01) return null;
    g.gain.value = gain;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  }
  noiseHit(out, t, dur, f0, f1, q, vol, type = 'lowpass') {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  tone(out, t, dur, f0, f1, vol, type = 'sine') {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, pos, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const out = this.bus(pos, vol);
    if (!out) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'ar': this.noiseHit(out, t, 0.16, 3500, 400, 0.8, 0.9); this.tone(out, t, 0.08, 180, 60, 0.5, 'triangle'); break;
      case 'smg': this.noiseHit(out, t, 0.1, 5000, 700, 0.8, 0.7); this.tone(out, t, 0.05, 240, 90, 0.3, 'triangle'); break;
      case 'hmg': this.noiseHit(out, t, 0.2, 2500, 250, 0.9, 1.0); this.tone(out, t, 0.12, 120, 40, 0.7, 'sawtooth'); break;
      case 'shotgun': this.noiseHit(out, t, 0.45, 2500, 120, 0.6, 1.2); this.tone(out, t, 0.25, 110, 35, 0.9, 'triangle'); break;
      case 'sniper':
        this.noiseHit(out, t, 0.7, 6000, 200, 0.5, 1.3); this.tone(out, t, 0.35, 90, 30, 1, 'sawtooth');
        this.noiseHit(out, t + 0.45, 0.06, 1500, 900, 4, 0.25, 'bandpass'); this.noiseHit(out, t + 0.65, 0.06, 1800, 1200, 4, 0.25, 'bandpass'); break;
      case 'turret': this.noiseHit(out, t, 0.08, 4000, 800, 1, 0.5); this.tone(out, t, 0.05, 600, 200, 0.15, 'square'); break;
      case 'spin': this.tone(out, t, 0.12, 300, 500, 0.1, 'sawtooth'); break;
      case 'reload': this.noiseHit(out, t, 0.05, 2000, 1500, 5, 0.4, 'bandpass'); this.noiseHit(out, t + 0.35, 0.06, 2500, 2000, 5, 0.5, 'bandpass'); break;
      case 'shell': this.noiseHit(out, t, 0.05, 2500, 2000, 6, 0.4, 'bandpass'); break;
      case 'empty': this.noiseHit(out, t, 0.03, 3000, 2500, 8, 0.3, 'bandpass'); break;
      case 'punch': this.tone(out, t, 0.12, 140, 50, 1.0); this.noiseHit(out, t, 0.08, 1200, 200, 1, 0.8); break;
      case 'bigpunch':
        this.tone(out, t, 0.25, 110, 35, 1.3); this.noiseHit(out, t, 0.2, 3000, 150, 1, 1.0);
        this.tone(out, t + 0.02, 0.3, 900, 200, 0.25, 'square'); break;
      case 'whiff': this.noiseHit(out, t, 0.15, 800, 2500, 2, 0.25, 'bandpass'); break;
      case 'slam': this.tone(out, t, 0.35, 90, 30, 1.4); this.noiseHit(out, t, 0.35, 1800, 100, 0.8, 1.1); break;
      case 'walljump': this.noiseHit(out, t, 0.1, 600, 300, 1, 0.5); this.tone(out, t, 0.12, 220, 440, 0.2, 'triangle'); break;
      case 'jump': this.noiseHit(out, t, 0.08, 500, 300, 1, 0.25); break;
      case 'land': this.noiseHit(out, t, 0.1, 400, 100, 1, 0.4); break;
      case 'step': this.noiseHit(out, t, 0.05, 900, 300, 1.5, 0.12); break;
      case 'step_wood': this.noiseHit(out, t, 0.07, 700, 220, 3, 0.35, 'bandpass'); this.tone(out, t, 0.06, 160, 90, 0.12, 'triangle'); break;
      case 'step_stone': this.noiseHit(out, t, 0.05, 2200, 700, 2, 0.28, 'bandpass'); break;
      case 'step_wet': this.noiseHit(out, t, 0.12, 3500, 900, 1.2, 0.3, 'bandpass'); this.noiseHit(out, t + 0.03, 0.08, 6000, 2500, 1, 0.12, 'highpass'); break;
      case 'stepTile': this.noiseHit(out, t, 0.04, 3200, 1500, 4, 0.3, 'bandpass'); this.tone(out, t, 0.03, 900, 700, 0.05, 'square'); break;
      case 'cover': this.noiseHit(out, t, 0.12, 600, 200, 1.5, 0.6); this.noiseHit(out, t + 0.05, 0.1, 2500, 900, 2, 0.25, 'bandpass'); break;
      case 'hit': this.tone(out, t, 0.05, 1800, 1700, 0.25, 'square'); break;
      case 'headshot': this.tone(out, t, 0.08, 2600, 2500, 0.3, 'square'); this.tone(out, t + 0.03, 0.1, 3400, 3300, 0.2, 'sine'); break;
      case 'kill': this.tone(out, t, 0.12, 900, 900, 0.3, 'triangle'); this.tone(out, t + 0.09, 0.2, 1350, 1350, 0.3, 'triangle'); break;
      case 'hitTaken': this.tone(out, t, 0.18, 120, 50, 1.0); this.noiseHit(out, t, 0.12, 900, 200, 1, 0.7); break;
      case 'crack': this.noiseHit(out, t, 0.06, 7000, 3000, 2, 0.9, 'highpass'); this.noiseHit(out, t + 0.02, 0.25, 1200, 300, 1, 0.35); break;
      case 'hurt': this.tone(out, t, 0.12, 200, 120, 0.4, 'sawtooth'); break;
      case 'shieldbreak': this.noiseHit(out, t, 0.4, 6000, 1200, 2, 0.6, 'highpass'); this.tone(out, t, 0.3, 1600, 400, 0.3, 'square'); break;
      case 'explode': this.noiseHit(out, t, 1.2, 1600, 40, 0.7, 1.6); this.tone(out, t, 0.6, 70, 25, 1.4); break;
      case 'arc':
        for (let i = 0; i < 5; i++) this.noiseHit(out, t + i * 0.04, 0.08, 6000, 2000, 3, 0.5, 'bandpass');
        this.tone(out, t, 0.4, 120, 60, 0.6, 'sawtooth'); break;
      case 'singularity': this.tone(out, t, 3.4, 60, 30, 0.8, 'sawtooth'); this.tone(out, t, 3.4, 220, 40, 0.3, 'sine'); break;
      case 'swarm': for (let i = 0; i < 8; i++) this.tone(out, t + i * 0.03, 0.15, 800 + i * 120, 1600, 0.12, 'square'); break;
      case 'pop': this.tone(out, t, 0.06, 1200, 400, 0.3, 'square'); break;
      case 'beep': this.tone(out, t, 0.08, 1800, 1800, 0.3, 'square'); break;
      case 'disc': this.noiseHit(out, t, 0.4, 3000, 6000, 6, 0.3, 'bandpass'); break;
      case 'clink': this.tone(out, t, 0.12, 2400 + Math.random() * 800, 1800, 0.25, 'triangle'); break;
      case 'sonic': this.tone(out, t, 0.5, 180, 40, 1.2, 'sawtooth'); this.noiseHit(out, t, 0.5, 600, 80, 1, 1.0); break;
      case 'emp': this.tone(out, t, 0.8, 1800, 60, 0.5, 'square'); this.noiseHit(out, t, 0.6, 8000, 400, 1, 0.8, 'highpass'); break;
      case 'stasis': this.tone(out, t, 1.2, 300, 1200, 0.3, 'sine'); this.tone(out, t, 1.2, 310, 1250, 0.2, 'sine'); break;
      case 'stasisEnd': this.tone(out, t, 0.4, 1200, 200, 0.4, 'sine'); this.noiseHit(out, t, 0.3, 4000, 400, 1, 0.5); break;
      case 'wall': this.tone(out, t, 0.3, 400, 900, 0.3, 'triangle'); this.noiseHit(out, t, 0.25, 6000, 2000, 2, 0.3, 'highpass'); break;
      case 'shatter': this.noiseHit(out, t, 0.5, 9000, 2000, 1, 0.7, 'highpass'); break;
      case 'grapple': this.noiseHit(out, t, 0.25, 1500, 4000, 4, 0.5, 'bandpass'); this.tone(out, t, 0.2, 300, 900, 0.2, 'sawtooth'); break;
      case 'phase': this.tone(out, t, 0.25, 1600, 200, 0.4, 'sine'); this.noiseHit(out, t, 0.2, 7000, 1500, 1, 0.4, 'highpass'); break;
      case 'pad': this.tone(out, t, 0.35, 200, 900, 0.5, 'triangle'); this.noiseHit(out, t, 0.2, 800, 2500, 1, 0.4); break;
      case 'pulse': this.tone(out, t, 1.0, 900, 880, 0.3, 'sine'); this.tone(out, t + 0.25, 0.8, 900, 880, 0.15, 'sine'); break;
      case 'dart': this.noiseHit(out, t, 0.12, 3000, 6000, 4, 0.4, 'bandpass'); break;
      case 'ability': this.tone(out, t, 0.18, 500, 1000, 0.25, 'triangle'); break;
      case 'denied': this.tone(out, t, 0.12, 220, 200, 0.25, 'square'); break;
      case 'medal': this.tone(out, t, 0.12, 660, 660, 0.25, 'triangle'); this.tone(out, t + 0.1, 0.18, 990, 990, 0.25, 'triangle'); break;
      case 'start': this.tone(out, t, 0.6, 440, 440, 0.35, 'triangle'); this.tone(out, t + 0.2, 0.8, 660, 660, 0.35, 'triangle'); break;
    }
  }
}
