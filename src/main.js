// Entry: 3-step loadout → Game.
import { Game } from './game.js';
import { Loadout } from './loadout.js';
import { mapById, randomMap } from './maps/index.js';

const $ = (id) => document.getElementById(id);
const dbg = new URLSearchParams(location.search);
if (dbg.has('mapdebug')) {
  document.getElementById('loadout').classList.add('hidden');
  const { runDebugView } = await import('./debugview.js');
  runDebugView(dbg.get('mapdebug') || 'testbed', +(dbg.get('view') || 0));
  throw new Error('map debug mode'); // stop the normal boot (expected)
}
let saved = {};
try { saved = JSON.parse(localStorage.getItem('breachpoint.loadout') || '{}'); } catch { saved = {}; }
if (saved.sv !== 2) { delete saved.quality; delete saved.renderScale; } // v2: new display defaults (100% res, no silent auto-downscale)
let game = null, last = null;
const settings = { sens: saved.sens ?? 1, volume: saved.volume ?? 0.6 };
$('sens').value = settings.sens; $('vol').value = settings.volume;

function persist(o) {
  try { localStorage.setItem('breachpoint.loadout', JSON.stringify({ ...o, ...settings, sv: 2 })); } catch { /* storage unavailable */ }
}
function start(o) {
  last = o; persist(o);
  $('loadout').classList.add('hidden');
  $('loadingMsg').textContent = `Deploying to ${mapById(o.map).name}…`;
  $('loading').classList.remove('hidden');
  setTimeout(() => {
    try {
      game = new Game({ ...o, sens: settings.sens, volume: settings.volume }, {
        restart: () => { game.dispose(); game = null; start({ ...last, map: randomMap().id }); },
        quit: toLoadout,
      });
    } catch (e) {
      console.error(e);
      $('loadingMsg').textContent = 'Failed to start: ' + e.message;
      setTimeout(toLoadout, 2500);
      return;
    }
    $('loading').classList.add('hidden');
  }, 40);
}
function toLoadout() {
  if (game) { game.dispose(); game = null; }
  $('pause').classList.add('hidden'); $('endscreen').classList.add('hidden'); $('loading').classList.add('hidden');
  $('loadout').classList.remove('hidden');
  loadout.go(0);
}
const loadout = new Loadout(saved, (o) => start(o));
$('quitBtn').onclick = (e) => { e.stopPropagation(); toLoadout(); };
$('sens').oninput = (e) => { settings.sens = +e.target.value; if (game) game.input.sens = settings.sens; if (last) persist(last); };
$('vol').oninput = (e) => {
  settings.volume = +e.target.value;
  if (game) { game.audio.volume = settings.volume; if (game.audio.master) game.audio.master.gain.value = settings.volume; }
  if (last) persist(last);
};
// test hook: ?autostart&debug&weapon=sniper&ab=arc,stasis&map=kilnworks
const qp = new URLSearchParams(location.search);
if (qp.has('autostart')) {
  loadout.setFromOpts({ weapon: qp.get('weapon'), abilities: (qp.get('ab') || 'arc,grapple').split(','), map: qp.get('map') });
  const o = loadout.result();
  if (qp.get('quality')) o.quality = qp.get('quality');
  start(o);
}
