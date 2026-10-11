// MODE 2 - EYES. Gaze from the iris landmarks (468-477) of the same FaceLandmarker the head
// mode uses, so no extra model or camera is needed.
//
// For each eye the iris centre is measured relative to the midpoint of the eye corners, along
// and across the eye axis, in units of eye width. That makes the value independent of how far
// you sit from the camera, of head roll, and (mostly) of where your head is: it is "where the
// eyes point inside the head". Both eyes are averaged, calibrated (centre/left/right/up/down),
// averaged over a few frames, passed through the One Euro filter and finally a small
// fixation dead-band so the cursor stays put while you look at one spot.
import { OneEuro, mapAxis } from '../filters.js';
import { BaseController, smoothingToCutoff } from './baseController.js';

// Landmark indices (MediaPipe face mesh). "left"/"right" = left/right in the IMAGE.
const EYE_A = { l: 33, r: 133, up: 159, dn: 145, iris: 468 }; // user's right eye
const EYE_B = { l: 362, r: 263, up: 386, dn: 374, iris: 473 }; // user's left eye

function eyeGaze(lm, W, H, e) {
  const p = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const l = p(e.l);
  const r = p(e.r);
  const c = p(e.iris);
  const u = p(e.up);
  const d = p(e.dn);
  const ax = r.x - l.x;
  const ay = r.y - l.y;
  const w = Math.hypot(ax, ay) || 1;
  const ux = ax / w;
  const uy = ay / w;
  const dx = c.x - (l.x + r.x) / 2;
  const dy = c.y - (l.y + r.y) / 2;
  return {
    along: (dx * ux + dy * uy) / w, // + = iris towards image-right
    down: (-dx * uy + dy * ux) / w, // + = iris towards image-down
    open: Math.hypot(u.x - d.x, u.y - d.y) / w, // eyelid opening
  };
}

export class EyeController extends BaseController {
  constructor() {
    super({
      id: 'eyes',
      label: 'EYES',
      needs: 'face',
      storageKey: 'hfEyeCal',
      defaults: { cx: 0, cy: 0, xl: -0.07, xr: 0.07, yu: -0.04, yd: 0.04 },
      minSpan: 0.01,
      calRequired: true,
      warnX: ' Left/right eye movement was small - look further to each side next time.',
      warnY: ' Up/down eye movement was small - look further up and down next time.',
      steps: [
        { key: 'center', text: 'Eye calibration 1/5: look at the CENTER of the screen. Keep your head still.' },
        { key: 'left', text: 'Eye calibration 2/5: look at the far LEFT edge (move only your eyes)' },
        { key: 'right', text: 'Eye calibration 3/5: look at the far RIGHT edge' },
        { key: 'up', text: 'Eye calibration 4/5: look at the TOP edge' },
        { key: 'down', text: 'Eye calibration 5/5: look at the BOTTOM edge' },
      ],
    });
    this.fx = new OneEuro(1.0, 3.0, 1.0);
    this.fy = new OneEuro(1.0, 3.0, 1.0);
    this.hist = [];
    this.hold = null;
  }

  reset() {
    super.reset();
    this.fx.reset();
    this.fy.reset();
    this.hist = [];
    this.hold = null;
  }

  // Exposed for the preview overlay.
  static irisPoints(lm) {
    return lm.length >= 478 ? [lm[468], lm[473]] : [];
  }

  sense(res, ctx) {
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    if (!lm) return 'noface';
    if (lm.length < 478) return 'noeyes'; // model returned no iris landmarks
    const a = eyeGaze(lm, ctx.W, ctx.H, EYE_A);
    const b = eyeGaze(lm, ctx.W, ctx.H, EYE_B);
    // Eyes (nearly) closed or mid-blink: the iris reading is garbage, keep the previous sample.
    if (ctx.blinking || a.open < 0.1 || b.open < 0.1) return 'ok';
    this.latest = {
      x: -(a.along + b.along) / 2, // + = user looks to THEIR right (mirrors like the head mode)
      y: (a.down + b.down) / 2,
      t: ctx.now,
    };
    return 'ok';
  }

  step(ctx, now) {
    const s = this.latest;
    if (!s || now - s.t > 200 || ctx.blinking) return { cursor: null, actions: [] };
    // 3-frame moving average on the raw gaze, then One Euro (low cutoff = calm cursor).
    this.hist.push(s);
    if (this.hist.length > 3) this.hist.shift();
    const gx = this.hist.reduce((v, h) => v + h.x, 0) / this.hist.length;
    const gy = this.hist.reduce((v, h) => v + h.y, 0) / this.hist.length;

    const cut = smoothingToCutoff(ctx.m.smooth) * 0.6;
    this.fx.minCutoff = this.fy.minCutoff = cut;
    const c = this.cal;
    const nx = mapAxis(gx, c.cx, c.xl, c.xr, ctx.m.gain);
    const ny = mapAxis(gy, c.cy, c.yu, c.yd, ctx.m.gain);
    const fx = this.fx.filter(nx, now / 1000);
    const fy = this.fy.filter(ny, now / 1000);

    // Fixation dead-band (1.2% of the screen): tiny eye tremor does not move the cursor.
    if (this.hold && Math.hypot(fx - this.hold.x, fy - this.hold.y) < 0.012) {
      return { cursor: { x: this.hold.x, y: this.hold.y }, actions: [] };
    }
    this.hold = { x: fx, y: fy };
    return { cursor: { x: fx, y: fy }, actions: [] };
  }
}
