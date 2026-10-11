// Shared behaviour for the three cursor controllers (head / eyes / hands).
// A controller turns one frame of landmarks into a normalised (0..1) cursor position.
// Only the ACTIVE controller is ever fed frames, so they can never fight over the cursor.
export const smoothingToCutoff = (s) => 3.0 * Math.pow(0.1, s);

export class BaseController {
  constructor({ id, label, needs, storageKey, defaults, minSpan, steps, warnX, warnY, calRequired }) {
    this.id = id;
    this.label = label;
    this.needs = needs; // 'face' | 'hand'
    this.storageKey = storageKey; // chrome.storage.local key for this mode's calibration
    this.defaults = { ...defaults, has: false };
    this.minSpan = minSpan;
    this.steps = steps;
    this.warnX = warnX;
    this.warnY = warnY;
    this.calRequired = calRequired; // true: prompt for calibration automatically
    this.cal = { ...this.defaults };
    this.latest = null; // last raw sample {x, y, t} (used for calibration)
  }

  get calibrated() {
    return !!this.cal.has;
  }

  setCalibration(saved) {
    this.cal = { ...this.defaults, ...saved };
  }

  activate() {
    this.reset();
  }

  deactivate() {
    this.reset();
  }

  reset() {
    this.latest = null;
  }

  lost() {
    this.latest = null;
  }

  // Same rules the original head calibration used: each side is stored separately; if the user
  // barely moved, fall back to default spans and report which axis was too small.
  finishCalibration(got) {
    const d = this.defaults;
    const next = { ...this.cal, cx: got.center.x, cy: got.center.y, has: true };
    let warn = '';
    if (got.left.x < next.cx - this.minSpan && got.right.x > next.cx + this.minSpan) {
      next.xl = got.left.x;
      next.xr = got.right.x;
    } else {
      next.xl = next.cx + (d.xl - d.cx);
      next.xr = next.cx + (d.xr - d.cx);
      warn += this.warnX;
    }
    if (got.up.y < next.cy - this.minSpan && got.down.y > next.cy + this.minSpan) {
      next.yu = got.up.y;
      next.yd = got.down.y;
    } else {
      next.yu = next.cy + (d.yu - d.cy);
      next.yd = next.cy + (d.yd - d.cy);
      warn += this.warnY;
    }
    this.cal = next;
    this.reset();
    return warn;
  }

  // Subclasses implement:
  //   sense(frameResult, ctx) -> 'ok' | 'noeyes' ... (updates this.latest)
  //   step(ctx, now)          -> { cursor: {x,y}|null, actions: [] }
}