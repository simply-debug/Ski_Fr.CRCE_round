// MODE 3 - HANDS (+ voice). MediaPipe HandLandmarker, one hand.
//   Move   : index fingertip position -> cursor (mirrored, calibrated, One Euro smoothed)
//   Click  : pinch thumb + index (click fires when the pinch closes)
//   Double : a second pinch within 450 ms of letting go of the first
//   Scroll : hold up INDEX + MIDDLE fingers only ("peace sign"); move the hand down/up from where
//            you started to scroll down/up (further = faster). Cursor is frozen while scrolling.
// While a pinch is closing the cursor is frozen so the click lands where you were pointing.
import { OneEuro, mapAxis } from '../filters.js';
import { BaseController, smoothingToCutoff } from './baseController.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class HandController extends BaseController {
  constructor() {
    super({
      id: 'hands',
      label: 'HANDS + VOICE',
      needs: 'hand',
      storageKey: 'hfHandCal',
      // Default active area: the middle ~50% of the camera view (mirrored). Calibration is optional.
      defaults: { cx: 0.5, cy: 0.5, xl: 0.25, xr: 0.75, yu: 0.22, yd: 0.78 },
      minSpan: 0.05,
      calRequired: false,
      warnX: ' Left/right reach was small - reach further next time.',
      warnY: ' Up/down reach was small - reach further next time.',
      steps: [
        { key: 'center', text: 'Hand calibration 1/5: point your INDEX finger at the CENTER of the screen' },
        { key: 'left', text: 'Hand calibration 2/5: move your hand to the far LEFT' },
        { key: 'right', text: 'Hand calibration 3/5: move your hand to the far RIGHT' },
        { key: 'up', text: 'Hand calibration 4/5: move your hand UP as high as is comfortable' },
        { key: 'down', text: 'Hand calibration 5/5: move your hand DOWN as low as is comfortable' },
      ],
    });
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.resetGestures();
  }

  resetGestures() {
    this.gesture = 'none'; // 'none' | 'point' | 'pinch' | 'scroll'
    this.pinched = false;
    this.pinchFrames = 0;
    this.lastRelT = 0; // when the previous (single) pinch was released
    this.armDouble = false;
    this.scrollFrames = 0;
    this.scrollOn = false;
    this.scrollAnchor = 0;
    this.ratio = 1;
    this.hand = null;
  }

  reset() {
    super.reset();
    this.fx.reset();
    this.fy.reset();
    this.resetGestures();
  }

  lost() {
    super.lost();
    // Hand left the view: release any gesture so nothing fires or scrolls by accident.
    this.pinched = false;
    this.pinchFrames = 0;
    this.scrollOn = false;
    this.scrollFrames = 0;
    this.gesture = 'none';
    this.hand = null;
  }

  // Finger "extension" = tip is clearly further from the wrist than the middle joint.
  static fingerRatio(lm, tip, pip) {
    const w = lm[0];
    return dist(lm[tip], w) / (dist(lm[pip], w) || 1);
  }

  sense(lm, ctx) {
    const tip = lm[8];
    this.latest = { x: 1 - tip.x, y: tip.y, t: ctx.now }; // mirrored like the preview
    const size = dist(lm[0], lm[9]) || 1; // wrist -> middle knuckle = hand size
    this.ratio = dist(lm[4], lm[8]) / size;
    this.fingers = {
      index: HandController.fingerRatio(lm, 8, 6),
      middle: HandController.fingerRatio(lm, 12, 10),
      ring: HandController.fingerRatio(lm, 16, 14),
      pinky: HandController.fingerRatio(lm, 20, 18),
    };
    this.handY = (lm[8].y + lm[12].y) / 2;
    this.hand = lm;
    return 'ok';
  }

  step(ctx, now) {
    const actions = [];
    if (!this.latest) return { cursor: null, actions };
    const thr = ctx.m.pinch;
    const f = this.fingers;

    // --- scroll gesture: index + middle up, ring + pinky curled (hysteresis + frame debounce)
    const wantScroll = f.index > 1.15 && f.middle > 1.15 && f.ring < 1.05 && f.pinky < 1.05;
    const notScroll = !(f.index > 1.05 && f.middle > 1.05 && f.ring < 1.15 && f.pinky < 1.15);
    if (!this.scrollOn) {
      this.scrollFrames = wantScroll ? this.scrollFrames + 1 : 0;
      if (this.scrollFrames >= 4) {
        this.scrollOn = true;
        this.scrollAnchor = this.handY;
        this.pinched = false;
        this.pinchFrames = 0;
      }
    } else {
      this.scrollFrames = notScroll ? this.scrollFrames + 1 : 0;
      if (this.scrollFrames >= 6) {
        this.scrollOn = false;
        this.scrollFrames = 0;
        this.fx.reset(); // restart smoothing from the current finger position
        this.fy.reset();
      }
    }

    if (this.scrollOn) {
      this.gesture = 'scroll';
      const d = this.handY - this.scrollAnchor;
      const dead = 0.03;
      // Posture already lost (exit debounce still counting): stop scrolling immediately.
      if (!notScroll && Math.abs(d) > dead) {
        const px = Math.sign(d) * (Math.abs(d) - dead) * 120 * ctx.m.scrollSpeed;
        actions.push({ type: 'scrollBy', dy: Math.round(px * 10) / 10 });
      }
      return { cursor: null, actions }; // cursor frozen while scrolling
    }

    // --- pinch (click / double click)
    if (!this.pinched) {
      this.pinchFrames = this.ratio < thr ? this.pinchFrames + 1 : 0;
      if (this.pinchFrames >= 2) {
        this.pinched = true;
        const dbl = this.lastRelT > 0 && now - this.lastRelT < 450;
        actions.push({ type: dbl ? 'dblclick' : 'click' });
        this.lastRelT = 0;
        this.armDouble = !dbl; // a double click cannot start a triple
      }
    } else if (this.ratio > thr * 1.35) {
      this.pinched = false;
      this.pinchFrames = 0;
      if (this.armDouble) this.lastRelT = now;
      this.armDouble = false;
    }

    const closing = this.pinched || this.ratio < thr * 1.25;
    this.gesture = this.pinched ? 'pinch' : 'point';
    if (closing) return { cursor: null, actions }; // freeze the cursor so the click lands on target

    this.fx.minCutoff = this.fy.minCutoff = smoothingToCutoff(ctx.m.smooth);
    const c = this.cal;
    const nx = mapAxis(this.latest.x, c.cx, c.xl, c.xr, ctx.m.gain);
    const ny = mapAxis(this.latest.y, c.cy, c.yu, c.yd, ctx.m.gain);
    return {
      cursor: { x: this.fx.filter(nx, now / 1000), y: this.fy.filter(ny, now / 1000) },
      actions,
    };
  }
}
