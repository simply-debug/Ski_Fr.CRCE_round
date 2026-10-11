// Handsfree - signal helpers (pure, unit-testable).

// One Euro filter: strong smoothing when the signal is nearly still (kills jitter),
// light smoothing when it moves fast (keeps the cursor responsive).
export class OneEuro {
  constructor(minCutoff = 1.0, beta = 8.0, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.t = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }
  filter(value, tSeconds) {
    if (this.x === null) {
      this.x = value;
      this.t = tSeconds;
      return value;
    }
    const dt = Math.max(1e-3, tSeconds - this.t);
    this.t = tSeconds;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Maps a raw head offset to 0..1 using a calibrated centre and left/right (or up/down) extremes.
// Each side is scaled separately, so a head that turns further one way than the other still works.
export function mapAxis(v, center, low, high, gain = 1) {
  let n;
  if (v >= center) {
    const span = Math.max(1e-6, high - center);
    n = 0.5 + 0.5 * ((v - center) / span) * gain;
  } else {
    const span = Math.max(1e-6, center - low);
    n = 0.5 - 0.5 * ((center - v) / span) * gain;
  }
  return clamp(n, 0, 1);
}

// Blink detector: 'blink' = short both-eye blink (click), 'longBlink' = ~0.7 s closure (pause/resume).
export class BlinkDetector {
  constructor({
    closed = 0.55,
    open = 0.30,
    blinkMs = 80,
    longBlinkMs = 700
  } = {}) {
    this.closed = closed;
    this.open = open;
    this.blinkMs = blinkMs;
    this.longBlinkMs = longBlinkMs;
    this.reset();
  }

  reset() {
    this.blinkStart = null;
    this.longBlinkTriggered = false;
  }

  update(left, right, nowMs) {
    const bothClosed =
      left >= this.closed && right >= this.closed;

    const bothOpen =
      left <= this.open && right <= this.open;

    // Start timing when both eyes close.
    if (bothClosed) {
      if (this.blinkStart === null) {
        this.blinkStart = nowMs;
        this.longBlinkTriggered = false;
      }

      // Trigger pause/resume once after a long blink.
      if (
        !this.longBlinkTriggered &&
        nowMs - this.blinkStart >= this.longBlinkMs
      ) {
        this.longBlinkTriggered = true;
        return "longBlink";
      }

      return null;
    }

    // Detect a blink when both eyes reopen.
    if (bothOpen && this.blinkStart !== null) {
      const duration = nowMs - this.blinkStart;
      const wasLongBlink = this.longBlinkTriggered;

      this.blinkStart = null;
      this.longBlinkTriggered = false;

      if (!wasLongBlink && duration >= this.blinkMs) {
        return "blink";
      }

      return null;
    }

    // Reset if the eyes reopen only partially for too long.
    // Otherwise, retain the timer through brief threshold fluctuations.
    if (
      this.blinkStart !== null &&
      nowMs - this.blinkStart > this.longBlinkMs + 1000
    ) {
      this.reset();
    }

    return null;
  }
}
