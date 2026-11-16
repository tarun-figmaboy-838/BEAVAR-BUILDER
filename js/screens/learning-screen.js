import { DEBUG_MODE } from '../config.js';
import { createSequenceScope, wait, isAbortError } from '../core/motion.js';
import { zoomToCab } from './story-screens.js';
import { createWorkshopBoard, BOARD } from '../learning/workshop-board.js';
import { createTriangleCanvas } from '../learning/triangle-canvas.js';
import { createBeaverGuide } from '../learning/beaver-guide.js';
import { createLearningFlow } from '../learning/learning-flow.js';
import { createDebugPanel } from '../learning/debug-panel.js';
import { LEARNING_COPY } from '../learning/learning-content.js';

/**
 * The Triangle Workshop: the operator takes the learner into his workshop. The crane pauses, he climbs
 * down from the cab, the lesson card rises, and the lesson runs (js/learning/). When it is done the card
 * lowers, he climbs back into the cab, and the scene carries on (`learningNext`). Same page, same scene.
 *
 * URL options: ?lesson=L07 begins at that screen; ?qa=1 exposes window.__learning for the play-through;
 * ?debug=1 (or the D key) adds the review panel.
 */
export function createLearningScreen({ els, audio, voice, camera, triangles, feedback, builder, fx, gameState, screenManager, learningNext = 'how-to-play' }) {
  const scope = createSequenceScope();
  const params = new URLSearchParams(location.search);
  const startLesson = params.get('lesson');
  const qa = params.get('qa') === '1' || DEBUG_MODE;
  const debug = params.get('debug') === '1';          // TEMPORARY review aid: screen list, Back / Next, no auto-advance
  let board = null;
  let canvas = null;
  let guide = null;
  let flow = null;
  let debugPanel = null;
  let onKey = null;
  let backdrop = null;

  /** The world cross-fades to the quiet workshop: the canal, crane and yard go, the wall and floor come. */
  async function enterWorkshop() {
    backdrop = new Image();
    backdrop.className = 'learning-backdrop';
    backdrop.src = BOARD.backdrop;
    backdrop.alt = '';
    backdrop.draggable = false;
    els.workshop.prepend(backdrop);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    backdrop.classList.add('is-on');
    els.crane.classList.add('is-away');
    els.platform.classList.add('is-away');
    await wait(900, scope.signal);
  }
  async function leaveWorkshop() {
    backdrop?.classList.remove('is-on');
    els.crane.classList.remove('is-away');
    els.platform.classList.remove('is-away');
    await wait(900, scope.signal).catch(() => {});
    backdrop?.remove();
    backdrop = null;
  }

  async function say(text) {
    const anchor = await zoomToCab({ camera, builder, signal: scope.signal, duration: 1000 }).catch(() => null);
    const line = feedback.showBubble(text, { anchor });
    await line.finished;
    await feedback.hideBubble();
  }

  async function run() {
    try {
      camera.reset(600).catch(() => {});
      builder.show();
      await triangles.clearIntroPile();                         // the yard empties as the scene changes
      builder.hide();                                           // he climbs down from the cab...
      await enterWorkshop();                                    // ...and the scene settles into his workshop
      board = createWorkshopBoard({ hostEl: els.workshop, voice, audio });
      board.root.classList.add('is-lowered');
      guide = createBeaverGuide({ hostEl: board.guideHostEl, x: BOARD.guide.x, groundY: BOARD.guide.groundY });
      canvas = createTriangleCanvas({ host: board.stageEl, width: BOARD.canvas.width, height: BOARD.canvas.height, audio });
      await board.rise({ signal: scope.signal });
      flow = createLearningFlow({ board, canvas, guide, audio, fx, gameState, qa, manual: debug });
      board.talker = guide;
      if (debug) debugPanel = createDebugPanel({ hostEl: els.hud, flow });
      // TEMPORARY review aid: the D key shows / hides the screen list with Back and Next (same as ?debug=1).
      onKey = (event) => {
        if (event.key !== 'd' && event.key !== 'D') return;
        if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
        if (debugPanel) { debugPanel.destroy(); debugPanel = null; flow?.setManual(false); }
        else if (flow) { debugPanel = createDebugPanel({ hostEl: els.hud, flow }); flow.setManual(true); }
      };
      window.addEventListener('keydown', onKey);
      const completed = await flow.run(startLesson);
      if (!completed) return;
      // Back to the bridge: the board goes down, he climbs back into the cab, the frames come back.
      await wait(400, scope.signal);
      await Promise.all([board.lower({ signal: scope.signal }), guide.leave()]);
      await leaveWorkshop();
      builder.show();
      builder.cheer();
      await say(LEARNING_COPY.beaver.leave);
      await camera.reset(900, scope.signal).catch(() => {});
      triangles.showIntroPile();
      await wait(500, scope.signal);
      if (screenManager.currentName === 'learning') screenManager.go(learningNext);
    } catch (error) {
      if (!isAbortError(error)) console.error('[learning]', error);
    }
  }

  return {
    async enter() {
      run();
    },
    async exit() {
      scope.cancel();
      flow?.stop();
      flow = null;
      debugPanel?.destroy();
      debugPanel = null;
      if (onKey) { window.removeEventListener('keydown', onKey); onKey = null; }
      board?.destroy();
      board = null;
      guide?.destroy();
      guide = null;
      canvas = null;
      backdrop?.remove();
      backdrop = null;
      els.crane.classList.remove('is-away');
      els.platform.classList.remove('is-away');
      builder.show();
      await feedback.hideBubble();
      if (!triangles.pileItems().length) triangles.showIntroPile();
      voice.stop();
    },
  };
}
