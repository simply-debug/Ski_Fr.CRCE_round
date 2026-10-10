// Handsfree - tracker window.
// Runs the webcam + MediaPipe face tracking + speech recognition, and drives the page in the
// active Chrome tab by messaging the content script.
import { OneEuro, mapAxis, BlinkDetector } from './filters.js';
import { parseCommand, HELP_TEXT } from './commands.js';

const $ = (id) => document.getElementById(id);
const video = $('video');

// ---------- settings ----------
const cfg = {
  dwell: true, wink: true, voice: true, edge: false,
  gain: 1.2, smooth: 0.5, dwellSec: 1.3, lang: 'en-IN',
  paused: false, dictating: false,
};
// Head offset calibration (nose position relative to the eyes, in "eye distances").
const DEFAULT_CAL = { cx: 0, cy: 0, xl: -0.1, xr: 0.1, yu: -0.08, yd: 0.08, has: false };
let cal = { ...DEFAULT_CAL };

const stats = { wink: 0, dwell: 0, voice: 0, commands: 0, unknown: 0, mistakes: 0 };

const NOSE = [1, 2, 4, 5]; // nose tip landmarks (averaged to reduce jitter)
const filterX = new OneEuro();
const filterY = new OneEuro();
const blink = new BlinkDetector();

let landmarker = null;
let latest = null; // latest head offset { x, y, t }
let calibrating = false;
let lastVideoTime = -1;
let busy = false;
let frames = 0;
let fpsStamp = performance.now();
let fps = 0;
let faceSeen = false;
let lastSent = { x: -1, y: -1, t: 0 };
let statusExtra = '';

// ---------- worker clock ----------
const worker = new Worker('tick-worker.js');
const sleepers = new Map();
let sleepId = 0;
function sleep(ms) {
  return new Promise((resolve) => {
    const id = ++sleepId;
    sleepers.set(id, resolve);
    worker.postMessage({ type: 'sleep', id, ms });
  });
}
worker.onmessage = (e) => {
  if (e.data.type === 'tick') tick();
  else if (e.data.type === 'wake') {
    const r = sleepers.get(e.data.id);
    sleepers.delete(e.data.id);
    if (r) r();
  }
};

// ---------- talking to the active tab ----------
const target = { tabId: null, url: '', blocked: false };
const failedUntil = new Map();
let lastNormalWin = null;

async function refreshTarget() {
  try {
    if (lastNormalWin == null) {
      const all = await chrome.windows.getAll({ windowTypes: ['normal'] });
      const pick = all.find((w) => w.focused) || all[0];
      lastNormalWin = pick ? pick.id : null;
    }
    if (lastNormalWin == null) return;
    const [tab] = await chrome.tabs.query({ active: true, windowId: lastNormalWin });
    if (!tab) return;
    if (tab.id !== target.tabId) {
      const old = target.tabId;
      target.tabId = tab.id;
      target.blocked = false;
      if (old != null) chrome.tabs.sendMessage(old, { type: 'hide' }).catch(() => {});
      pushConfig();
    }
    target.url = tab.url || '';
  } catch (_) {
    lastNormalWin = null; // window was closed; pick again next time
  }
}
chrome.windows.onFocusChanged.addListener(async (id) => {
  if (id === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const w = await chrome.windows.get(id);
    if (w.type === 'normal') {
      lastNormalWin = id;
      refreshTarget();
    }
  } catch (_) {}
});
chrome.tabs.onActivated.addListener(() => refreshTarget());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === target.tabId && info.status === 'complete') {
    target.blocked = false;
    failedUntil.delete(tabId);
    setTimeout(pushConfig, 300);
  }
});

async function inject(tabId) {
  if ((failedUntil.get(tabId) || 0) > Date.now()) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (_) {
    failedUntil.set(tabId, Date.now() + 4000);
    return false;
  }
}

async function send(msg) {
  const tabId = target.tabId;
  if (tabId == null) return null;
  try {
    const r = await chrome.tabs.sendMessage(tabId, msg);
    target.blocked = false;
    return r;
  } catch (_) {
    if (await inject(tabId)) {
      try {
        const r = await chrome.tabs.sendMessage(tabId, msg);
        target.blocked = false;
        return r;
      } catch (_) {}
    }
    target.blocked = true;
    return null;
  }
}

function pushConfig() {
  send({ type: 'config', paused: cfg.paused, dwell: cfg.dwell, dwellMs: cfg.dwellSec * 1000, edgeScroll: cfg.edge });
}
const toastPage = (text, opts = {}) => send({ type: 'toast', text, ...opts });

// Messages from content scripts (stats, open-in-new-tab).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'stat' && msg.kind === 'dwellClick') stats.dwell++;
  else if (msg.type === 'openTab' && msg.url) chrome.tabs.create({ url: msg.url, active: true });
});

// ---------- head pose from landmarks ----------
function headOffset(lm) {
  const W = video.videoWidth || 640;
  const H = video.videoHeight || 480;
  const px = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const a = px(33), b = px(263), c = px(133), d = px(362); // eye corners
  const eye = { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4 };
  const eyeDist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = 0, ny = 0;
  for (const i of NOSE) {
    const p = px(i);
    nx += p.x;
    ny += p.y;
  }
  nx /= NOSE.length;
  ny /= NOSE.length;
  const roll = Math.atan2(b.y - a.y, b.x - a.x);
  const dx = nx - eye.x;
  const dy = ny - eye.y;
  const cos = Math.cos(-roll);
  const sin = Math.sin(-roll);
  const rx = (dx * cos - dy * sin) / eyeDist; // cancels head tilt
  const ry = (dx * sin + dy * cos) / eyeDist;
  // Camera is not mirrored: turning to your right moves the nose to image-left, so flip x.
  return { x: -rx, y: ry };
}

function smoothingToCutoff(s) {
  return 3.0 * Math.pow(0.1, s); // s=0 -> 3 Hz (snappy), s=1 -> 0.3 Hz (very steady)
}

// ---------- per-frame loop ----------
function tick() {
  frames++;
  const now = performance.now();
  if (now - fpsStamp >= 1000) {
    fps = Math.round((frames * 1000) / (now - fpsStamp));
    frames = 0;
    fpsStamp = now;
    refreshTarget();
  }
  if (frames % 8 === 0) renderStatus();
  if (!landmarker || busy || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  busy = true;
  try {
    const res = landmarker.detectForVideo(video, now);
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    if (!lm) {
      faceSeen = false;
      latest = null;
      return;
    }
    faceSeen = true;
    const off = headOffset(lm);
    latest = { ...off, t: now };

    let bl = 0, br = 0;
    const cats = res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories;
    if (cats) {
      for (const c of cats) {
        if (c.categoryName === 'eyeBlinkLeft') bl = c.score;
        else if (c.categoryName === 'eyeBlinkRight') br = c.score;
      }
    }
    const ev = blink.update(bl, br, now);
    if (ev === 'longBlink') setPaused(!cfg.paused);
    else if (ev === 'wink' && cfg.wink && !cfg.paused && !calibrating) {
      stats.wink++;
      send({ type: 'click' });
    }

    if (cfg.paused || calibrating) return;
    // Freeze the cursor while an eye is closing so winking does not drag it off the target.
    if (Math.max(bl, br) > 0.3) return;

    filterX.minCutoff = filterY.minCutoff = smoothingToCutoff(cfg.smooth);
    const nxm = mapAxis(off.x, cal.cx, cal.xl, cal.xr, cfg.gain);
    const nym = mapAxis(off.y, cal.cy, cal.yu, cal.yd, cfg.gain);
    const fx = filterX.filter(nxm, now / 1000);
    const fy = filterY.filter(nym, now / 1000);
    if (Math.abs(fx - lastSent.x) > 0.0006 || Math.abs(fy - lastSent.y) > 0.0006 || now - lastSent.t > 150) {
      lastSent = { x: fx, y: fy, t: now };
      send({ type: 'move', x: fx, y: fy });
    }
  } catch (err) {
    statusExtra = 'Tracking error: ' + (err && err.message ? err.message : err);
  } finally {
    busy = false;
  }
}

// ---------- calibration ----------
const avg = (arr, k) => arr.reduce((s, v) => s + v[k], 0) / arr.length;

async function startCalibration() {
  if (calibrating) return;
  if (!landmarker) return;
  calibrating = true;
  $('btnCal').disabled = true;
  const wasPaused = cfg.paused;
  cfg.paused = false;
  pushConfig();
  const steps = [
    { key: 'center', text: 'Calibration 1/5: look at the CENTER of the screen and hold still' },
    { key: 'left', text: 'Calibration 2/5: turn your head LEFT, as if aiming at the left edge' },
    { key: 'right', text: 'Calibration 3/5: turn your head RIGHT' },
    { key: 'up', text: 'Calibration 4/5: tilt your head UP' },
    { key: 'down', text: 'Calibration 5/5: tilt your head DOWN' },
  ];
  const got = {};
  for (const s of steps) {
    await toastPage(s.text, { big: true, ms: 2600 });
    await sleep(1500);
    const samples = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1000) {
      if (latest && performance.now() - latest.t < 250) samples.push(latest);
      await sleep(40);
    }
    if (samples.length < 6) {
      await toastPage('Calibration cancelled: I could not see your face. Try again.', { big: true, ms: 3000 });
      calibrating = false;
      $('btnCal').disabled = false;
      cfg.paused = wasPaused;
      pushConfig();
      return;
    }
    got[s.key] = { x: avg(samples, 'x'), y: avg(samples, 'y') };
  }
  const next = { ...cal, cx: got.center.x, cy: got.center.y, has: true };
  const minSpan = 0.02;
  let warn = '';
  if (got.left.x < next.cx - minSpan && got.right.x > next.cx + minSpan) {
    next.xl = got.left.x;
    next.xr = got.right.x;
  } else {
    next.xl = next.cx + DEFAULT_CAL.xl;
    next.xr = next.cx + DEFAULT_CAL.xr;
    warn += ' Left/right movement was small - turn further next time.';
  }
  if (got.up.y < next.cy - minSpan && got.down.y > next.cy + minSpan) {
    next.yu = got.up.y;
    next.yd = got.down.y;
  } else {
    next.yu = next.cy + DEFAULT_CAL.yu;
    next.yd = next.cy + DEFAULT_CAL.yd;
    warn += ' Up/down movement was small - tilt further next time.';
  }
  cal = next;
  filterX.reset();
  filterY.reset();
  chrome.storage.local.set({ hfCal: cal });
  calibrating = false;
  $('btnCal').disabled = false;
  cfg.paused = wasPaused;
  pushConfig();
  await toastPage('Calibration done.' + warn, { big: true, ms: 2800 });
}

// ---------- commands ----------
function setPaused(v) {
  cfg.paused = v;
  $('btnPause').textContent = v ? 'Resume' : 'Pause';
  filterX.reset();
  filterY.reset();
  pushConfig();
  toastPage(v ? 'Paused. Say "resume" or hold a long blink.' : 'Resumed', { ms: 1800 });
}

async function relativeTab(delta) {
  if (lastNormalWin == null) return;
  const tabs = await chrome.tabs.query({ windowId: lastNormalWin });
  tabs.sort((a, b) => a.index - b.index);
  const i = tabs.findIndex((t) => t.active);
  const next = tabs[(i + delta + tabs.length) % tabs.length];
  if (next) await chrome.tabs.update(next.id, { active: true });
  refreshTarget();
}

async function run(c) {
  switch (c.name) {
    case 'click': stats.voice++; return send({ type: 'click' });
    case 'dblclick': stats.voice++; return send({ type: 'dblclick' });
    case 'scroll': return send({ type: 'scroll', arg: c.arg });
    case 'hintsOn': return send({ type: 'hintsOn' });
    case 'hintsOff': return send({ type: 'hintsOff' });
    case 'hintClick': stats.voice++; return send({ type: 'hintClick', arg: c.arg });
    case 'clickText': stats.voice++; return send({ type: 'clickText', arg: c.arg });
    case 'text': return send({ type: 'text', arg: c.arg });
    case 'enter': return send({ type: 'key', arg: 'enter' });
    case 'clear': return send({ type: 'key', arg: 'clear' });
    case 'deleteWord': return send({ type: 'key', arg: 'deleteWord' });
    case 'dictateOn':
      cfg.dictating = true;
      return toastPage('Dictating. Everything you say is typed. Say "stop typing" to finish.', { ms: 3500 });
    case 'dictateOff':
      cfg.dictating = false;
      return toastPage('Stopped typing', { ms: 1500 });
    case 'pause': return setPaused(true);
    case 'resume': return setPaused(false);
    case 'calibrate': return startCalibration();
    case 'dwell':
      cfg.dwell = !!c.arg;
      $('chkDwell').checked = cfg.dwell;
      pushConfig();
      return toastPage('Dwell click ' + (cfg.dwell ? 'on' : 'off'), { ms: 1500 });
    case 'mistake':
      stats.mistakes++;
      return toastPage('Noted as a mistake', { ms: 1200 });
    case 'help': return toastPage(HELP_TEXT, { ms: 8000 });
    case 'back': if (target.tabId != null) return chrome.tabs.goBack(target.tabId).catch(() => {}); return;
    case 'forward': if (target.tabId != null) return chrome.tabs.goForward(target.tabId).catch(() => {}); return;
    case 'reload': if (target.tabId != null) return chrome.tabs.reload(target.tabId); return;
    case 'newTab': return chrome.tabs.create({ windowId: lastNormalWin ?? undefined, active: true });
    case 'closeTab': if (target.tabId != null) return chrome.tabs.remove(target.tabId); return;
    case 'nextTab': return relativeTab(1);
    case 'prevTab': return relativeTab(-1);
    case 'search':
      if (target.tabId != null)
        return chrome.tabs.update(target.tabId, { url: 'https://www.google.com/search?q=' + encodeURIComponent(c.arg) });
      return;
    case 'goto': if (target.tabId != null) return chrome.tabs.update(target.tabId, { url: c.arg }); return;
    default: return;
  }
}

function handleSpeech(text) {
  $('heard').textContent = 'Heard: ' + text;
  const c = parseCommand(text, { dictating: cfg.dictating });
  if (c.name === 'empty') return;
  if (cfg.paused && !['resume', 'pause', 'help'].includes(c.name)) return;
  stats.commands++;
  if (c.name === 'unknown') {
    stats.unknown++;
    toastPage(`Didn't understand "${text.trim()}". Say "help" for commands.`, { ms: 2200 });
    return;
  }
  if (c.name !== 'text' && c.name !== 'scroll') toastPage('🎤 ' + text.trim(), { ms: 1200 });
  run(c);
}

// ---------- speech recognition ----------
let rec = null;
let recWanted = false;
let voiceMsg = 'off';
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceMsg = 'not supported in this browser';
    return;
  }
  if (rec) stopVoice();
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.lang = cfg.lang;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) handleSpeech(e.results[i][0].transcript);
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      recWanted = false;
      voiceMsg = 'microphone blocked - allow it in the address-bar prompt, then reload this window';
    } else if (e.error === 'network') {
      voiceMsg = 'needs an internet connection';
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      voiceMsg = e.error;
    }
  };
  rec.onstart = () => (voiceMsg = 'listening');
  rec.onend = () => {
    if (recWanted && cfg.voice) setTimeout(() => { try { rec.start(); } catch (_) {} }, 300);
  };
  recWanted = true;
  try { rec.start(); } catch (_) {}
}
function stopVoice() {
  recWanted = false;
  if (rec) { try { rec.stop(); } catch (_) {} }
  voiceMsg = 'off';
}

// ---------- UI ----------
function renderStatus() {
  const badge = $('badge');
  let text;
  if (!landmarker) text = statusExtra || 'Loading face tracker…';
  else if (!faceSeen) text = 'No face detected. Sit facing the camera in good light.';
  else if (cfg.paused) text = 'Paused (say "resume" or hold a long blink).';
  else if (calibrating) text = 'Calibrating…';
  else text = cal.has ? 'Tracking your head.' : 'Tracking with default settings. Press Calibrate for best results.';
  if (target.blocked) text += ' This page cannot be controlled (Chrome blocks extensions on it). Switch to a normal website.';
  if (statusExtra && landmarker) text += ' ' + statusExtra;
  $('status').textContent = text;
  if (!landmarker) { badge.className = 'badge off'; badge.textContent = 'loading'; }
  else if (!faceSeen) { badge.className = 'badge warn'; badge.textContent = 'no face'; }
  else if (cfg.paused) { badge.className = 'badge warn'; badge.textContent = 'paused'; }
  else { badge.className = 'badge ok'; badge.textContent = fps + ' fps'; }
  $('stats').textContent =
    `Clicks: wink ${stats.wink} · dwell ${stats.dwell} · voice ${stats.voice} | ` +
    `commands ${stats.commands} (unheard ${stats.unknown}) | mistakes ${stats.mistakes} | voice: ${voiceMsg}` +
    (cfg.dictating ? ' | DICTATING' : '');
}

function wireUi() {
  $('help').textContent = HELP_TEXT;
  const bind = (id, key, after) => {
    $(id).addEventListener('change', (e) => {
      cfg[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      chrome.storage.local.set({ hfCfg: persistable() });
      if (after) after();
    });
  };
  bind('chkDwell', 'dwell', pushConfig);
  bind('chkWink', 'wink');
  bind('chkEdge', 'edge', pushConfig);
  bind('chkVoice', 'voice', () => (cfg.voice ? startVoice() : stopVoice()));
  bind('selLang', 'lang', () => cfg.voice && startVoice());
  for (const [id, key] of [['rngGain', 'gain'], ['rngSmooth', 'smooth'], ['rngDwell', 'dwellSec']]) {
    $(id).addEventListener('input', (e) => {
      cfg[key] = parseFloat(e.target.value);
      chrome.storage.local.set({ hfCfg: persistable() });
      if (key === 'dwellSec') pushConfig();
    });
  }
  $('btnCal').addEventListener('click', startCalibration);
  $('btnPause').addEventListener('click', () => setPaused(!cfg.paused));
}

const persistable = () => ({
  dwell: cfg.dwell, wink: cfg.wink, voice: cfg.voice, edge: cfg.edge,
  gain: cfg.gain, smooth: cfg.smooth, dwellSec: cfg.dwellSec, lang: cfg.lang,
});

function applyCfgToUi() {
  $('chkDwell').checked = cfg.dwell;
  $('chkWink').checked = cfg.wink;
  $('chkVoice').checked = cfg.voice;
  $('chkEdge').checked = cfg.edge;
  $('rngGain').value = cfg.gain;
  $('rngSmooth').value = cfg.smooth;
  $('rngDwell').value = cfg.dwellSec;
  $('selLang').value = cfg.lang;
}

// ---------- start ----------
async function main() {
  wireUi();
  const saved = await chrome.storage.local.get(['hfCfg', 'hfCal']);
  if (saved.hfCfg) Object.assign(cfg, saved.hfCfg);
  if (saved.hfCal) cal = { ...DEFAULT_CAL, ...saved.hfCal };
  applyCfgToUi();
  await refreshTarget();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 30, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    statusExtra = 'Camera error: ' + (err && err.message ? err.message : err) + '. Allow the camera and reopen this window.';
    renderStatus();
    return;
  }

  try {
    const vision = await import('./lib/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks('./lib/wasm');
    const make = (delegate) =>
      vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: './lib/face_landmarker.task', delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });
    try {
      landmarker = await make('GPU');
    } catch (_) {
      landmarker = await make('CPU');
    }
  } catch (err) {
    statusExtra =
      'Could not load MediaPipe from the lib/ folder. Run "node setup.js" inside the extension folder (see README), ' +
      'then reload the extension. Details: ' + (err && err.message ? err.message : err);
    renderStatus();
    return;
  }

  worker.postMessage({ type: 'start', ms: 33 });
  if (cfg.voice) startVoice();
  pushConfig();
  if (!cal.has) toastPage('Handsfree is on. Press "Calibrate" in the controller window for best accuracy.', { ms: 4000 });
}

addEventListener('pagehide', () => {
  if (target.tabId != null) chrome.tabs.sendMessage(target.tabId, { type: 'hide' }).catch(() => {});
});

main();
