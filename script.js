/* =====================================================================
   26,000 CRACKS — game engine (vanilla JS, no build step)
   Player: Karolina Willberg · Funder: Carl-Åke Willberg · Maker: Moa Rihne
   All asset paths live in ASSETS so swapping art is trivial.
   ===================================================================== */
'use strict';

/* ----------------------------- ASSET CONFIG ----------------------------- */
const ASSETS = {
  eggs: [
    'assets/images/eggs/egg_01_pristine.png',
    'assets/images/eggs/egg_02_tiny_crack.png',
    'assets/images/eggs/egg_03_hairline.png',
    'assets/images/eggs/egg_04_branching_crack.png',
    'assets/images/eggs/egg_05_multiple_cracks.png',
    'assets/images/eggs/egg_06_deep_cracks.png',
    'assets/images/eggs/egg_07_glowing_cracks.png',
    'assets/images/eggs/egg_08_shell_lifting.png',
    'assets/images/eggs/egg_09_near_break.png',
    'assets/images/eggs/egg_10_broken_reveal.png'
  ],
  hammers: [
    'assets/images/hammers/hammer_1_wooden_spoon.png',
    'assets/images/hammers/hammer_2_toy_hammer.png',
    'assets/images/hammers/hammer_3_respectable.png',
    'assets/images/hammers/hammer_4_cartoon_mallet.png',
    'assets/images/hammers/hammer_5_golden_birthday.png',
    'assets/images/hammers/hammer_6_psychology_device.png',
    'assets/images/hammers/hammer_7_steam_mallet.png',
    'assets/images/hammers/hammer_8_final_destiny.png'
  ],
  mouse: 'assets/images/reveal/steamboat_mouse.png',
  questions: 'assets/data/karolina_questions.json',
  // Backgrounds are now baked-transparent offline (assets are real PNG alpha),
  // so no runtime keying is needed. Left as null; set to 'black'/'white' only
  // if you ever swap in a non-transparent asset and want in-browser removal.
  eggBg: null, hammerBg: null, mouseBg: null
};

/* ------------------------------- TUNING --------------------------------- */
const TARGET = 26000;
const QUESTION_PRELUDE_MS = 1650;
const ANSWER_READ_MS = 3600;
const ANSWER_READ_WITH_NOTE_MS = 5200;
const SKIP_READ_MS = 3000;
const SKIP_READ_WITH_NOTE_MS = 4600;
const WRONG_READ_MS = 1500;
const UPGRADE_TOAST_MS = 2800;
// Per-tap crack points for hammer levels 1..24. Progression is now driven ONLY by
// answering protocol checks correctly (each correct answer = +1 hammer level). The
// ramp is gentle early and escalates: ~90 efficient taps reach 26,000 if every check
// is answered correctly (≈100 in real play). Names come from karolina_questions.json
// → hammerLadder (filled in at boot); the fallback list keeps the game playable offline.
const HAMMER_PTS = [45,60,80,105,135,168,205,248,298,352,412,478,550,628,712,802,898,1000,1108,1222,1342,1468,1600,1738];
const FALLBACK_HAMMER_NAMES = [
  'Träslev','Leksakshammare','Respektabel Hammare','Tecknad Klubba','Gyllene Födelsedagshammare',
  'Psykolog-Certifierad Slagenhet','Moa-Kalibrerad Ånghammare','Ödets Sluthammare','Descartes Tvivels-Slägga',
  'Pangloss Optimist-Mursleva','Naild-it Proffshammare','Linjära Avbildningens Slägga','Press-on Precisionsklubban',
  'Linköpings Legitimerade Tordönsklubba','Den 25 Maj-Märkta Jubileumshammaren','Egenvärdes-Förstärkta Megaklubban',
  'Soft Gel Storsläggan','Carl-Åkes Finansierade Guldslägga','Moa Rihnes Kvalitetsstämplade Storsläggan',
  'Bokslutsgodkända Bjässehammaren','Den Stadigt Eskalerande Stridshammaren','Organisationsnummer-Certifierade Kolossen',
  'Näst Bästa Hammaren i Den Bästa Av Världar','Den Absolut Bästa Hammaren i Den Bästa Av Världar'
];
let HAMMERS = HAMMER_PTS.map((pts, i) => ({ name: FALLBACK_HAMMER_NAMES[i] || ('Hammare ' + (i + 1)), pts }));
// 24 hammer levels share 8 hammer images (3 levels per image).
function hammerImageForLevel(lvl) {
  return ASSETS.hammers[clamp(Math.floor((lvl - 1) / 3), 0, ASSETS.hammers.length - 1)];
}
// Egg visual-state lower bounds (state 1..9); state 10 = final break.
const EGG_BANDS = [0, 2600, 5200, 7800, 10400, 13000, 15600, 18200, 20800];
const SYSTEM_MESSAGES = [
  'Karolina Willberg detected.',
  'Age confirmed: 26. Converting 26 years into 26,000 cracks.',
  'Quality control online. Birthday drama within unsafe limits.',
  'Egg integrity dropping. Keep striking.',
  'Steam pressure rising. The shell is listening.',
  'Protocol nominal. Continue cracking.',
  'Payload sealed inside. Contents classified.'
];

/* ------------------------------- STATE ---------------------------------- */
const STORAGE_KEY = 'cracks26000_v2';
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === 'true';

const defaultState = () => ({
  playerName: 'Karolina Willberg',
  crackTarget: TARGET,
  currentCracks: 0,
  hammerLevel: 1,
  answeredQuestions: [],
  triggeredEvents: [],
  introSeen: false,
  finalX26: false,
  isComplete: false,
  soundEnabled: true
});

let state = loadState();
let QUESTIONS = [];
let activeMultiplier = 1;
let multiplierTimer = null;
let multiplierEndsAt = 0;
let questionOpen = false;
let currentQuestion = null;
let sysMsgTimer = null;
const keyedCache = {};

function loadState() {
  if (params.get('reset') === 'true') { localStorage.removeItem(STORAGE_KEY); }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* corrupt → fresh */ }
  return defaultState();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ------------------------------ ELEMENTS -------------------------------- */
const $ = (id) => document.getElementById(id);
const el = {
  body: document.body,
  intro: $('screen-intro'), game: $('screen-game'), reveal: $('screen-reveal'),
  beginBtn: $('beginBtn'), skipIntro: $('skipIntroBtn'),
  intro26: $('intro26'), introZeros: $('introZeros'), introYearsWord: $('introYearsWord'),
  introSubReq: $('introSubReq'), introStamp: $('introStamp'), introGreeting: $('introGreeting'),
  crackCount: $('crackCount'), progressFill: $('progressFill'), progress: document.querySelector('.progress'),
  systemMsg: $('systemMsg'), brand: $('brandLabel'),
  eggStage: $('eggStage'), eggImg: $('eggImg'), eggGlow: $('eggGlow'),
  swingHammer: $('swingHammer'), fxLayer: $('fxLayer'), tapHint: $('tapHint'),
  hammerImg: $('hammerImg'), hammerMedallion: $('hammerMedallion'),
  hammerName: $('hammerName'), multiplierLabel: $('multiplierLabel'),
  protocolHint: $('protocolHint'), strikeInfo: $('strikeInfo'),
  questionPrelude: $('questionPrelude'),
  qModal: $('questionModal'), qProgress: $('qProgress'), qText: $('qText'),
  qOptions: $('qOptions'), qFeedback: $('qFeedback'), qSkip: $('qSkipBtn'),
  qPortrait: $('qPortrait'), qPortraitImg: $('qPortraitImg'),
  upgradeToast: $('upgradeToast'), toastName: $('toastHammerName'),
  finalPrompt: $('finalPrompt'), finalCrackBtn: $('finalCrackBtn'),
  revealMouse: $('revealMouse'),
  tripBtn: $('tripDetailsBtn'), tripDetails: $('tripDetails'),
  debug: $('debugPanel'), mute: $('muteBtn')
};

/* --------------------- BACKGROUND KEYING (canvas) ----------------------- */
// Removes a solid black or white background and returns a transparent dataURL.
// Falls back to the raw src if the canvas is tainted (e.g. file:// protocol).
function keyOut(src, mode) {
  return new Promise((resolve) => {
    if (!mode) return resolve(src); // transparency already baked into the file
    if (keyedCache[src]) return resolve(keyedCache[src]);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          const r = p[i], g = p[i + 1], b = p[i + 2];
          if (mode === 'black') {
            const lum = Math.max(r, g, b);
            if (lum < 58) p[i + 3] = 0;
            else if (lum < 112) p[i + 3] = Math.round(((lum - 58) / 54) * p[i + 3]);
          } else if (mode === 'white') {
            const mn = Math.min(r, g, b);
            if (mn > 205) p[i + 3] = 0;
            else if (mn > 150) p[i + 3] = Math.round(((205 - mn) / 55) * p[i + 3]);
          }
        }
        cx.putImageData(d, 0, 0);
        const out = c.toDataURL('image/png');
        keyedCache[src] = out;
        resolve(out);
      } catch (e) {
        keyedCache[src] = src; resolve(src); // tainted → use raw
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
async function setKeyed(imgEl, src, mode) {
  imgEl.src = src;                       // show raw immediately
  const keyed = await keyOut(src, mode); // then upgrade to transparent
  imgEl.src = keyed;
}

/* ------------------------------- AUDIO ---------------------------------- */
// Synthesized tones (no mp3 files needed). Unlocked after first tap.
const Sound = (() => {
  let ctx = null, unlocked = false;
  function unlock() {
    if (unlocked) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); unlocked = true; }
    catch (e) { unlocked = false; }
  }
  function tone(freq, dur, type = 'sine', gain = 0.15, slideTo = null) {
    if (!unlocked || !ctx || !state.soundEnabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur);
  }
  function noise(dur, gain = 0.2) {
    if (!unlocked || !ctx || !state.soundEnabled) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = gain;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    s.connect(f); f.connect(g); g.connect(ctx.destination); s.start();
  }
  const fx = {
    hit:    () => { tone(180, 0.09, 'square', 0.12, 90); noise(0.07, 0.12); },
    hitHard:() => { tone(110, 0.16, 'sawtooth', 0.18, 55); noise(0.14, 0.22); },
    crack:  () => { noise(0.12, 0.18); tone(900, 0.06, 'triangle', 0.08, 400); },
    correct:() => { tone(523, 0.12, 'sine', 0.16); setTimeout(() => tone(784, 0.18, 'sine', 0.16), 110); },
    wrong:  () => { tone(220, 0.18, 'sawtooth', 0.12, 140); },
    upgrade:() => { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.14), i * 80)); },
    steam:  () => { noise(0.7, 0.25); tone(300, 0.6, 'sine', 0.08, 800); },
    ticket: () => { [659, 880, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'sine', 0.12), i * 70)); },
    drop:   () => { tone(400, 0.3, 'sine', 0.16, 90); },
    stamp:  () => { tone(140, 0.12, 'square', 0.2, 70); noise(0.1, 0.2); },
    final:  () => { noise(1.2, 0.3); tone(80, 1.0, 'sawtooth', 0.2, 40); },
    fanfare:() => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.16), i * 140)); }
  };
  return { unlock, fx, isOn: () => state.soundEnabled };
})();

/* ------------------------------ HELPERS --------------------------------- */
const fmt = (n) => n.toLocaleString('en-US');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function eggStateForCracks(c) {
  if (c >= TARGET) return 10;
  let s = 1;
  for (let i = 0; i < EGG_BANDS.length; i++) if (c >= EGG_BANDS[i]) s = i + 1;
  return s;
}
function pointsPerTap() {
  return HAMMERS[state.hammerLevel - 1].pts * activeMultiplier;
}
function nextQuestion() {
  return QUESTIONS.find(q => !state.answeredQuestions.includes(q.id) && state.currentCracks >= q.threshold)
      || null;
}
function upcomingThreshold() {
  const q = QUESTIONS.find(q => !state.answeredQuestions.includes(q.id));
  return q ? q.threshold : null;
}
function questionsPending() {
  return QUESTIONS.some(q => !state.answeredQuestions.includes(q.id));
}

/* ---------------------- JUICE: haptics / idle / milestones -------------- */
// navigator.vibrate is a harmless no-op on desktop, so no capability guard beyond existence.
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

let idleTimer = null;
// The egg "breathes" (a slow pulse) after ~2.2s untapped, inviting the next strike.
function scheduleIdle() {
  clearTimeout(idleTimer);
  el.eggImg.classList.remove('breathing');
  idleTimer = setTimeout(() => {
    if (!questionOpen && !state.isComplete) el.eggImg.classList.add('breathing');
  }, 2200);
}

const MILESTONES = [
  { pct: 0.25, key: 'm25', msg: 'En fjärdedel krossad. Moa nickar gillande.' },
  { pct: 0.50, key: 'm50', msg: 'Halvvägs! Ångtrycket stiger i skalet.' },
  { pct: 0.75, key: 'm75', msg: 'Tre fjärdedelar. Skalet darrar — fortsätt.' }
];
// Fired once each (persisted via state.triggeredEvents) when crossing 25/50/75%.
function checkMilestones() {
  for (const m of MILESTONES) {
    if (state.currentCracks >= TARGET * m.pct && !state.triggeredEvents.includes(m.key)) {
      state.triggeredEvents.push(m.key); save();
      steamBurst(0);
      systemMessage(m.msg);
      buzz([10, 40, 10]);
    }
  }
}

/* ----------------------------- RENDERING -------------------------------- */
let lastEggState = 0, lastHammerLevel = 0;

function render() {
  el.crackCount.textContent = fmt(state.currentCracks);
  const pct = clamp((state.currentCracks / TARGET) * 100, 0, 100);
  el.progressFill.style.width = pct + '%';
  el.progress.setAttribute('aria-valuenow', state.currentCracks);

  // hammer
  const lvl = state.hammerLevel;
  el.hammerName.textContent = HAMMERS[lvl - 1].name;
  if (lvl !== lastHammerLevel) {
    setKeyed(el.hammerImg, hammerImageForLevel(lvl), ASSETS.hammerBg);
    lastHammerLevel = lvl;
  }

  // hammer level label (each correct protocol check upgrades it)
  el.multiplierLabel.textContent = 'Hammare ' + lvl + ' / ' + HAMMERS.length;
  el.multiplierLabel.dataset.active = lvl > 1 ? 'true' : 'false';
  el.strikeInfo.textContent = '+' + fmt(pointsPerTap()) + ' per strike';

  // egg state
  const es = eggStateForCracks(state.currentCracks);
  if (es !== lastEggState) {
    setKeyed(el.eggImg, ASSETS.eggs[es - 1], ASSETS.eggBg);
    lastEggState = es;
    el.eggStage.dataset.glow = es >= 9 ? 'high' : es >= 7 ? 'mid' : es >= 6 ? 'low' : '';
  }

  // protocol hint
  const ut = upcomingThreshold();
  el.protocolHint.textContent = ut !== null
    ? 'Next protocol check at ' + fmt(ut)
    : (state.currentCracks >= TARGET ? 'Requirement complete' : 'All protocols cleared');
}

/* ----------------------------- TAP / STRIKE ----------------------------- */
function addCracks(amount, opts = {}) {
  if (state.isComplete) return;
  let next = state.currentCracks + amount;
  // Gate the finish: never let a strike reach the target while a protocol check is
  // still unanswered. Holding one crack short guarantees the final question fires
  // (and with it the ×26 finale) instead of being leapfrogged by a big late-game tap.
  if (next >= TARGET && !opts.noQuestion && questionsPending()) next = TARGET - 1;
  state.currentCracks = Math.min(TARGET, next);
  // Hammer level is NOT derived from crack count — it only rises when a protocol
  // check is answered correctly (see applyReward). Tapping just adds crack points.

  el.crackCount.classList.remove('bump'); void el.crackCount.offsetWidth; el.crackCount.classList.add('bump');
  render();
  save();
  checkMilestones();

  if (state.currentCracks >= TARGET) { triggerFinalPrompt(); return; }
  if (!opts.noQuestion) maybeQuestion();
}

function strikeAt(clientX, clientY) {
  if (state.isComplete || questionOpen) return;
  Sound.unlock();
  scheduleIdle();

  const rect = el.eggStage.getBoundingClientRect();
  let x = clientX != null ? clientX - rect.left : rect.width / 2;
  let y = clientY != null ? clientY - rect.top : rect.height * 0.42;
  const side = x < rect.width / 2 ? 'left' : 'right';

  const hard = state.hammerLevel >= 5;
  // ~1 in 15 strikes lands a "critical crack": double points, brighter spark, heavier
  // sound and a sharper buzz. Disabled during the ×26 finale (already maxed out).
  const crit = !state.finalX26 && Math.random() < 0.066;

  // swing the CURRENT hammer in from the tapped side
  swing(side, x, y);
  spark(x, y, crit);

  el.eggImg.classList.remove('is-hit', 'is-hit--hard');
  void el.eggImg.offsetWidth;
  el.eggImg.classList.add(hard || crit ? 'is-hit--hard' : 'is-hit');
  el.eggStage.classList.add('shake-stage');
  if (crit) { el.eggStage.classList.add('crit'); setTimeout(() => el.eggStage.classList.remove('crit'), 340); }
  setTimeout(() => el.eggStage.classList.remove('shake-stage'), 200);

  const prevState = eggStateForCracks(state.currentCracks);
  let gained = pointsPerTap();
  if (crit) gained *= 2;
  floatPoints((crit ? '★ +' : '+') + fmt(gained), x, y, crit);

  if (crit) { Sound.fx.hitHard(); Sound.fx.crack(); buzz([14, 26, 14]); }
  else { hard ? Sound.fx.hitHard() : Sound.fx.hit(); buzz(hard ? 16 : 8); }

  addCracks(gained);

  if (eggStateForCracks(state.currentCracks) !== prevState) Sound.fx.crack();

  if (!el.eggStage.classList.contains('tapped')) el.eggStage.classList.add('tapped');
}

function swing(side, x, y) {
  const h = el.swingHammer;
  if (!h.src || h.dataset.lvl != state.hammerLevel) {
    setKeyed(h, hammerImageForLevel(state.hammerLevel), ASSETS.hammerBg);
    h.dataset.lvl = state.hammerLevel;
  }
  const rect = el.eggStage.getBoundingClientRect();
  const W = h.offsetWidth || Math.min(rect.width * 0.42, 175);
  const H = W;
  // place the head near the tap point, body extending from the tapped side
  const left = side === 'left' ? x - W * 0.78 : x - W * 0.22;
  const top = y - H * 0.62;
  h.style.left = clamp(left, -W * 0.5, rect.width - W * 0.5) + 'px';
  h.style.top = clamp(top, -H * 0.4, rect.height - H * 0.4) + 'px';
  h.classList.remove('go', 'swing--left', 'swing--right');
  void h.offsetWidth;
  h.classList.add('go', side === 'left' ? 'swing--left' : 'swing--right');
}

function spark(x, y, big) {
  const s = document.createElement('div');
  s.className = big ? 'spark spark--crit' : 'spark';
  s.style.left = x + 'px'; s.style.top = y + 'px';
  el.fxLayer.appendChild(s);
  void s.offsetWidth; s.classList.add('go');
  setTimeout(() => s.remove(), big ? 520 : 360);
}
function floatPoints(text, x, y, crit) {
  const f = document.createElement('div');
  f.className = crit ? 'float-pts float-pts--crit' : 'float-pts'; f.textContent = text;
  f.style.left = x + 'px'; f.style.top = y + 'px'; f.style.transform = 'translateX(-50%)';
  el.fxLayer.appendChild(f);
  setTimeout(() => f.remove(), crit ? 1100 : 900);
}

/* ------------------------------ MULTIPLIER ------------------------------ */
function setMultiplier(value, durationSec) {
  activeMultiplier = value;
  multiplierEndsAt = Date.now() + durationSec * 1000;
  if (multiplierTimer) clearInterval(multiplierTimer);
  multiplierTimer = setInterval(() => {
    if (Date.now() >= multiplierEndsAt) {
      clearInterval(multiplierTimer); multiplierTimer = null;
      if (!state.finalX26) activeMultiplier = 1;
      render();
    }
  }, 250);
  render();
}
function enterFinalMode() {
  if (state.finalX26) return;
  state.finalX26 = true;
  activeMultiplier = 26;
  if (multiplierTimer) { clearInterval(multiplierTimer); multiplierTimer = null; }
  clearTimeout(idleTimer); el.eggImg.classList.remove('breathing');
  el.eggStage.dataset.glow = 'high';
  el.eggStage.classList.add('final-mode');
  Sound.fx.steam();
  buzz([20, 50, 20, 50, 30]);
  systemMessage('×26 ÖVERLADDNING! Skalet är som tunnast. En sista crack återstår.');
  render(); save();
}

/* ----------------------------- SPECIAL FX ------------------------------- */
function steamBurst(points) {
  const puff = document.createElement('div');
  puff.className = 'steam-puff'; el.fxLayer.appendChild(puff);
  void puff.offsetWidth; puff.classList.add('go');
  setTimeout(() => puff.remove(), 1600);
  Sound.fx.steam();
  if (points) addCracks(points, { noQuestion: true });
}
function ticketStorm() {
  Sound.fx.ticket();
  const rect = el.eggStage.getBoundingClientRect();
  for (let i = 0; i < 9; i++) {
    const t = document.createElement('div');
    t.className = 'ticket-fly';
    t.style.left = (rect.width * (0.2 + Math.random() * 0.6)) + 'px';
    t.style.top = (rect.height * 0.6) + 'px';
    t.style.setProperty('--tx', (Math.random() * 200 - 100) + 'px');
    t.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
    el.fxLayer.appendChild(t);
    void t.offsetWidth; t.classList.add('go');
    setTimeout(() => t.remove(), 1400);
  }
}

// Lingering gold confetti for the reveal: an opening burst, then gentle drifts that
// taper off over ~16s. Skipped entirely under prefers-reduced-motion.
let confettiTimer = null;
function startConfetti() {
  const layer = $('confettiLayer');
  if (!layer) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#e8cf8b', '#d8b76a', '#f4e6c0', '#a78a4a', '#fff7e0'];
  const spawn = (n) => {
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div');
      b.className = 'confetti-bit';
      const w = 5 + Math.random() * 6;
      b.style.left = (Math.random() * 100) + '%';
      b.style.width = w + 'px';
      b.style.height = (w * (1.2 + Math.random())) + 'px';
      b.style.background = colors[(Math.random() * colors.length) | 0];
      if (Math.random() < 0.3) b.style.borderRadius = '50%';
      const dur = 3.2 + Math.random() * 2.8;
      b.style.setProperty('--dur', dur + 's');
      b.style.setProperty('--spin', (Math.random() * 760 - 380) + 'deg');
      layer.appendChild(b);
      void b.offsetWidth; b.classList.add('go');
      setTimeout(() => b.remove(), dur * 1000 + 250);
    }
  };
  spawn(44);                 // opening burst
  let bursts = 0;
  clearInterval(confettiTimer);
  confettiTimer = setInterval(() => {
    spawn(6);
    if (++bursts > 22) clearInterval(confettiTimer);   // ~16s of lingering drift
  }, 700);
}

/* ------------------------------ MESSAGES -------------------------------- */
let sysIndex = 0;
function systemMessage(text) {
  el.systemMsg.classList.remove('flash'); void el.systemMsg.offsetWidth;
  el.systemMsg.textContent = text;
  el.systemMsg.classList.add('flash');
}
function rotateSystemMessages() {
  if (sysMsgTimer) clearInterval(sysMsgTimer);
  sysMsgTimer = setInterval(() => {
    if (questionOpen || state.isComplete) return;
    sysIndex = (sysIndex + 1) % SYSTEM_MESSAGES.length;
    systemMessage(SYSTEM_MESSAGES[sysIndex]);
  }, 6000);
}

/* ------------------------------ UPGRADE --------------------------------- */
function showUpgrade(level) {
  el.toastName.textContent = HAMMERS[level - 1].name;
  el.hammerMedallion.classList.remove('upgrade'); void el.hammerMedallion.offsetWidth;
  el.hammerMedallion.classList.add('upgrade');
  el.upgradeToast.classList.add('is-open');
  Sound.fx.upgrade();
  setTimeout(() => el.upgradeToast.classList.remove('is-open'), UPGRADE_TOAST_MS);
}

/* ------------------------------ QUESTIONS ------------------------------- */
function maybeQuestion() {
  const q = nextQuestion();
  if (q && !questionOpen) cueQuestion(q);
}
function cueQuestion(q) {
  questionOpen = true;
  currentQuestion = q;
  clearTimeout(idleTimer); el.eggImg.classList.remove('breathing');
  if (el.questionPrelude) {
    el.questionPrelude.classList.add('is-open');
    el.questionPrelude.setAttribute('aria-hidden', 'false');
  }
  systemMessage('Protocol check incoming.');
  setTimeout(() => {
    if (el.questionPrelude) {
      el.questionPrelude.classList.remove('is-open');
      el.questionPrelude.setAttribute('aria-hidden', 'true');
    }
    openQuestion(q);
  }, QUESTION_PRELUDE_MS);
}
function openQuestion(q) {
  questionOpen = true;
  currentQuestion = q;
  clearTimeout(idleTimer); el.eggImg.classList.remove('breathing');
  if (el.qSkip) el.qSkip.disabled = false;
  const answeredCount = state.answeredQuestions.length;
  el.qProgress.textContent = 'Question ' + (answeredCount + 1) + ' of ' + QUESTIONS.length;
  el.qText.textContent = q.question;
  if (q.portrait) { el.qPortraitImg.src = 'assets/images/faces/' + q.portrait; el.qPortrait.hidden = false; }
  else { el.qPortrait.hidden = true; el.qPortraitImg.removeAttribute('src'); }
  el.qFeedback.hidden = true; el.qFeedback.innerHTML = '';
  el.qOptions.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'q-opt'; b.type = 'button';
    // staggered entrance: each option drops in ~80ms after the previous one,
    // after the card itself has slid up (320ms base offset).
    b.style.animationDelay = (320 + i * 90) + 'ms';
    b.innerHTML = '<span class="q-key">' + 'ABCD'[i] + '</span><span>' + opt + '</span>';
    b.addEventListener('click', () => answer(q, i, b));
    el.qOptions.appendChild(b);
  });
  el.qModal.classList.add('is-open');
}
function answer(q, idx, btn) {
  const buttons = [...el.qOptions.querySelectorAll('.q-opt')];
  // Trick questions: every option IS the right answer written differently, so any click is correct.
  if (q.trick || idx === q.correctIndex) {
    btn.classList.add('correct');
    buttons.forEach(b => b.disabled = true);
    el.qFeedback.hidden = false;
    el.qFeedback.innerHTML = q.successText + '<span class="reward">' + q.rewardText + '</span>'
      + (q.personalNote ? '<span class="note">' + q.personalNote + '</span>' : '');
    Sound.fx.correct();
    state.answeredQuestions.push(q.id);
    save();
    setTimeout(() => { closeQuestion(); applyReward(q.reward); maybeEnterFinale(); }, q.personalNote ? ANSWER_READ_WITH_NOTE_MS : ANSWER_READ_MS);
  } else {
    btn.classList.add('wrong');
    buttons.forEach(b => b.disabled = true);
    el.qFeedback.hidden = false;
    el.qFeedback.textContent = q.wrongText;
    Sound.fx.wrong();
    setTimeout(() => {
      btn.classList.remove('wrong');
      buttons.forEach(b => b.disabled = false);
    }, WRONG_READ_MS);
  }
}
function closeQuestion() {
  el.qModal.classList.remove('is-open');
  if (el.questionPrelude) {
    el.questionPrelude.classList.remove('is-open');
    el.questionPrelude.setAttribute('aria-hidden', 'true');
  }
  questionOpen = false;
  currentQuestion = null;
  if (!state.isComplete && !state.finalX26) scheduleIdle();
}
function maybeEnterFinale() {
  // Last protocol check cleared → engage the ×26 finale for the final crack.
  if (!state.isComplete && state.currentCracks < TARGET && !questionsPending()) enterFinalMode();
}
// Skip a check: marks it answered (won't re-fire), grants the reward with a gentle
// line — no "Rätt!" fanfare — so pacing never stalls and she's never trapped (PRD §4).
function skipQuestion() {
  if (!questionOpen || !currentQuestion) return;
  const q = currentQuestion;
  el.qOptions.querySelectorAll('.q-opt').forEach(b => b.disabled = true);
  if (el.qSkip) el.qSkip.disabled = true;
  el.qFeedback.hidden = false;
  el.qFeedback.innerHTML = '<em>Ingen stress — systemet ger dig den ändå.</em>'
    + '<span class="reward">' + q.rewardText + '</span>'
    + (q.personalNote ? '<span class="note">' + q.personalNote + '</span>' : '');
  Sound.fx.drop();
  if (!state.answeredQuestions.includes(q.id)) { state.answeredQuestions.push(q.id); save(); }
  setTimeout(() => { closeQuestion(); applyReward(q.reward); maybeEnterFinale(); }, q.personalNote ? SKIP_READ_WITH_NOTE_MS : SKIP_READ_MS);
}
function applyReward(reward) {
  if (!reward) return;
  if (reward.type === 'hammer') {
    const lvl = clamp(reward.value || (state.hammerLevel + 1), 1, HAMMERS.length);
    if (lvl > state.hammerLevel) { state.hammerLevel = lvl; showUpgrade(lvl); }
    render(); save();
    // a single answer may unlock the next check immediately if its threshold is already met
    setTimeout(() => { if (state.currentCracks < TARGET && !state.isComplete) maybeQuestion(); }, UPGRADE_TOAST_MS + 450);
  } else if (reward.type === 'points') {
    addCracks(reward.value);
  } else if (reward.type === 'steam') {
    steamBurst(reward.value);
    setTimeout(() => { if (state.currentCracks < TARGET) maybeQuestion(); }, 400);
  } else if (reward.type === 'multiplier') {
    if (reward.value >= 10) ticketStorm();
    setMultiplier(reward.value, reward.duration || 12);
    systemMessage('Hammer recalibrated: ×' + reward.value + ' for ' + (reward.duration || 12) + 's.');
  }
}

/* --------------------------- FINAL REVEAL ------------------------------- */
function triggerFinalPrompt() {
  state.currentCracks = TARGET;
  render(); save();
  if (multiplierTimer) clearInterval(multiplierTimer);
  setTimeout(() => el.finalPrompt.classList.add('is-open'), 500);
}
function deliverFinalCrack() {
  el.finalPrompt.classList.remove('is-open');
  state.isComplete = true; save();
  // egg breaks
  setKeyed(el.eggImg, ASSETS.eggs[9], ASSETS.eggBg);
  el.eggStage.dataset.glow = 'high';
  steamBurst(0);
  Sound.fx.final();
  el.eggImg.classList.add('is-hit--hard');
  setTimeout(showReveal, 900);
}
function showReveal() {
  switchScreen(el.reveal);
  el.reveal.classList.add('go');
  startConfetti();
  setKeyed(el.revealMouse, ASSETS.mouse, ASSETS.mouseBg).then(() => {
    el.revealMouse.style.backgroundImage = 'url(' + (keyedCache[ASSETS.mouse] || ASSETS.mouse) + ')';
  });
  // revealMouse is a div: set background after keying
  keyOut(ASSETS.mouse, ASSETS.mouseBg).then(src => { el.revealMouse.style.backgroundImage = 'url(' + src + ')'; });
  setTimeout(() => Sound.fx.fanfare(), 700);
}

/* ------------------------------ SCREENS --------------------------------- */
function switchScreen(target) {
  [el.intro, el.game, el.reveal].forEach(s => { s.classList.remove('is-active'); });
  target.classList.add('is-active');
}

/* ------------------------------- INTRO ---------------------------------- */
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let introRunning = false, introDone = false;

// Karolina's birthday is 25 May (see question id 2). The handwritten greeting adapts to
// whenever she actually opens this — on the day, just after, just before, or any time.
const BIRTHDAY = { month: 4, day: 25 }; // JS months are 0-indexed → 4 = May
function birthdayGreeting() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const bday = new Date(now.getFullYear(), BIRTHDAY.month, BIRTHDAY.day);
  const diff = Math.round((today - bday) / 86400000);
  if (diff === 0) return 'Grattis på 26-årsdagen, Karolina';
  if (diff > 0 && diff <= 21) return 'Grattis i efterskott, Karolina';
  if (diff < 0 && diff >= -21) return 'Snart fyller du 26, Karolina';
  return 'För Karolina — 26 år';
}
function setGreeting() {
  if (el.introGreeting) el.introGreeting.textContent = birthdayGreeting();
}

async function runIntro() {
  if (introRunning) return; introRunning = true;
  // preload pristine egg into intro element keyed
  keyOut(ASSETS.eggs[0], ASSETS.eggBg).then(src => {
    const e = $('introEgg'); if (e) e.style.backgroundImage = 'url(' + src + ')';
  });
  el.intro.classList.add('atmos');
  const get = (n) => el.intro.querySelector('[data-beat="' + n + '"]');
  const show = (n) => get(n).classList.add('is-in');
  const hide = (n) => { const b = get(n); b.classList.remove('is-in'); b.classList.add('is-out'); };

  await wait(450);
  show('name'); Sound.fx.drop();
  await wait(1900);
  if (introDone) return finishIntroNow();

  // name → years (cross-fade; same centered box, so nothing shifts)
  hide('name'); show('years');
  await wait(700);
  // 26 → 26,000
  el.introYearsWord.classList.add('gone');
  await wait(420);
  el.introYearsWord.style.display = 'none';
  ',000'.split('').forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'z'; span.textContent = ch;
    el.introZeros.appendChild(span);
    setTimeout(() => { span.classList.add('stamped'); Sound.fx.stamp(); }, i * 220);
  });
  await wait(4 * 220 + 250);
  el.introSubReq.classList.add('is-in');
  await wait(1500);
  if (introDone) return finishIntroNow();

  // years → stamp
  hide('years'); show('stamp');
  requestAnimationFrame(() => { el.introStamp.classList.add('slam'); Sound.fx.stamp(); });
  await wait(1900);
  if (introDone) return finishIntroNow();

  // stamp → egg (final resting beat)
  hide('stamp'); show('egg'); Sound.fx.drop();
  await wait(900);

  el.beginBtn.classList.add('is-in');
  introRunning = false; introDone = true;
}
function finishIntroNow() {
  // jump straight to the final resting beat (egg) + begin button
  introDone = true; introRunning = false;
  const get = (n) => el.intro.querySelector('[data-beat="' + n + '"]');
  ['name', 'years', 'stamp'].forEach(n => { const b = get(n); b.classList.remove('is-in'); b.classList.add('is-out'); });
  el.introYearsWord.style.display = 'none';
  if (!el.introZeros.children.length) {
    ',000'.split('').forEach(ch => { const s = document.createElement('span'); s.className = 'z stamped'; s.textContent = ch; el.introZeros.appendChild(s); });
  }
  el.introSubReq.classList.add('is-in');
  el.introStamp.classList.add('slam');
  get('egg').classList.add('is-in');
  el.beginBtn.classList.add('is-in');
}

function beginGame() {
  Sound.unlock();
  state.introSeen = true; save();
  el.intro.classList.add('fade-out');
  setTimeout(() => {
    switchScreen(el.game);
    el.mute.hidden = false;
    startGame();
  }, 450);
}

function startGame() {
  lastEggState = 0; lastHammerLevel = 0;
  state.hammerLevel = clamp(state.hammerLevel || 1, 1, HAMMERS.length);
  // Resume mid-finale (state persists) so the ×26 overcharge survives a reload.
  if (state.finalX26 && !state.isComplete) {
    activeMultiplier = 26;
    el.eggStage.dataset.glow = 'high';
    el.eggStage.classList.add('final-mode');
  }
  render();
  systemMessage(SYSTEM_MESSAGES[0]);
  rotateSystemMessages();
  scheduleIdle();
  if (state.currentCracks >= TARGET && !state.isComplete) triggerFinalPrompt();
}

/* ------------------------------- DEBUG ---------------------------------- */
function setupDebug() {
  if (!DEBUG) return;
  el.debug.hidden = false;
  el.debug.addEventListener('click', (e) => {
    const a = e.target.dataset.debug;
    if (!a) return;
    if (a === 'add') {
      // never let a prior force-reveal soft-lock the tester
      state.isComplete = false;
      state.currentCracks = Math.min(TARGET, state.currentCracks + 1000);
      render(); save();
      if (state.currentCracks >= TARGET) triggerFinalPrompt(); else maybeQuestion();
    } else if (a === 'question') {
      // next UNANSWERED check, in threshold order; jump cracks up to it if needed
      const q = QUESTIONS.find(q => !state.answeredQuestions.includes(q.id));
      if (q) {
        if (state.currentCracks < q.threshold) { state.currentCracks = q.threshold; render(); save(); }
        cueQuestion(q);
      } else systemMessage('Debug: alla protokoll besvarade. Använd "Clear storage".');
    } else if (a === 'reveal') { state.isComplete = false; state.currentCracks = TARGET; render(); triggerFinalPrompt(); }
    else if (a === 'clear') { localStorage.removeItem(STORAGE_KEY); location.reload(); }
  });
}

/* ------------------------------- WIRING --------------------------------- */
function wire() {
  // tap the EGG (pointer gives us the coordinate → side-aware hammer)
  el.eggStage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    strikeAt(e.clientX, e.clientY);
  });
  // keyboard / fallback (Enter/Space on focused egg)
  el.eggStage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); strikeAt(null, null); }
  });

  el.beginBtn.addEventListener('click', beginGame);
  el.skipIntro.addEventListener('click', () => { introDone = true; if (!introRunning) finishIntroNow(); });
  if (el.qSkip) el.qSkip.addEventListener('click', skipQuestion);
  el.finalCrackBtn.addEventListener('click', deliverFinalCrack);
  el.tripBtn.addEventListener('click', () => {
    el.tripDetails.hidden = !el.tripDetails.hidden;
    el.tripBtn.textContent = el.tripDetails.hidden ? 'Show trip details' : 'Hide trip details';
  });
  el.mute.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled; save();
    el.mute.dataset.muted = (!state.soundEnabled).toString();
  });
  el.mute.dataset.muted = (!state.soundEnabled).toString();

  // hidden reset: tap brand/title 5 times
  let titleTaps = 0, titleTimer = null;
  el.brand.addEventListener('click', () => {
    titleTaps++; el.brand.classList.add('pulse'); setTimeout(() => el.brand.classList.remove('pulse'), 300);
    clearTimeout(titleTimer); titleTimer = setTimeout(() => titleTaps = 0, 1500);
    if (titleTaps >= 5) { localStorage.removeItem(STORAGE_KEY); location.reload(); }
  });
}

/* --------------------------------- BOOT --------------------------------- */
async function boot() {
  try {
    const res = await fetch(ASSETS.questions, { cache: 'no-store' });
    const data = await res.json();
    QUESTIONS = (data.questions || data).sort((a, b) => a.threshold - b.threshold);
    if (Array.isArray(data.hammerLadder)) {
      data.hammerLadder.forEach((h) => {
        const i = (h.level || 0) - 1;
        if (i >= 0 && i < HAMMERS.length && h.name) HAMMERS[i].name = h.name;
      });
    }
  } catch (e) {
    QUESTIONS = []; // game still works without questions
    console.warn('questions.json failed to load:', e);
  }

  // Self-heal stale/leaked progress: a question can only have been answered once
  // cracks reached its threshold (and cracks only increase). Any answered id whose
  // threshold is above current cracks — or that no longer exists — is impossible,
  // so drop it. Prevents stale localStorage from permanently suppressing the quizzes.
  if (QUESTIONS.length && state.answeredQuestions.length) {
    const valid = state.answeredQuestions.filter((id) => {
      const q = QUESTIONS.find((x) => x.id === id);
      return q && state.currentCracks >= q.threshold;
    });
    if (valid.length !== state.answeredQuestions.length) {
      state.answeredQuestions = valid;
      save();
    }
  }

  wire();
  setupDebug();
  setGreeting();
  el.body.classList.remove('is-loading');

  if (state.introSeen) {
    // resume straight into the game
    switchScreen(el.game);
    el.mute.hidden = false;
    introDone = true;
    startGame();
  } else {
    switchScreen(el.intro);
    runIntro();
  }
}
document.addEventListener('DOMContentLoaded', boot);
