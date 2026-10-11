# Handsfree Browsing (Chrome extension) - v0.2: three control modes

Control any website in Chrome hands-free, with a webcam and microphone only. Everything runs on your computer, no server.

Pick **how the cursor moves**; **voice commands and voice typing work in every mode**:

| Mode | Cursor | Click | Also |
|---|---|---|---|
| **HEAD** | Move your head | Wink, or dwell (hold still on a link) | Long blink = pause/resume |
| **EYES** | Look where you want it (iris/gaze) | Dwell (wink also works) | Long blink = pause/resume |
| **HANDS + VOICE** | Index fingertip | Pinch thumb + index; two quick pinches = double click | Peace sign (index + middle up) and move the hand down/up = scroll |

Voice (all modes): click, double click, scroll, go back/forward, reload, tabs, search, open sites, "show numbers" then "click 5", "click <link text>", "type ...", "dictate" / "stop typing", enter, delete, clear, pause/resume, calibrate, **"head mode" / "eyes mode" / "hands mode"**.

## 1. Setup

The MediaPipe runtime, the face model and a hand model are already inside `lib/`, so the folder works as-is:

1. Chrome -> `chrome://extensions` -> **Developer mode** -> **Load unpacked** -> pick this folder. Pin the extension.
2. Optional: run `node setup.js` (Node 18+) to re-download the MediaPipe files. To replace the bundled hand model with Google's official file, delete `lib/hand_landmarker.task` first.

## 2. Using it

1. Open a normal website (Wikipedia, Google, YouTube...). Click the Handsfree icon; allow **camera** and **microphone**.
2. Choose **HEAD / EYES / HANDS + VOICE** at the top of the controller window. You can switch any time, by button or by voice, without restarting.
3. **Calibrate**: head and eyes ask for it automatically the first time you use them (centre, left, right, up, down). Hands calibration is optional (same five steps, sets how far you must reach). Each mode keeps its **own** calibration.
4. Keep the controller window visible (beside your browser, not behind it).

Status chips show: Tracking (Active / Lost / Paused / Calibrating), Voice (Listening / Typing / Off / Mic unavailable), Camera (In use / Unavailable), Calibration (Done / Needed / Optional). Messages: "Face not detected", "Eyes not detected", "Hand not detected", "Camera unavailable", "Microphone unavailable".

### Tips per mode
- **Eyes**: sit 50-70 cm away, face evenly lit, keep the head fairly still, calibrate by looking at the real screen edges. Webcam gaze is much less precise than head tracking, so use the **Sensitivity/Smoothness** sliders, bigger links, or "show numbers" + "click 5" for small targets.
- **Hands**: keep the hand in view and well lit. The cursor freezes while your fingers close for a pinch, so the click lands where you pointed. Raise **Pinch threshold** if pinches are missed, lower it if you get accidental clicks.

## 3. Settings (per mode, remembered)
General: voice commands, voice typing, edge scrolling, language. Per mode: sensitivity, smoothness, dwell on/off, dwell time. Head/Eyes: wink click. Hands: pinch threshold, scroll-gesture speed.

## 4. How it is built

```
manifest.json           MV3 settings and permissions (unchanged permissions)
background.js           Opens the controller window
tracker.html/js/css     Control manager + UI: ONE camera stream, mode switching, calibration flow, settings, status
tick-worker.js          Frame clock in a Web Worker
controllers/
  baseController.js     Shared calibration logic
  headController.js     MODE 1 - original head pipeline (nose vs eye corners, One Euro)
  eyeController.js      MODE 2 - iris position inside the eye (landmarks 468-477), averaged, One Euro, fixation dead-band
  handController.js     MODE 3 - index tip, pinch/double-pinch, scroll gesture
vision/pipeline.js      Shared MediaPipe loader: only the model the active mode needs is kept in memory
voice/voiceManager.js   Speech recognition + parsing, independent of the mode
commands.js             Voice-command parser (original, plus mode commands)
filters.js              One Euro filter, axis mapping, blink/wink detector (unchanged)
content.js              Page side: cursor, dwell ring, clicking, scrolling, hints, typing (+ scrollBy, double-pinch support)
lib/                    MediaPipe runtime + face_landmarker.task + hand_landmarker.task
eval-test.html          10-target benchmark
headTracking.js         Legacy standalone module from v0.1 (not used by the controller)
```

Only the active controller receives frames, so the three input methods can never fight over the cursor. Voice and gestures all call the same `run()` action handler in `tracker.js`.

### Storage (chrome.storage.local)
`hfCal` head calibration (same key as v0.1, so existing calibrations keep working) · `hfEyeCal` eye calibration · `hfHandCal` hand calibration · `hfSettings` `{ activeMode, voice:{enabled,typingEnabled}, modes:{head,eyes,hands} }` · `hfCfg` legacy v0.1 settings (still read on upgrade and still written).

## 5. Known limits
- Cannot control cross-origin iframes, canvas editors (Google Docs), or native `<select>` menus. Chrome blocks extensions on `chrome://` pages and the Web Store.
- Webcam eye-gaze is approximate; head mode is more accurate.
- Speech recognition uses Chrome's built-in service and needs internet. Camera frames are processed locally and never uploaded.
- The bundled `hand_landmarker.task` was assembled from MediaPipe's official hand detector and landmark models (same files Google's `.task` contains) and verified to load in the MediaPipe Tasks runtime.
