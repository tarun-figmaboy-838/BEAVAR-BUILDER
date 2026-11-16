/**
 * Runs the Triangle Workshop from its content map, one screen at a time, on one cancellable timeline.
 *
 * Every screen moves through the same states (ENTERING → NARRATING / DEMONSTRATING → WAITING_FOR_INPUT /
 * INTERACTING → CHECKING → FEEDBACK → REINFORCING → TRANSITIONING); the card's data-state gates pointer
 * input, so only one state ever accepts it and animations never fight a tap. There are no NEXT buttons:
 * a teaching screen moves on by itself once its line has been read, an interaction moves on at success,
 * and the deck's own CHECK / CONTINUE buttons are the only ones the learner presses.
 */
import { LEARNING_SCREENS, LEARNING_COPY } from './learning-content.js';
import { layoutFromSpec, goalMet } from './triangle-model.js';
import { BOARD } from './workshop-board.js';
import {
  createPillButton, createBadge, createLens, createGreatJob,
  createOptionCard, createMultiGrid, createSortBoard, createSortResult, createDualCard, createSummaryView,
  createGhostHand } from './workshop-widgets.js';
import { createSequenceScope, wait, isAbortError, prefersReducedMotion } from '../core/motion.js';

const FRAME = Object.freeze({ center: { cx: 780, cy: 300 }, stack: { cx: 780, cy: 250 }, dual: { cx: 780, cy: 160 } });
const DRAG_BOUNDS = Object.freeze({ left: 80, top: 40, right: BOARD.canvas.width - 80, bottom: BOARD.canvas.height - 40 });
const SIDE_ORDER = [0, 2, 1];              // left, right, bottom: the deck's reading order (5 cm, 4 cm, 6 cm) and a clockwise walk
const CORNER_ORDER = [0, 2, 1];            // top, right, left: clockwise
/** The beaver appears only where he does something: measuring the shape, and explaining the summary cards. */
const GUIDE_SCREENS = new Set(['measureSides', 'measureAngles', 'summary']);
/** The summary's big card (surface px) and how far his head rises above it. */
const SUMMARY_BIG = Object.freeze({ left: 545, top: 110, width: 470 });
const SUMMARY_BOTH = Object.freeze({ left: 560, top: 92, width: 440 });
const PEEK_HEAD = 184;                     // the peek sprite: hat top this far above the card's edge; his hands and the cut-off vest tuck behind the edge

function abortError() {
  const error = new Error('Sequence cancelled');
  error.name = 'AbortError';
  return error;
}
function withSignal(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => { signal.removeEventListener('abort', onAbort); resolve(value); }, reject);
  });
}

export function createLearningFlow({ board, canvas, guide, audio, fx, gameState, qa = false, manual: manualAtStart = false }) {
  let manual = manualAtStart;                // review aid: no auto-advance, every screen waits for Next (toggled live by the debug panel)
  const scope = createSequenceScope();
  let index = 0;
  let stopped = false;
  let pending = null;                        // a debug jump: the screen to run next, set while the current one is cancelled
  let resolveNext = null;                    // manual mode: the Next tap the current screen is waiting for
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(); };
  let current = null;
  let state = 'ENTERING';
  let live = {};                             // widgets of the running screen, for the QA hooks
  const reduced = () => prefersReducedMotion();
  const signal = () => scope.signal;
  const pause = (ms) => wait(reduced() ? 0 : ms, scope.signal);

  function setState(name) {
    state = name;
    board.setState(name);
    gameState.update({ learningState: name });
  }

  /**
   * The ghost hand: after `firstMs` without a touch it shows the gesture once, then again every few seconds
   * while the learner idles; any touch on the card puts it away for a while. Returns a stop function.
   */
  function ghostGuide(show, { firstMs = 1400, everyMs = 5200, afterTouchMs = 7000 } = {}) {
    stopGhost();
    const hand = createGhostHand({ hostEl: board.overlayEl });
    let timer = 0;
    const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(() => { if (state === 'INTERACTING' || state === 'WAITING_FOR_INPUT') show(hand); schedule(everyMs); }, ms); };
    const onTouch = () => { hand.stop(); schedule(afterTouchMs); };
    board.root.addEventListener('pointerdown', onTouch, true);
    schedule(firstMs);
    live.ghostStop = () => { clearTimeout(timer); board.root.removeEventListener('pointerdown', onTouch, true); hand.remove(); };
    return live.ghostStop;
  }
  function stopGhost() { live.ghostStop?.(); live.ghostStop = null; }
  /** An element's centre in overlay px (the card is scaled on the stage). */
  function overlayPoint(el) {
    const o = board.overlayEl.getBoundingClientRect();
    const k = o.width / board.overlayEl.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    return [(r.left + r.width / 2 - o.left) / k, (r.top + r.height / 2 - o.top) / k];
  }
  const pointAt = (selector) => (hand) => hand.point([...board.overlayEl.querySelectorAll(selector)].filter((el) => !el.disabled).map(overlayPoint));

  async function clearOverlay() {
    stopGhost();
    const children = [...board.overlayEl.children];
    if (!children.length) return;
    if (!reduced()) {
      children.forEach((child) => child.classList.add('is-leaving'));
      await pause(420).catch(() => {});
    }
    children.forEach((child) => child.remove());
    live = {};
  }

  /** The beaver steps in for the screens that are his to present, and away for the learner's own work. */
  async function placeGuide(screen, { present = GUIDE_SCREENS.has(screen.kind) } = {}) {
    board.setGuidePresent(present);
    board.setGuidePeeking(false);
    guide.setInstant(false);
    guide.setRegistration('feet');
    if (present) { await guide.home(); await guide.enter(); } else await guide.leave();
  }

  /* ---------- The triangle between screens: morph, keep, or place ---------- */
  function frameFor(screen) {
    return FRAME[screen.layout] ?? FRAME.center;
  }
  function classificationOf(requires) {
    const m = canvas.measured;
    return ['scalene', 'isosceles', 'equilateral'].includes(requires) ? m.bySides : m.byAngles;
  }
  /**
   * How big this screen's triangle can be: as large as the room its layout leaves (the narration box above,
   * the name row / answers below, the lengths outside), between 1x and 1.45x the base scale.
   */
  const ROOM = Object.freeze({ center: { w: 860, h: 410 }, stack: { w: 860, h: 380 }, dual: { w: 900, h: 250 } });
  function fitZoom(screen) {
    const room = ROOM[screen.layout] ?? ROOM.center;
    const unit = layoutFromSpec(screen.triangle, { cx: 0, cy: 0, pxPerCm: 1 });
    const w = Math.max(...unit.map((p) => p[0])) - Math.min(...unit.map((p) => p[0]));
    const h = Math.max(...unit.map((p) => p[1])) - Math.min(...unit.map((p) => p[1]));
    const base = canvas.basePxPerCm;
    return Math.max(1, Math.min(1.45, room.w / (w * base), room.h / (h * base)));
  }
  async function prepareTriangle(screen) {
    canvas.clearTools();
    canvas.clearTones();
    canvas.clearEmphasis();
    canvas.clearChips();
    canvas.clearHint();
    canvas.setDrag({ enabled: false, goal: null });
    if (!screen.triangle) {
      canvas.setVisible({ sides: false, vertices: false }, { merge: false });
      return;
    }
    const frame = frameFor(screen);
    const shown = canvas.visible.sides;
    const keepable = screen.keep && shown && (!screen.requires || classificationOf(screen.requires) === screen.requires);
    if (!keepable) canvas.setZoom(screen.zoom ?? fitZoom(screen));        // a kept shape keeps its scale, so its lengths stay true
    const target = layoutFromSpec(screen.triangle, { ...frame, pxPerCm: canvas.pxPerCm });
    if (screen.kind === 'draw') {
      // A screen that draws the triangle starts from an empty card: nothing is shown before the pen moves.
      canvas.setVisible({ sides: false, vertices: false }, { merge: false, instant: true });
      canvas.setPoints(target);
      return;
    }
    if (keepable) {
      // The learner's own shape stays; it only slides over if this screen frames it differently.
      const points = canvas.points;
      const xs = points.map((p) => p[0]);
      const shift = frame.cx - (Math.min(...xs) + Math.max(...xs)) / 2;
      if (Math.abs(shift) > 1) await canvas.morphTo(points.map(([x, y]) => [x + shift, y]), { duration: 600, signal: signal() });
    } else if (shown) {
      await canvas.morphTo(target, { duration: 1000, signal: signal() });
    } else {
      canvas.setPoints(target);
    }
    canvas.setVisible({ sides: true, vertices: true, ...(screen.show ?? {}) }, { merge: false });
  }

  /** What lights up on the summary card as each word of its rule is said. */
  function summaryCues(item, view) {
    const words = item.text.toLowerCase();
    const cues = [{ phrase: item.name.split(' ')[0], run: () => view.pulseName() }];
    if (/\bsides\b/.test(words)) cues.push({ phrase: 'sides', run: () => view.lightSides() });
    if (/\bdifferent\b/.test(words)) cues.push({ phrase: 'different', run: () => view.pulseLengths() });
    if (/\bequal\b/.test(words)) cues.push({ phrase: 'equal', run: () => view.pulseEqual() });
    if (/\bangles\b/.test(words)) cues.push({ phrase: 'angles', run: () => view.pulseCorners() });
    else if (/\bangle\b/.test(words)) cues.push({ phrase: 'angle', run: () => view.pulseCorners() });
    if (words.includes('90°')) cues.push({ phrase: '90°', run: () => view.pulseSpecial() });
    return cues;
  }

  /* ---------- Shared beats ---------- */
  /** Speaks a line; `cues` ([{ phrase, run }]) fire the geometry's moves on the spoken word. */
  async function narrate(text, options = {}) {
    setState('NARRATING');
    const line = board.narrate(text, options);
    await withSignal(line.finished, signal());
  }
  /** A line the beaver says himself, in his speech bubble beside him (not the narration box). */
  async function speakAsBeaver(text, focus = null) {
    setState('NARRATING');
    const line = board.speak(text, { focus });
    await withSignal(line.finished, signal());
  }
  const fire = (fn) => () => { fn().catch(() => {}); };
  /** Reading time after a line, then the screen moves on by itself (no button). In manual (debug) mode the
   *  screen waits for the Next tap instead, at the end of every screen. */
  async function settle(text = '') {
    setState('REINFORCING');
    if (manual) return;
    await pause(1900 + Math.min(3400, String(text).length * 40));
    setState('TRANSITIONING');
  }
  async function manualGate() {
    if (!manual) return;
    setState('WAITING_FOR_INPUT');
    notify();
    await withSignal(new Promise((resolve) => { resolveNext = resolve; }), signal());
    resolveNext = null;
    setState('TRANSITIONING');
  }
  function triangleBox() {
    const points = canvas.points;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2 };
  }
  function badgeUnderTriangle(text, tone) {
    const box = triangleBox();
    audio.play('badge');
    return createBadge({ overlayEl: board.overlayEl, text, tone, at: { left: Math.round(box.cx), top: Math.round(Math.min(box.bottom + 66, BOARD.canvas.height - 62)), center: true } });
  }
  /** A centred row under the triangle that chips join one after another (placed from the shape, not fixed). */
  function rowUnderTriangle() {
    const box = triangleBox();
    const row = document.createElement('div');
    row.className = 'ws-badge-row';
    row.style.top = `${Math.round(Math.min(box.bottom + 66, BOARD.canvas.height - 70))}px`;
    board.overlayEl.appendChild(row);
    return { element: row, add: (widget) => { row.appendChild(widget.element); return widget; }, remove: () => row.remove() };
  }
  async function pulseLabelsInOrder(indices, gapMs = 640) {
    for (const i of indices) {
      canvas.pulseSide(i);
      canvas.pulseSideLabel(i);
      audio.play('bloop');
      await pause(gapMs);
    }
  }
  async function pulseAnglesInOrder(indices, gapMs = 640) {
    for (const i of indices) {
      canvas.pulseAngle(i);
      audio.play('bloop');
      await pause(gapMs);
    }
  }
  function equalSideIndices() {
    return canvas.measured.equalSides.map((equal, i) => (equal ? i : -1)).filter((i) => i >= 0);
  }
  /** Points the learner back at the measurements the answer rests on (also the only hint after a wrong try). */
  async function reinforce(kind) {
    setState('REINFORCING');
    const m = canvas.measured;
    if (kind === 'sides') await pulseLabelsInOrder(SIDE_ORDER);
    else if (kind === 'angles') await pulseAnglesInOrder([0, 1, 2]);
    else if (kind === 'equalSides') { canvas.emphasiseSides(equalSideIndices()); await pulseLabelsInOrder(equalSideIndices()); }
    else if (kind === 'rightAngle') { canvas.emphasiseAngles([m.rightAt]); await pulseAnglesInOrder([m.rightAt]); }
    else if (kind === 'obtuseAngle') { canvas.emphasiseAngles([m.obtuseAt]); await pulseAnglesInOrder([m.obtuseAt]); }
    await pause(200);
    canvas.clearEmphasis();
  }
  const FOOT = BOARD.canvas.height - 96;      // CHECK and CONTINUE always sit at the foot of the card
  async function continueButton(top = FOOT) {
    await pause(300);
    setState('WAITING_FOR_INPUT');
    let resolvePressed;
    const pressed = new Promise((resolve) => { resolvePressed = resolve; });
    const button = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.continue, tone: 'green', at: { center: true, top }, onPress: () => { audio.play('uiTap'); resolvePressed(); } });
    live.continue = button;
    await withSignal(pressed, signal());
    button.pressOnce();
    setState('TRANSITIONING');
    await button.remove();
    live.continue = null;
  }
  /** Walks the beaver along a side as it is measured, clockwise round the shape, the tape running with him. */
  async function measureSideWithGuide(i) {
    // Corners run A (top), B (left), C (right): side i joins i and i + 1, so walking it backwards goes clockwise.
    const start = canvas.points[(i + 1) % 3];
    const end = canvas.points[i];
    const d = [end[0] - start[0], end[1] - start[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    const dir = [d[0] / l, d[1] / l];
    const flip = dir[0] < 0;
    const rotate = (flip ? Math.atan2(dir[1], -dir[0]) : Math.atan2(dir[1], dir[0])) * (180 / Math.PI);
    const n = canvas.outwardNormal(i);
    const onSide = (p) => ({ x: BOARD.surface.left + p[0] + n[0] * 4, y: BOARD.surface.top + p[1] + n[1] * 4, scale: 0.42, flip, rotate });
    guide.setInstant(false);
    guide.setPose('walk');
    await guide.moveTo(onSide(start));
    guide.setInstant(true);
    const hand = () => { const h = guide.handPoint(); return [h.x - BOARD.surface.left, h.y - BOARD.surface.top]; };
    await canvas.measureSide(i, { signal: signal(), fromEnd: 1, hand, onProgress: (t, at) => guide.placeAt(onSide(at)) });
    guide.setPose('walkStop');
    await pause(600);
  }

  /* ---------- Screen kinds ---------- */
  const runners = {
    async draw(screen) {
      setState('DEMONSTRATING');
      await canvas.drawIn({ signal: signal() });
      await narrate(screen.narration, { focus: screen.focus, cues: [{ phrase: 'triangle', run: () => { canvas.pulseAll(); canvas.sparkleVertices(); } }] });
      await settle(screen.narration);
    },

    async count(screen) {
      setState('DEMONSTRATING');
      let counting = Promise.resolve();
      const countSides = async () => {
        for (const i of SIDE_ORDER) {
          canvas.emphasiseSides([i]);
          canvas.pulseSide(i);
          audio.play('bloop');
          await canvas.showCountChip(i, String(SIDE_ORDER.indexOf(i) + 1));
          await pause(620);
        }
      };
      const spoken = board.narrate(screen.narration, { focus: screen.focus, cues: [
        { phrase: 'closed', run: () => { canvas.emphasiseSides([0, 1, 2]); canvas.pulseAll(); audio.play('clank', { variant: 2 }); setTimeout(() => canvas.clearEmphasis(), 500); } },
        { phrase: '3', run: () => { counting = countSides(); } },
        { phrase: 'triangle', run: () => { canvas.pulseAll(); canvas.sparkleVertices(); } },
      ] });
      await withSignal(spoken.finished, signal());
      await withSignal(counting, signal());
      await pause(400);
      canvas.clearEmphasis();
      await settle(screen.narration);
      canvas.clearChips();
    },

    async morph(screen) {
      setState('DEMONSTRATING');
      const frame = frameFor(screen);
      let morphing = Promise.resolve();
      const morphAll = async () => {
        for (const shape of screen.shapes) {
          await canvas.morphTo(layoutFromSpec(shape, { ...frame, pxPerCm: canvas.pxPerCm }), { duration: 1300, signal: signal() });
          await pause(700);
        }
      };
      const spoken = board.narrate(screen.narration, { cues: [{ phrase: 'different', run: () => { morphing = morphAll(); } }] });
      await withSignal(spoken.finished, signal());
      await withSignal(morphing, signal());
      await settle(screen.narration);
    },

    async measureSides(screen) {
      setState('DEMONSTRATING');
      await speakAsBeaver(screen.narration, screen.focus);          // he says it in his own bubble, then gets to work
      for (const i of SIDE_ORDER) await measureSideWithGuide(i);
      guide.setInstant(false);
      guide.setPose('walk');
      await guide.home();
      guide.idle();
      await settle(screen.narration);
    },

    async measureAngles(screen) {
      setState('DEMONSTRATING');
      // He says it first; then, corner by corner (clockwise), he walks up, sets the protractor he holds onto
      // the corner (its flat edge along a side, its round side into the angle), the arc sweeps while the
      // value counts up, and he lifts it off again.
      await speakAsBeaver(screen.narration, screen.focus);
      const centre = canvas.centroid();
      const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
      for (const i of CORNER_ORDER) {
        const v = canvas.points[i];
        const sides = [canvas.points[(i + 1) % 3], canvas.points[(i + 2) % 3]].map((q) => unit([q[0] - v[0], q[1] - v[1]]));
        const inward = unit([centre[0] - v[0], centre[1] - v[1]]);
        const pose = guide.pickToolPose(sides);
        const at = (back, rotate) => ({ x: BOARD.surface.left + v[0] - inward[0] * back, y: BOARD.surface.top + v[1] - inward[1] * back, scale: 0.5, flip: pose.flip, rotate: pose.flip ? -rotate : rotate });
        guide.setInstant(false);
        guide.setRegistration('feet');
        guide.setPose('walk');
        await guide.moveTo({ x: BOARD.surface.left + v[0] - inward[0] * 70, y: BOARD.surface.top + v[1] - inward[1] * 70 + 40, scale: 0.5, flip: pose.flip, rotate: 0 });
        guide.setInstant(true);
        guide.setRegistration('tool');
        guide.setPose(pose.frameName);
        guide.placeAt(at(34, 0));                    // the protractor just off the corner...
        guide.setInstant(false);
        await pause(40);
        guide.placeAt(at(0, pose.rotate));           // ...then set onto it, turned to lie along the side
        await pause(560);
        await canvas.measureAngle(i, { signal: signal() });
        await pause(500);
        guide.placeAt(at(34, 0));                    // and lifted off
        await pause(460);
        guide.setInstant(true);
        guide.setRegistration('feet');
        guide.setPose('walkStop');
        guide.placeAt({ x: BOARD.surface.left + v[0] - inward[0] * 70, y: BOARD.surface.top + v[1] - inward[1] * 70 + 40, scale: 0.5, flip: pose.flip, rotate: 0 });
        guide.setInstant(false);
      }
      guide.setPose('walk');
      await guide.home();
      guide.idle();
      await settle(screen.narration);
    },

    async compare90(screen) {
      setState('DEMONSTRATING');
      const eachAngle = async () => { for (const i of CORNER_ORDER) { canvas.emphasiseAngles([i]); canvas.pulseAngle(i); audio.play('bloop'); await pause(760); } };
      const spoken = board.narrate(screen.narration, { focus: screen.focus, cues: [
        { phrase: 'All three angles', run: fire(eachAngle) },
        { phrase: 'acute', run: () => { canvas.emphasiseAngles([0, 1, 2]); canvas.pulseAngle(0); canvas.pulseAngle(1); canvas.pulseAngle(2); audio.play('badge'); } },
      ] });
      await withSignal(spoken.finished, signal());
      await pause(300);
      canvas.clearEmphasis();
      await settle(screen.narration);
    },

    async question(screen) {
      const { question } = screen;
      let resolveAnswer = null;
      const optionsTop = Math.round(Math.min(556, Math.max(430, triangleBox().bottom + 84)));   // under the shape and its labels
      const card = createOptionCard({
        overlayEl: board.overlayEl, prompt: question.prompt, options: question.options, audio, at: { top: optionsTop },
        onSelect: (option) => resolveAnswer?.(option),
      });
      live.card = card;
      await narrate(question.prompt);
      ghostGuide(pointAt('.ws-option--pill'), { firstMs: 6000 });
      for (;;) {
        setState('WAITING_FOR_INPUT');
        card.setEnabled(true);
        const option = await withSignal(new Promise((resolve) => { resolveAnswer = resolve; }), signal());
        resolveAnswer = null;
        setState('CHECKING');
        card.setEnabled(false);
        if (option === question.correct) {
          audio.play('correct');
          card.markCorrect(option);
          await reinforce(question.reinforce);
          await pause(500);
          break;
        }
        audio.play('softNo');
        await card.markIncorrect(option);
        await reinforce(question.reinforce);        // the hint after a wrong try: the measurements, again
      }
      setState('TRANSITIONING');
      await card.remove();
    },

    async discover(screen) {
      setState('DEMONSTRATING');
      const m = canvas.measured;
      const highlight = async () => {
        if (screen.tones) {
          for (const i of SIDE_ORDER) {
            canvas.setTone(i, screen.tones[SIDE_ORDER.indexOf(i)]);
            canvas.pulseSide(i);
            canvas.pulseSideLabel(i);
            audio.play('bloop');
            await pause(520);
          }
        }
        if (screen.highlightEqual) {
          const equal = equalSideIndices();
          canvas.emphasiseSides(equal);
          await pulseLabelsInOrder(equal, 480);
        }
        if (screen.highlightAngles) {
          const which = screen.highlightAngles === 'right' ? [m.rightAt] : screen.highlightAngles === 'obtuse' ? [m.obtuseAt] : screen.highlightAngles;
          canvas.emphasiseAngles(which);
          await pulseAnglesInOrder(which, 480);
        }
      };
      const cues = [
        { phrase: screen.cues?.highlight ?? screen.narration.split(' ')[0], run: fire(highlight) },
        { phrase: screen.cues?.name ?? screen.badge.toLowerCase(), run: () => { live.badge = badgeUnderTriangle(screen.badge, screen.tone); canvas.sparkleVertices(); } },
      ];
      await narrate(screen.narration, { focus: screen.focus, cues });
      if (!live.badge) live.badge = badgeUnderTriangle(screen.badge, screen.tone);
      await settle(screen.narration);
      canvas.clearEmphasis();
    },

    async drag(screen) {
      await narrate(screen.narration);
      if (screen.instruction) {                  // the question is read first; then the box swaps to the instruction
        await pause(700);
        await narrate(screen.instruction);
      }
      setState('INTERACTING');
      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });
      let hintTimer = 0;
      const showHint = () => { if (!canvas.isDragging) canvas.showHint(screen.hintVertex ?? 0); };
      canvas.setDrag({
        enabled: true, goal: screen.goal, bounds: DRAG_BOUNDS, silentSnaps: Boolean(screen.silentSnaps),
        onChange: () => {},
        onRelease: (m, { goalMet: met }) => { if (met) resolveDone(m); },
      });
      // Teaching screens show the ghost corner at once; checkpoints only after a while without success.
      if (screen.hintAfterMs) hintTimer = setTimeout(showHint, screen.hintAfterMs);
      else showHint();
      ghostGuide((hand) => { const path = canvas.ghostPath(screen.hintVertex ?? 0); if (path && !canvas.isDragging) hand.drag(...path); }, { firstMs: screen.hintAfterMs ? 8000 : 1600 });
      try {
        await withSignal(done, signal());
      } finally {
        clearTimeout(hintTimer);
        canvas.setDrag({ enabled: false, goal: null });
        canvas.clearHint();
        stopGhost();
      }
      setState('FEEDBACK');
      canvas.sparkleVertices();
      const m = canvas.measured;
      if (screen.success?.final) {
        await this.finalSuccess(screen);
        return;
      }
      audio.play('correct');
      if (screen.goal === 'isosceles' || screen.goal === 'equilateral') {
        canvas.emphasiseSides(equalSideIndices());
        await pulseLabelsInOrder(equalSideIndices(), 300);
      } else if (screen.goal === 'right') {
        canvas.emphasiseAngles([m.rightAt]);
        await pulseAnglesInOrder([m.rightAt], 300);
      } else if (screen.goal === 'obtuse') {
        canvas.emphasiseAngles([m.obtuseAt]);
        await pulseAnglesInOrder([m.obtuseAt], 300);
      }
      if (screen.success) {
        await narrate(screen.success.narration, { cues: [{ phrase: screen.success.name ?? screen.success.badge.toLowerCase(), run: () => { live.badge = badgeUnderTriangle(screen.success.badge, screen.success.tone); canvas.sparkleVertices(); } }] });
        if (!live.badge) live.badge = badgeUnderTriangle(screen.success.badge, screen.success.tone);
        await settle(screen.success.narration);
      } else {
        await pause(1100);          // the next screen names what the learner just made
      }
      canvas.clearEmphasis();
    },

    /** The right-angled isosceles triangle: each condition is shown and named in turn, then the celebration. */
    async finalSuccess(screen) {
      const m = canvas.measured;
      audio.play('snapRight');
      canvas.emphasiseSides(equalSideIndices());
      await pulseLabelsInOrder(equalSideIndices(), 320);
      live.row = rowUnderTriangle();
      audio.play('badge');
      live.badgeA = live.row.add(createBadge({ overlayEl: board.overlayEl, text: screen.success.badges[0].text, tone: screen.success.badges[0].tone, at: {} }));
      await pause(760);
      canvas.emphasiseAngles([m.rightAt]);
      await pulseAnglesInOrder([m.rightAt], 320);
      audio.play('badge');
      live.badgeB = live.row.add(createBadge({ overlayEl: board.overlayEl, text: screen.success.badges[1].text, tone: screen.success.badges[1].tone, at: {} }));
      await pause(700);
      audio.play('celebration');
      fx.confetti(70);
      await narrate(screen.success.narration, { focus: 'sides and angles', cues: [
        { phrase: 'sides', run: () => { canvas.emphasiseSides(equalSideIndices()); equalSideIndices().forEach((i) => canvas.pulseSideLabel(i)); } },
        { phrase: 'angles', run: () => { canvas.clearEmphasis(); canvas.emphasiseAngles([m.rightAt]); canvas.pulseAngle(m.rightAt); live.greatJob = live.row.add(createGreatJob({ overlayEl: board.overlayEl, at: {} })); canvas.sparkleVertices(); } },
      ] });
      await settle(screen.success.narration);
      canvas.clearEmphasis();
    },

    async sort(screen) {
      await narrate(screen.narration);
      setState('INTERACTING');
      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });
      const sorter = createSortBoard({
        overlayEl: board.overlayEl, cards: screen.cards, bins: screen.bins, audio,
        onDrop: (cardId, binId) => screen.cards.find((c) => c.id === cardId)?.answer === binId,
        onAllSorted: () => resolveDone(),
      });
      live.sorter = sorter;
      ghostGuide((hand) => { const path = sorter.ghostPath(); if (path) hand.carry(sorter.currentFigure(), ...path); }, { firstMs: 2200 });
      await withSignal(done, signal());
      stopGhost();
      setState('FEEDBACK');
      sorter.setEnabled(false);
      audio.play('tada');
      await pause(1400);                        // all three cards rest in their crates for a moment
      await sorter.remove();
      live.sorter = null;
      live.result = createSortResult({ overlayEl: board.overlayEl, cards: screen.cards, bins: screen.bins });
      await narrate(screen.success);
      await continueButton();
    },

    async multi(screen) {
      await narrate(screen.narration);
      setState('INTERACTING');
      let resolveChecked;
      let checked = new Promise((resolve) => { resolveChecked = resolve; });
      const grid = createMultiGrid({ overlayEl: board.overlayEl, cards: screen.cards, audio, onChange: (selection) => check.setEnabled(selection.size > 0) });
      const check = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.check, tone: 'yellow', at: { center: true, top: FOOT }, enabled: false, onPress: () => { audio.play('uiTap'); resolveChecked(); } });
      live.grid = grid;
      live.check = check;
      ghostGuide(pointAt('.ws-pick'), { firstMs: 6000 });
      for (;;) {
        await withSignal(checked, signal());
        setState('CHECKING');
        grid.setEnabled(false);
        check.setEnabled(false);
        const picked = [...grid.selection].sort();
        const correct = [...screen.correct].sort();
        if (picked.join() === correct.join()) break;
        audio.play('softNo');
        await grid.shakeWrong(screen.correct);
        checked = new Promise((resolve) => { resolveChecked = resolve; });
        setState('INTERACTING');
        grid.setEnabled(true);
        check.setEnabled(grid.selection.size > 0);
      }
      setState('FEEDBACK');
      audio.play('correct');
      grid.markResult(screen.correct);
      await check.remove();
      live.check = null;
      await narrate(screen.success);
      await continueButton();
    },

    async dual(screen) {
      await narrate(screen.narration);
      setState('INTERACTING');
      let resolveChecked;
      let checked = new Promise((resolve) => { resolveChecked = resolve; });
      const bothChosen = (s) => screen.groups.every((g) => s[g.id]);
      const card = createDualCard({ overlayEl: board.overlayEl, prompt: screen.prompt, groups: screen.groups, audio, at: { top: 372 }, onChange: (s) => check.setEnabled(bothChosen(s)) });
      const check = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.check, tone: 'yellow', at: { center: true, top: FOOT }, enabled: false, onPress: () => { audio.play('uiTap'); resolveChecked(); } });
      live.card = card;
      live.check = check;
      ghostGuide(pointAt('.ws-dual .ws-option--pill'), { firstMs: 6000 });
      for (;;) {
        await withSignal(checked, signal());
        setState('CHECKING');
        card.setEnabled(false);
        check.setEnabled(false);
        const picks = card.selections;
        const wrong = screen.groups.filter((g) => picks[g.id] !== g.correct).map((g) => g.id);
        if (!wrong.length) break;
        audio.play('softNo');
        await card.markWrong(wrong);
        checked = new Promise((resolve) => { resolveChecked = resolve; });
        setState('INTERACTING');
        card.setEnabled(true);
        check.setEnabled(bothChosen(card.selections));
      }
      setState('FEEDBACK');
      audio.play('correct');
      card.markCorrect();
      await pause(600);
      await Promise.all([card.remove(), check.remove()]);
      live.card = null;
      live.check = null;
      // Sides first, then the angle: both classification systems, each on its word.
      const m = canvas.measured;
      live.row = rowUnderTriangle();
      const chip = (b) => { audio.play('badge'); return live.row.add(createBadge({ overlayEl: board.overlayEl, text: b.text, tone: b.tone, at: {} })); };
      await narrate(screen.success.narration, { cues: [
        { phrase: 'scalene', run: () => { canvas.emphasiseSides([0, 1, 2]); fire(() => pulseLabelsInOrder(SIDE_ORDER, 240))(); live.badgeA = chip(screen.success.badges[0]); } },
        { phrase: 'obtuse-angled', run: () => { canvas.clearEmphasis(); canvas.emphasiseAngles([m.obtuseAt]); canvas.pulseAngle(m.obtuseAt); live.badgeB = chip(screen.success.badges[1]); canvas.sparkleVertices(); } },
      ] });
      await settle(screen.success.narration);
      canvas.clearEmphasis();
    },

    async dualReveal(screen) {
      setState('DEMONSTRATING');
      const m = canvas.measured;
      live.row = rowUnderTriangle();
      const chip = (b) => { audio.play('badge'); return live.row.add(createBadge({ overlayEl: board.overlayEl, text: b.text, tone: b.tone, at: {} })); };
      await narrate(screen.narration, { focus: screen.focus, cues: [
        // "isosceles": the two equal sides light up (the rest steps back) and its name pops under the shape
        { phrase: 'isosceles', run: () => { canvas.emphasiseSides(equalSideIndices()); equalSideIndices().forEach((i) => canvas.pulseSideLabel(i)); live.badgeA = chip(screen.badges[0]); } },
        // "right angled": now the 90° corner lights up and its name joins the first
        { phrase: 'right angled', run: () => { canvas.clearEmphasis(); canvas.emphasiseAngles([m.rightAt]); canvas.pulseAngle(m.rightAt); live.badgeB = chip(screen.badges[1]); canvas.sparkleVertices(); } },
      ] });
      await settle(screen.narration);
      canvas.clearEmphasis();
    },

    async lenses(screen) {
      setState('DEMONSTRATING');
      const m = canvas.measured;
      let lensA = null;
      let lensB = null;
      live.row = rowUnderTriangle();
      const lensChip = (k) => { audio.play('badge'); return live.row.add(createLens({ overlayEl: board.overlayEl, title: screen.lenses[k].title, result: screen.lenses[k].result, tone: screen.lenses[k].tone, at: {} })); };
      const spoken = board.narrate(screen.narration, { focus: screen.focus, cues: [
        { phrase: 'sides', run: () => { lensA = lensChip(0); canvas.emphasiseSides(equalSideIndices()); equalSideIndices().forEach((i) => canvas.pulseSideLabel(i)); } },
        { phrase: 'angles', run: () => { canvas.clearEmphasis(); lensB = lensChip(1); canvas.emphasiseAngles([m.rightAt]); canvas.pulseAngle(m.rightAt); } },
      ] });
      await withSignal(spoken.finished, signal());
      lensA ??= lensChip(0);
      lensB ??= lensChip(1);
      await pause(700);
      canvas.clearEmphasis();
      // The two lenses merge into the two names, in the same row under the shape.
      await Promise.all([lensA.merge(), lensB.merge()]);
      await Promise.all([lensA.remove(), lensB.remove()]);
      audio.play('badge');
      live.badgeA = live.row.add(createBadge({ overlayEl: board.overlayEl, text: 'ISOSCELES', tone: 'isosceles', at: {} }));
      await pause(200);
      audio.play('badge');
      live.badgeB = live.row.add(createBadge({ overlayEl: board.overlayEl, text: 'RIGHT-ANGLED', tone: 'right', at: {} }));
      await settle(screen.narration);
    },

    /**
     * The recap (PDF p48): each category pops up as one big card, the beaver pops up behind it with
     * only his head showing and explains it, then the card shrinks into the row; last, the "both" card.
     */
    async summary(screen) {
      setState('DEMONSTRATING');
      await guide.leave();
      await narrate(LEARNING_COPY.summary.heading);
      await settle(LEARNING_COPY.summary.heading);
      board.hideNarration();                 // from here the beaver explains each card in his own bubble
      const view = createSummaryView({ overlayEl: board.overlayEl, screen });
      live.summary = view;
      const items = [...screen.bySides, ...screen.byAngles];
      // Registered on his hat: `peek` rests his hands on the card's top edge, `duck` hides him behind the card.
      const headX = (card) => BOARD.surface.left + card.left + Math.round(card.width * 0.3);
      const peek = (card) => ({ x: headX(card), y: BOARD.surface.top + card.top - PEEK_HEAD, scale: 0.9, flip: false, rotate: 0 });
      const duck = (card) => ({ x: headX(card), y: BOARD.surface.top + card.top + 60, scale: 0.9, flip: false, rotate: 0 });
      const rise = async (card) => { guide.element.classList.remove('is-ducked'); guide.setPose('peek'); await guide.moveTo(peek(card)); };
      const sink = async (card) => { await guide.moveTo(duck(card)); guide.element.classList.add('is-ducked'); };
      // His bubble opens to the right of his head, its tail at his mouth.
      const say = (card, text, cues = null) => {
        setState('NARRATING');
        const line = board.speak(text, { tip: { x: headX(card) + 150, y: BOARD.surface.top + card.top - 70 }, cues, holdMs: 700 });
        return withSignal(line.finished, signal());
      };
      board.setGuidePeeking(true);
      board.setGuidePresent(true);
      guide.setRegistration('head');
      guide.setInstant(true);
      guide.setPose('peek');
      guide.placeAt(duck(SUMMARY_BIG));
      guide.setInstant(false);
      guide.element.classList.add('is-ducked');
      guide.element.hidden = false;
      for (let i = 0; i < items.length; i += 1) {
        view.popCard(i);
        audio.play('badge');
        await pause(300);
        await rise(SUMMARY_BIG);
        // He names it (the name glows) and gives its rule (the figure lights up on the rule's first word).
        await say(SUMMARY_BIG, `${items[i].name}. ${items[i].text}`, summaryCues(items[i], view));
        await pause(500);
        await sink(SUMMARY_BIG);
        audio.play('snapEqual');
        await view.collectCard(i);            // the card flies to its column: sides on the left, angles on the right
        await pause(240);
      }
      await view.gather();
      audio.play('correct');
      view.popBothCard();
      audio.play('badge');
      await pause(300);
      await rise(SUMMARY_BOTH);
      await say(SUMMARY_BOTH, LEARNING_COPY.summary.both);
      await pause(400);
      setState('WAITING_FOR_INPUT');
      let resolvePressed;
      const pressed = new Promise((resolve) => { resolvePressed = resolve; });
      const button = createPillButton({ overlayEl: board.overlayEl, text: LEARNING_COPY.summary.cta, tone: 'green', at: { center: true, top: FOOT }, onPress: () => { audio.play('uiTap'); resolvePressed(); } });
      live.cta = button;
      await withSignal(pressed, signal());
      button.pressOnce();
      setState('TRANSITIONING');
      await sink(SUMMARY_BOTH);
      await Promise.all([button.remove(), view.remove()]);
      board.setGuidePeeking(false);
      guide.element.classList.remove('is-ducked');
      await guide.leave();
    },
  };

  async function runScreen(screen) {
    current = screen;
    gameState.update({ learningScreen: screen.id });
    board.cancelCues();
    await clearOverlay();
    board.clearNarration();
    board.narrationEl.hidden = true;               // it opens with the screen's first line, never empty
    await Promise.all([prepareTriangle(screen), screen.kind === 'summary' ? Promise.resolve() : placeGuide(screen)]);
    const runner = runners[screen.kind];
    if (!runner) throw new Error(`Unknown learning screen kind: ${screen.kind}`);
    notify();
    await runner.call(runners, screen);
    await manualGate();
  }

  /* ---------- QA hooks (?qa=1 or DEBUG_MODE): read-only state and client-space targets ---------- */
  function installHooks() {
    const client = (point) => canvas.toClient(point[0], point[1]);
    window.__learning = {
      state: () => ({
        id: current?.id ?? null,
        kind: current?.kind ?? null,
        state,
        index,
        total: LEARNING_SCREENS.length,
        narration: board.narrationText,
        badges: [...board.overlayEl.querySelectorAll('.ws-badge')].map((b) => b.textContent),
        guide: guide.isPresent ? guide.pose : null,
        measured: canvas.measured,
        points: canvas.points,
      }),
      dragTarget(vertexIndex) {
        const goal = current?.goal;
        if (!goal) return null;
        const i = vertexIndex ?? current.hintVertex ?? 0;
        const from = canvas.points[i];
        return { index: i, from: client(from), to: client(canvas.solutionFor(goal, i, DRAG_BOUNDS)) };
      },
      vertexClient: (i) => client(canvas.points[i]),
      sortTargets: () => live.sorter?.targets() ?? null,
      buttons: () => [...board.overlayEl.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim() || b.getAttribute('aria-label'), option: b.dataset.option ?? b.dataset.card ?? null, x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: b.disabled, cls: b.className }; }),
    };
  }

  return {
    get state() { return state; },
    get current() { return current; },
    async run(startId) {
      if (qa) installHooks();
      index = startId ? Math.max(0, LEARNING_SCREENS.findIndex((s) => s.id === startId)) : 0;
      while (index < LEARNING_SCREENS.length && !stopped) {
        const screen = LEARNING_SCREENS[index];
        setState('ENTERING');
        try {
          await runScreen(screen);
        } catch (error) {
          if (stopped) return false;
          if (pending === null && isAbortError(error)) return false;
          if (pending === null) console.error(`[learning] screen ${screen.id} failed; moving on:`, error);
        }
        if (pending !== null) {                 // a debug jump: cancel left the current screen, go where it points
          index = pending;
          pending = null;
          continue;
        }
        index += 1;
      }
      notify();
      return !stopped;
    },
    /* ---- Debug navigation (?debug=1): jump anywhere; Next and Back replay a screen from its start ---- */
    get index() { return index; },
    get screens() { return LEARNING_SCREENS; },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    /** Turns the review mode on or off while running; turning it off releases a screen waiting for Next. */
    setManual(on) {
      manual = Boolean(on);
      if (!manual) resolveNext?.();
    },
    get manual() { return manual; },
    jumpTo(target) {
      const i = typeof target === 'string' ? LEARNING_SCREENS.findIndex((s) => s.id === target) : target;
      if (i < 0 || i >= LEARNING_SCREENS.length || stopped) return;
      pending = i;
      board.cancelCues();
      board.stopVoice();
      canvas.setDrag({ enabled: false, goal: null });
      scope.cancel();                         // the running screen stops; run() picks up `pending`
    },
    next() {
      if (resolveNext) { resolveNext(); return; }   // waiting at the end of a screen: move on normally
      this.jumpTo(index + 1);
    },
    back() {
      this.jumpTo(Math.max(0, index - 1));
    },
    stop() {
      stopped = true;
      scope.cancel();
      board.cancelCues();
      canvas.setDrag({ enabled: false, goal: null });
      if (window.__learning) delete window.__learning;
    },
  };
}
