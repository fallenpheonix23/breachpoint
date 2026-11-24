// Keyboard + mouse → soldier input for the human player.
// Laptop-friendly aiming: right-click TOGGLES aim/scope by default (setting: toggle/hold),
// and Tab or Caps Lock also toggle aim, so you never need both mouse buttons at once.
import { blankInput } from './bot.js';

export class PlayerController {
  constructor(game, canvas) {
    this.g = game; this.canvas = canvas;
    this.keys = new Set(); this.mouse = [false, false, false];
    this.mdx = 0; this.mdy = 0; this.lookDx = 0; this.lookDy = 0;
    this.sens = 1; this.aimMode = game.opts.aimMode || 'toggle';
    this.aimOn = false;
    this.inp = blankInput();
    this.stance = 'stand';
    this.pressed = new Set();
    this.locked = false;
    const toggleAim = () => { this.aimOn = !this.aimOn; };
    this.handlers = {
      keydown: (e) => {
        if (['Tab', 'Space', 'CapsLock'].includes(e.code)) e.preventDefault();
        if (e.code === 'CapsLock') { toggleAim(); return; } // macOS fires keydown/keyup per toggle
        if (e.code === 'Tab' && !e.repeat) toggleAim();
        if (!this.keys.has(e.code)) this.pressed.add(e.code);
        this.keys.add(e.code);
      },
      keyup: (e) => {
        if (e.code === 'CapsLock') { toggleAim(); return; }
        this.keys.delete(e.code);
      },
      mousedown: (e) => {
        if (!this.locked) return;
        this.mouse[e.button] = true;
        if (e.button === 2 && this.aimMode === 'toggle') toggleAim();
        if (e.button === 1) { this.pressed.add('Mouse1'); e.preventDefault(); }
      },
      mouseup: (e) => { this.mouse[e.button] = false; },
      mousemove: (e) => { if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; } },
      contextmenu: (e) => e.preventDefault(),
      blur: () => { this.keys.clear(); this.mouse = [false, false, false]; },
      lockchange: () => {
        this.locked = document.pointerLockElement === this.canvas;
        if (!this.locked) { this.keys.clear(); this.mouse = [false, false, false]; }
        this.g.onLockChange(this.locked);
      },
    };
    for (const k of ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'contextmenu', 'blur']) addEventListener(k, this.handlers[k]);
    document.addEventListener('pointerlockchange', this.handlers.lockchange);
  }
  dispose() {
    for (const k of ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'contextmenu', 'blur']) removeEventListener(k, this.handlers[k]);
    document.removeEventListener('pointerlockchange', this.handlers.lockchange);
  }
  lock() { if (!this.locked) this.canvas.requestPointerLock(); }
  was(code) { return this.pressed.has(code); }
  get showBoard() { return this.keys.has('KeyP') || this.keys.has('Backquote'); }
  get(s) {
    const k = this.keys, inp = this.inp;
    inp.forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    inp.right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    inp.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    inp.holdBreath = inp.sprint;
    inp.jumpPressed = this.was('Space');
    if (this.was('KeyC') || this.was('ControlLeft')) this.stance = s.stance === 'crouch' ? 'stand' : 'crouch';
    if (this.was('KeyZ')) this.stance = s.stance === 'prone' ? 'stand' : 'prone';
    if (inp.jumpPressed && s.stance !== 'stand') this.stance = 'stand';
    if (inp.sprint && inp.forward > 0 && s.stance === 'crouch' && !s.ads && !s.cover) this.stance = 'stand';
    if (this.stance !== s.stance && this.lastStance === this.stance) this.stance = s.stance; // blocked or overridden
    this.lastStance = this.stance;
    inp.stance = s.cover ? s.stance : this.stance;
    // aim: toggle state (RMB / Tab / Caps Lock) or hold RMB
    if (inp.sprint && inp.forward > 0 && !s.cover && !s.weapon.scope) this.aimOn = false;
    if (!s.alive) this.aimOn = false;
    inp.ads = this.aimMode === 'hold' ? (this.mouse[2] || this.aimOn) : this.aimOn;
    inp.fire = this.mouse[0];
    inp.reloadPressed = this.was('KeyR');
    inp.punchPressed = this.was('KeyF') || this.was('KeyV') || this.was('Mouse1');
    inp.coverPressed = this.was('KeyX');
    inp.ability[0] = this.was('KeyQ');
    inp.ability[1] = this.was('KeyE');
    inp.abilityTarget = null;
    const fov = this.g.camera.fov;
    const adsScale = s.adsT > 0.5 ? Math.max(0.12, fov / 78) * 1.15 : 1;
    const sens = 0.0022 * this.sens * adsScale;
    inp.dYaw = -this.mdx * sens;
    inp.dPitch = -this.mdy * sens;
    this.lookDx = this.mdx; this.lookDy = this.mdy;
    this.mdx = 0; this.mdy = 0;
    this.pressed.clear();
    return inp;
  }
}
