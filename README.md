# Handsfree Browsing (Chrome extension)

Control any website in Chrome with your **head** (cursor), **wink / dwell** (click) and **voice** (scroll, navigate, type). Uses only a normal webcam and microphone. Everything runs on your computer, no server.

## 1. One-time setup (about 5 minutes)

1. Install **Node.js 18+** from https://nodejs.org (skip if `node -v` already works).
2. Open a terminal **inside this folder** and run:
   ```
   node setup.js
   ```
   This downloads the MediaPipe face-tracking files (and the hand-tracking model) into `lib/` (about 25 MB). A copy of `hand_landmarker.task` is already included. Chrome extensions are not allowed to load these from the internet, so they must sit inside the folder.
   *No Node?* Download the 6 files listed at the bottom of this README in your browser and save them at the paths shown.
3. In Chrome open `chrome://extensions`, switch on **Developer mode** (top right), click **Load unpacked**, and pick this folder.
4. Click the puzzle-piece icon and **pin** "Handsfree Browsing".

## 2. Using it

1. Open any normal website (Wikipedia, Google, YouTube...).
2. Click the Handsfree icon. A small **controller window** opens. Allow the **camera** and **microphone** when asked.
3. Click **Calibrate (12 s)** in the controller and follow the big messages on the page: centre, left, right, up, down. Do it again whenever you change seat or posture.
4. Keep the controller window visible (beside your browser, not hidden behind it) and keep using Chrome.
5. After you edit any file, press the reload icon on the extension card in `chrome://extensions`, then reopen the controller.

| What you do | What happens |
|---|---|
| Move your head | Blue cursor dot moves on the page |
| Hold the dot still on a link/button (default 1.3 s) | A ring fills, then it clicks (dwell) |
| Wink one eye for about 0.3 s | Click. Normal blinks are ignored |
| Close both eyes for 1 s | Pause or resume (safety switch) |
| Say **"pause"** / **"resume"** | Same safety switch by voice |

### Three control modes: Head, Eyes, Hands + Voice
Pick a mode with the big buttons at the top of the controller window, **or say** "head mode", "eyes mode" or "hands mode". Voice commands and voice typing work in every mode. Each mode keeps its own settings and its own calibration.

| Mode | Move the cursor | Click | Notes |
|---|---|---|---|
| **HEAD** (default) | Turn / tilt your head | Blink or dwell | Exactly as before |
| **EYES** | Look where you want the cursor (iris tracking). Keep your head fairly still | Blink or dwell | Asks you to calibrate the first time you use it (look centre, left, right, top, bottom) |
| **HANDS + VOICE** | Point with your index finger | Pinch thumb + index = click, two quick pinches = double click | Peace sign (index + middle only) and move your hand down / up = scroll down / up. Calibration is optional |

Eye zoom (wide eyes / raised eyebrows / squint) works in Head and Eyes modes. The small preview shows iris dots (Eyes) or the hand skeleton (Hands) so you can see what the camera sees.

### Voice commands
- **click**, **double click**
- **scroll down / up**, **page down / up**, **scroll to top / bottom**
- **go back**, **go forward**, **refresh**, **new tab**, **close tab**, **next tab**, **previous tab**
- **show numbers**, then **click 5** (works on any site, the most reliable way to hit small targets)
- **click about us** / **open contact** (clicks the link or button whose text matches)
- **type hello world**, or say **dictate** and speak freely, then **stop typing**. While dictating: **enter**, **delete**, **clear**
- **search for cheap flights**, **open youtube**, **go to wikipedia dot org**
- **dwell off / dwell on**, **calibrate**, **undo** (counts as a mistake in the stats), **help**

To type: click a text box first (wink, dwell or "click 4"), then speak.

## 3. Measuring it (for your results slide)

The controller window shows live counts: clicks by wink / dwell / voice, commands heard vs not understood, and mistakes.

For a timed comparison, open the benchmark page `eval-test.html`:
- Easiest: in this folder run `python -m http.server 8000`, then open `http://localhost:8000/eval-test.html`.
- Choose **Mouse**, press Start, click the 10 circles. Then choose **Handsfree** and repeat. The table shows total time, average per target, misses and accuracy; "Copy results as CSV" pastes into Excel/Sheets.

## 4. Tuning and troubleshooting

- **Cursor jumps around:** raise **Smoothness**, improve lighting (face lit from the front, no bright window behind you), recalibrate.
- **Cursor does not reach the screen edges:** raise **Sensitivity** or turn your head further during calibration.
- **Accidental clicks:** turn dwell off (checkbox or say "dwell off") or lengthen **Dwell time**.
- **"Could not load MediaPipe":** run `node setup.js` again; confirm `lib/vision_bundle.mjs`, `lib/face_landmarker.task` and `lib/wasm/` exist.
- **Voice not working:** Chrome's speech recognition needs internet. Allow the microphone when prompted. If you clicked Block, click the lock icon in the controller's address bar, allow the mic, and reopen the window.
- **Nothing happens on a page:** Chrome blocks all extensions on `chrome://` pages, the Chrome Web Store and the new-tab page. Try a normal site.
- A tab that was open before you installed the extension is handled automatically.

## 5. Known limits (be upfront about these in the demo)

- It cannot control things inside **cross-origin iframes**, Google Docs-style canvas editors, or native `<select>` dropdown menus.
- Links that open in a new tab are opened by the extension itself (Chrome blocks synthetic popups).
- Head tracking is far more accurate than webcam eye-gaze, so the cursor follows the head; the eyes are used for clicking.
- The camera is processed locally and never uploaded. Only the speech audio goes to Google (Chrome's built-in speech service).

## 6. How it is built

```
manifest.json        Manifest V3 settings and permissions
background.js        Opens the controller window when you click the icon
tracker.html/js/css  Camera + MediaPipe Face Landmarker + speech recognition + calibration + settings
tick-worker.js       Frame clock in a Web Worker (so tracking keeps full speed when the window is covered)
content.js           Runs on every page: cursor dot, dwell ring, clicking, scrolling, number hints, typing
commands.js          Voice-command parser
filters.js           One-Euro smoothing filter, head-to-screen mapping, wink/long-blink detector
setup.js             Downloads MediaPipe into lib/
eval-test.html       10-target timing benchmark (mouse vs handsfree)
```

Head position = nose position relative to the eye corners, divided by eye distance, with head-tilt removed. That makes it steady when you lean closer or shift sideways.

## MediaPipe files (manual download fallback)

Save each at the path shown inside this folder:

- `lib/vision_bundle.mjs` ← https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs
- `lib/wasm/vision_wasm_internal.js` ← https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.js
- `lib/wasm/vision_wasm_internal.wasm` ← https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.wasm
- `lib/wasm/vision_wasm_nosimd_internal.js` ← https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.js
- `lib/wasm/vision_wasm_nosimd_internal.wasm` ← https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.wasm
- `lib/face_landmarker.task` ← https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task