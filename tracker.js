<!doctype html>
<html lang="en">
<head>
  <link rel="stylesheet" href="glass-cursor.css">
  <meta charset="utf-8" />
  <title>Handsfree Controller</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="tracker.css" />
</head>
<body>
  <header>
    <h1>Handsfree</h1>
    <span id="badge" class="badge off">starting…</span>
  </header>

  <div class="videowrap">
    <video id="video" autoplay playsinline muted></video>
  </div>

  <p id="status">Starting camera…</p>

  <div class="row">
    <button id="btnCal" class="primary">Calibrate (12 s)</button>
    <button id="btnPause">Pause</button>
  </div>

  <fieldset>
    <label><input type="checkbox" id="chkDwell" checked /> Dwell click (hold still on a link)</label>
    <label><input type="checkbox" id="chkWink" checked /> Wink to click</label>
    <label><input type="checkbox" id="chkVoice" checked /> Voice commands</label>
    <label><input type="checkbox" id="chkEdge" /> Scroll when cursor is at screen edge</label>
  </fieldset>

  <fieldset>
    <label class="slider">Sensitivity
      <input type="range" id="rngGain" min="0.6" max="2.2" step="0.05" value="1.2" />
    </label>
    <label class="slider">Smoothness
      <input type="range" id="rngSmooth" min="0" max="1" step="0.05" value="0.5" />
    </label>
    <label class="slider">Dwell time
      <input type="range" id="rngDwell" min="0.7" max="2.5" step="0.1" value="1.3" />
    </label>
    <label class="slider">Language
      <select id="selLang">
        <option value="en-IN">English (India)</option>
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="hi-IN">Hindi</option>
        <option value="mr-IN">Marathi</option>
        <option value="gu-IN">Gujrati</option>
        <option value="ta-IN">Tamil</option>
      </select>
    </label>
  </fieldset>

  <div id="heard">Heard: —</div>
  <div id="stats"></div>

  <details>
    <summary>Voice commands</summary>
    <div id="help"></div>
  </details>

  <p class="tip">Keep this window visible (beside your browser, not hidden behind it) and use Chrome.</p>

  <script type="module" src="tracker.js"></script>
  <script src="glass-cursor.js"></script>
</body>
</html>
        'error',
        () => reject(new Error('Could not load camera video.')),
        { once: true }
      );
    });
  }

  await video.play();

  if (video.readyState < 2) {
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener(
        'error',
        () => reject(new Error('Camera video data could not be loaded.')),
        { once: true }
      );
    });
  }

  console.log('[Handsfree] Camera started successfully.');
}
