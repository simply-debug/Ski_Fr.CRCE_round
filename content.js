// Handsfree content script. Runs in every page.
// It stays invisible until the tracker window sends it cursor positions, then it:
// draws the cursor dot, hover highlight and dwell ring
// performs clicks, scrolling, numbered link hints, text entry and key presses
(() => {
  if (window.__handsfreeLoaded) return;
  window.__handsfreeLoaded = true;

  const S = {
    x: innerWidth / 2,
    y: innerHeight / 2,
    lastMove: 0,
    active: false,
    paused: false,
    dwell: true,
    dwellMs: 1300,
    radius: 28,
    edgeScroll: false,
    anchorX: -999,
    anchorY: -999,
    anchorT: 0,
    armed: true,
    hoverEl: null,
    lastHover: 0,
    hints: [],
    hintsOn: false,
    flashUntil: 0,
  };

  const CLICKABLE =
    'a[href],button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],' +
    '[role="menuitem"],[role="checkbox"],[role="radio"],[role="option"],[role="switch"],[onclick],' +
    '[contenteditable=""],[contenteditable="true"]';

  let host, root, dot, ring, arc, hl, toastEl, hintsLayer, toastTimer;

  // overlay
  function build() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-handsfree', '1');
    host.style.cssText =
      'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:system-ui,"Segoe UI",Arial,sans-serif}
        #dot{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
          background:rgba(66,133,244,.35);border:2px solid #1a73e8;box-shadow:0 0 0 2px rgba(255,255,255,.9);
          will-change:transform;display:none}
        #dot.paused{background:rgba(150,150,150,.35);border-color:#777}
        #dot.flash{background:rgba(52,168,83,.75);border-color:#188038}
        #ring{position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;display:none;will-change:transform}
        #hl{position:fixed;border:2px solid #1a73e8;background:rgba(26,115,232,.10);border-radius:4px;display:none}
        #toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:70vw;background:rgba(32,33,36,.94);
          color:#fff;padding:10px 16px;border-radius:10px;font-size:15px;line-height:1.35;display:none;text-align:center}
        #toast.big{bottom:auto;top:26%;font-size:26px;padding:18px 28px}
        .hint{position:fixed;background:#fbbc04;color:#000;font:700 12px/1 system-ui,sans-serif;padding:2px 5px;
          border-radius:4px;border:1px solid #b06000}
      </style>
      <div id="hl"></div>
      <div id="hints"></div>
      <svg id="ring" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="4"/>
        <circle id="arc" cx="22" cy="22" r="19" fill="none" stroke="#1a73e8" stroke-width="4" stroke-linecap="round"
          stroke-dasharray="119.4" stroke-dashoffset="119.4" transform="rotate(-90 22 22)"/>
      </svg>
      <div id="dot"></div>
      <div id="toast"></div>`;
    dot = root.getElementById('dot');
    ring = root.getElementById('ring');
    arc = root.getElementById('arc');
    hl = root.getElementById('hl');
    toastEl = root.getElementById('toast');
    hintsLayer = root.getElementById('hints');
    document.documentElement.appendChild(host);
    requestAnimationFrame(frame);
  }

  function toast(text, { big = false, ms = 2200 } = {}) {
    build();
    toastEl.textContent = text;
    toastEl.className = big ? 'big' : '';
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    if (ms > 0) toastTimer = setTimeout(() => (toastEl.style.display = 'none'), ms);
  }

  function flash() {
    S.flashUntil = performance.now() + 250;
  }

  function sendStat(kind) {
    try {
      chrome.runtime.sendMessage({ type: 'stat', kind }).catch(() => {});
    } catch (_) {
      /* extension was reloaded; ignore */
    }
  }

  // DOM helpers
  function deepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    let guard = 0;
    while (el && el.shadowRoot && guard++ < 8) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  function clickableAncestor(el) {
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 7; n = n.parentElement, i++) {
      if (n.matches && n.matches(CLICKABLE)) return n;
      if (n !== document.body && n !== document.documentElement && getComputedStyle(n).cursor === 'pointer') return n;
    }
    return null;
  }

  function isVisible(el, r) {
    if (r.width < 6 || r.height < 6) return false;
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.02;
  }

  function collectClickables() {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll(CLICKABLE)) {
      if (el.closest('[data-handsfree]')) continue;
      const r = el.getBoundingClientRect();
      if (!isVisible(el, r)) continue;
      const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
      const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const top = deepElementFromPoint(cx, cy);
      if (!top || !(el === top || el.contains(top) || top.contains(el))) continue; // covered by something else
      if (seen.has(el)) continue;
      seen.add(el);
      out.push({ el, r });
    }
    out.sort((a, b) => Math.round(a.r.top / 12) - Math.round(b.r.top / 12) || a.r.left - b.r.left);
    return out;
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function labelOf(el) {
    const lab = el.labels && el.labels[0] ? el.labels[0].innerText : '';
    return norm(
      el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.alt || el.placeholder || lab || ''
    ).slice(0, 140);
  }

  function findByText(query) {
    const q = norm(query);
    if (!q) return null;
    const words = q.split(' ');
    let best = null;
    let bestScore = 0;
    for (const { el } of collectClickables()) {
      const label = labelOf(el);
      if (!label) continue;
      let score;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 85;
      else if (label.includes(q)) score = 72;
      else {
        const hit = words.filter((w) => w.length > 1 && label.includes(w)).length;
        score = (hit / words.length) * 60;
      }
      score -= Math.min(10, label.length / 30); // prefer the most specific (shortest) match
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return bestScore >= 52 ? best : null;
  }

  // acting
  function fire(target, x, y, double) {
    const a = target.closest && target.closest('a[href]');
    if (a && a.target === '_blank' && a.href && !/^javascript:/i.test(a.href)) {
      // Synthetic clicks cannot open popups, so ask the extension to open the tab.
      try {
        chrome.runtime.sendMessage({ type: 'openTab', url: a.href }).catch(() => {});
      } catch (_) {}
      flash();
      return true;
    }
    const base = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y, button: 0,
    };
    const ptr = { pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const rounds = double ? 2 : 1;
    target.dispatchEvent(new MouseEvent('mouseover', base));
    target.dispatchEvent(new MouseEvent('mousemove', base));
    for (let i = 0; i < rounds; i++) {
      target.dispatchEvent(new PointerEvent('pointerdown', { ...base, ...ptr, buttons: 1 }));
      target.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
      if (i === 0 && typeof target.focus === 'function') {
        try { target.focus({ preventScroll: true }); } catch (_) {}
      }
      target.dispatchEvent(new PointerEvent('pointerup', { ...base, ...ptr, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
      target.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0, detail: i + 1 }));
    }
    if (double) target.dispatchEvent(new MouseEvent('dblclick', { ...base, detail: 2 }));
    flash();
    return true;
  }

  function clickAt(x, y, double = false) {
    const el = deepElementFromPoint(x, y);
    if (!el || el === document.documentElement) return false;
    return fire(clickableAncestor(el) || el, x, y, double);
  }

  function scrollableAt(x, y) {
    for (let n = deepElementFromPoint(x, y); n && n.nodeType === 1; n = n.parentElement) {
      if (n === document.body || n === document.documentElement) break;
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && n.scrollHeight > n.clientHeight + 2) return n;
    }
    return document.scrollingElement || document.documentElement;
  }

  function doScroll(arg) {
    const el = scrollableAt(S.x, S.y);
    const step = Math.round(innerHeight * 0.45);
    const page = Math.round(innerHeight * 0.85);
    const opts = { behavior: 'smooth' };
    if (arg === 'down') el.scrollBy({ top: step, ...opts });
    else if (arg === 'up') el.scrollBy({ top: -step, ...opts });
    else if (arg === 'pageDown') el.scrollBy({ top: page, ...opts });
    else if (arg === 'pageUp') el.scrollBy({ top: -page, ...opts });
    else if (arg === 'left') el.scrollBy({ left: -300, ...opts });
    else if (arg === 'right') el.scrollBy({ left: 300, ...opts });
    else if (arg === 'top') el.scrollTo({ top: 0, ...opts });
    else if (arg === 'bottom') el.scrollTo({ top: el.scrollHeight, ...opts });
  }

  function activeEditable() {
    let a = document.activeElement;
    let guard = 0;
    while (a && a.shadowRoot && a.shadowRoot.activeElement && guard++ < 8) a = a.shadowRoot.activeElement;
    return a;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertText(text) {
    const el = activeEditable();
    if (!el) return false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      let start = null;
      let end = null;
      try { start = el.selectionStart; end = el.selectionEnd; } catch (_) {}
      const v = el.value;
      if (start === null || end === null) {
        setNativeValue(el, v + (v && !v.endsWith(' ') ? ' ' : '') + text);
      } else {
        const before = v.slice(0, start);
        const sep = before && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
        const next = before + sep + text + v.slice(end);
        setNativeValue(el, next);
        const pos = (before + sep + text).length;
        try { el.setSelectionRange(pos, pos); } catch (_) {}
      }
      return true;
    }
    if (el.isContentEditable) {
      document.execCommand('insertText', false, text);
      return true;
    }
    return false;
  }

  function pressKey(kind) {
    const el = activeEditable();
    if (!el) return false;
    if (kind === 'enter') {
      const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
      const down = new KeyboardEvent('keydown', init);
      el.dispatchEvent(down);
      el.dispatchEvent(new KeyboardEvent('keypress', init));
      el.dispatchEvent(new KeyboardEvent('keyup', init));
      if (!down.defaultPrevented) {
        if (el.tagName === 'TEXTAREA' || el.isContentEditable) insertText('\n');
        else if (el.form) {
          try { el.form.requestSubmit(); } catch (_) { el.form.submit(); }
        }
      }
      return true;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (kind === 'clear') setNativeValue(el, '');
      else if (kind === 'deleteWord') setNativeValue(el, el.value.replace(/\s*\S+\s*$/, ''));
      return true;
    }
    if (el.isContentEditable) {
      if (kind === 'clear') document.execCommand('selectAll') && document.execCommand('delete');
      else if (kind === 'deleteWord') document.execCommand('deleteWordBackward');
      return true;
    }
    return false;
  }

  // numbered hints
  function clearHints() {
    S.hints = [];
    S.hintsOn = false;
    if (hintsLayer) hintsLayer.textContent = '';
  }

  function showHints(silent = false) {
    build();
    hintsLayer.textContent = '';
    S.hints = [];
    const items = collectClickables().slice(0, 90);
    items.forEach(({ el, r }, i) => {
      const d = document.createElement('div');
      d.className = 'hint';
      d.textContent = String(i + 1);
      d.style.left = Math.max(0, r.left) + 'px';
      d.style.top = Math.max(0, r.top) + 'px';
      hintsLayer.appendChild(d);
      S.hints.push(el);
    });
    S.hintsOn = true;
    if (!silent) toast(`${items.length} items numbered. Say "click 3".`, { ms: 2500 });
  }

  let hintTimer;
  function scheduleHintRefresh() {
    if (!S.hintsOn) return;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => S.hintsOn && showHints(true), 250);
  }
  addEventListener('scroll', scheduleHintRefresh, { passive: true, capture: true });
  addEventListener('resize', scheduleHintRefresh, { passive: true });

  function moveCursorTo(el) {
    const r = el.getBoundingClientRect();
    S.x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    S.y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    S.lastMove = performance.now();
  }

  function clickElement(el) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    moveCursorTo(el);
    return fire(el, S.x, S.y, false);
  }

  // per frame rendering + dwell 
  function frame(now) {
    requestAnimationFrame(frame);
    if (!S.active) return;
    const live = now - S.lastMove < 3000;
    dot.style.display = live ? 'block' : 'none';
    if (!live) {
      ring.style.display = 'none';
      hl.style.display = 'none';
      return;
    }
    dot.style.transform = `translate(${S.x}px,${S.y}px)`;
    dot.classList.toggle('paused', S.paused);
    dot.classList.toggle('flash', now < S.flashUntil);

    if (now - S.lastHover > 60) {
      S.lastHover = now;
      const el = deepElementFromPoint(S.x, S.y);
      S.hoverEl = el ? clickableAncestor(el) : null;
      if (S.hoverEl && !S.paused) {
        const r = S.hoverEl.getBoundingClientRect();
        if (r.width * r.height < innerWidth * innerHeight * 0.6) {
          hl.style.display = 'block';
          hl.style.left = r.left + 'px';
          hl.style.top = r.top + 'px';
          hl.style.width = r.width + 'px';
          hl.style.height = r.height + 'px';
        } else hl.style.display = 'none';
      } else hl.style.display = 'none';
    }

    if (Math.hypot(S.x - S.anchorX, S.y - S.anchorY) > S.radius) {
      S.anchorX = S.x;
      S.anchorY = S.y;
      S.anchorT = now;
      S.armed = true;
    }
    if (S.dwell && !S.paused && S.armed && S.hoverEl) {
      const p = Math.min(1, (now - S.anchorT) / S.dwellMs);
      ring.style.display = 'block';
      ring.style.transform = `translate(${S.x}px,${S.y}px)`;
      arc.style.strokeDashoffset = String(119.4 * (1 - p));
      if (p >= 1) {
        S.armed = false;
        ring.style.display = 'none';
        if (clickAt(S.x, S.y)) sendStat('dwellClick');
      }
    } else {
      ring.style.display = 'none';
    }

    if (S.edgeScroll && !S.paused) {
      const edge = innerHeight * 0.06;
      const el = document.scrollingElement || document.documentElement;
      if (S.y < edge) el.scrollBy(0, -Math.ceil((1 - S.y / edge) * 16));
      else if (S.y > innerHeight - edge) el.scrollBy(0, Math.ceil((1 - (innerHeight - S.y) / edge) * 16));
    }
  }

  //  messages from the tracker 
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case 'ping':
        sendResponse({ ok: true });
        return false;
      case 'move':
        build();
        S.active = true;
        S.x = msg.x * innerWidth;
        S.y = msg.y * innerHeight;
        S.lastMove = performance.now();
        return false;
      case 'config':
        build();
        S.active = true;
        for (const k of ['paused', 'dwell', 'dwellMs', 'edgeScroll']) if (k in msg) S[k] = msg[k];
        return false;
      case 'toast':
        toast(msg.text, { big: !!msg.big, ms: msg.ms ?? 2200 });
        return false;
      case 'click': {
        build();
        S.active = true;
        const ok = clickAt(S.x, S.y, false);
        sendResponse({ ok });
        return false;
      }
      case 'dblclick': {
        const ok = clickAt(S.x, S.y, true);
        sendResponse({ ok });
        return false;
      }
      case 'scroll':
        doScroll(msg.arg);
        return false;
      case 'hintsOn':
        showHints();
        return false;
      case 'hintsOff':
        clearHints();
        return false;
      case 'hintClick': {
        const el = S.hints[msg.arg - 1];
        if (!el || !document.contains(el)) {
          toast(`No item numbered ${msg.arg}. Say "show numbers" first.`);
          sendResponse({ ok: false });
          return false;
        }
        const ok = clickElement(el);
        clearHints();
        sendResponse({ ok });
        return false;
      }
      case 'clickText': {
        const el = findByText(msg.arg);
        if (!el) {
          toast(`Couldn't find "${msg.arg}" on this page.`);
          sendResponse({ ok: false });
          return false;
        }
        const label = labelOf(el);
        const ok = clickElement(el);
        clearHints();
        toast(`Clicked "${label.slice(0, 40)}"`, { ms: 1400 });
        sendResponse({ ok, label });
        return false;
      }
      case 'text': {
        const ok = insertText(msg.arg);
        if (!ok) toast('Click a text box first, then speak.');
        sendResponse({ ok });
        return false;
      }
      case 'key': {
        const ok = pressKey(msg.arg);
        if (!ok) toast('Click a text box first.');
        sendResponse({ ok });
        return false;
      }
      case 'hide':
        S.active = false;
        if (dot) {
          dot.style.display = 'none';
          ring.style.display = 'none';
          hl.style.display = 'none';
        }
        clearHints();
        return false;
      default:
        return false;
    }
  });
})();
