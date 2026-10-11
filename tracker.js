// Handsfree - tracker window.
// Runs the webcam + MediaPipe tracking (HEAD / EYES / HANDS modes) + speech recognition.
//
//   camera -> VisionPipeline -> ACTIVE controller (head | eyes | hands) -> cursor -> content script
//   speech recognition -> parseCommand -> run()   (same voice layer in every mode)
import { BlinkDetector } from './filters.js';
import { parseCommand, HELP_TEXT } from './commands.js';
import { VisionPipeline } from './vision/pipeline.js';
import { HeadController } from './controllers/headController.js';
import { EyeController } from './controllers/eyeController.js';
import { HandController } from './controllers/handController.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const octx = overlay.getContext('2d');

// ---------- settings ----------
// Global settings + one block of tuning per mode. HEAD keeps your original defaults.
const cfg = {
  mode: 'head',
  wink: true,
  voice: true,
  edge: false,
  lang: 'en-IN',
  paused: false,
  dictating: false,
  modes: {
    head: { gain: 1.2, smooth: 0.5, dwell: true, dwellSec: 1.3 },
    eyes: { gain: 1.0, smooth: 0.8, dwell: true, dwellSec: 1.5 },
    hands: { gain: 1.0, smooth: 0.5, dwell: false, dwellSec: 1.3, pinch: 0.28, scrollSpeed: 1.0 },
  },
};
const M = () => cfg.modes[cfg.mode]; // settings of the active mode

const MODE_INFO = {
  head: {
    title: 'HEAD',
    desc: 'Move your head to move the cursor. Blink or dwell to click. Voice works too.',
    gestures: 'Head: blink or hold still on a link (dwell) to click. Close both eyes for about 1 s to pause / resume.',
  },
  eyes: {
    title: 'EYES',
    desc: 'Look where you want the cursor. Keep your head fairly still. Dwell (or blink) to click. Voice works too.',
    gestures: 'Eyes: hold your gaze on a link (dwell) to click. Blink to click. Close both eyes for about 1 s to pause / resume.',
  },
  hands: {
    title: 'HANDS + VOICE',
    desc: 'Point with your index finger to move the cursor. Pinch to click. Voice commands and typing work as always.',
    gestures:
      'Hands: index finger = cursor · pinch thumb + index = click · two quick pinches = double click · ' +
      'raise index + middle fingers only (peace sign) and move your hand down/up = scroll down/up.',
  },
};

const stats = {
  wink: 0,
  dwell: 0,
  pinch: 0,
  voice: 0,
  commands: 0,
  unknown: 0,
  mistakes: 0,
};

const controllers = {
  head: new HeadController(),
  eyes: new EyeController(),
  hands: new HandController(),
};
const ctl = () => controllers[cfg.mode];

const vision = new VisionPipeline();
const blink = new BlinkDetector();

let calibrating = false;
let calAbort = false;
let switching = true; // true until the first mode is ready, and during mode switches
let switchToken = 0;
let cameraOn = false;
let pipelineReady = false;
let lastVideoTime = -1;
let busy = false;
let frames = 0;
let fpsStamp = performance.now();
let fps = 0;
let seen = false; // tracker currently has data (face / hand visible)
let issue = null; // null | 'noface' | 'noeyes' | 'nohand'
let lostSince = 0;
let lostToasted = false;
let lastSent = { x: -1, y: -1, t: 0 };
let statusExtra = '';
let autoCalTimer = null;
const autoCalOffered = new Set();

// ---------- eye zoom ----------
const ZOOM = { enabled: true, step: 0.1, min: 0.25, max: 5,
               holdMs: 450, repeatMs: 600, squint: 0.40, wide: 0.30, brow: 0.50 };
let lastDbg = 0;
let zoomDir = null, zoomStart = 0, lastZoomAt = 0;

async function zoomBy(delta) {
  if (target.tabId == null) return;
  try {
    const z = await chrome.tabs.getZoom(target.tabId);
    const n = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round((z + delta) * 100) / 100));
    await chrome.tabs.setZoom(target.tabId, n);
    toastPage('Zoom ' + Math.round(n * 100) + '%', { ms: 800 });
  } catch (_) {}
}
function zoomReset() {
  if (target.tabId != null) {
    chrome.tabs.setZoom(target.tabId, 0).catch(() => {});
    toastPage('Zoom 100%', { ms: 800 });
  }
}
function eyeScores(cats) {
  const s = {};
  if (cats) for (const c of cats) s[c.categoryName] = c.score;
  return {
    squint: Math.min(s.eyeSquintLeft || 0, s.eyeSquintRight || 0),
    wide: Math.min(s.eyeWideLeft || 0, s.eyeWideRight || 0),
    brow: s.browInnerUp || 0,
  };
}
// A squint also raises the "blink" scores, so it must not reach the blink detector
// (otherwise it counts as a long blink and pauses/resumes). Fully shut eyes (>0.85) still count as a blink.
function isSquinting(eye, bl, br) {
  return ZOOM.enabled && eye.squint > ZOOM.squint && Math.min(bl, br) < 0.85;
}
function updateEyeZoom(eye, bl, br, now) {
  const squinting = isSquinting(eye, bl, br);
  const eyesOpen = Math.max(bl, br) < 0.35;
  let dir = null;
  if (squinting) dir = 'out';
  else if (eyesOpen && (eye.wide > ZOOM.wide || eye.brow > ZOOM.brow)) dir = 'in';
  if (now - lastDbg > 150) {
    lastDbg = now;
    const el = $('eyeDebug');
    if (el) el.textContent = 'Eyes: wide ' + eye.wide.toFixed(2) + ' (>' + ZOOM.wide + ') | brows ' +
      eye.brow.toFixed(2) + ' (>' + ZOOM.brow + ') = zoom IN | squint ' + eye.squint.toFixed(2) +
      ' (>' + ZOOM.squint + ') = zoom OUT' + (dir ? '  -> ' + dir.toUpperCase() : '');
  }
  if (!dir) { zoomDir = null; return; }
  if (dir !== zoomDir) { zoomDir = dir; zoomStart = now; lastZoomAt = 0; }
  if (now - zoomStart >= ZOOM.holdMs && now - lastZoomAt >= ZOOM.repeatMs) {
    lastZoomAt = now;
    zoomBy(dir === 'in' ? ZOOM.step : -ZOOM.step);
  }
}


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
    const resolve = sleepers.get(e.data.id);
    sleepers.delete(e.data.id);
    if (resolve) resolve();
  }
};

// ---------- active tab ----------
const target = { tabId: null, url: '', blocked: false };
const failedUntil = new Map();
let lastNormalWin = null;

async function refreshTarget() {
  try {
    if (lastNormalWin == null) {
      const windows = await chrome.windows.getAll({
        windowTypes: ['normal'],
      });

      const pick = windows.find((w) => w.focused) || windows[0];
      lastNormalWin = pick ? pick.id : null;
    }

    if (lastNormalWin == null) return;

    const [tab] = await chrome.tabs.query({
      active: true,
      windowId: lastNormalWin,
    });

    if (!tab) return;

    if (tab.id !== target.tabId) {
      const old = target.tabId;
      target.tabId = tab.id;
      target.blocked = false;

      if (old != null) {
        chrome.tabs.sendMessage(old, { type: 'hide' }).catch(() => {});
      }

      pushConfig();
    }

    target.url = tab.url || '';
  } catch (_) {
    lastNormalWin = null;
  }
}

chrome.windows.onFocusChanged.addListener(async (id) => {
  if (id === chrome.windows.WINDOW_ID_NONE) return;

  try {
    const win = await chrome.windows.get(id);

    if (win.type === 'normal') {
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
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });

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
    const result = await chrome.tabs.sendMessage(tabId, msg);
    target.blocked = false;
    return result;
  } catch (_) {
    if (await inject(tabId)) {
      try {
        const result = await chrome.tabs.sendMessage(tabId, msg);
        target.blocked = false;
        return result;
      } catch (_) {}
    }

    target.blocked = true;
    return null;
  }
}

function pushConfig() {
  send({
    type: 'config',
    paused: cfg.paused,
    dwell: M().dwell,
    dwellMs: M().dwellSec * 1000,
    edgeScroll: cfg.edge,
  });
}

const toastPage = (text, opts = {}) =>
  send({ type: 'toast', text, ...opts });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'stat' && msg.kind === 'dwellClick') {
    stats.dwell++;
  } else if (msg.type === 'openTab' && msg.url) {
    chrome.tabs.create({ url: msg.url, active: true });
  }
});


const ISSUE_TEXT = {
  noface: { title: 'No face detected', help: 'Sit facing the camera in good light.' },
  noeyes: { title: 'Eyes not detected', help: 'Please face the camera clearly.' },
  nohand: { title: 'No hand detected', help: 'Show your hand to the camera.' },
};

function setTracked(ok, why) {
  seen = !!ok;

  if (ok) {
    issue = null;
    lostSince = 0;
    lostToasted = false;
    return;
  }

  issue = why;
  const now = performance.now();
  if (!lostSince) lostSince = now;

  // EYES / HANDS only (HEAD behaves exactly as before): tell the person on the page, once per loss.
  if (
    cfg.mode !== 'head' &&
    !lostToasted &&
    now - lostSince > 2500 &&
    !cfg.paused &&
    !calibrating
  ) {
    lostToasted = true;
    toastPage(ISSUE_TEXT[why].title + '. ' + ISSUE_TEXT[why].help, { ms: 2500 });
  }
}

function frameCtx(now) {
  return {
    now,
    W: video.videoWidth || 640,
    H: video.videoHeight || 480,
    m: M(),
    blinking: false,
  };
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

  const c = ctl();

  if (
    switching ||
    busy ||
    !vision.has(c.needs) ||
    !video ||
    video.readyState < 2 ||
    video.currentTime === lastVideoTime
  ) {
    return;
  }

  // Hands mode while paused: nothing to detect (resume is by voice / button). Saves CPU.
  if (c.needs === 'hand' && cfg.paused && !calibrating) {
    clearOverlay();
    return;
  }

  lastVideoTime = video.currentTime;
  busy = true;

  try {
    if (c.needs === 'face') processFace(c, now);
    else processHand(c, now);
  } catch (err) {
    statusExtra =
      'Tracking error: ' +
      (err && err.message ? err.message : String(err));
  } finally {
    busy = false;
  }
}

// HEAD + EYES share one FaceLandmarker result, blink clicks, long-blink pause and eye zoom.
function processFace(c, now) {
  const res = vision.detect('face', video, now);
  const lm = res.faceLandmarks && res.faceLandmarks[0];

  if (!lm) {
    setTracked(false, 'noface');
    c.lost();
    clearOverlay();
    return;
  }

  let bl = 0;
  let br = 0;

  const cats =
    res.faceBlendshapes &&
    res.faceBlendshapes[0] &&
    res.faceBlendshapes[0].categories;

  if (cats) {
    for (const cat of cats) {
      if (cat.categoryName === 'eyeBlinkLeft') bl = cat.score;
      if (cat.categoryName === 'eyeBlinkRight') br = cat.score;
    }
  }

  const ctx = frameCtx(now);
  // Freeze cursor while the eyes are closing.
  ctx.blinking = Math.max(bl, br) > 0.3;

  const state = c.sense(res, ctx);
  setTracked(state === 'ok', state);

  if (state !== 'ok') {
    c.lost();
    clearOverlay();
    return;
  }

  if (c.id === 'eyes') drawIris(lm);
  else clearOverlay();

  // Process each blink event only once (your original blink + eye-zoom logic, unchanged).
  const eye = eyeScores(cats);
  const squinting = isSquinting(eye, bl, br);
  const ev = blink.update(squinting ? 0 : bl, squinting ? 0 : br, now);

  if (ev === 'longBlink') {
    setPaused(!cfg.paused);
  } else if (
    ev === 'blink' &&
    cfg.wink &&
    !cfg.paused &&
    !calibrating
  ) {
    stats.wink++;
    send({ type: 'click' });
  }

  if (ZOOM.enabled && !cfg.paused && !calibrating) updateEyeZoom(eye, bl, br, now);

  if (cfg.paused || calibrating) return;

  const out = c.step(ctx, now);
  sendCursor(out.cursor, now);
}

// HANDS: HandLandmarker result -> cursor + gesture actions.
function processHand(c, now) {
  const res = vision.detect('hand', video, now);
  const lm = res.landmarks && res.landmarks[0];

  if (!lm) {
    setTracked(false, 'nohand');
    c.lost();
    clearOverlay();
    return;
  }

  setTracked(true);

  const ctx = frameCtx(now);
  c.sense(lm, ctx);
  drawHand(lm, c);

  if (cfg.paused || calibrating) return;

  const out = c.step(ctx, now);

  for (const a of out.actions) {
    if (a.type === 'click') {
      stats.pinch++;
      send({ type: 'click' });
    } else if (a.type === 'dblclick') {
      stats.pinch++;
      send({ type: 'dblclick', second: true }); // click #1 was already sent by the first pinch
    } else if (a.type === 'scrollBy') {
      send({ type: 'scrollBy', dy: a.dy });
    }
  }

  sendCursor(out.cursor, now);
}

function sendCursor(cur, now) {
  if (!cur) return;

  if (
    Math.abs(cur.x - lastSent.x) > 0.0006 ||
    Math.abs(cur.y - lastSent.y) > 0.0006 ||
    now - lastSent.t > 150
  ) {
    lastSent = { x: cur.x, y: cur.y, t: now };
    send({ type: 'move', x: cur.x, y: cur.y });
  }
}

// ---------- camera preview overlay (iris dots / hand skeleton) ----------
function sizeOverlay() {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;

  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = w;
    overlay.height = h;
  }
}

function clearOverlay() {
  if (overlay.width) octx.clearRect(0, 0, overlay.width, overlay.height);
}

function drawIris(lm) {
  sizeOverlay();
  octx.clearRect(0, 0, overlay.width, overlay.height);

  octx.fillStyle = '#30d158';
  for (const p of EyeController.irisPoints(lm)) {
    octx.beginPath();
    octx.arc(p.x * overlay.width, p.y * overlay.height, 4, 0, Math.PI * 2);
    octx.fill();
  }
}

function drawHand(lm, c) {
  sizeOverlay();

  const W = overlay.width;
  const H = overlay.height;
  octx.clearRect(0, 0, W, H);

  octx.fillStyle =
    c.gesture === 'pinch' ? '#ff453a' : c.gesture === 'scroll' ? '#ff9f0a' : '#30d158';

  for (let i = 0; i < lm.length; i++) {
    octx.beginPath();
    octx.arc(lm[i].x * W, lm[i].y * H, i === 8 || i === 4 ? 5 : 3, 0, Math.PI * 2);
    octx.fill();
  }
}

// ---------- calibration (generic: works for whichever mode is active) ----------
const avg = (arr, key) =>
  arr.reduce((sum, value) => sum + value[key], 0) / arr.length;

async function startCalibration() {
  const c = ctl();
  if (calibrating || switching || !vision.has(c.needs)) return;

  calibrating = true;
  calAbort = false;
  $('btnCal').disabled = true;

  const wasPaused = cfg.paused;
  cfg.paused = false;
  pushConfig();

  const finish = () => {
    calibrating = false;
    $('btnCal').disabled = false;
    cfg.paused = wasPaused;
    $('btnPause').textContent = cfg.paused ? 'Resume' : 'Pause';
    pushConfig();
  };

  const got = {};

  for (const step of c.steps) {
    await toastPage(step.text, { big: true, ms: 2600 });
    await sleep(1500);

    if (calAbort || ctl() !== c) return finish();

    const samples = [];
    const t0 = performance.now();

    while (performance.now() - t0 < 1000) {
      if (calAbort || ctl() !== c) return finish();

      if (c.latest && performance.now() - c.latest.t < 250) {
        samples.push(c.latest);
      }

      await sleep(40);
    }

    if (samples.length < 6) {
      const what =
        c.needs === 'hand' ? 'your hand' : c.id === 'eyes' ? 'your eyes' : 'your face';

      await toastPage(
        'Calibration cancelled: I could not see ' + what + '. Try again.',
        { big: true, ms: 3000 }
      );

      return finish();
    }

    got[step.key] = {
      x: avg(samples, 'x'),
      y: avg(samples, 'y'),
    };
  }

  const warn = c.finishCalibration(got);
  chrome.storage.local.set({ [c.storageKey]: c.cal });

  finish();

  await toastPage('Calibration done.' + warn, {
    big: true,
    ms: 2800,
  });
}

// ---------- commands ----------
function setPaused(value) {
  // Avoid duplicate pause/resume actions.
  if (cfg.paused === value) return;

  cfg.paused = value;
  $('btnPause').textContent = value ? 'Resume' : 'Pause';

  ctl().reset();

  pushConfig();

  toastPage(
    value
      ? (ctl().needs === 'face'
          ? 'Paused. Say "resume" or hold a long blink.'
          : 'Paused. Say "resume" or press Resume.')
      : 'Resumed',
    { ms: 1800 }
  );

  renderStatus();
}

async function relativeTab(delta) {
  if (lastNormalWin == null) return;

  const tabs = await chrome.tabs.query({
    windowId: lastNormalWin,
  });

  tabs.sort((a, b) => a.index - b.index);

  const i = tabs.findIndex((tab) => tab.active);
  if (tabs.length === 0) return;

  const next = tabs[(i + delta + tabs.length) % tabs.length];

  if (next) {
    await chrome.tabs.update(next.id, { active: true });
  }

  refreshTarget();
}

async function run(c) {
  switch (c.name) {
    case 'click':
      stats.voice++;
      return send({ type: 'click' });

    case 'dblclick':
      stats.voice++;
      return send({ type: 'dblclick' });

    case 'scroll':
      return send({ type: 'scroll', arg: c.arg });

    case 'hintsOn':
      return send({ type: 'hintsOn' });

    case 'hintsOff':
      return send({ type: 'hintsOff' });

    case 'hintClick':
      stats.voice++;
      return send({ type: 'hintClick', arg: c.arg });

    case 'clickText':
      stats.voice++;
      return send({ type: 'clickText', arg: c.arg });

    case 'text':
      return send({ type: 'text', arg: c.arg });

    case 'enter':
      return send({ type: 'key', arg: 'enter' });

    case 'clear':
      return send({ type: 'key', arg: 'clear' });

    case 'deleteWord':
      return send({ type: 'key', arg: 'deleteWord' });

    case 'dictateOn':
      cfg.dictating = true;
      return toastPage(
        'Dictating. Everything you say is typed. Say "stop typing" to finish.',
        { ms: 3500 }
      );

    case 'dictateOff':
      cfg.dictating = false;
      return toastPage('Stopped typing', { ms: 1500 });

    case 'pause':
      return setPaused(true);

    case 'resume':
      return setPaused(false);

    case 'calibrate':
      return startCalibration();

    case 'mode':
      return setMode(c.arg);

    case 'zoom':
      return c.arg === 'reset' ? zoomReset() : zoomBy(c.arg === 'in' ? ZOOM.step : -ZOOM.step);

    case 'dwell':
      M().dwell = !!c.arg;
      $('chkDwell').checked = M().dwell;
      saveSettings();
      pushConfig();
      return toastPage(
        'Dwell click ' + (M().dwell ? 'on' : 'off'),
        { ms: 1500 }
      );

    case 'mistake':
      stats.mistakes++;
      return toastPage('Noted as a mistake', { ms: 1200 });

    case 'help':
      return toastPage(HELP_TEXT, { ms: 8000 });

    case 'back':
      if (target.tabId != null) {
        return chrome.tabs.goBack(target.tabId).catch(() => {});
      }
      return;

    case 'forward':
      if (target.tabId != null) {
        return chrome.tabs.goForward(target.tabId).catch(() => {});
      }
      return;

    case 'reload':
      if (target.tabId != null) {
        return chrome.tabs.reload(target.tabId);
      }
      return;

    case 'newTab':
      return chrome.tabs.create({
        windowId: lastNormalWin ?? undefined,
        active: true,
      });

    case 'closeTab':
      if (target.tabId != null) {
        return chrome.tabs.remove(target.tabId);
      }
      return;

    case 'nextTab':
      return relativeTab(1);

    case 'prevTab':
      return relativeTab(-1);

    case 'search':
      if (target.tabId != null) {
        return chrome.tabs.update(target.tabId, {
          url:
            'https://www.google.com/search?q=' +
            encodeURIComponent(c.arg),
        });
      }
      return;

    case 'goto':
      if (target.tabId != null) {
        return chrome.tabs.update(target.tabId, { url: c.arg });
      }
      return;

    default:
      return;
  }
}


// ---------- mode switching ----------
// One camera stream stays open. Only the vision model the new mode needs is loaded; the other
// one is closed. Voice recognition and the cursor in the page are untouched.
async function setMode(mode, { initial = false } = {}) {
  if (!controllers[mode]) return;
  if (!initial && mode === cfg.mode && pipelineReady && !switching) return;

  const token = ++switchToken;
  calAbort = true; // cancel a calibration that belongs to the previous mode
  switching = true;
  clearTimeout(autoCalTimer);

  ctl().deactivate(); // release the previous controller's filters / gesture state
  cfg.mode = mode;
  issue = null;
  seen = false;
  lostSince = 0;
  lostToasted = false;
  lastVideoTime = -1;
  lastSent = { x: -1, y: -1, t: 0 };
  zoomDir = null;
  blink.reset();
  clearOverlay();
  applyModeToUi();
  pushConfig();
  saveSettings();

  const next = ctl();
  statusExtra = '';

  const wanted = next.needs; // 'face' | 'hand'
  const other = wanted === 'face' ? 'hand' : 'face';

  // A newer switch may start while we await. A stale call must not leave its model loaded.
  const stale = () => {
    if (token === switchToken) return false;
    if (ctl().needs !== wanted) vision.release(wanted);
    return true;
  };

  try {
    if (cameraOn) {
      vision.release(other); // never keep both models in memory
      await vision.ensure(wanted);
      if (stale()) return;
      vision.release(other);
      pipelineReady = true;
    } else {
      pipelineReady = false;
    }
  } catch (err) {
    if (stale()) return;

    pipelineReady = false;
    statusExtra =
      'Could not load the ' + (wanted === 'hand' ? 'hand' : 'face') +
      ' tracker from the lib/ folder. Run "node setup.js" inside the extension folder. Details: ' +
      (err && err.message ? err.message : String(err));

    console.error('[Handsfree] MediaPipe initialization failed:', err);
  }

  if (token !== switchToken) return; // a newer switch took over

  next.activate();
  switching = false;
  renderStatus();

  if (!initial) {
    toastPage('Mode: ' + MODE_INFO[mode].title, { ms: 1600 });
  }

  maybeAutoCalibrate();
}

// First time in a mode that needs calibration (EYES): start it once the tracker can see the user.
function maybeAutoCalibrate() {
  clearTimeout(autoCalTimer);

  const c = ctl();
  if (!c.calRequired || c.calibrated || autoCalOffered.has(c.id) || !pipelineReady) return;

  const mode = cfg.mode;

  const check = () => {
    if (cfg.mode !== mode || switching) return;

    if (seen && vision.has(c.needs) && !calibrating) {
      autoCalOffered.add(mode);
      startCalibration();
    } else {
      autoCalTimer = setTimeout(check, 500);
    }
  };

  autoCalTimer = setTimeout(check, 500);
}

// ---- speech-clean-begin
// Chrome often mishears short commands and adds filler words. Fix the common cases before parsing.
const MISHEARS = [
  [/\b(scrolled|scrawl|school|scroll) (down|done|dawn|don)\b/g, 'scroll down'],
  [/\b(scrolled|scrawl|school|scroll) (up|op|app)\b/g, 'scroll up'],
  [/\b(clique|klick|clic|clik)\b/g, 'click'],
  [/\b(next|new|close|previous) tap\b/g, '$1 tab'],
  [/\b(paws|pores)\b/g, 'pause'],
  [/\b(presume|resumes)\b/g, 'resume'],
  [/\bgo bag\b/g, 'go back'],
];
const FILLER = /\b(please|kindly|now|just|ok|okay|hey|um|uh|the)\b/g;

function cleanSpeech(text) {
  const raw = String(text || '').trim();
  let t = raw.toLowerCase().replace(/[.,!?;:"]/g, ' ');
  // Never touch text that will be typed or searched.
  if (/^\s*(type|write|enter text|dictate|search)\b/.test(t)) return raw;
  if (/^\s*(?:टाइप|लिखो|लिखें|लिहा|खोजो|शोधा|सर्च|ટાઇપ|લખો|શોધો|સર્ચ|டைப்|எழுது|தேடு)/.test(raw)) return raw;
  for (const [re, to] of MISHEARS) t = t.replace(re, to);
  t = t.replace(/^\s*click on /, 'click ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

function zoomCommand(text) {
  const zt = text.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (zt === 'zoom in' || zt === 'zoom') return { name: 'zoom', arg: 'in' };
  if (zt === 'zoom out') return { name: 'zoom', arg: 'out' };
  if (zt === 'reset zoom' || zt === 'zoom reset' || zt === 'normal zoom') return { name: 'zoom', arg: 'reset' };
  return null;
}

// Chrome gives several guesses for each phrase. Use the first guess that is a real command.
function interpret(alts) {
  const list = alts.length ? alts : [''];
  const parse = (raw) => {
    if (cfg.dictating) return parseCommand(raw, { dictating: true });
    const text = cleanSpeech(raw);
    return zoomCommand(text) || parseCommand(text, { dictating: false });
  };
  for (const raw of list) {
    const c = parse(raw);
    if (c.name !== 'unknown' && c.name !== 'empty') return { c, text: raw };
  }
  return { c: parse(list[0]), text: list[0] };
}
// ---- speech-clean-end

function handleSpeech(alts) {
  const { c, text } = interpret(alts);

  $('heard').textContent = 'Heard: ' + text;

  if (c.name === 'empty') return;

  if (
    cfg.paused &&
    !['resume', 'pause', 'help'].includes(c.name)
  ) {
    return;
  }

  stats.commands++;

  if (c.name === 'unknown') {
    stats.unknown++;
    toastPage(
      `Didn't understand "${text.trim()}". Say "help" for commands.`,
      { ms: 2200 }
    );
    return;
  }

  if (c.name !== 'text' && c.name !== 'scroll' && c.name !== 'zoom') {
    toastPage('🎤 ' + text.trim(), { ms: 1200 });
  }

  run(c);
}

// ---------- speech recognition ----------
let rec = null;
let recWanted = false;
let voiceMsg = 'off';

function startVoice() {
  const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SR) {
    voiceMsg = 'not supported in this browser';
    return;
  }

  if (rec) stopVoice();

  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;   // react as soon as a short command is heard, not after a long pause
  rec.maxAlternatives = 5;     // several guesses per phrase
  rec.lang = cfg.lang;

  // Short, complete commands fire immediately from the live (interim) text. Anything that could be the
  // start of a longer phrase ("click" -> "click 5") waits for the final result.
  const INSTANT = new Set(['pause', 'resume', 'back', 'forward', 'reload', 'newTab', 'closeTab',
    'nextTab', 'prevTab', 'hintsOn', 'hintsOff', 'calibrate', 'zoom', 'scroll']);
  const fired = new Set();

  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const alts = [];
      for (let k = 0; k < r.length; k++) alts.push(r[k].transcript);

      if (r.isFinal) {
        if (fired.has(i)) { fired.delete(i); continue; }
        handleSpeech(alts);
      } else {
        $('heard').textContent = 'Hearing: ' + (alts[0] || '');
        if (!cfg.dictating && !fired.has(i)) {
          const { c } = interpret(alts);
          if (INSTANT.has(c.name)) {
            fired.add(i);
            handleSpeech(alts);
          }
        }
      }
    }
  };

  rec.onerror = (e) => {
    if (
      e.error === 'not-allowed' ||
      e.error === 'service-not-allowed'
    ) {
      recWanted = false;
      voiceMsg =
        'microphone blocked - allow it, then reload this window';
    } else if (e.error === 'network') {
      voiceMsg = 'needs an internet connection';
    } else if (
      e.error !== 'no-speech' &&
      e.error !== 'aborted'
    ) {
      voiceMsg = e.error;
    }
  };

  rec.onstart = () => {
    fired.clear();
    voiceMsg = 'listening';
  };

  rec.onend = () => {
    if (recWanted && cfg.voice) {
      setTimeout(() => {
        try {
          rec.start();
        } catch (_) {}
      }, 50);
    }
  };

  recWanted = true;

  try {
    rec.start();
  } catch (_) {}
}

function stopVoice() {
  recWanted = false;

  if (rec) {
    try {
      rec.stop();
    } catch (_) {}
  }

  voiceMsg = 'off';
}

// ---------- UI ----------
function renderStatus() {
  const c = ctl();
  const badge = $('badge');
  const info = MODE_INFO[cfg.mode];
  let text;
  let badgeCls;
  let badgeText;

  if (!cameraOn) {
    text = statusExtra || 'Starting camera…';
    badgeCls = 'off';
    badgeText = 'loading';
  } else if (!pipelineReady || !vision.has(c.needs) || switching) {
    text = statusExtra || (switching ? 'Switching to ' + info.title + '…' : 'Loading tracker…');
    badgeCls = 'off';
    badgeText = 'loading';
  } else if (calibrating) {
    text = 'Calibrating… follow the big messages on the page.';
    badgeCls = 'warn';
    badgeText = 'calibrating';
  } else if (cfg.paused) {
    text =
      c.needs === 'face'
        ? 'Paused (say "resume" or hold a long blink).'
        : 'Paused (say "resume" or press Resume).';
    badgeCls = 'warn';
    badgeText = 'paused';
  } else if (issue) {
    text = ISSUE_TEXT[issue].title + '. ' + ISSUE_TEXT[issue].help;
    badgeCls = 'warn';
    badgeText = issue === 'nohand' ? 'no hand' : issue === 'noeyes' ? 'no eyes' : 'no face';
  } else {
    if (cfg.mode === 'head') {
      text = c.calibrated
        ? 'Tracking your head.'
        : 'Tracking with default settings. Press Calibrate for best results.';
    } else if (cfg.mode === 'eyes') {
      text = c.calibrated
        ? 'Tracking your eyes. Keep your head fairly still.'
        : 'Eye tracking needs calibration. Press Calibrate.';
    } else {
      const g = { point: 'POINTING', pinch: 'PINCH (click)', scroll: 'SCROLL', none: 'READY' }[c.gesture] || 'READY';
      text = 'Tracking your hand. Gesture: ' + g + '.';
    }
    badgeCls = 'ok';
    badgeText = fps + ' fps';
  }

  if (target.blocked) {
    text +=
      ' This page cannot be controlled. Switch to a normal website.';
  }

  if (statusExtra && pipelineReady && cameraOn) {
    text += ' ' + statusExtra;
  }

  $('status').textContent = text;
  badge.className = 'badge ' + badgeCls;
  badge.textContent = badgeText;

  $('stats').textContent =
    `Clicks: blink ${stats.wink} · dwell ${stats.dwell} · pinch ${stats.pinch} · voice ${stats.voice} | ` +
    `commands ${stats.commands} (unheard ${stats.unknown}) | ` +
    `mistakes ${stats.mistakes} | voice: ${voiceMsg}` +
    (cfg.dictating ? ' | DICTATING' : '');
}

// Shows the active mode's own settings in the shared controls.
function applyModeToUi() {
  const info = MODE_INFO[cfg.mode];
  const m = M();
  const hands = cfg.mode === 'hands';

  for (const b of document.querySelectorAll('button.mode')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === cfg.mode));
  }

  $('modeName').textContent = info.title;
  $('modeDesc').textContent = info.desc;
  $('gestureHelp').textContent = info.gestures;

  $('chkDwell').checked = m.dwell;
  $('rngGain').value = m.gain;
  $('rngSmooth').value = m.smooth;
  $('rngDwell').value = m.dwellSec;

  if (hands) {
    $('rngPinch').value = m.pinch;
    $('rngScrollSpeed').value = m.scrollSpeed;
  }

  // Face-only controls are hidden in hands mode; hand-only sliders only show there.
  $('rowWink').hidden = hands;
  $('rowZoom').hidden = hands;
  $('eyeDebug').hidden = hands;
  $('rowPinch').hidden = !hands;
  $('rowScrollSpeed').hidden = !hands;

  $('btnCal').textContent = hands ? 'Calibrate (optional)' : 'Calibrate (12 s)';
}

function wireUi() {
  $('help').textContent = HELP_TEXT;
  $('help').style.whiteSpace = 'pre-line';

  for (const b of document.querySelectorAll('button.mode')) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }

  const bindGlobal = (id, key, after) => {
    $(id).addEventListener('change', (e) => {
      cfg[key] =
        e.target.type === 'checkbox'
          ? e.target.checked
          : e.target.value;

      saveSettings();

      if (after) after();
    });
  };

  bindGlobal('chkWink', 'wink');
  bindGlobal('chkEdge', 'edge', pushConfig);
  bindGlobal('chkVoice', 'voice', () =>
    cfg.voice ? startVoice() : stopVoice()
  );
  bindGlobal('selLang', 'lang', () => {
    if (cfg.voice) startVoice();
  });

  $('chkDwell').addEventListener('change', (e) => {
    M().dwell = e.target.checked;
    saveSettings();
    pushConfig();
  });

  for (const [id, key] of [
    ['rngGain', 'gain'],
    ['rngSmooth', 'smooth'],
    ['rngDwell', 'dwellSec'],
    ['rngPinch', 'pinch'],
    ['rngScrollSpeed', 'scrollSpeed'],
  ]) {
    $(id).addEventListener('input', (e) => {
      M()[key] = parseFloat(e.target.value);

      saveSettings();

      if (key === 'dwellSec') pushConfig();
    });
  }

  $('chkZoom').addEventListener('change', (e) => { ZOOM.enabled = e.target.checked; });
  $('btnZoomIn').addEventListener('click', () => zoomBy(ZOOM.step));
  $('btnZoomOut').addEventListener('click', () => zoomBy(-ZOOM.step));
  $('btnZoomReset').addEventListener('click', zoomReset);
  $('btnCal').addEventListener('click', startCalibration);
  $('btnPause').addEventListener('click', () =>
    setPaused(!cfg.paused)
  );
}

// Legacy keys (your original format) mirror the HEAD settings, so old installs keep working.
const persistable = () => ({
  dwell: cfg.modes.head.dwell,
  wink: cfg.wink,
  voice: cfg.voice,
  edge: cfg.edge,
  gain: cfg.modes.head.gain,
  smooth: cfg.modes.head.smooth,
  dwellSec: cfg.modes.head.dwellSec,
  lang: cfg.lang,
});

function saveSettings() {
  chrome.storage.local.set({
    hfCfg: persistable(),
    hfSettings: {
      activeMode: cfg.mode,
      lang: cfg.lang,
      wink: cfg.wink,
      voice: cfg.voice,
      edge: cfg.edge,
      modes: cfg.modes,
    },
  });
}

function applyCfgToUi() {
  $('chkWink').checked = cfg.wink;
  $('chkVoice').checked = cfg.voice;
  $('chkEdge').checked = cfg.edge;
  $('selLang').value = cfg.lang;

  applyModeToUi();

  $('btnPause').textContent = cfg.paused ? 'Resume' : 'Pause';
}

// Old installs only have `hfCfg` (head-only format) and `hfCal`: those become the HEAD settings and
// head calibration. Every new field falls back to its default.
function loadSettings(saved) {
  const legacy = saved.hfCfg;

  if (legacy) {
    for (const k of ['wink', 'voice', 'edge', 'lang']) if (k in legacy) cfg[k] = legacy[k];
    for (const k of ['dwell', 'gain', 'smooth', 'dwellSec']) if (k in legacy) cfg.modes.head[k] = legacy[k];
  }

  const s = saved.hfSettings;

  if (s) {
    for (const k of ['lang', 'wink', 'voice', 'edge']) if (k in s) cfg[k] = s[k];

    if (s.modes) {
      for (const id of Object.keys(cfg.modes)) {
        if (s.modes[id]) Object.assign(cfg.modes[id], s.modes[id]);
      }
    }

    if (controllers[s.activeMode]) cfg.mode = s.activeMode;
  }

  if (saved.hfCal) controllers.head.setCalibration(saved.hfCal);
  if (saved.hfEyeCal) controllers.eyes.setCalibration(saved.hfEyeCal);
  if (saved.hfHandCal) controllers.hands.setCalibration(saved.hfHandCal);
}

// ---------- camera ----------
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Camera API unavailable. Open the extension using its normal Chrome extension page.'
    );
  }

  // Request the camera without audio.
  // One plain request: Chrome shows its normal camera prompt (or uses the saved Allow/Block).
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    throw new Error((err && err.name ? err.name + ': ' : '') + (err && err.message ? err.message : String(err)));
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  // Wait for the browser to load video metadata.
  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for camera video metadata.'));
      }, 10000);

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('The browser could not load the camera video.'));
      };

      function cleanup() {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      }

      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  await video.play();

  if (video.readyState < 2) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for camera frames.'));
      }, 10000);

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('Camera frames could not be loaded.'));
      };

      function cleanup() {
        clearTimeout(timer);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
      }

      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  return stream;
}

// ---------- start ----------
async function main() {
  wireUi();
  setInterval(renderStatus, 500);

  try {
    const saved = await chrome.storage.local.get([
      'hfCfg',
      'hfCal',
      'hfSettings',
      'hfEyeCal',
      'hfHandCal',
    ]);

    loadSettings(saved);
    applyCfgToUi();
    await refreshTarget();

    // Start the camera before loading the tracking model.
    statusExtra = 'Starting camera… (click Allow if Chrome asks)';
    await startCamera();
    statusExtra = '';
    cameraOn = true;
  } catch (err) {
    statusExtra =
      'Camera startup error: ' +
      (err && err.message ? err.message : String(err)) +
      '. Also check macOS System Settings > Privacy & Security > Camera > Chrome.';

    renderStatus();
    console.error('[Handsfree] Camera startup failed:', err);
    return;
  }

  await setMode(cfg.mode, { initial: true });

  // The clock and voice start even if a model failed to load, so you can still switch modes by voice.
  worker.postMessage({ type: 'start', ms: 33 });

  if (cfg.voice) startVoice();

  pushConfig();

  if (pipelineReady) {
    if (cfg.mode === 'head') {
      if (!ctl().calibrated) {
        toastPage(
          'Handsfree is on. Press "Calibrate" in the controller window for best accuracy.',
          { ms: 4000 }
        );
      }
    } else {
      toastPage('Handsfree is on. Mode: ' + MODE_INFO[cfg.mode].title, { ms: 2000 });
    }
  }
}

addEventListener('pagehide', () => {
  if (target.tabId != null) {
    chrome.tabs.sendMessage(target.tabId, { type: 'hide' }).catch(() => {});
  }

  stopVoice();
  clearTimeout(autoCalTimer);

  if (video && video.srcObject) {
    for (const track of video.srcObject.getTracks()) {
      track.stop();
    }

    video.srcObject = null;
  }

  worker.terminate();

  // Free the MediaPipe WASM memory.
  vision.releaseAll();
});

main();