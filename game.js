"use strict";
/* =========================================================================
   REDLIGHT RUN  -  infinite side-scrolling platformer
   ========================================================================= */
(function () {

/* ------------------------------ utils ---------------------------------- */
/* The course is fixed. Level generation draws from a seeded stream so every run
   lays out an identical world; cosmetic randomness (particles, sparks, screen
   shake) stays on Math.random so a dropped frame can never shift the level.
   rngSrc is swapped to the seeded stream for the duration of generate() only. */
const DEFAULT_SEED = 0x5EED1A7E;
function readSeed() {
  if (typeof location === 'undefined' || !location.search) return DEFAULT_SEED;
  const m = /[?&]seed=(-?\d+)/.exec(location.search);
  return m ? (parseInt(m[1], 10) >>> 0) : DEFAULT_SEED;
}
let WORLD_SEED = readSeed();
let wstate = WORLD_SEED;
function worldRand() {                                   // mulberry32
  wstate = (wstate + 0x6D2B79F5) | 0;
  let t = Math.imul(wstate ^ (wstate >>> 15), 1 | wstate);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

let rngSrc = Math.random;
const rnd   = (a, b) => a + rngSrc() * (b - a);
const ri    = (a, b) => Math.floor(a + rngSrc() * (b - a + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const chance = p => rngSrc() < p;
const aabb  = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

const $ = id => document.getElementById(id);

/* ------------------------------ tuning --------------------------------- */
const PPM        = 20;      // pixels per "metre" of score
const GRAV       = 2600;
const MAX_FALL   = 1500;
const JUMP_V     = 800;     // single jump apex ~123px, double ~245px
const DBL_V      = 760;
const RUN_SPEED  = 330;
const CROUCH_SPD = 155;
const ACC_GROUND = 3400;
const ACC_AIR    = 2100;
const FRICTION   = 3600;
const PW = 26, PH = 46, PHC = 24;
const COYOTE = 0.10, BUFFER = 0.12;
const VIEW_H = 720;

/* colours */
const C = {
  rock:  '#141a2c', rockHi: '#2b3a63', edge: '#4fd8ff',
  block: '#1a2138', blockHi: '#5a7ad8',
  ledge: '#1d2742', ledgeHi: '#7effd0',
  slab:  '#181d31', slabHi: '#8a6bd8',
  spike: '#ff3b52', spikeGlow: 'rgba(255,60,80,.45)',
  green: '#3dff9a', red: '#ff3550', amber: '#ffc043'
};

/* ------------------------------ canvas --------------------------------- */
const cv = $('cv'), ctx = cv.getContext('2d');
let CSSW = 0, CSSH = 0, DPR = 1, SC = 1, viewW = 1280, viewH = VIEW_H;

function resize() {
  DPR  = Math.min(window.devicePixelRatio || 1, 2);
  CSSW = window.innerWidth; CSSH = window.innerHeight;
  cv.width  = Math.round(CSSW * DPR);
  cv.height = Math.round(CSSH * DPR);
  cv.style.width = CSSW + 'px'; cv.style.height = CSSH + 'px';
  SC    = CSSH / VIEW_H;
  viewH = VIEW_H;
  viewW = CSSW / SC;
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------ audio ---------------------------------- */
let actx = null, master = null;
let muted = localStorage.getItem('rlr_mute') === '1';

function audioInit() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.32;
    master.connect(actx.destination);
  } catch (e) { actx = null; }
}
function setMute(m) {
  muted = m; localStorage.setItem('rlr_mute', m ? '1' : '0');
  if (master) master.gain.value = m ? 0 : 0.32;
}
function tone(freq, dur, type, vol, slideTo) {
  if (!actx || muted) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(25, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol == null ? 0.25 : vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, freq) {
  if (!actx || muted) return;
  const t = actx.currentTime, len = Math.max(1, Math.floor(actx.sampleRate * dur));
  const buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
  const g = actx.createGain(); g.gain.value = vol == null ? 0.25 : vol;
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}
const sfx = {
  jump:  () => tone(430, 0.13, 'square', 0.16, 780),
  dbl:   () => tone(660, 0.15, 'triangle', 0.16, 1120),
  land:  () => noise(0.07, 0.10, 700),
  shoot: () => tone(220, 0.07, 'sawtooth', 0.09, 90),
  green: () => { tone(560, 0.10, 'sine', 0.18); setTimeout(() => tone(840, 0.14, 'sine', 0.16), 90); },
  warn:  () => tone(400, 0.09, 'square', 0.13),
  red:   () => { tone(300, 0.22, 'sawtooth', 0.16, 150); noise(0.2, 0.08, 500); },
  die:   () => { tone(180, 0.5, 'sawtooth', 0.28, 40); noise(0.5, 0.22, 900); },
  mark:  () => tone(1050, 0.09, 'sine', 0.10, 1400)
};

/* ------------------------------ input ---------------------------------- */
const K = { left: false, right: false, up: false, down: false };
let jumpPressed = false, jumpHeld = false;

function keyFlag(code, down) {
  switch (code) {
    case 'ArrowLeft': case 'KeyA': K.left = down; return true;
    case 'ArrowRight': case 'KeyD': K.right = down; return true;
    case 'ArrowDown': case 'KeyS': K.down = down; return true;
    case 'ArrowUp': case 'KeyW': case 'Space':
      if (down && !jumpHeld) jumpPressed = true;
      jumpHeld = down; K.up = down; return true;
  }
  return false;
}
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  audioInit();
  if (keyFlag(e.code, true)) e.preventDefault();
  if (e.code === 'KeyM') setMute(!muted);
  if (e.code === 'KeyR' && (S.mode === 'play' || S.mode === 'dead')) startRun();
  if (e.code === 'Enter' && S.mode === 'menu') startRun();
});
window.addEventListener('keyup', e => { if (keyFlag(e.code, false)) e.preventDefault(); });
window.addEventListener('blur', () => { K.left = K.right = K.up = K.down = false; jumpHeld = false; });

/* touch */
const touchEl = $('touch');
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) touchEl.classList.add('on');
function bindTouch(el, on, off) {
  const set = (v, e) => {
    e.preventDefault(); audioInit();
    el.classList.toggle('act', v);
    v ? on() : off();
  };
  el.addEventListener('touchstart', e => set(true, e), { passive: false });
  el.addEventListener('touchend',   e => set(false, e), { passive: false });
  el.addEventListener('touchcancel', e => set(false, e), { passive: false });
}
bindTouch($('tL'), () => K.left = true,  () => K.left = false);
bindTouch($('tR'), () => K.right = true, () => K.right = false);
bindTouch($('tC'), () => K.down = true,  () => K.down = false);
bindTouch($('tJ'), () => { jumpPressed = true; jumpHeld = true; }, () => { jumpHeld = false; });

/* ------------------------------ world ---------------------------------- */
const W = {
  solids: [], spikes: [], enemies: [], bullets: [], zones: [], parts: [], backs: [],
  segs: [], genX: 0, genY: 0, lastType: '', n: 0
};

/* nothing that can kill you on its own spawns before this world x */
let SAFE_X = 900;

/* a solid interior for tunnels and shafts so the parallax sky does not show through */
function addBack(x, y, w, h) { W.backs.push({ x, y, w, h }); }

function addSolid(x, y, w, h, kind) { W.solids.push({ x, y, w, h, oneWay: false, kind: kind || 'rock' }); }
function addLedge(x, y, w)          { W.solids.push({ x, y, w, h: 20, oneWay: true, kind: 'ledge' }); }
function addGround(x, y, w)         { addSolid(x, y, w, 1100, 'rock'); }
/* spikes: rect is the hit box; dir controls how the teeth are drawn */
function addSpikes(x, y, w, dir)    { W.spikes.push({ x, y, w, h: 18, dir: dir || 'up' }); }
function floorSpikes(x, surfY, w)   { addSpikes(x, surfY - 18, w, 'up'); }
function pit(x, surfY, w) {           // bottomless-looking gap with spikes at the bottom
  const fy = surfY + 240;
  addSolid(x, fy, w, 900, 'rock');
  floorSpikes(x + 4, fy, w - 8);
}

function walker(x, surfY, minX, maxX) {
  if (x < SAFE_X) return;
  W.enemies.push({ type: 'walker', x: x, y: surfY - 36, w: 30, h: 36,
    minX, maxX, vx: chance(0.5) ? -95 : 95, t: 0 });
}
function flyer(x, y, amp, w) {
  if (x < SAFE_X) return;
  W.enemies.push({ type: 'flyer', x, y, w: 30, h: 26, baseY: y, amp,
    minX: x - w, maxX: x + w, vx: chance(0.5) ? -80 : 80, t: rnd(0, 6) });
}
function turret(x, surfY, mode) {
  // high = shoots over a crouching player, low = must be jumped
  if (x < SAFE_X) return;
  const my = mode === 'high' ? surfY - 34 : surfY - 14;
  W.enemies.push({ type: 'turret', x: x - 17, y: my - 20, w: 34, h: 40,
    my, sy: surfY, mode, cd: rnd(0.2, 1.2), rate: 1.0, dir: -1 });
}
function slasher(x, surfY) {
  if (x < SAFE_X) return;
  W.enemies.push({ type: 'slasher', x: x - 16, y: surfY - 44, w: 32, h: 44,
    t: rnd(0, 2.2), reach: 76 });
}

/* ---- segment generators: f(x, surfaceY, difficulty) -> {w, y} ---------- */

function segFlat(x, y, d) {
  const w = rnd(340, 640);
  addGround(x, y, w);
  if (x > SAFE_X && chance(0.3 + 0.35 * d)) {
    walker(x + w * 0.5, y, x + 50, x + w - 50);
  } else {
    const n = chance(0.55) ? 1 : (d > 0.4 && chance(0.4) ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const bh = rnd(45, 95 + 115 * d);                  // tops out at 210; double jump lifts the feet 228
      addSolid(x + 100 + (w - 240) * (n === 1 ? rnd(0.15, 0.85) : i / n + 0.1),
               y - bh, rnd(32, 58), bh, 'block');
    }
  }
  return { w, y };
}

function segGaps(x, y, d) {
  let cx = x, cy = y;
  addGround(cx, cy, 110); cx += 110;
  const n = 2 + ri(0, 1) + Math.floor(d * 2);
  for (let i = 0; i < n; i++) {
    const gap = rnd(115, 175 + 85 * d);                  // max 260, double jump carries 327
    pit(cx, cy, gap); cx += gap;
    /* a step up is only fair if the gap itself is short */
    const step = chance(0.42) ? (chance(0.5) && gap < 195 ? -60 : 60) : 0;
    const ny = cy + step;
    const pw = Math.max(95, rnd(130, 215) - 45 * d);
    addGround(cx, ny, pw); cx += pw; cy = ny;
  }
  return { w: cx - x, y: cy };
}

function segPillars(x, y, d) {
  let cx = x;
  addGround(cx, y, 95); cx += 95;
  const n = 3 + ri(0, 1) + Math.floor(d * 2);
  const span = n * (150 + 55 * d) + 70;
  addSolid(cx, y, span, 900, 'rock');
  floorSpikes(cx + 5, y, span - 10);
  let px = cx + 35, h = rnd(55, 90);
  const hiMax = 105 + 115 * d;
  for (let i = 0; i < n; i++) {
    h = clamp(h + rnd(-80, 80), 55, hiMax);              // gentle staircase, never a 200px step
    const pw = rnd(46, 76);
    addSolid(px, y - h, pw, h + 900, 'pillar');
    if (i === 1 && d > 0.35 && chance(0.4)) addSpikes(px, y - h - 18 - 150, pw, 'down');
    px += pw + rnd(95, 130 + 55 * d);
  }
  cx += span;
  addGround(cx, y, 120); cx += 120;
  return { w: cx - x, y };
}

function segCrouch(x, y, d) {
  let cx = x;
  addGround(cx, y, 70); cx += 70;
  const n = 1 + ri(0, 1) + (d > 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const len = rnd(170, 290 + 90 * d);
    addGround(cx, y, len);
    const spiked = chance(0.45 + 0.3 * d);
    const gapTop = spiked ? y - 52 : y - 34;             // crouch box is 24 tall
    addSolid(cx, gapTop - 120, len, 120, 'slab');
    addBack(cx, gapTop, len, y - gapTop);
    if (spiked) addSpikes(cx + 6, y - 52, len - 12, 'down');
    cx += len;
    const brk = rnd(80, 150);
    addGround(cx, y, brk);
    /* spikes belong in the open break, where there is headroom to jump them */
    if (d > 0.4 && brk > 110 && chance(0.4)) floorSpikes(cx + brk * 0.5 - 22, y, 44);
    cx += brk;
  }
  return { w: cx - x, y };
}

function segTurrets(x, y, d) {
  const w = rnd(430, 660);
  addGround(x, y, w);
  const n = 1 + ri(0, 1) + (d > 0.55 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const tx = x + 150 + (w - 230) * ((i + 0.5) / n);
    turret(tx, y, chance(0.55) ? 'high' : 'low');
  }
  for (let i = 0; i < 2; i++) {
    if (chance(0.65)) addSolid(x + rnd(90, w - 150), y - 62, 26, 62, 'block');
  }
  return { w, y };
}

function segShaftUp(x, y, d) {
  const SW = 350, steps = [3, 5, 5, 7][ri(0, 3)];
  const rise = 100;
  const topY = y - rise * steps;
  addBack(x, topY - 60, SW, (y + 20) - (topY - 60));
  /* left wall keeps a 62px doorway at the bottom so you can walk in */
  addSolid(x, topY - 60, 40, (y - 62) - (topY - 60), 'rock');
  /* right wall: its top surface is the exit ledge */
  addSolid(x + SW - 40, topY, 40, (y + 900) - topY, 'rock');
  /* floor: safe landing pad, then spikes all the way across */
  addSolid(x, y, SW, 900, 'rock');
  floorSpikes(x + 130, y, SW - 175);
  for (let i = 1; i <= steps; i++) {
    const right = (i % 2) === 1;
    const ly = y - rise * i;
    const lw = i === steps ? 130 : rnd(105, 130);
    const lx = right ? x + SW - 40 - lw : x + 40;
    addLedge(lx, ly, lw);
    if (i > 1 && i < steps && d > 0.45 && chance(0.3))
      addSpikes(right ? x + 40 : x + SW - 58, ly - 70, 18, right ? 'right' : 'left');
  }
  if (d > 0.5 && chance(0.45)) flyer(x + SW * 0.5, y - rise * (steps * 0.5), 46, 90);
  return { w: SW, y: topY };
}

function segShaftDown(x, y, d) {
  const SW = 340, steps = [2, 3, 3, 4][ri(0, 3)];
  const drop = 130;
  const botY = y + drop * steps;
  addBack(x, y, SW, botY - y + 20);
  addSolid(x + SW - 40, y - 340, 40, (botY - 62) - (y - 340), 'rock');
  addSolid(x, botY, SW, 900, 'rock');
  floorSpikes(x + 6, botY, SW - 175);
  for (let i = 1; i <= steps; i++) {
    const right = (i % 2) === 0;
    const ly = y + drop * i;
    const lw = rnd(100, 135);
    const lx = right ? x + SW - 40 - lw : x + 42;
    addLedge(lx, ly, lw);
    if (d > 0.4 && chance(0.35)) addSpikes(lx + lw * 0.5 - 12, ly - 18, 24, 'up');
  }
  return { w: SW, y: botY };
}

function segRedlight(x, y, d) {
  const w = rnd(560, 760) + d * 220;
  addGround(x, y, w);
  if (chance(0.45 + 0.3 * d)) addSolid(x + w * rnd(0.35, 0.6), y - 72, 30, 72, 'block');
  W.zones.push({
    x: x + 45, y: y - 900, w: w - 90, h: 1100,
    t: 0, state: 'green',
    tGreen: Math.max(1.15, 2.9 - 1.3 * d),
    tWarn: Math.max(0.4, 0.72 - 0.2 * d),
    tRed: 1.1 + rnd(0, 1.1) + 0.7 * d,
    eyeX: x + w - 46, eyeY: y - 168, blink: 0, surfY: y
  });
  return { w, y };
}

function segFlyers(x, y, d) {
  let cx = x;
  addGround(cx, y, 130); cx += 130;
  const n = 2 + (d > 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const gap = rnd(140, 200 + 60 * d);
    pit(cx, y, gap); cx += gap;
    const pw = rnd(120, 190);
    addGround(cx, y, pw); cx += pw;
  }
  const span = cx - x;
  for (let i = 0; i < n; i++)
    flyer(x + span * ((i + 0.5) / n), y - rnd(80, 190), rnd(35, 70), rnd(70, 130));
  return { w: span, y };
}

function segSlash(x, y, d) {
  const w = rnd(430, 620);
  addGround(x, y, w);
  const n = 1 + (d > 0.45 ? 1 : 0) + (d > 0.8 ? 1 : 0);
  for (let i = 0; i < n; i++) slasher(x + 160 + (w - 260) * ((i + 0.5) / n), y);
  if (chance(0.4)) addSolid(x + rnd(80, w - 120), y - 55, 28, 55, 'block');
  return { w, y };
}

function segGauntlet(x, y, d) {
  let cx = x;
  addGround(cx, y, 90); cx += 90;
  const n = 3 + ri(0, 2) + Math.floor(d * 2);
  for (let i = 0; i < n; i++) {
    const sw = rnd(48, 78 + 40 * d);
    addGround(cx, y, sw); floorSpikes(cx, y, sw); cx += sw;
    const gapw = rnd(70, 120);
    addGround(cx, y, gapw);
    if (chance(0.35 + 0.3 * d)) addSolid(cx - 10, y - 250, gapw + 20, 120, 'slab');
    cx += gapw;
  }
  addGround(cx, y, 110); cx += 110;
  return { w: cx - x, y };
}

const POOL = [
  { id: 'flat',  f: segFlat,      w: () => 2.6,               easy: true },
  { id: 'gaps',  f: segGaps,      w: () => 2.4,               easy: true },
  { id: 'pill',  f: segPillars,   w: d => 0.5 + 1.8 * d },
  { id: 'crch',  f: segCrouch,    w: d => 0.7 + 1.6 * d },
  { id: 'turr',  f: segTurrets,   w: d => 0.35 + 1.9 * d },
  { id: 'up',    f: segShaftUp,   w: d => 0.3 + 1.7 * d },
  { id: 'down',  f: segShaftDown, w: d => 0.2 + 1.5 * d },
  { id: 'red',   f: segRedlight,  w: d => 0.55 + 1.7 * d },
  { id: 'fly',   f: segFlyers,    w: d => 0.25 + 1.5 * d },
  { id: 'slsh',  f: segSlash,     w: d => 0.2 + 1.6 * d },
  { id: 'gaunt', f: segGauntlet,  w: d => 0.35 + 1.7 * d }
];

const SEG_LABEL = {
  flat: '', gaps: 'CHASM', pill: 'SPIRE FIELD', crch: 'THE CRAWL',
  turr: 'FIRING LINE', up: 'ASCENT', down: 'DESCENT', red: 'WATCHER ZONE',
  fly: 'SWARM', slsh: 'BLADEWORKS', gaunt: 'THE TEETH'
};

/* Difficulty of a segment is a property of WHERE it sits in the course, not of
   where the player was standing when it happened to stream in. */
function genDifficulty() { return clamp((W.genX - S.startX) / 11000, 0, 1); }
/* How far the player has actually got - drives the storm, never the layout. */
function runDifficulty() { return clamp((P.x - S.startX) / 11000, 0, 1); }

function generate() {
  rngSrc = worldRand;
  try { generateSeeded(); } finally { rngSrc = Math.random; }
}

function generateSeeded() {
  const d = genDifficulty();
  let entry;
  if (W.n < 3) {
    entry = POOL[W.n === 1 ? 1 : 0];
  } else if (W.lastType !== 'flat' && chance(0.42)) {
    entry = POOL[0];                                     // breather after anything spicy
  } else {
    let tot = 0;
    const ws = POOL.map(p => {
      let v = p.w(d);
      if (p.id === W.lastType) v *= 0.15;
      tot += v; return v;
    });
    let r = rngSrc() * tot;
    entry = POOL[POOL.length - 1];
    for (let i = 0; i < POOL.length; i++) { r -= ws[i]; if (r <= 0) { entry = POOL[i]; break; } }
  }
  const x = W.genX, y = W.genY;
  const res = entry.f(x, y, d);
  W.segs.push({ x0: x, x1: x + res.w, killY: Math.max(y, res.y) + 980, id: entry.id });
  W.genX = x + res.w;
  W.genY = res.y;
  W.lastType = entry.id;
  W.n++;
}

function prune(minX) {
  const keep = o => o.x + (o.w || 0) > minX;
  W.solids  = W.solids.filter(keep);
  W.spikes  = W.spikes.filter(keep);
  W.enemies = W.enemies.filter(keep);
  W.zones   = W.zones.filter(keep);
  W.backs   = W.backs.filter(keep);
  W.segs    = W.segs.filter(s => s.x1 > minX);
  W.bullets = W.bullets.filter(b => b.x > minX && b.life > 0);
}

/* ------------------------------ player --------------------------------- */
const P = { x: 0, y: 0, vx: 0, vy: 0, w: PW, h: PH, crouch: false, onGround: false,
            jumps: 0, coyote: 0, buffer: 0, face: 1, run: 0, alive: true, trail: [] };

const S = { mode: 'menu', startX: 0, best: 0, dist: 0, maxX: 0, t: 0,
            shake: 0, cause: '', deadT: 0, litState: 'none' };

const cam = { x: 0, y: 0, sx: 0, sy: 0 };
const storm = { x: 0, v: 0, flash: 0 };

function part(x, y, vx, vy, life, col, r) {
  if (W.parts.length > 420) return;
  W.parts.push({ x, y, vx, vy, life, max: life, col, r: r || 3, g: 1 });
}
function burst(x, y, n, col, spd, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(spd * 0.3, spd);
    part(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(life * 0.5, life), col, rnd(2, 4.5));
  }
}

/* ------------------------------ run control ---------------------------- */
function startRun() {
  audioInit();
  W.solids = []; W.spikes = []; W.enemies = []; W.bullets = []; W.zones = []; W.parts = [];
  W.backs = []; W.segs = []; W.genX = 0; W.genY = 0; W.lastType = ''; W.n = 0;
  wstate = WORLD_SEED;                                   // rewind the course

  addGround(-600, 0, 700);                                // safe launch pad
  W.segs.push({ x0: -600, x1: 100, killY: 980, id: 'flat' });
  W.genX = 100; W.genY = 0;

  P.x = -180; P.y = -PH; P.vx = 0; P.vy = 0; P.w = PW; P.h = PH;
  P.crouch = false; P.onGround = true; P.jumps = 0; P.coyote = 0; P.buffer = 0;
  P.face = 1; P.run = 0; P.alive = true; P.trail.length = 0;
  SAFE_X = P.x + 950;

  S.mode = 'play'; S.startX = P.x; S.dist = 0; S.maxX = P.x; S.t = 0;
  S.shake = 0; S.cause = ''; S.deadT = 0; S.litState = 'none'; S.lbl = null;
  $('zone').textContent = '';
  storm.x = P.x - 760; storm.v = 55; storm.flash = 0;
  cam.x = P.x - viewW * 0.36; cam.y = P.y - viewH * 0.55;

  while (W.genX < P.x + 2600) generate();

  $('menu').classList.add('hidden');  $('menu').classList.remove('on');
  $('death').classList.add('hidden'); $('death').classList.remove('on');
  $('hud').classList.remove('hidden');
  $('lightBox').classList.remove('on');
  fadeOut();
}

function fadeOut() { const f = $('fade'); f.style.opacity = '0'; }

function die(cause) {
  if (!P.alive) return;
  P.alive = false; S.mode = 'dead'; S.cause = cause; S.deadT = 0; S.shake = 26;
  redFreeze = false;
  sfx.die();
  burst(P.x + P.w / 2, P.y + P.h / 2, 34, '#ff5a70', 460, 0.9);
  burst(P.x + P.w / 2, P.y + P.h / 2, 18, '#ffd166', 300, 0.7);
  setTimeout(showDeath, 820);
}

/* ------------------------------ high scores ---------------------------- */
const SKEY = 'rlr_scores_v1', NKEY = 'rlr_name';
function loadScores() {
  try { const a = JSON.parse(localStorage.getItem(SKEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function saveScores(a) { try { localStorage.setItem(SKEY, JSON.stringify(a.slice(0, 10))); } catch (e) {} }
function bestScore() { const a = loadScores(); return a.length ? a[0].s : 0; }
function renderScores(el, hi) {
  const a = loadScores();
  if (!a.length) { el.innerHTML = '<h3>LOCAL HIGH SCORES</h3><div class="empty">No runs recorded yet.</div>'; return; }
  el.innerHTML = '<h3>LOCAL HIGH SCORES</h3>' + a.map((r, i) =>
    '<div class="row' + (hi != null && i === hi ? ' me' : '') + '">' +
    '<span class="rk">' + (i + 1) + '</span>' +
    '<span class="nm">' + r.n + '</span>' +
    '<span class="sc">' + r.s + ' m</span></div>').join('');
}

let pendingScore = -1;
function showDeath() {
  const sc = S.dist, prevBest = bestScore();
  $('dTitle').textContent = 'YOU DIED';
  $('dCause').textContent = S.cause;
  $('dScore').textContent = sc;
  $('dBest').textContent  = 'BEST ' + Math.max(prevBest, 0) + ' M';
  $('newRec').style.display = (sc > prevBest && sc > 0) ? 'block' : 'none';

  const list = loadScores();
  const qualifies = sc > 0 && (list.length < 10 || sc > list[list.length - 1].s);
  pendingScore = -1;
  if (qualifies) {
    $('nameRow').style.display = 'flex';
    $('nameIn').value = localStorage.getItem(NKEY) || '';
    pendingScore = sc;
  } else {
    $('nameRow').style.display = 'none';
  }
  renderScores($('dScores'), null);
  $('death').classList.remove('hidden'); $('death').classList.add('on');
  $('hud').classList.add('hidden');
}
function commitScore() {
  if (pendingScore < 0) return;
  let n = ($('nameIn').value || 'YOU').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'YOU';
  localStorage.setItem(NKEY, n);
  const a = loadScores();
  a.push({ n, s: pendingScore, t: Date.now() });
  a.sort((p, q) => q.s - p.s || p.t - q.t);
  const idx = a.findIndex(r => r.s === pendingScore && r.n === n);
  saveScores(a);
  pendingScore = -1;
  $('nameRow').style.display = 'none';
  renderScores($('dScores'), idx < 10 ? idx : null);
  $('best').textContent = 'BEST ' + bestScore();
  sfx.mark();
}

$('playBtn').onclick  = () => startRun();
$('againBtn').onclick = () => { commitScore(); startRun(); };
$('menuBtn').onclick  = () => {
  commitScore();
  S.mode = 'menu';
  $('death').classList.add('hidden'); $('death').classList.remove('on');
  $('menu').classList.remove('hidden'); $('menu').classList.add('on');
  renderScores($('scores'), null);
};
$('saveBtn').onclick = () => commitScore();
$('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') commitScore(); });

/* ------------------------------ physics -------------------------------- */
function solidsNear(x0, x1) {
  const out = [];
  for (let i = 0; i < W.solids.length; i++) {
    const s = W.solids[i];
    if (s.x < x1 && s.x + s.w > x0) out.push(s);
  }
  return out;
}

function standBlocked() {
  const box = { x: P.x, y: P.y + P.h - PH, w: P.w, h: PH };
  const near = solidsNear(box.x - 4, box.x + box.w + 4);
  for (const s of near) if (!s.oneWay && aabb(box, s)) return true;
  return false;
}

function setHeight(h) { const b = P.y + P.h; P.h = h; P.y = b - h; }

function physics(dt) {
  /* ---- crouch ---- */
  const wantCrouch = K.down;
  if (wantCrouch && !P.crouch)      { P.crouch = true; setHeight(PHC); }
  else if (!wantCrouch && P.crouch && !standBlocked()) { P.crouch = false; setHeight(PH); }

  /* ---- horizontal ---- */
  const maxSpd = P.crouch ? CROUCH_SPD : RUN_SPEED;
  let dir = (K.right ? 1 : 0) - (K.left ? 1 : 0);
  const acc = P.onGround ? ACC_GROUND : ACC_AIR;
  if (dir !== 0) {
    P.face = dir;
    P.vx += dir * acc * dt;
    if (Math.abs(P.vx) > maxSpd) P.vx = maxSpd * Math.sign(P.vx);
  } else {
    const f = FRICTION * (P.onGround ? 1 : 0.35) * dt;
    if (Math.abs(P.vx) <= f) P.vx = 0; else P.vx -= Math.sign(P.vx) * f;
  }

  /* ---- jump ---- */
  if (jumpPressed) { P.buffer = BUFFER; jumpPressed = false; }
  P.buffer = Math.max(0, P.buffer - dt);
  P.coyote = P.onGround ? COYOTE : Math.max(0, P.coyote - dt);

  if (P.buffer > 0) {
    if (P.onGround || P.coyote > 0) {
      P.vy = -JUMP_V; P.jumps = 1; P.buffer = 0; P.coyote = 0; P.onGround = false;
      sfx.jump();
      for (let i = 0; i < 7; i++) part(P.x + P.w / 2 + rnd(-9, 9), P.y + P.h, rnd(-70, 70), rnd(-30, 60), 0.35, '#7fe4ff', 2.6);
    } else if (P.jumps < 2) {
      P.vy = -DBL_V; P.jumps = 2; P.buffer = 0;
      sfx.dbl();
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (0.15 + Math.random() * 0.7);
        part(P.x + P.w / 2, P.y + P.h - 4, Math.cos(a) * rnd(60, 190) * (chance(0.5) ? 1 : -1),
             Math.sin(a) * rnd(40, 140), 0.42, '#b98cff', 3);
      }
    }
  }
  if (!jumpHeld && P.vy < -220) P.vy = -220;              // variable jump height

  /* ---- gravity ---- */
  P.vy += GRAV * dt * (P.vy < 0 ? 1 : 1.14);
  if (P.vy > MAX_FALL) P.vy = MAX_FALL;

  /* ---- integrate + collide ---- */
  const near = solidsNear(P.x - 220, P.x + P.w + 220);
  P.x += P.vx * dt;
  for (const s of near) {
    if (s.oneWay) continue;
    if (aabb(P, s)) {
      if (P.vx > 0)      P.x = s.x - P.w;
      else if (P.vx < 0) P.x = s.x + s.w;
      P.vx = 0;
    }
  }
  const prevBottom = P.y + P.h;
  const wasAir = !P.onGround;
  P.y += P.vy * dt;
  P.onGround = false;
  for (const s of near) {
    if (!aabb(P, s)) continue;
    if (s.oneWay) {
      if (P.vy >= 0 && prevBottom <= s.y + 2) { P.y = s.y - P.h; P.vy = 0; P.onGround = true; }
    } else if (P.vy > 0) { P.y = s.y - P.h; P.vy = 0; P.onGround = true; }
    else if (P.vy < 0)   { P.y = s.y + s.h; P.vy = 0; }
  }
  if (P.onGround) {
    if (wasAir) {
      sfx.land();
      for (let i = 0; i < 8; i++) part(P.x + P.w / 2 + rnd(-12, 12), P.y + P.h, rnd(-110, 110), rnd(-60, -10), 0.3, '#8fa8d8', 2.4);
    }
    P.jumps = 0;
  }
  P.run += Math.abs(P.vx) * dt;
}

/* ------------------------------ hazards -------------------------------- */
function hazards(dt) {
  /* spikes */
  for (const s of W.spikes) {
    if (s.x > P.x + P.w + 40 || s.x + s.w < P.x - 40) continue;
    if (aabb(P, s)) return die('IMPALED ON SPIKES');
  }
  /* enemies */
  for (const e of W.enemies) {
    if (e.x > P.x + 260 || e.x + e.w < P.x - 260) continue;
    if (e.type === 'slasher') {
      if (e.phase === 2) {
        const blade = { x: e.x - e.reach, y: e.y + 8, w: e.w + e.reach * 2, h: 30 };
        if (aabb(P, blade)) return die('CUT DOWN');
      }
      if (aabb(P, e)) return die('CUT DOWN');
    } else if (aabb(P, e)) {
      return die(e.type === 'flyer' ? 'SWARMED' : 'SOMETHING GOT YOU');
    }
  }
  /* bullets */
  for (const b of W.bullets) {
    if (aabb(P, { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 })) return die('SHOT DEAD');
  }
  /* storm */
  if (P.x < storm.x + 14) return die('EATEN BY THE STORM');
  /* fell */
  for (const sg of W.segs) {
    if (P.x + P.w > sg.x0 && P.x < sg.x1) {
      if (P.y > sg.killY) return die('A VERY LONG FALL');
      break;
    }
  }
}

/* ------------------------------ entities ------------------------------- */
function updateEntities(dt) {
  for (const e of W.enemies) {
    if (e.x < cam.x - 400 || e.x > cam.x + viewW + 500) { if (e.type === 'turret') e.cd = Math.max(e.cd, 0.35); continue; }
    if (e.type === 'walker') {
      e.t += dt;
      e.x += e.vx * dt;
      if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); }
    } else if (e.type === 'flyer') {
      e.t += dt;
      e.x += e.vx * dt;
      if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
      if (e.x > e.maxX) { e.x = e.maxX; e.vx = -Math.abs(e.vx); }
      e.y = e.baseY + Math.sin(e.t * 2.6) * e.amp;
      if (chance(0.14)) part(e.x + e.w / 2 + rnd(-6, 6), e.y + e.h, rnd(-16, 16), rnd(10, 40), 0.4, '#ff8ad0', 2);
    } else if (e.type === 'turret') {
      e.cd -= dt;
      if (e.cd <= 0 && P.x < e.x + 40 && P.x > e.x - 1000) {
        e.cd = e.rate;
        W.bullets.push({ x: e.x - 4, y: e.my, vx: -520, vy: 0, r: 6, life: 3.2, t: 0 });
        sfx.shoot();
        part(e.x - 8, e.my, -180, rnd(-40, 40), 0.2, '#ffcf6b', 3);
      }
    } else if (e.type === 'slasher') {
      e.t += dt;
      const cyc = 2.15;
      const p = e.t % cyc;
      e.phase = p < 1.35 ? 0 : (p < 1.72 ? 1 : 2);
      if (e.phase === 2 && !e.rang) { e.rang = true; noise(0.1, 0.12, 2200); }
      if (e.phase !== 2) e.rang = false;
    }
  }
  /* bullets */
  for (const b of W.bullets) {
    b.life -= dt; b.t += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.life <= 0) continue;
    for (const s of W.solids) {
      if (s.oneWay) continue;
      if (b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h) {
        b.life = 0; burst(b.x, b.y, 5, '#ffb457', 130, 0.28); break;
      }
    }
    if (b.life > 0 && chance(0.6)) part(b.x, b.y, rnd(-20, 20), rnd(-20, 20), 0.18, '#ffae4d', 2);
  }
  W.bullets = W.bullets.filter(b => b.life > 0);

  /* particles */
  for (const p of W.parts) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 520 * dt * p.g;
    p.vx *= 1 - 1.6 * dt;
  }
  W.parts = W.parts.filter(p => p.life > 0);
}

/* ------------------------------ red light ------------------------------ */
let redFreeze = false;
function updateZones(dt) {
  redFreeze = false;
  let active = null;
  for (const z of W.zones) {
    if (z.x + z.w < cam.x - 200 || z.x > cam.x + viewW + 300) continue;
    z.t += dt;
    let dur = z.state === 'green' ? z.tGreen : z.state === 'warn' ? z.tWarn : z.tRed;
    if (z.t >= dur) {
      z.t = 0;
      z.state = z.state === 'green' ? 'warn' : z.state === 'warn' ? 'red' : 'green';
      const inside = P.x + P.w > z.x && P.x < z.x + z.w;
      if (inside || Math.abs(P.x - z.x) < 700) {
        if (z.state === 'warn') sfx.warn();
        else if (z.state === 'red') sfx.red();
        else sfx.green();
      }
    }
    const inside = P.x + P.w > z.x && P.x < z.x + z.w && P.y + P.h > z.y && P.y < z.y + z.h;
    if (inside) {
      active = z;
      if (z.state === 'red') {
        redFreeze = true;
        const moved = z.t > 0.13 &&
          (Math.abs(P.x - P.px) > 0.45 || Math.abs(P.y - P.py) > 0.45);
        if (moved && P.alive) {
          burst(P.x + P.w / 2, P.y + P.h / 2, 22, '#ff3550', 380, 0.8);
          die('THE WATCHER SAW YOU MOVE');
        }
      }
    }
  }
  /* HUD light */
  const box = $('lightBox');
  if (active) {
    box.classList.add('on');
    const col = active.state === 'green' ? C.green : active.state === 'warn' ? C.amber : C.red;
    const txt = active.state === 'green' ? 'GO' : active.state === 'warn' ? 'GET READY' : 'FREEZE';
    $('lamp').style.background = col;
    $('lamp').style.boxShadow = '0 0 18px ' + col;
    $('lightTxt').textContent = txt;
    $('lightTxt').style.color = col;
    S.litState = active.state;
  } else {
    box.classList.remove('on');
    S.litState = 'none';
  }
  return active;
}

/* ------------------------------ update --------------------------------- */
function update(dt) {
  if (S.mode !== 'play') {
    S.deadT += dt;
    updateEntities(dt);
    S.shake *= Math.pow(0.001, dt);
    camFollow(dt);
    return;
  }
  S.t += dt;
  P.px = P.x; P.py = P.y;

  physics(dt);
  updateZones(dt);
  updateEntities(dt);

  /* trail ghosts */
  if (Math.abs(P.vx) > 120 && S.t % 0.05 < dt) {
    P.trail.push({ x: P.x, y: P.y, w: P.w, h: P.h, life: 0.26 });
    if (P.trail.length > 10) P.trail.shift();
  }
  for (const g of P.trail) g.life -= dt;
  P.trail = P.trail.filter(g => g.life > 0);

  /* storm */
  const d = runDifficulty();
  storm.v = 58 + 118 * d;
  if (!redFreeze) storm.x += storm.v * dt;
  if (P.x - storm.x > 1020) storm.x = P.x - 1020;
  storm.flash = Math.max(0, storm.flash - dt);
  if (chance(dt * 2.2)) storm.flash = 0.16;

  /* score */
  if (P.x > S.maxX) S.maxX = P.x;
  const nd = Math.max(0, Math.floor((S.maxX - S.startX) / PPM));
  if (nd !== S.dist) {
    if (Math.floor(nd / 100) > Math.floor(S.dist / 100)) sfx.mark();
    S.dist = nd;
    $('dist').textContent = nd;
  }

  /* HUD subtitle: what you are standing in, or how close the storm is */
  let lbl = '';
  for (const sg of W.segs) if (P.x + P.w > sg.x0 && P.x < sg.x1) { lbl = SEG_LABEL[sg.id] || ''; break; }
  const stormGap = Math.floor((P.x - storm.x) / PPM);
  if (stormGap < 14) lbl = 'STORM ' + Math.max(0, stormGap) + ' M';
  if (lbl !== S.lbl) { S.lbl = lbl; $('zone').textContent = lbl; $('zone').style.color = stormGap < 14 ? '#ff6070' : ''; }

  hazards(dt);

  /* stream world */
  while (W.genX < P.x + 2600) generate();
  if (S.t % 0.5 < dt) prune(Math.min(storm.x, cam.x) - 900);

  S.shake *= Math.pow(0.0015, dt);
  camFollow(dt);
}

function camFollow(dt) {
  const tx = P.x + P.w / 2 - viewW * 0.38;
  let ty = P.y + P.h / 2 - viewH * 0.60;
  const k = 1 - Math.pow(0.0009, dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * (1 - Math.pow(0.004, dt));
  if (cam.x < storm.x - 120) cam.x = storm.x - 120;
  const s = S.shake;
  cam.sx = cam.x + rnd(-s, s);
  cam.sy = cam.y + rnd(-s, s);
}

/* ------------------------------ render --------------------------------- */
function bg() {
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, '#0a0d1e'); g.addColorStop(0.45, '#0d1226');
  g.addColorStop(1, '#06070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, viewH);

  /* stars */
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const sx = (hash(i * 3.1) * 4000 - cam.sx * 0.06) % 4000;
    const x = ((sx % viewW) + viewW) % viewW;
    const y = hash(i * 7.7) * viewH * 0.75 - cam.sy * 0.03;
    const a = 0.25 + 0.55 * hash(i * 2.3) * (0.6 + 0.4 * Math.sin(S.t * 2 + i));
    ctx.fillStyle = 'rgba(190,215,255,' + a.toFixed(3) + ')';
    ctx.fillRect(x, ((y % viewH) + viewH) % viewH, 2, 2);
  }
  ctx.restore();

  /* two parallax ridge layers */
  const ridge = (par, base, amp, col, rim, seed) => {
    const step = 58;
    const ox = cam.sx * par, oy = cam.sy * par * 0.35;
    const x0 = Math.floor((ox - 100) / step) * step;
    const pts = [];
    for (let x = x0; x < ox + viewW + step * 2; x += step) {
      const n = hash(x * 0.013 + seed) * 0.55 + hash(x * 0.047 + seed * 2) * 0.3
              + hash(x * 0.11 + seed * 3) * 0.15;
      pts.push([x - ox, base - oy + (n - 0.5) * amp]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], viewH + 200);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(pts[pts.length - 1][0], viewH + 200);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    /* rim light along the crest so the silhouette reads against the sky */
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = rim; ctx.lineWidth = 1.5; ctx.stroke();
  };
  ridge(0.06, viewH * 0.50, 240, '#141d3d', 'rgba(120,150,235,.22)', 11.3);
  ridge(0.14, viewH * 0.66, 200, '#101733', 'rgba(95,130,215,.20)', 4.7);
  ridge(0.26, viewH * 0.82, 150, '#0b1026', 'rgba(70,105,190,.18)', 21.9);

  /* haze */
  const h = ctx.createLinearGradient(0, viewH * 0.5, 0, viewH);
  h.addColorStop(0, 'rgba(60,110,200,0)'); h.addColorStop(1, 'rgba(50,90,180,.10)');
  ctx.fillStyle = h; ctx.fillRect(0, viewH * 0.5, viewW, viewH * 0.5);
}

function drawSolid(s) {
  const x = s.x, y = s.y, w = s.w, h = Math.min(s.h, viewH + 400);
  if (s.oneWay) {
    ctx.fillStyle = C.ledge; ctx.fillRect(x, y, w, s.h);
    ctx.fillStyle = C.ledgeHi; ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = 'rgba(126,255,208,.14)'; ctx.fillRect(x, y + 3, w, 4);
    return;
  }
  if (s.kind === 'slab') {
    ctx.fillStyle = C.slab; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.slabHi; ctx.fillRect(x, y + s.h - 3, w, 3);
    ctx.fillStyle = 'rgba(138,107,216,.16)'; ctx.fillRect(x, y + s.h - 9, w, 6);
    for (let i = 0; i < w; i += 26) {
      ctx.fillStyle = 'rgba(255,255,255,.028)'; ctx.fillRect(x + i, y, 2, s.h);
    }
    return;
  }
  ctx.fillStyle = s.kind === 'block' ? C.block : C.rock;
  ctx.fillRect(x, y, w, h);
  /* strata */
  ctx.fillStyle = 'rgba(255,255,255,.022)';
  for (let i = 14; i < h; i += 34) ctx.fillRect(x, y + i, w, 2);
  /* neon top edge */
  const hi = s.kind === 'block' ? C.blockHi : C.edge;
  ctx.fillStyle = hi; ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = 'rgba(79,216,255,.10)'; ctx.fillRect(x, y + 3, w, 7);
  /* side shading only on free-standing pieces; ground tiles butt together seamlessly */
  if (s.kind !== 'rock') {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(x, y + 3, 4, h - 3);
    ctx.fillRect(x + w - 4, y + 3, 4, h - 3);
  }
}

function drawSpikes(s) {
  ctx.save();
  ctx.fillStyle = C.spike;
  ctx.shadowColor = C.spikeGlow; ctx.shadowBlur = 12;
  const T = 14;
  ctx.beginPath();
  if (s.dir === 'up' || s.dir === 'down') {
    const n = Math.max(1, Math.floor(s.w / T));
    const step = s.w / n;
    for (let i = 0; i < n; i++) {
      const x = s.x + i * step;
      if (s.dir === 'up') {
        ctx.moveTo(x, s.y + s.h); ctx.lineTo(x + step / 2, s.y); ctx.lineTo(x + step, s.y + s.h);
      } else {
        ctx.moveTo(x, s.y); ctx.lineTo(x + step / 2, s.y + s.h); ctx.lineTo(x + step, s.y);
      }
    }
  } else {
    const n = Math.max(1, Math.floor(s.h / T));
    const step = s.h / n;
    for (let i = 0; i < n; i++) {
      const y = s.y + i * step;
      if (s.dir === 'right') { ctx.moveTo(s.x, y); ctx.lineTo(s.x + s.w, y + step / 2); ctx.lineTo(s.x, y + step); }
      else { ctx.moveTo(s.x + s.w, y); ctx.lineTo(s.x, y + step / 2); ctx.lineTo(s.x + s.w, y + step); }
    }
  }
  ctx.fill();
  ctx.restore();
  /* base plate */
  ctx.fillStyle = 'rgba(120,20,35,.75)';
  if (s.dir === 'up') ctx.fillRect(s.x, s.y + s.h - 3, s.w, 3);
  else if (s.dir === 'down') ctx.fillRect(s.x, s.y, s.w, 3);
}

function drawEnemy(e) {
  ctx.save();
  if (e.type === 'walker') {
    const bob = Math.sin(e.t * 9) * 2;
    ctx.shadowColor = 'rgba(255,90,60,.5)'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#2a1420';
    ctx.fillRect(e.x, e.y + bob, e.w, e.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff6a3d';
    ctx.fillRect(e.x + 2, e.y + 4 + bob, e.w - 4, 4);
    /* eyes */
    ctx.fillStyle = '#ffd7c2';
    const ex = e.vx > 0 ? e.x + e.w - 11 : e.x + 5;
    ctx.fillRect(ex, e.y + 11 + bob, 6, 5);
    /* legs */
    ctx.fillStyle = '#3a1c2c';
    const lp = Math.sin(e.t * 11) * 5;
    ctx.fillRect(e.x + 5, e.y + e.h - 5 + bob, 7, 5 + lp * 0.4);
    ctx.fillRect(e.x + e.w - 12, e.y + e.h - 5 + bob, 7, 5 - lp * 0.4);
  } else if (e.type === 'flyer') {
    const f = Math.sin(e.t * 16);
    ctx.shadowColor = 'rgba(255,90,190,.55)'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#3a1030';
    ctx.beginPath();
    ctx.ellipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, 0, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,120,210,.75)';
    ctx.beginPath();
    ctx.moveTo(e.x + e.w / 2, e.y + e.h / 2);
    ctx.lineTo(e.x - 12, e.y + 2 + f * 8);
    ctx.lineTo(e.x + 2, e.y + e.h / 2 + 4);
    ctx.moveTo(e.x + e.w / 2, e.y + e.h / 2);
    ctx.lineTo(e.x + e.w + 12, e.y + 2 - f * 8);
    ctx.lineTo(e.x + e.w - 2, e.y + e.h / 2 + 4);
    ctx.fill();
    ctx.fillStyle = '#fff0fb';
    ctx.fillRect(e.x + e.w / 2 - 5, e.y + e.h / 2 - 3, 10, 4);
  } else if (e.type === 'turret') {
    const chg = clamp(1 - e.cd / e.rate, 0, 1);
    ctx.fillStyle = '#232c48';
    ctx.fillRect(e.x + 9, e.y + e.h - 4, 16, Math.max(0, e.sy - (e.y + e.h) + 4));
    ctx.save();
    ctx.shadowColor = 'rgba(255,150,60,' + (0.25 + 0.5 * chg) + ')';
    ctx.shadowBlur = 8 + 14 * chg;
    ctx.fillStyle = '#2c3760';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.restore();
    ctx.fillStyle = '#5a6da8'; ctx.fillRect(e.x, e.y, e.w, 3);
    ctx.fillStyle = '#151a2b'; ctx.fillRect(e.x + 3, e.y + 5, e.w - 6, e.h - 10);
    /* barrel */
    ctx.fillStyle = '#3d4a78'; ctx.fillRect(e.x - 15, e.my - 6, 20, 12);
    ctx.fillStyle = '#151a2b'; ctx.fillRect(e.x - 15, e.my - 2, 14, 4);
    ctx.save();
    ctx.shadowColor = 'rgba(255,170,60,.95)'; ctx.shadowBlur = 8 + 18 * chg;
    ctx.fillStyle = 'rgb(255,' + Math.round(110 + 110 * chg) + ',60)';
    ctx.fillRect(e.x - 18, e.my - 4, 6, 8);
    ctx.restore();
    /* charge bar */
    ctx.fillStyle = 'rgba(255,170,60,.18)'; ctx.fillRect(e.x + 6, e.y + e.h - 9, e.w - 12, 4);
    ctx.fillStyle = 'rgba(255,190,90,.95)'; ctx.fillRect(e.x + 6, e.y + e.h - 9, (e.w - 12) * chg, 4);
  } else if (e.type === 'slasher') {
    const tel = e.phase === 1, act = e.phase === 2;
    ctx.shadowColor = act ? 'rgba(120,240,255,.9)' : 'rgba(90,120,255,.35)';
    ctx.shadowBlur = act ? 22 : 10;
    ctx.fillStyle = tel ? '#43305e' : '#241a3a';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = act ? '#9df1ff' : (tel ? '#ffb2f0' : '#6d5cc0');
    ctx.fillRect(e.x + 6, e.y + 8, e.w - 12, 5);
    if (tel) {
      ctx.strokeStyle = 'rgba(160,220,255,.35)';
      ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.strokeRect(e.x - e.reach, e.y + 8, e.w + e.reach * 2, 30);
      ctx.setLineDash([]);
    }
    if (act) {
      ctx.save();
      ctx.shadowColor = 'rgba(150,240,255,.9)'; ctx.shadowBlur = 20;
      const g = ctx.createLinearGradient(e.x - e.reach, 0, e.x + e.w + e.reach, 0);
      g.addColorStop(0, 'rgba(150,240,255,.15)');
      g.addColorStop(0.5, 'rgba(200,250,255,.85)');
      g.addColorStop(1, 'rgba(150,240,255,.15)');
      ctx.fillStyle = g;
      ctx.fillRect(e.x - e.reach, e.y + 14, e.w + e.reach * 2, 18);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawZone(z) {
  const col = z.state === 'green' ? [61, 255, 154] : z.state === 'warn' ? [255, 192, 67] : [255, 53, 80];
  const inten = z.state === 'red' ? 0.16 : z.state === 'warn' ? 0.09 : 0.045;
  const top = Math.max(z.y, cam.sy - 100);
  ctx.fillStyle = 'rgba(' + col.join(',') + ',' + inten + ')';
  ctx.fillRect(z.x, top, z.w, z.h);
  /* boundary posts */
  ctx.fillStyle = 'rgba(' + col.join(',') + ',.55)';
  ctx.fillRect(z.x - 3, z.surfY - 220, 4, 220);
  ctx.fillRect(z.x + z.w, z.surfY - 220, 4, 220);
  ctx.save();
  ctx.strokeStyle = 'rgba(' + col.join(',') + ',.3)';
  ctx.lineWidth = 2; ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(z.x, z.surfY - 220); ctx.lineTo(z.x + z.w, z.surfY - 220);
  ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();

  /* the watcher */
  const ex = z.eyeX, ey = z.eyeY;
  const open = z.state === 'green' ? 0.12 : z.state === 'warn' ? 0.55 : 1;
  ctx.save();
  ctx.fillStyle = '#0b0f1e';
  ctx.beginPath(); ctx.ellipse(ex, ey, 54, 40, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(' + col.join(',') + ',.65)'; ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowColor = 'rgba(' + col.join(',') + ',.9)';
  ctx.shadowBlur = 26 * open + 6;
  ctx.fillStyle = 'rgb(' + col.join(',') + ')';
  ctx.beginPath();
  ctx.ellipse(ex, ey, 46 * (0.35 + 0.65 * open), 30 * open + 3, 0, 0, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (open > 0.4) {
    ctx.fillStyle = '#050710';
    const px = clamp((P.x - ex) * 0.03, -16, 16);
    ctx.beginPath(); ctx.ellipse(ex + px, ey, 11, 15 * open, 0, 0, 7); ctx.fill();
  }
  /* stalk */
  ctx.strokeStyle = 'rgba(80,100,150,.5)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(ex, ey + 38); ctx.lineTo(ex, z.surfY); ctx.stroke();
  ctx.restore();

  /* scan beam when red */
  if (z.state !== 'green') {
    ctx.save();
    ctx.globalAlpha = z.state === 'red' ? 0.14 : 0.07;
    const g = ctx.createLinearGradient(ex, ey, z.x, z.surfY);
    g.addColorStop(0, 'rgb(' + col.join(',') + ')');
    g.addColorStop(1, 'rgba(' + col.join(',') + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(z.x, z.surfY - 240);
    ctx.lineTo(z.x, z.surfY);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawPlayer() {
  /* trail */
  for (const g of P.trail) {
    ctx.fillStyle = 'rgba(120,220,255,' + (g.life / 0.26 * 0.10).toFixed(3) + ')';
    ctx.fillRect(g.x, g.y, g.w, g.h);
  }
  const x = P.x, y = P.y, w = P.w, h = P.h;
  const frozen = redFreeze;
  ctx.save();
  ctx.shadowColor = frozen ? 'rgba(255,80,100,.8)' : 'rgba(90,210,255,.75)';
  ctx.shadowBlur = 20;
  /* body */
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, frozen ? '#ffb0bb' : '#dff4ff');
  g.addColorStop(1, frozen ? '#ff5f74' : '#54c8ff');
  ctx.fillStyle = g;
  const r = 7;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  /* visor */
  ctx.fillStyle = '#08111f';
  const vy = y + (P.crouch ? 6 : 10);
  ctx.fillRect(x + (P.face > 0 ? 8 : 4), vy, w - 12, P.crouch ? 6 : 8);
  ctx.fillStyle = frozen ? '#ff9aa8' : '#8ef0ff';
  ctx.fillRect(x + (P.face > 0 ? w - 11 : 4), vy + 1, 6, P.crouch ? 4 : 5);
  /* legs */
  if (P.onGround && Math.abs(P.vx) > 30) {
    const sw = Math.sin(P.run * 0.09) * 6;
    ctx.fillStyle = 'rgba(10,20,40,.65)';
    ctx.fillRect(x + 4, y + h - 6, 7, 6);
    ctx.fillRect(x + w - 11, y + h - 6, 7, 6);
    ctx.fillStyle = 'rgba(140,230,255,.35)';
    ctx.fillRect(x + w / 2 - 2 + sw, y + h - 3, 4, 3);
  }
  /* double-jump ring */
  if (!P.onGround && P.jumps < 2) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(S.t * 12);
    ctx.strokeStyle = '#b98cff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 8, 13, 5, 0, 0, 7); ctx.stroke();
    ctx.restore();
  }
}

function drawStorm() {
  const sx = storm.x;
  if (sx < cam.sx - 200) return;
  const g = ctx.createLinearGradient(sx - 420, 0, sx, 0);
  g.addColorStop(0, 'rgba(20,0,15,0)');
  g.addColorStop(0.55, 'rgba(60,6,28,.55)');
  g.addColorStop(1, 'rgba(140,14,50,.9)');
  ctx.fillStyle = g;
  ctx.fillRect(cam.sx - 200, cam.sy - 200, sx - (cam.sx - 200) + 4, viewH + 400);
  /* solid core */
  ctx.fillStyle = 'rgba(10,2,8,.92)';
  ctx.fillRect(cam.sx - 400, cam.sy - 200, sx - (cam.sx - 400) - 30, viewH + 400);
  /* churning edge */
  ctx.save();
  ctx.strokeStyle = 'rgba(255,70,110,.85)'; ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(255,60,100,.8)'; ctx.shadowBlur = 20;
  ctx.beginPath();
  for (let y = cam.sy - 60; y < cam.sy + viewH + 60; y += 18) {
    const n = Math.sin(y * 0.05 + S.t * 5) * 9 + Math.sin(y * 0.017 - S.t * 3) * 14;
    if (y === cam.sy - 60) ctx.moveTo(sx + n, y); else ctx.lineTo(sx + n, y);
  }
  ctx.stroke();
  if (storm.flash > 0) {
    ctx.globalAlpha = storm.flash * 5;
    ctx.strokeStyle = '#ffd0dd'; ctx.lineWidth = 2;
    ctx.beginPath();
    let ly = cam.sy - 40, lx = sx - 20;
    ctx.moveTo(lx, ly);
    while (ly < cam.sy + viewH) { ly += rnd(40, 90); lx = sx - rnd(4, 80); ctx.lineTo(lx, ly); }
    ctx.stroke();
  }
  ctx.restore();
  /* embers */
  if (chance(0.5)) part(sx - rnd(0, 60), cam.sy + rnd(0, viewH), rnd(10, 70), rnd(-90, -20), rnd(0.4, 1.1), '#ff5f80', rnd(1.5, 3.5));
}

function drawMarkers() {
  const first = Math.floor((cam.sx - S.startX) / (100 * PPM));
  for (let i = Math.max(1, first); i <= first + 3; i++) {
    const mx = S.startX + i * 100 * PPM;
    if (mx < cam.sx - 60 || mx > cam.sx + viewW + 60) continue;
    let sy = 0;
    for (const s of W.segs) if (mx >= s.x0 && mx < s.x1) { sy = s.killY - 980; break; }
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#4fd8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, sy); ctx.lineTo(mx, sy - 150); ctx.stroke();
    ctx.fillStyle = '#4fd8ff';
    ctx.font = '700 18px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(i * 100 + 'm', mx, sy - 160);
    ctx.restore();
  }
}

function render() {
  ctx.setTransform(DPR * SC, 0, 0, DPR * SC, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  bg();

  ctx.save();
  ctx.translate(-cam.sx, -cam.sy);

  const x0 = cam.sx - 120, x1 = cam.sx + viewW + 120;
  const y0 = cam.sy - 200, y1 = cam.sy + viewH + 200;

  drawMarkers();

  for (const b of W.backs) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = '#070a14';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const sh = ctx.createLinearGradient(0, b.y, 0, b.y + Math.min(b.h, 120));
    sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.fillRect(b.x, b.y, b.w, Math.min(b.h, 120));
  }

  for (const z of W.zones) if (z.x < x1 && z.x + z.w > x0) drawZone(z);

  for (const s of W.solids) {
    if (s.x > x1 || s.x + s.w < x0) continue;
    if (s.y > y1 || s.y + s.h < y0) continue;
    drawSolid(s);
  }
  for (const s of W.spikes) {
    if (s.x > x1 || s.x + s.w < x0 || s.y > y1 || s.y + s.h < y0) continue;
    drawSpikes(s);
  }
  for (const e of W.enemies) {
    if (e.x > x1 || e.x + e.w < x0 || e.y > y1 || e.y + e.h < y0) continue;
    drawEnemy(e);
  }
  /* bullets */
  ctx.save();
  ctx.shadowColor = 'rgba(255,180,80,.9)'; ctx.shadowBlur = 14;
  for (const b of W.bullets) {
    if (b.x > x1 || b.x < x0) continue;
    ctx.fillStyle = '#ffd48a';
    ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r + 3, b.r - 1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,150,60,.35)';
    ctx.fillRect(b.x, b.y - 2, 26, 4);
  }
  ctx.restore();

  /* particles */
  for (const p of W.parts) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
  }
  ctx.globalAlpha = 1;

  if (P.alive) drawPlayer();

  drawStorm();
  ctx.restore();

  /* red flash overlay */
  if (redFreeze) {
    ctx.fillStyle = 'rgba(255,40,70,' + (0.05 + 0.04 * Math.sin(S.t * 9)) + ')';
    ctx.fillRect(0, 0, viewW, viewH);
  }
  /* vignette */
  const v = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.35, viewW / 2, viewH / 2, viewH * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, viewW, viewH);

  if (S.mode === 'dead') {
    ctx.fillStyle = 'rgba(120,0,20,' + clamp(S.deadT * 0.9, 0, 0.45) + ')';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

/* ------------------------------ loop ----------------------------------- */
let last = performance.now(), acc = 0;
const STEP = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) { update(STEP); acc -= STEP; }
  if (guard >= 8) acc = 0;
  render();
}

/* ------------------------------ boot ----------------------------------- */
function bootScene() {
  /* a quiet idle world behind the menu */
  W.solids = []; W.spikes = []; W.enemies = []; W.bullets = []; W.zones = []; W.parts = [];
  W.backs = []; W.segs = []; W.genX = 0; W.genY = 0; W.lastType = ''; W.n = 0;
  addGround(-800, 0, 3600);
  W.segs.push({ x0: -800, x1: 2800, killY: 980, id: 'flat' });
  W.genX = 2800; W.genY = 0;
  P.x = 0; P.y = -PH; P.alive = false;
  storm.x = -100000;
  cam.x = -200; cam.y = -viewH * 0.62; cam.sx = cam.x; cam.sy = cam.y;
  S.mode = 'menu';
}
bootScene();
if (typeof window !== 'undefined' && window.__RLR_DEBUG) {
  window.__RLR = { W, P, S, cam, storm, K, startRun, update, render, generate,
    setSeed: n => { WORLD_SEED = n >>> 0; wstate = WORLD_SEED; },
    getSeed: () => WORLD_SEED,
    press: () => { jumpPressed = true; jumpHeld = true; },
    release: () => { jumpHeld = false; },
    frozen: () => redFreeze, cause: () => S.cause };
}
renderScores($('scores'), null);
$('best').textContent = 'BEST ' + bestScore();
requestAnimationFrame(frame);

})();
