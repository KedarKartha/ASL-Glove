// Sign recognition. Every sign is a movement: it starts from the rest pose (open hand), moves,
// and ends by holding still. Movements are matched to recorded examples with Dynamic Time
// Warping (DTW) plus an end-handshape term, and each sign has its own acceptance threshold
// learned from how consistently its examples were recorded.

// --- Tuning knobs -------------------------------------------------------------
// The glove sends ~20 packets/s, so 1 frame ≈ 50 ms.
export const GYRO_MOVING = 60;        // deg/s of rotation that counts as "moving"
export const ACCEL_MOVING = 0.2;      // g of deviation from gravity that counts as "moving"
export const FLEX_MOVING = 0.12;      // change in a normalized flex value over 2 frames that counts as "moving"
export const REST_RADIUS = 0.35;      // how close the fingers must be to the calibrated open hand
export const RETURN_RADIUS = 0.35;    // how close a movement's start must be to the last sign's end to count as a return
const STILL_FRAMES_TO_END = 6;        // ~300 ms still -> movement finished (the "hold")
const PREROLL_FRAMES = 3;             // frames kept from just before motion was detected
const MIN_FRAMES = 6;                 // under ~0.3 s of actual motion is a twitch, not a sign
const MAX_FRAMES = 80;                // force-end after ~4 s
const GYRO_SCALE = 200;               // deg/s -> roughly the same range as the other features
const END_POSE_WEIGHT = 1;            // how much the final handshape counts on top of the DTW cost

// How much each feature counts when comparing the motion (DTW). Tilt and rotation are weighted up
// so how the hand moves and turns dominates; small finger variations count less. The final
// handshape (END_POSE_WEIGHT) is still compared at full weight, so handshape-only signs stay distinct.
export const FLEX_WEIGHT = 0.5;
export const ACCEL_WEIGHT = 2;
export const GYRO_WEIGHT = 2;
const MOTION_WEIGHTS = [...Array(5).fill(FLEX_WEIGHT), ...Array(3).fill(ACCEL_WEIGHT), ...Array(3).fill(GYRO_WEIGHT)];

// Per-sign thresholds: the score covering 95% of a sign's own examples (each compared with its
// closest sibling), times a margin, clamped to a sane range. Signs with one example use the default.
const THRESHOLD_PERCENTILE = 0.95;
// The margin and floor allow for reps recorded back to back being more alike than
// attempts made later (different speed, arm position); "teaching" rejected attempts refines this.
export const THRESHOLD_MARGIN = 1.5;
const MIN_THRESHOLD = 0.2;
const MAX_THRESHOLD = 1;              // cap, so a sign recorded inconsistently can't swallow random movements
export const DEFAULT_THRESHOLD = 0.5;
const AMBIGUITY_RATIO = 0.9;          // reject if another sign scores within 90% of the best one

/** Normalize a raw 11-value packet into the 8 pose features: 5 flex + 3 accel. */
export const normalize = (values) => [
  (values[0] / 1023) * 2,
  (values[1] / 1023) * 2,
  (values[2] / 1023) * 2 * 10, // F3 reads ~10x low in hardware (A2), boost to match the others
  (values[3] / 1023) * 2,
  (values[4] / 1023) * 2,
  values[5] / 2, // accel (g)
  values[6] / 2,
  values[7] / 2,
];

/** Feature vector for one frame: the 8 pose features + 3 gyro rates. */
export const frameFeatures = (values, gyroOffsets) => [
  ...normalize(values),
  (values[8] - gyroOffsets.x) / GYRO_SCALE,
  (values[9] - gyroOffsets.y) / GYRO_SCALE,
  (values[10] - gyroOffsets.z) / GYRO_SCALE,
];

/**
 * True when the hand is rotating, accelerating beyond gravity (accel is in g), or bending
 * its fingers. `pastFrame` is the frame from ~2 packets ago, used for finger speed.
 */
export const isMovingNow = (values, gyroOffsets, frame, pastFrame) => {
  const gyroMag = Math.hypot(values[8] - gyroOffsets.x, values[9] - gyroOffsets.y, values[10] - gyroOffsets.z);
  const accelDev = Math.abs(Math.hypot(values[5], values[6], values[7]) - 1);
  let flexDelta = 0;
  if (pastFrame) for (let i = 0; i < 5; i++) flexDelta = Math.max(flexDelta, Math.abs(frame[i] - pastFrame[i]));
  return gyroMag > GYRO_MOVING || accelDev > ACCEL_MOVING || flexDelta > FLEX_MOVING;
};

const weightedSqDist = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += MOTION_WEIGHTS[i] * (a[i] - b[i]) ** 2;
  return d;
};

const meanFrame = (frames) => frames[0].map((_, d) => frames.reduce((sum, f) => sum + f[d], 0) / frames.length);

const rangeDist = (a, b, from, to) => {
  let d = 0;
  for (let i = from; i < to; i++) d += (a[i] - b[i]) ** 2;
  return Math.sqrt(d);
};

/** True when a pose's fingers match the open hand captured during calibration (any orientation). */
export const isRestPose = (pose, restPose) => !!restPose && rangeDist(pose, restPose, 0, 5) <= REST_RADIUS;

/**
 * True when a movement starts where `previous` ended (same handshape and tilt), i.e. it looks
 * like the return to rest after that sign rather than a new sign.
 */
export const startsWhereEnded = (movement, previous) => rangeDist(movement.startPose, previous.endPose, 0, 8) <= RETURN_RADIUS;

const REST_TRACKING = 0.1; // per still frame at rest: how fast the rest pose follows sensor drift

/** Nudges the rest pose toward the current frame while the hand is still at rest, to follow drift. */
export const trackRest = (restPose, frame) => (
  isRestPose(frame, restPose)
    ? restPose.map((v, i) => v + (frame[i] - v) * REST_TRACKING)
    : restPose
);

/**
 * Splits the frame stream into movements. push() returns a finished movement
 * { frames, startPose, endPose } once it ends, otherwise null.
 * - startPose: average of the frames just before motion began
 * - endPose:   average of the held frames at the end (the final handshape)
 */
export const createSegmenter = () => {
  let moving = false;
  let frames = [];
  let preroll = [];
  let stillCount = 0;
  let prerollCount = 0;
  let startPose = null;

  return {
    get isMoving() { return moving; },

    push(frame, movingNow) {
      if (!moving) {
        preroll.push(frame);
        if (preroll.length > PREROLL_FRAMES) preroll.shift();
        if (movingNow) {
          moving = true;
          frames = [...preroll];
          prerollCount = preroll.length;
          startPose = meanFrame(preroll);
          stillCount = 0;
        }
        return null;
      }

      frames.push(frame);
      stillCount = movingNow ? 0 : stillCount + 1;
      if (stillCount < STILL_FRAMES_TO_END && frames.length < MAX_FRAMES) return null;

      // Movement finished: the trailing still frames are the held end pose; keep one in the curve
      const held = stillCount > 0 ? frames.slice(frames.length - stillCount) : frames.slice(-1);
      const sequence = frames.slice(0, frames.length - Math.max(stillCount - 1, 0));
      const movingFrames = frames.length - prerollCount - stillCount;
      const result = { frames: sequence, startPose, endPose: meanFrame(held) };
      moving = false;
      frames = [];
      preroll = [];
      return movingFrames >= MIN_FRAMES ? result : null;
    },

    reset() {
      moving = false;
      frames = [];
      preroll = [];
      stillCount = 0;
      startPose = null;
    },
  };
};

/**
 * DTW cost between two frame sequences, averaged over the warping path so long
 * and short gestures are comparable, with each feature weighted by MOTION_WEIGHTS.
 * Uses a Sakoe-Chiba band to keep the warp sane.
 */
export const dtwDistance = (a, b) => {
  const n = a.length;
  const m = b.length;
  if (!n || !m || Math.max(n, m) > 2 * Math.min(n, m)) return Infinity;

  const band = Math.max(Math.ceil(Math.max(n, m) * 0.25), Math.abs(n - m));
  let prev = new Float64Array(m + 1).fill(Infinity);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    const cur = new Float64Array(m + 1).fill(Infinity);
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      cur[j] = weightedSqDist(a[i - 1], b[j - 1]) + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[m] / (n + m);
};

/**
 * Same alignment as dtwDistance, but returns how much each feature contributed to the cost
 * along the best warping path. Slower (keeps the whole matrix), so only used for explanations.
 */
const dtwFeatureCosts = (a, b) => {
  const n = a.length;
  const m = b.length;
  const band = Math.max(Math.ceil(Math.max(n, m) * 0.25), Math.abs(n - m));
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      D[i][j] = weightedSqDist(a[i - 1], b[j - 1]) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }
  const costs = new Array(a[0].length).fill(0);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    a[i - 1].forEach((v, d) => { costs[d] += MOTION_WEIGHTS[d] * (v - b[j - 1][d]) ** 2; });
    const diag = D[i - 1][j - 1];
    const up = D[i - 1][j];
    const left = D[i][j - 1];
    if (diag <= up && diag <= left) { i--; j--; } else if (up <= left) i--; else j--;
  }
  return costs.map((c) => c / (n + m));
};

export const FEATURE_NAMES = [
  'Flex 1', 'Flex 2', 'Flex 3', 'Flex 4', 'Flex 5', 'Accel X', 'Accel Y', 'Accel Z', 'Gyro X', 'Gyro Y', 'Gyro Z',
];

// Flex sensors drift over time (warming up, the glove shifting on the hand), which offsets every
// reading. Every sign starts from the open hand, so flex is compared relative to the movement's
// own start pose: a drifted baseline shifts the start by the same amount and cancels out.
const relativeCache = new WeakMap();
const toRelative = (movement) => {
  let rel = relativeCache.get(movement);
  if (!rel) {
    const shift = (f) => f.map((v, i) => (i < 5 ? v - movement.startPose[i] : v));
    rel = { frames: movement.frames.map(shift), endPose: shift(movement.endPose) };
    relativeCache.set(movement, rel);
  }
  return rel;
};

/**
 * How different a movement is from a recorded example: { total, motion, endShape, endDiffs }
 * (lower = more similar). `motion` is the DTW cost over the movement, `endShape` the difference
 * in final handshape, and `endDiffs` that difference per feature. The whole movement is compared
 * with the whole example, start to end.
 */
export const scoreParts = (movement, example) => {
  const a = toRelative(movement);
  const b = toRelative(example);
  const aligned = [a.frames, b.frames];
  const motion = dtwDistance(...aligned);
  if (!Number.isFinite(motion)) return { total: Infinity };
  const endDiffs = a.endPose.slice(0, 8).map((v, i) => END_POSE_WEIGHT * (v - b.endPose[i]) ** 2);
  const endShape = endDiffs.reduce((sum, d) => sum + d, 0);
  return { total: motion + endShape, motion, endShape, endDiffs, aligned };
};

export const movementScore = (movement, example) => scoreParts(movement, example).total;

// Per-sign strictness, chosen on the Train tab: scales the learned threshold for one sign
export const STRICTNESS_LEVELS = [
  { id: 'loose', label: 'Loose', factor: 1.5 },
  { id: 'normal', label: 'Normal', factor: 1 },
  { id: 'strict', label: 'Strict', factor: 0.6 },
  { id: 'very-strict', label: 'Very strict', factor: 0.35 },
];
const strictnessFactor = (id) => STRICTNESS_LEVELS.find((l) => l.id === id)?.factor ?? 1;

/**
 * Groups examples by sign and learns each sign's threshold from its own examples, then scales
 * it by that sign's strictness (`strictness` maps label -> level id; missing = normal).
 */
export const buildSignModel = (examples, strictness = {}) => {
  const byLabel = new Map();
  for (const e of examples) {
    if (!byLabel.has(e.label)) byLabel.set(e.label, []);
    byLabel.get(e.label).push(e);
  }

  const signs = new Map();
  for (const [label, list] of byLabel) {
    let threshold = DEFAULT_THRESHOLD;
    if (list.length > 1) {
      // Leave-one-out: how far is each example from its closest sibling?
      const nearest = list.map((e, i) => Math.min(
        ...list.map((other, j) => (i === j ? Infinity : Math.min(movementScore(e, other), movementScore(other, e))))
      )).filter(Number.isFinite).sort((a, b) => a - b);
      if (nearest.length) {
        const typical = nearest[Math.min(nearest.length - 1, Math.floor(nearest.length * THRESHOLD_PERCENTILE))];
        threshold = Math.min(Math.max(typical * THRESHOLD_MARGIN, MIN_THRESHOLD), MAX_THRESHOLD);
      }
    }
    signs.set(label, {
      examples: list,
      learnedThreshold: threshold,
      strictness: strictness[label] || 'normal',
      threshold: threshold * strictnessFactor(strictness[label]),
      speech: list[list.length - 1].speech || label,
    });
  }
  return { signs };
};

/**
 * Best-matching sign for a movement:
 * { label, speech, score, threshold, matched, ambiguous, breakdown }, or null when nothing is
 * comparable yet. A match needs a score under that sign's threshold and clearly better than any
 * other sign. `breakdown` splits the score into motion vs. end handshape and names the feature
 * whose end value differed most, to show why a sign was rejected.
 */
export const classifyMovement = (movement, model) => {
  const best = [];
  for (const [label, sign] of model.signs) {
    let parts = { total: Infinity };
    for (const e of sign.examples) {
      const p = scoreParts(movement, e);
      if (p.total < parts.total) parts = p;
    }
    if (Number.isFinite(parts.total)) best.push({ label, sign, score: parts.total, parts });
  }
  if (!best.length) return null;
  best.sort((a, b) => a.score - b.score);

  const [top, runnerUp] = best;
  const ambiguous = !!runnerUp && top.score >= runnerUp.score * AMBIGUITY_RATIO;
  const worst = (costs) => FEATURE_NAMES[costs.indexOf(Math.max(...costs))];
  return {
    label: top.label,
    speech: top.sign.speech,
    score: top.score,
    threshold: top.sign.threshold,
    ambiguous,
    matched: top.score < top.sign.threshold && !ambiguous,
    breakdown: {
      motion: top.parts.motion,
      endShape: top.parts.endShape,
      worstMotionFeature: worst(dtwFeatureCosts(...top.parts.aligned)),
      worstEndFeature: worst(top.parts.endDiffs),
    },
  };
};
