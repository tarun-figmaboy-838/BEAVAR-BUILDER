/** Promise-based motion helpers: easing, tweens, waits and cancellable sequence scopes. */

/** CSS-style cubic-bezier(x1, y1, x2, y2) as an easing function (Newton steps on x, then y). */
export function cubicBezier(x1, y1, x2, y2) {
  const bez = (t, a, b) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  const slope = (t, a, b) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return (x) => {
    if (x <= 0 || x >= 1) return Math.min(1, Math.max(0, x));
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const d = slope(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= (bez(t, x1, x2) - x) / d;
    }
    return bez(Math.min(1, Math.max(0, t)), y1, y2);
  };
}

export const easings = Object.freeze({
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inQuad: (t) => t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  mechanical: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t) => {
    const overshoot = 1.70158;
    return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
  },
  outSoftBack: (t) => {
    const overshoot = 0.9;
    return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
  },
  /** A heavy load: a slow start, a steady middle, a long gentle approach (never an abrupt stop). */
  travel: cubicBezier(0.45, 0, 0.18, 1),
});

let reducedMotionQuery = null;
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  reducedMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return reducedMotionQuery.matches;
}

function abortError() {
  const error = new Error('Sequence cancelled');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error) {
  return error?.name === 'AbortError';
}

export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Tween a number from `from` to `to`, calling onUpdate(value, progress) each frame.
 * Resolves on completion; rejects with AbortError when the signal fires.
 */
export function tween({ from = 0, to = 1, duration = 300, ease = easings.outCubic, onUpdate, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const start = performance.now();
    let frame = 0;
    const onAbort = () => {
      cancelAnimationFrame(frame);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const step = (now) => {
      const progress = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      onUpdate?.(from + (to - from) * ease(progress), progress);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }
    };
    frame = requestAnimationFrame(step);
  });
}

/** A scope whose signal cancels every tween/wait started under it; cancel() also re-arms it. */
export function createSequenceScope() {
  let controller = new AbortController();
  return {
    get signal() {
      return controller.signal;
    },
    cancel() {
      controller.abort();
      controller = new AbortController();
    },
  };
}

/** Add a class, wait for its animation to finish (with a timeout guard), then remove it. */
export function playClassAnimation(element, className, fallbackMs = 1200) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener('animationend', onEnd);
      element.classList.remove(className);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target === element) finish();
    };
    element.addEventListener('animationend', onEnd);
    element.classList.remove(className);
    void element.offsetWidth; // restart the animation when the class was already present
    element.classList.add(className);
    setTimeout(finish, fallbackMs);
  });
}
