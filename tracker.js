// Control manager. Runs the ONE webcam stream, the shared MediaPipe pipeline, the active cursor
// controller (head / eyes / hands), the shared voice layer, and drives the page in the active
// Chrome tab by messaging the content script.
//
//   camera -> VisionPipeline -> ACTIVE controller -> cursor -> content script
//   VoiceManager -> parseCommand -> run() (shared actions, also used by hand gestures)
import { BlinkDetector } from './filters.js';
import { HELP_TEXT } from './commands.js';
import { VisionPipeline } from './vision/pipeline.js';
import { VoiceManager } from './voice/voiceManager.js';
import { HeadController } from './controllers/headController.js';
import { EyeController } from './controllers/eyeController.js';
import { HandController } from './controllers/handController.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const octx = overlay.getContext('2d');

// ---------- settings ----------
// Global settings + one settings block per mode (so each mode keeps its own tuning).
const cfg = {
  mode: 'head',
  wink: true,
  voice: true,
  typing: true,
  edge: false,
  lang: 'en-IN',
  paused: false,
  dictating: false,
  modes: {
    head: { gain: 1.2, smooth: 0.75, dwell: true, dwellSec: 1.3 },
    eyes: { gain: 1.0, smooth: 0.8, dwell: true, dwellSec: 1.5 },
    hands: { gain: 1.0, smooth: 0.5, dwell: false, dwellSec: 1.3, pinch: 0.28, scrollSpeed: 1.0 },
  },
};
const M = () => cfg.modes[cfg.mode]; // settings of the active mode

const MODE_INFO = {
  head: {
    title: 'HEAD',
    desc: 'Move your head to move the cursor. Wink or dwell to click. Voice works too.',
    gestures: 'Head: wink one eye or hold still on a link (dwell) to click. Close both eyes for 1 s to pause / resume.',
  },
  eyes: {
    title: 'EYES',
    desc: 'Look where you want the cursor. Keep your head fairly still. Dwell (or wink) to click. Voice works too.',
    gestures: 'Eyes: hold your gaze on a link (dwell) to click. Wink to click. Close both eyes for 1 s to pause / resume.',
  },
  hands: {
    title: 'HANDS + VOICE',
    desc: 'Point with your index finger to move the cursor. Pinch to click. Voice commands and typing as always.',
    gestures:
      'Hands: index finger = cursor · pinch thumb + index = click · two quick pinches = double click · ' +
      'raise index + middle fingers only (peace sign) and move your hand down/up = scroll down/up.',
  },
};

const stats = { wink: 0, dwell: 0, pinch: 0, voice: 0, commands: 0, unknown: 0, mistakes: 0 };

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
let lastVideoTime = -1;
let busy = false;
let frames = 0;
let fpsStamp = performance.now();
let fps = 0;
let seen = false; // tracker currently has data (face / hand visible)
let issue = null; // null | 'noface' | 'noeyes' | 'nohand'  (why tracking has no data right now)
let lostSince = 0;
let lostToasted = false;
let lastSent = { x: -1, y: -1, t: 0 };
let statusExtra = '';
let cameraState = 'starting'; // starting | on | error
let pipelineReady = false;
let autoCalTimer = null;
const autoCalOffered = new Set();

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
  if (e.data.type === 'tick') {
    tick();
  } else if (e.data.type === 'wake') {
    const resolve = sleepers.get(e.data.id);
    sleepers.delete(e.data.id);
    if (resolve) resolve();
  }
};

// ---------- talking to the active tab ----------
const target = {
  tabId: null,
  url: '',
  blocked: false,
};

const failedUntil = new Map();
let lastNormalWin = null;

async function refreshTarget() {
  try {
    if (lastNormalWin == null) {
      const all = await chrome.windows.getAll({
        windowTypes: ['normal'],
      });

      const pick = all.find((w) => w.focused) || all[0];
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
    const window = await chrome.windows.get(id);

    if (window.type === 'normal') {
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
  if ((failedUntil.get(tabId) || 0) > Date.now()) {
    return false;
  }

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
    const response = await chrome.tabs.sendMessage(tabId, msg);
    target.blocked = false;
    return response;
  } catch (_) {
    if (await inject(tabId)) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, msg);
        target.blocked = false;
        return response;
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

// Messages from content scripts.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'stat' && msg.kind === 'dwellClick') {
    stats.dwell++;
  } else if (msg.type === 'openTab' && msg.url) {
    chrome.tabs.create({ url: msg.url, active: true });
  }
});

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

  if (frames % 8 === 0) {
    renderStatus();
  }

  const c = ctl();

  if (
    switching ||
    busy ||
    !vision.has(c.needs) ||
    video.readyState < 2 ||
    video.currentTime === lastVideoTime
  ) {
    return;
  }

  // Hand mode while paused: nothing to detect (resume is by voice / button), saves CPU.
  if (c.needs === 'hand' && cfg.paused && !calibrating) {
    clearOverlay();
    return;
  }

  lastVideoTime = video.currentTime;
  busy = true;

  try {
    if (c.needs === 'face') {
      processFace(c, now);
    } else {
      processHand(c, now);
    }
  } catch (err) {
    statusExtra =
      'Tracking error: ' +
      (err && err.message ? err.message : err);
  } finally {
    busy = false;
  }
}

function frameCtx(now) {
  return {
    now,
    W: video.videoWidth || 320,
    H: video.videoHeight || 240,
    m: M(),
    blinking: false,
  };
}

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
  // Tell the person on the page too, once per loss, after a short grace period.
  if (!lostToasted && now - lostSince > 2500 && !cfg.paused && !calibrating) {
    lostToasted = true;
    toastPage(ISSUE_TEXT[why].title + '. ' + ISSUE_TEXT[why].help, { ms: 2500 });
  }
}

const ISSUE_TEXT = {
  noface: { title: 'Face not detected', help: 'Please move into the camera view.' },
  noeyes: { title: 'Eyes not detected', help: 'Please face the camera clearly.' },
  nohand: { title: 'Hand not detected', help: 'Show your hand to the camera.' },
};

// Head + Eyes: shared FaceLandmarker result, shared blink handling (wink click, long-blink pause).
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
    for (const category of cats) {
      if (category.categoryName === 'eyeBlinkLeft') {
        bl = category.score;
      } else if (category.categoryName === 'eyeBlinkRight') {
        br = category.score;
      }
    }
  }

  const ctx = frameCtx(now);
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

  const ev = blink.update(bl, br, now);

  if (ev === 'longBlink') {
    setPaused(!cfg.paused);
  } else if (ev === 'wink' && cfg.wink && !cfg.paused && !calibrating) {
    stats.wink++;
    send({ type: 'click' });
  }

  if (cfg.paused || calibrating) return;

  const out = c.step(ctx, now);
  sendCursor(out.cursor, now);
}

// Hands: HandLandmarker result -> cursor + gesture actions.
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
  // Throttled to keep Chrome messaging light during playback/video.
  if (
    Math.abs(cur.x - lastSent.x) > 0.001 ||
    Math.abs(cur.y - lastSent.y) > 0.001 ||
    now - lastSent.t > 250
  ) {
    lastSent = { x: cur.x, y: cur.y, t: now };
    send({ type: 'move', x: cur.x, y: cur.y });
  }
}

// ---------- camera preview overlay ----------
function sizeOverlay() {
  const w = video.videoWidth || 320;
  const h = video.videoHeight || 240;
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
  const pts = EyeController.irisPoints(lm);
  octx.fillStyle = '#30d158';
  for (const p of pts) {
    octx.beginPath();
    octx.arc(p.x * overlay.width, p.y * overlay.height, 3, 0, Math.PI * 2);
    octx.fill();
  }
}

function drawHand(lm, c) {
  sizeOverlay();
  const W = overlay.width;
  const H = overlay.height;
  octx.clearRect(0, 0, W, H);
  const color =
    c.gesture === 'pinch' ? '#ff453a' : c.gesture === 'scroll' ? '#ff9f0a' : '#30d158';
  octx.fillStyle = color;
  for (let i = 0; i < lm.length; i++) {
    octx.beginPath();
    octx.arc(lm[i].x * W, lm[i].y * H, i === 8 || i === 4 ? 4 : 2, 0, Math.PI * 2);
    octx.fill();
  }
}

// ---------- calibration (generic: works for whichever controller is active) ----------
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

// ---------- commands (shared by voice and hand gestures) ----------
function setPaused(v) {
  cfg.paused = v;
  $('btnPause').textContent = v ? 'Resume' : 'Pause';
  $('btnPause').classList.toggle('toggled', v);

  ctl().reset();

  pushConfig();
  renderStatus();

  toastPage(
    v
      ? 'Paused. Say "resume" or press Resume.'
      : 'Resumed',
    { ms: 1800 }
  );
}

async function relativeTab(delta) {
  if (lastNormalWin == null) return;

  const tabs = await chrome.tabs.query({
    windowId: lastNormalWin,
  });

  tabs.sort((a, b) => a.index - b.index);

  const i = tabs.findIndex((tab) => tab.active);
  if (i < 0 || tabs.length === 0) return;

  const next = tabs[(i + delta + tabs.length) % tabs.length];

  if (next) {
    await chrome.tabs.update(next.id, { active: true });
  }

  refreshTarget();
}

function setDictating(v) {
  cfg.dictating = v;
  const b = $('btnDictate');
  b.textContent = 'Voice typing: ' + (v ? 'On' : 'Off');
  b.classList.toggle('toggled', v);
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
      setDictating(true);
      return toastPage(
        'Dictating. Everything you say is typed. Say "stop typing" to finish.',
        { ms: 3500 }
      );

    case 'dictateOff':
      setDictating(false);
      return toastPage('Stopped typing', { ms: 1500 });

    case 'pause':
      return setPaused(true);

    case 'resume':
      return setPaused(false);

    case 'calibrate':
      return startCalibration();

    case 'mode':
      return setMode(c.arg);

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
        return chrome.tabs.update(target.tabId, {
          url: c.arg,
        });
      }
      return;

    default:
      return;
  }
}

// Called by the VoiceManager for every final transcript, whatever the control mode.
function handleCommand(c, text) {
  if (c.name === 'empty') return;

  if (
    cfg.paused &&
    !['resume', 'pause', 'help'].includes(c.name)
  ) {
    return;
  }

  // Voice typing switched off in settings: do not type, and say so.
  if (!cfg.typing && cfg.dictating) setDictating(false);
  if (!cfg.typing && ['text', 'dictateOn'].includes(c.name)) {
    toastPage('Voice typing is turned off in Settings.', { ms: 2000 });
    return;
  }

  stats.commands++;

  if (c.name === 'unknown') {
    stats.unknown++;

    toastPage(
      'Did not understand "' + text.trim() + '". Say "help" for commands.',
      { ms: 2200 }
    );

    return;
  }

  if (c.name !== 'text' && c.name !== 'scroll') {
    toastPage(text.trim(), { ms: 1200 });
  }

  run(c);
}

// ---------- voice (shared by all modes) ----------
const voice = new VoiceManager({
  getLang: () => cfg.lang,
  isDictating: () => cfg.dictating,
  onHeard: (text) => {
    $('heard').textContent = 'Heard: ' + text;
  },
  onCommand: handleCommand,
  onState: () => renderStatus(),
});

function startVoice() {
  voice.start();
}

function stopVoice() {
  voice.stop();
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
    if (cameraState === 'on') {
      vision.release(other); // never keep both models in memory
      await tuneCamera(wanted === 'face' ? 320 : 640, wanted === 'face' ? 240 : 480); // hand model likes more pixels
      if (stale()) return;
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
      'Could not load the ' +
      (wanted === 'hand' ? 'hand' : 'face') +
      ' tracker from the lib/ folder. Run "node setup.js" inside the extension folder (see README), ' +
      'then reload the extension. Details: ' +
      (err && err.message ? err.message : err);
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

async function tuneCamera(w, h) {
  const track = video.srcObject && video.srcObject.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ width: w, height: h, frameRate: 24 });
  } catch (_) {
    // Keep whatever resolution the camera gives us.
  }
}

// First time in a mode that needs calibration: start it once the tracker can see the user.
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

// ---------- UI ----------
const setChip = (id, cls, value) => {
  $(id).className = 'chip ' + cls;
  $(id.replace('chip', 'v')).textContent = value;
};

function renderStatus() {
  const c = ctl();
  const badge = $('badge');
  const info = MODE_INFO[cfg.mode];
  let text;
  let track; // [class, label]

  if (cameraState === 'error') {
    text =
      'Camera unavailable. Please allow camera access.' +
      (statusExtra ? ' (' + statusExtra + ')' : '');
    track = ['err', 'No camera'];
  } else if (cameraState === 'starting') {
    text = 'Starting camera…';
    track = ['off', 'Starting'];
  } else if (!pipelineReady || !vision.has(c.needs) || switching) {
    text = statusExtra || (switching ? 'Switching to ' + info.title + '…' : 'Loading tracker…');
    track = statusExtra ? ['err', 'Error'] : ['off', 'Loading'];
  } else if (calibrating) {
    text = 'Calibrating… follow the big messages on the page.';
    track = ['warn', 'Calibrating'];
  } else if (cfg.paused) {
    text =
      c.needs === 'face'
        ? 'Paused (say "resume", press Resume, or hold a long blink).'
        : 'Paused (say "resume" or press Resume).';
    track = ['warn', 'Paused'];
  } else if (issue) {
    text = ISSUE_TEXT[issue].title + '. ' + ISSUE_TEXT[issue].help;
    track = ['warn', 'Lost'];
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
    track = ['ok', 'Active'];
  }

  if (target.blocked) {
    text +=
      ' This page cannot be controlled (Chrome blocks extensions on it). Switch to a normal website.';
  }

  if (statusExtra && pipelineReady && cameraState === 'on') {
    text += ' ' + statusExtra;
  }

  $('status').textContent = text;
  $('banner').hidden = !cfg.paused;

  // badge (top right)
  if (track[0] === 'ok') {
    badge.className = 'badge ok';
    badge.textContent = fps + ' fps';
  } else {
    badge.className = 'badge ' + (track[0] === 'err' ? 'warn' : track[0]);
    badge.textContent = track[1].toLowerCase();
  }

  setChip('chipTrack', track[0], track[1]);

  // camera chip
  if (cameraState === 'on') setChip('chipCam', 'ok', 'In use');
  else if (cameraState === 'error') setChip('chipCam', 'err', 'Unavailable');
  else setChip('chipCam', 'off', 'Starting');

  // voice / microphone chip
  const vs = voice.state;
  if (vs === 'listening') setChip('chipVoice', 'ok', cfg.dictating ? 'Typing' : 'Listening');
  else if (vs === 'starting' || vs === 'retrying') setChip('chipVoice', 'warn', vs === 'retrying' ? 'Retrying' : 'Starting');
  else if (vs === 'blocked') setChip('chipVoice', 'err', 'Mic unavailable');
  else if (vs === 'unsupported') setChip('chipVoice', 'err', 'Unsupported');
  else setChip('chipVoice', 'off', 'Off');

  // calibration chip
  if (c.calibrated) setChip('chipCal', 'ok', 'Done');
  else if (c.calRequired) setChip('chipCal', 'warn', 'Needed');
  else setChip('chipCal', 'off', 'Optional');

  // voice message under the status, and retry buttons
  const voiceProblem = vs === 'blocked' || vs === 'unsupported' || vs === 'retrying';
  if (voiceProblem && voice.detail) $('status').textContent += '  ' + voice.detail;
  $('btnRetryCam').hidden = cameraState !== 'error';
  $('btnRetryMic').hidden = !(vs === 'blocked' || vs === 'retrying');
  $('retryRow').hidden = $('btnRetryCam').hidden && $('btnRetryMic').hidden;

  const vbtn = $('btnVoice');
  vbtn.textContent = 'Voice: ' + (cfg.voice ? 'On' : 'Off');
  vbtn.classList.toggle('toggled', cfg.voice && vs === 'listening');

  $('stats').textContent =
    'Clicks: wink ' + stats.wink +
    ' | dwell ' + stats.dwell +
    ' | pinch ' + stats.pinch +
    ' | voice ' + stats.voice +
    ' | commands ' + stats.commands +
    ' (unheard ' + stats.unknown + ')' +
    ' | mistakes ' + stats.mistakes +
    ' | voice: ' + (vs === 'listening' ? 'listening' : vs) +
    (cfg.dictating ? ' | DICTATING' : '');
}

// Shows the active mode's own settings in the shared sliders.
function applyModeToUi() {
  const info = MODE_INFO[cfg.mode];
  const m = M();
  for (const b of document.querySelectorAll('button.mode')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === cfg.mode));
  }
  $('modeName').textContent = info.title;
  $('modeDesc').textContent = info.desc;
  $('modeSettingsTitle').textContent = info.title.split(' ')[0][0] + info.title.split(' ')[0].slice(1).toLowerCase() + ' settings';
  $('gestureHelp').textContent = info.gestures;
  $('chkDwell').checked = m.dwell;
  $('rngGain').value = m.gain;
  $('rngSmooth').value = m.smooth;
  $('rngDwell').value = m.dwellSec;
  if (cfg.mode === 'hands') {
    $('rngPinch').value = m.pinch;
    $('rngScrollSpeed').value = m.scrollSpeed;
  }
  $('rowWink').hidden = cfg.mode === 'hands';
  $('rowPinch').hidden = cfg.mode !== 'hands';
  $('rowScrollSpeed').hidden = cfg.mode !== 'hands';
  $('btnCal').textContent = cfg.mode === 'hands' ? 'Calibrate (optional)' : 'Calibrate (12 s)';
}

const persistable = () => ({
  // Legacy keys (the original extension's format) mirror the HEAD settings.
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
      voice: { enabled: cfg.voice, typingEnabled: cfg.typing },
      lang: cfg.lang,
      wink: cfg.wink,
      edge: cfg.edge,
      modes: cfg.modes,
    },
  });
}

function wireUi() {
  $('help').textContent = HELP_TEXT;

  for (const b of document.querySelectorAll('button.mode')) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }

  const bindGlobal = (id, key, after) => {
    $(id).addEventListener('change', (e) => {
      cfg[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      saveSettings();
      if (after) after();
    });
  };

  bindGlobal('chkWink', 'wink');
  bindGlobal('chkEdge', 'edge', pushConfig);
  bindGlobal('chkTyping', 'typing', () => {
    if (!cfg.typing) setDictating(false);
  });
  bindGlobal('chkVoice', 'voice', () => {
    if (cfg.voice) startVoice();
    else stopVoice();
    renderStatus();
  });
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

  $('btnCal').addEventListener('click', startCalibration);

  $('btnPause').addEventListener('click', () => {
    setPaused(!cfg.paused);
  });

  $('btnVoice').addEventListener('click', () => {
    cfg.voice = !cfg.voice;
    $('chkVoice').checked = cfg.voice;
    if (cfg.voice) startVoice();
    else stopVoice();
    saveSettings();
    renderStatus();
  });

  $('btnDictate').addEventListener('click', () => {
    if (!cfg.typing) {
      toastPage('Voice typing is turned off in Settings.', { ms: 2000 });
      return;
    }
    setDictating(!cfg.dictating);
    if (cfg.dictating && !cfg.voice) {
      cfg.voice = true;
      $('chkVoice').checked = true;
      startVoice();
    }
    toastPage(
      cfg.dictating
        ? 'Dictating. Click a text box, then speak. Say "stop typing" to finish.'
        : 'Stopped typing',
      { ms: 2500 }
    );
    renderStatus();
  });

  $('btnRetryMic').addEventListener('click', () => {
    cfg.voice = true;
    $('chkVoice').checked = true;
    voice.restart();
  });

  $('btnRetryCam').addEventListener('click', () => {
    startCamera().then(() => setMode(cfg.mode, { initial: true }));
  });
}

function applyCfgToUi() {
  $('chkWink').checked = cfg.wink;
  $('chkVoice').checked = cfg.voice;
  $('chkTyping').checked = cfg.typing;
  $('chkEdge').checked = cfg.edge;
  $('selLang').value = cfg.lang;
  setDictating(false);
  applyModeToUi();
}

// Loads settings. Old installs only have `hfCfg` (head-only format) and `hfCal`; those keep
// working: they become the HEAD mode settings / head calibration, and every new field defaults.
function loadSettings(saved) {
  const legacy = saved.hfCfg;
  if (legacy) {
    for (const k of ['wink', 'voice', 'edge', 'lang']) if (k in legacy) cfg[k] = legacy[k];
    for (const k of ['dwell', 'gain', 'smooth', 'dwellSec']) if (k in legacy) cfg.modes.head[k] = legacy[k];
  }
  const s = saved.hfSettings;
  if (s) {
    if (s.voice) {
      if ('enabled' in s.voice) cfg.voice = !!s.voice.enabled;
      if ('typingEnabled' in s.voice) cfg.typing = !!s.voice.typingEnabled;
    }
    for (const k of ['lang', 'wink', 'edge']) if (k in s) cfg[k] = s[k];
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
async function startCamera() {
  cameraState = 'starting';
  statusExtra = '';
  renderStatus();
  try {
    if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 320,
        height: 240,
        frameRate: 24,
        facingMode: 'user',
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();
    cameraState = 'on';
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        cameraState = 'error';
        statusExtra = 'The camera was disconnected';
        renderStatus();
      });
    }
  } catch (err) {
    cameraState = 'error';
    statusExtra = err && err.message ? err.message : String(err);
  }
  renderStatus();
}

// ---------- start ----------
async function main() {
  wireUi();

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

  worker.postMessage({ type: 'start', ms: 33 });

  // Voice is independent of the camera and of the control mode: start it first.
  if (cfg.voice) {
    startVoice();
  }

  await startCamera();
  if (cameraState === 'error') return; // "Retry camera" button re-runs the start-up

  await setMode(cfg.mode, { initial: true });

  pushConfig();

  if (pipelineReady && ctl().calibrated) {
    toastPage('Handsfree is on. Mode: ' + MODE_INFO[cfg.mode].title, { ms: 2000 });
  }
}

// ---------- cleanup on exit / window close ----------
addEventListener('pagehide', () => {
  if (target.tabId != null) {
    chrome.tabs
      .sendMessage(target.tabId, { type: 'hide' })
      .catch(() => {});
  }

  worker.terminate();
  clearTimeout(autoCalTimer);

  voice.stop();

  // Release camera stream tracks to prevent background capture leaks
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }

  // Dispose of MediaPipe landmarker WASM memory heap
  vision.releaseAll();
});

main();
