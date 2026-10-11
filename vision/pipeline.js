// Shared MediaPipe vision pipeline.
// ONE camera stream (owned by tracker.js) feeds whichever landmarker the active mode needs:
//   'face' -> FaceLandmarker (head + eye/iris modes)      'hand' -> HandLandmarker (hand mode)
// Only one landmarker is kept alive at a time; the unused one is closed to free WASM/GPU memory.
let bundle = null;
let fileset = null;

async function loadBundle() {
  if (!bundle) bundle = await import('../lib/vision_bundle.mjs');
  if (!fileset) fileset = await bundle.FilesetResolver.forVisionTasks('./lib/wasm');
  return bundle;
}

export class VisionPipeline {
  constructor() {
    this.inst = { face: null, hand: null };
    this.pending = { face: null, hand: null };
  }

  has(kind) {
    return !!this.inst[kind];
  }

  async ensure(kind) {
    if (this.inst[kind]) return this.inst[kind];
    if (this.pending[kind]) return this.pending[kind];
    this.pending[kind] = this._create(kind)
      .then((lm) => {
        this.inst[kind] = lm;
        return lm;
      })
      .finally(() => {
        this.pending[kind] = null;
      });
    return this.pending[kind];
  }

  async _create(kind) {
    const vision = await loadBundle();
    const make = (delegate) =>
      kind === 'face'
        ? vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: './lib/face_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: false,
          })
        : vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: './lib/hand_landmarker.task', delegate },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
    try {
      return await make('GPU');
    } catch (_) {
      return await make('CPU');
    }
  }

  release(kind) {
    const lm = this.inst[kind];
    this.inst[kind] = null;
    if (lm && typeof lm.close === 'function') {
      try {
        lm.close();
      } catch (_) {}
    }
  }

  releaseAll() {
    this.release('face');
    this.release('hand');
  }

  detect(kind, video, nowMs) {
    return this.inst[kind].detectForVideo(video, nowMs);
  }
}
