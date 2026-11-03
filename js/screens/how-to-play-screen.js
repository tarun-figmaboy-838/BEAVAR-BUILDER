import { COPY } from '../data/copy.js';
import { createSequenceScope, wait, playClassAnimation, isAbortError, prefersReducedMotion } from '../core/motion.js';
import { BRIDGE_GEOMETRY } from '../data/bridge-geometry.js';

const DEMO_PILE_INDEX = 3;              // the tall frame in the yard
const DEMO_TARGET = { x: 960 }; // the middle hotspot (PDF p6 marks spots on the deck)

const STEP_ICONS = [
  '<span class="howto-arrow howto-arrow--left"></span><span class="howto-arrow howto-arrow--right"></span>',
  '<img src="assets/images/crane-kit/claw-open.png" alt="" draggable="false">',
  '<img src="assets/images/crane-kit/claw-closed.png" alt="" draggable="false">',
];

/** G0.3 How to Play: each instruction is demonstrated with the real crane and the real controls, input gated. */
export function createHowToPlayScreen({ els, voice, camera, crane, triangles, bridge, input, builder, screenManager }) {
  const scope = createSequenceScope();
  const copy = COPY.screens.howToPlay;
  let card = null;

  function buildCard() {
    card = document.createElement('section');
    card.className = 'howto-card';
    card.setAttribute('aria-label', copy.title);
    card.innerHTML = `
      <p class="howto-card__intro">${copy.intro}</p>
      <ol class="howto-steps">
        ${copy.steps.map((step, index) => `
          <li class="howto-step" data-step="${index}">
            <span class="howto-step__number">${index + 1}</span>
            <span class="howto-step__text">${step}</span>
            <span class="howto-step__icon">${STEP_ICONS[index]}</span>
          </li>`).join('')}
      </ol>`;
    els.overlays.appendChild(card);
    playClassAnimation(card, 'is-entering', 620);
  }

  function highlightStep(index) {
    card.querySelectorAll('.howto-step').forEach((step, k) => {
      step.classList.toggle('is-active', k === index);
      step.classList.toggle('is-done', k < index);
    });
  }

  async function sayStep(index) {
    highlightStep(index);
    const line = voice.say(copy.steps[index], { speaker: 'narrator' });
    await wait(Math.min(900, line.seconds * 500), scope.signal);
  }

  function revealControls() {
    if (!els.controls.hidden) return;
    input.setEnabled(false);
    input.setActionState({ mode: 'pick', enabled: false });
    els.controls.hidden = false;
    playClassAnimation(els.controls, 'is-entering', 700);
  }

  /** Left, then right, in the open middle of the canal (the card sits on the right). */
  async function demoMove() {
    input.showDemoAxis({ x: -1, y: 0 });
    await crane.glideTo(760, { signal: scope.signal });
    input.showDemoAxis({ x: 1, y: 0 });
    await crane.glideTo(1060, { signal: scope.signal });
    input.showDemoAxis(null);
  }

  async function demoPickAndPlace() {
    const item = triangles.pileItems()[DEMO_PILE_INDEX];
    if (!item) return;
    const grab = { x: item.homeCenterX - item.width / 2 + item.grabX * item.width, y: item.baseY - item.baseOffset + item.grabY };
    await sayStep(1);
    input.showDemoAxis({ x: grab.x < crane.position.x ? -1 : 1, y: 0 });
    await crane.glideTo(grab.x, { signal: scope.signal });
    input.showDemoAxis(null);
    await input.demoPress('pick');
    await crane.pickUp({ ...item, id: 'demo', grabStageX: grab.x, grabStageY: grab.y }, { signal: scope.signal });
    input.setActionState({ mode: 'drop', enabled: false });
    await wait(200, scope.signal);
    await sayStep(2);
    input.showDemoAxis({ x: DEMO_TARGET.x < crane.position.x ? -1 : 1, y: 0 });
    await crane.glideTo(DEMO_TARGET.x, { signal: scope.signal });
    input.showDemoAxis(null);
    await input.demoPress('drop');
    const released = await crane.lowerAndRelease(
      { craneX: DEMO_TARGET.x, gripY: BRIDGE_GEOMETRY.deckY - item.baseOffset + item.grabY },
      { signal: scope.signal }
    );
    input.setActionState({ mode: 'pick', enabled: false });
    triangles.placeInWorld(item, released.left, released.top);
    await triangles.seat(item);
    await crane.liftAway({ signal: scope.signal });
    await wait(prefersReducedMotion() ? 0 : 500, scope.signal);
    await playClassAnimation(item.element, 'is-demo-ghost', 600);
    await triangles.returnToSlot(item);
    await crane.glideTo(1240, { signal: scope.signal });
  }

  return {
    async enter() {
      camera.reset(1300).catch(() => {});
      builder.show();
      buildCard();
      bridge.showDemoSpots();
      revealControls();
      const intro = voice.say(copy.intro, { speaker: 'narrator' });
      await intro.finished;
      try {
        await sayStep(0);
        await demoMove();
        await demoPickAndPlace();
      } catch (error) {
        if (!isAbortError(error)) throw error;
      } finally {
        input.showDemoAxis(null);
        input.setActionState({ mode: 'pick', enabled: false });
      }
      highlightStep(copy.steps.length);
      // PDF p6: the card closes with this line; the builder says it and the practice round begins.
      const footer = document.createElement('p');
      footer.className = 'howto-card__footer';
      footer.textContent = copy.cta;
      card.appendChild(footer);
      playClassAnimation(footer, 'is-entering', 600);
      // Not awaited: this screen finishes entering first, then the line plays and the round begins.
      voice.say(copy.cta, { speaker: 'builder' }).finished
        .then(() => wait(700))
        .then(() => screenManager.go('gameplay'));
    },
    async exit() {
      bridge.hideDemoSpots();
      if (card) {
        await playClassAnimation(card, 'is-leaving', 460);
        card.remove();
        card = null;
      }
    },
  };
}
