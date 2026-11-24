// ─── BREACHPOINT · game data ────────────────────────────────────────────────
export const TEAM_COLORS = [0x2f9bff, 0xff4040];
export const TEAM_CSS = ['#3aa0ff', '#ff4a4a'];
export const TEAM_NAMES = ['BLUE', 'RED'];
export const KILL_LIMIT = 75;
export const MATCH_TIME = 600; // seconds
export const RESPAWN_TIME = 4.5;

// spread values are cone half-angles in radians
export const WEAPONS = {
  ar: {
    id: 'ar', name: 'VX-7 Assault Rifle', short: 'ASSAULT RIFLE', role: 'All-rounder',
    desc: 'Full-auto rifle. Strong at mid range and workable everywhere.',
    dmg: 24, head: 1.8, rpm: 640, mag: 30, reload: 2.0, auto: true, pellets: 1,
    hip: 0.0044, ads: 0.0027, bloomPer: 0.0025, bloomMax: 0.03, recoil: 0.012,
    // stray model: firstShot = accuracy mult after a pause, recover = bloom shed per second,
    // adsBloom = bloom mult while aiming, yawKick/yawBias = sideways recoil (bias >0 pulls right),
    // climb = extra recoil over a long burst, moveSpread/air = spread added at full run / airborne, center = 0.5 uniform, >0.5 tighter core
    // all spreads are cone radii in radians, tuned to Valorant-like figures (1° = 0.01745 rad)
    tapShots: 3, firstShot: 1, recover: 0.1, adsBloom: 0.8, yawKick: 0.006, yawBias: 0.25, climb: 0.6, moveSpread: 0.105, air: 0.21, center: 0.62,
    falloff: [40, 95], minMult: 0.6, range: 320, adsFov: 50, adsTime: 0.2, move: 1.0,
    tracer: [3.2, 2.4, 1.2], sound: 'ar', stats: { dmg: 55, rate: 65, range: 65, mob: 65 },
  },
  smg: {
    id: 'smg', name: 'K-90 Stinger SMG', short: 'SMG', role: 'Close / hallway',
    desc: 'Very fast fire rate and the quickest movement. Damage drops off fast.',
    dmg: 17, head: 1.5, rpm: 920, mag: 36, reload: 1.7, auto: true, pellets: 1,
    hip: 0.007, ads: 0.0044, bloomPer: 0.003, bloomMax: 0.035, recoil: 0.008,
    tapShots: 4, firstShot: 1, recover: 0.15, adsBloom: 0.8, yawKick: 0.01, yawBias: -0.15, climb: 0.35, moveSpread: 0.026, air: 0.1, center: 0.5,
    falloff: [14, 42], minMult: 0.5, range: 220, adsFov: 60, adsTime: 0.14, move: 1.1,
    tracer: [3.2, 2.6, 1.4], sound: 'smg', stats: { dmg: 35, rate: 95, range: 30, mob: 95 },
  },
  hmg: {
    id: 'hmg', name: 'M-240 Juggernaut HMG', short: 'HMG', role: 'Suppression',
    desc: '100-round belt. Spins up before firing and slows you down, but holds lanes.',
    dmg: 26, head: 1.6, rpm: 580, mag: 100, reload: 4.3, spinup: 0.5, auto: true, pellets: 1,
    hip: 0.014, ads: 0.0087, bloomPer: 0.0012, bloomMax: 0.02, recoil: 0.009,
    tapShots: 2, firstShot: 1, recover: 0.08, adsBloom: 0.6, yawKick: 0.011, yawBias: 0, climb: 0.9, moveSpread: 0.087, air: 0.2, center: 0.45, braced: 0.45,
    falloff: [45, 110], minMult: 0.65, range: 320, adsFov: 55, adsTime: 0.35, move: 0.8,
    tracer: [3.6, 2.0, 0.8], sound: 'hmg', stats: { dmg: 60, rate: 60, range: 70, mob: 30 },
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12 Shotgun', short: 'SHOTGUN', role: 'Point blank',
    desc: 'Ten pellets per pump. One-shots up close, useless at range.',
    dmg: 16, pellets: 10, head: 1.4, rpm: 75, mag: 6, shellReload: 0.48, auto: false,
    hip: 0.039, ads: 0.033, bloomPer: 0.004, bloomMax: 0.01, recoil: 0.06,
    firstShot: 1, recover: 0.05, adsBloom: 1, yawKick: 0.022, yawBias: 0, climb: 0, moveSpread: 0.012, air: 0.04, center: 0.5, patternJitter: 0.25,
    falloff: [8, 24], minMult: 0.2, range: 70, adsFov: 64, adsTime: 0.18, move: 1.05,
    tracer: [3.0, 2.2, 1.2], sound: 'shotgun', stats: { dmg: 95, rate: 15, range: 15, mob: 80 },
  },
  sniper: {
    id: 'sniper', name: 'Longbow .50 Sniper', short: 'SNIPER', role: 'Long range',
    desc: 'Bolt-action. One-shot headshots at any range. Steadier crouched or prone.',
    dmg: 110, head: 2.2, rpm: 46, mag: 5, reload: 2.9, auto: false, pellets: 1,
    hip: 0.087, ads: 0.0, bloomPer: 0, bloomMax: 0, recoil: 0.07,
    firstShot: 1, recover: 0.1, adsBloom: 1, yawKick: 0.02, yawBias: 0, climb: 0, moveSpread: 0.09, air: 0.2, center: 0.6, settle: 0.4, settleSpread: 0.006,
    falloff: [999, 1000], minMult: 1, range: 650, adsFov: 9, adsTime: 0.3, move: 0.9, scope: true,
    tracer: [1.6, 2.8, 4.0], sound: 'sniper', stats: { dmg: 100, rate: 8, range: 100, mob: 55 },
  },
};
export const WEAPON_ORDER = ['ar', 'smg', 'hmg', 'shotgun', 'sniper'];

export const ABILITIES = {
  arc:         { name: 'Arc Grenade', cat: 'Offensive', cd: 16, icon: '⚡', desc: 'Lightning jumps between enemies standing close together. Strongest against groups.' },
  singularity: { name: 'Singularity Grenade', cat: 'Offensive', cd: 20, icon: '◉', desc: 'Gravity well that pulls enemies to one spot for a few seconds. Combo it with Arc.' },
  swarm:       { name: 'Swarm Pod', cat: 'Offensive', cd: 22, icon: '✺', desc: 'Burst of 8 tiny homing drones that chase the nearest targets.' },
  tripmine:    { name: 'Plasma Tripmine', cat: 'Offensive', cd: 14, icon: '⌁', desc: 'Stick a laser tripwire to a wall to booby-trap a route. Max 2 active.' },
  disc:        { name: 'Ricochet Disc', cat: 'Offensive', cd: 10, icon: '◎', desc: 'Thrown blade that bounces off walls. Each bounce adds damage.' },
  sonic:       { name: 'Sonic Repulser', cat: 'Crowd Control', cd: 12, icon: '≋', desc: 'Cone blast that knocks enemies back. Bonus damage if they slam into a wall.' },
  emp:         { name: 'EMP', cat: 'Crowd Control', cd: 20, icon: 'ϟ', desc: 'Strips shields, silences abilities, kills drones/mines/walls/decoys, disables turrets.' },
  stasis:      { name: 'Stasis Field', cat: 'Crowd Control', cd: 26, icon: '❄', desc: 'Time nearly stops inside. Enemies freeze and bullets hang in the air until it collapses.' },
  hardlight:   { name: 'Hard-Light Wall', cat: 'Crowd Control', cd: 18, icon: '▤', desc: 'Instant cover wall. Your team shoots out through it; enemies can\'t shoot in.' },
  grapple:     { name: 'Grapple Line', cat: 'Movement', cd: 8, icon: '⤴', desc: 'Pull yourself to a surface, or yank an enemy toward you (and into walls).' },
  phase:       { name: 'Phase Dash', cat: 'Movement', cd: 7, icon: '»', desc: 'Short teleport that passes through enemies and bullets.' },
  jumppad:     { name: 'Jump Pad', cat: 'Movement', cd: 18, icon: '⇑', desc: 'Drop a launch pad your team can use. Stays in the level for 25 s.' },
  pulse:       { name: 'Pulse Scanner', cat: 'Recon', cd: 20, icon: '◌', desc: 'Briefly shows enemies within 70 m through walls to your whole team.' },
  decoy:       { name: 'Holo-Decoy', cat: 'Recon', cd: 15, icon: '⧉', desc: 'A fake copy of you runs forward and draws enemy fire.' },
  hack:        { name: 'Hack Dart', cat: 'Recon', cd: 16, icon: '⌖', desc: 'Turns an enemy sentry turret (or drones/mines) to your side for 15 s. Tags soldiers.' },
};
export const ABILITY_CATS = ['Offensive', 'Crowd Control', 'Movement', 'Recon'];

export const BOT_NAMES = ['Vex', 'Kestrel', 'Rook', 'Juno', 'Talon', 'Mako', 'Nyx', 'Ghost', 'Sable',
  'Orion', 'Havoc', 'Cipher', 'Wren', 'Blitz', 'Saber', 'Echo', 'Drift', 'Volt'];

// ── Bot fairness: engagement range is derived from how big a soldier looks on a small laptop screen.
// A 1.8 m soldier is REF_PX pixels tall at this distance on a REF_H-pixel-tall screen at DEFAULT_HFOV.
export const DEFAULT_HFOV = 95, REF_W = 1366, REF_H = 768, REF_PX = 20;
export function visibleRange(hfov = DEFAULT_HFOV, px = REF_PX, w = REF_W, h = REF_H) {
  const vfov = 2 * Math.atan(Math.tan((hfov * Math.PI) / 360) * (h / w));
  return (1.8 * h) / (2 * Math.tan(vfov / 2) * px);
}
export const VIS_RANGE = visibleRange(); // ≈ 56 m

// react: [min, max] seconds from first sighting to first shot · err: starting aim error (rad)
// minErr: settled error · distK: error grows by +100% every distK metres · firstMiss: extra error on
// the opening shots at long range, decaying over `settle` s · engage: × VIS_RANGE before opening fire
export const DIFFICULTY = {
  recruit: { label: 'Recruit (easy)', react: [0.45, 0.7], err: 0.09, minErr: 0.03, distK: 30, firstMiss: 3.0, settle: 1.4, engage: 0.85, turn: 3.5, fireTol: 0.07, headChance: 0.05, abilityRate: 0.3, brawl: 0.2 },
  veteran: { label: 'Veteran (normal)', react: [0.25, 0.4], err: 0.06, minErr: 0.016, distK: 45, firstMiss: 2.2, settle: 1.0, engage: 1.0, turn: 6, fireTol: 0.045, headChance: 0.15, abilityRate: 0.55, brawl: 0.45 },
  elite:   { label: 'Elite (hard)', react: [0.2, 0.3], err: 0.045, minErr: 0.009, distK: 60, firstMiss: 1.5, settle: 0.7, engage: 1.15, turn: 9, fireTol: 0.03, headChance: 0.3, abilityRate: 0.85, brawl: 0.7 },
};
