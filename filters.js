// signal helpers

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

// long-blink detector
export class BlinkDetector {
  constructor({ closed = 0.55, open = 0.3, winkMs = 320, longMs = 1000 } = {}) {
    Object.assign(this, { closed, open, winkMs, longMs });
    this.reset();
  }
  reset() {
    this.winkStart = null;
    this.bothStart = null;
    this.armed = true;
  }
  update(left, right, nowMs) {
    const both = left > this.closed && right > this.closed;
    const winkL = left > this.closed && right < this.open;
    const winkR = right > this.closed && left < this.open;
    const bothOpen = left < this.open && right < this.open;
    let event = null;

    if (bothOpen) {
      this.armed = true;
      this.winkStart = null;
      this.bothStart = null;
      return null;
    }
    if (!this.armed) return null;

    if (winkL || winkR) {
      this.bothStart = null;
      if (this.winkStart === null) this.winkStart = nowMs;
      else if (nowMs - this.winkStart >= this.winkMs) {
        event = 'wink';
        this.armed = false;
        this.winkStart = null;
      }
    } else if (both) {
      this.winkStart = null;
      if (this.bothStart === null) this.bothStart = nowMs;
      else if (nowMs - this.bothStart >= this.longMs) {
        event = 'longBlink';
        this.armed = false;
        this.bothStart = null;
      }
    } else {
      // transitional frame 
    }
    return event;
  }
}
