// MODE 1 - HEAD. This is the original head-tracking pipeline, moved here unchanged:
// nose position relative to the eye corners (in eye distances, roll removed) -> calibrated
// mapping -> One Euro smoothing.
import { OneEuro, mapAxis } from '../filters.js';
import { BaseController, smoothingToCutoff } from './baseController.js';

const NOSE = [1, 2, 4, 5];

export class HeadController extends BaseController {
  constructor() {
    super({
      id: 'head',
      label: 'HEAD',
      needs: 'face',
      storageKey: 'hfCal', // same key the original extension used -> old calibrations keep working
      defaults: { cx: 0, cy: 0, xl: -0.1, xr: 0.1, yu: -0.08, yd: 0.08 },
      minSpan: 0.02,
      calRequired: false, // original behaviour: only a hint, calibrate when you want
      warnX: ' Left/right movement was small - turn further next time.',
      warnY: ' Up/down movement was small - tilt further next time.',
      steps: [
        { key: 'center', text: 'Calibration 1/5: look at the CENTER of the screen and hold still' },
        { key: 'left', text: 'Calibration 2/5: turn your head LEFT' },
        { key: 'right', text: 'Calibration 3/5: turn your head RIGHT' },
        { key: 'up', text: 'Calibration 4/5: tilt your head UP' },
        { key: 'down', text: 'Calibration 5/5: tilt your head DOWN' },
      ],
    });
    this.fx = new OneEuro();
    this.fy = new OneEuro();
  }

  reset() {
    super.reset();
    this.fx.reset();
    this.fy.reset();
  }

  static offset(lm, W, H) {
    const px = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
    const a = px(33);
    const b = px(263);
    const c = px(133);
    const d = px(362);
    const eye = { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4 };
    const eyeDist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = 0;
    let ny = 0;
    for (const i of NOSE) {
      const p = px(i);
      nx += p.x;
      ny += p.y;
    }
    nx /= NOSE.length;
    ny /= NOSE.length;
    const roll = Math.atan2(b.y - a.y, b.x - a.x);
    const dx = nx - eye.x;
    const dy = ny - eye.y;
    const cos = Math.cos(-roll);
    const sin = Math.sin(-roll);
    return { x: -((dx * cos - dy * sin) / eyeDist), y: (dx * sin + dy * cos) / eyeDist };
  }

  sense(res, ctx) {
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    if (!lm) return 'noface';
    const off = HeadController.offset(lm, ctx.W, ctx.H);
    this.latest = { ...off, t: ctx.now };
    return 'ok';
  }

  step(ctx, now) {
    if (!this.latest || ctx.blinking) return { cursor: null, actions: [] };
    this.fx.minCutoff = this.fy.minCutoff = smoothingToCutoff(ctx.m.smooth);
    const c = this.cal;
    const nx = mapAxis(this.latest.x, c.cx, c.xl, c.xr, ctx.m.gain);
    const ny = mapAxis(this.latest.y, c.cy, c.yu, c.yd, ctx.m.gain);
    return {
      cursor: { x: this.fx.filter(nx, now / 1000), y: this.fy.filter(ny, now / 1000) },
      actions: [],
    };
  }
}