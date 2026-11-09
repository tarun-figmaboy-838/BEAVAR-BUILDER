import { COPY } from '../data/copy.js';
import { createSequenceScope, wait, playClassAnimation, isAbortError, prefersReducedMotion } from '../core/motion.js';
import { bridgeSeatTarget } from '../gameplay/placement-controller.js';
import { padPlateSvg } from '../core/pad-plate.js';

const DEMO_PILE_INDEX = 3;              // the tall frame in the yard
const DEMO_TARGET = { x: 960 }; // the middle hotspot (PDF p6 marks spots on the deck)

/** Each step shows the real control it teaches: the arrow pad, the green PICK button, the orange DROP button. */
const STEP_CHIPS = [
  `<span class="howto-chip howto-chip--move">
     <span class="howto-pad__plate">${padPlateSvg('chip')}</span>
     <img class="howto-pad__key howto-pad__key--left" src="assets/images/kit/key-left.png" alt="" draggable="false">
     <img class="howto-pad__key howto-pad__key--right" src="assets/images/kit/key-right.png" alt="" draggable="false">
   </span>`,
  `<span class="howto-chip howto-chip--pick"><img class="howto-chip__art" src="assets/images/kit/btn-pick.png" alt="" draggable="false"></span>`,
  `<span class="howto-chip howto-chip--drop"><img class="howto-chip__art" src="assets/images/kit/btn-drop.png" alt="" draggable="false"></span>`,
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
      <header class="howto-card__header">${copy.title}</header>
      <div class="howto-card__body">
        <p class="howto-card__intro">${copy.intro}</p>
        <ol class="howto-steps">
          ${copy.steps.map((step, index) => `
            <li class="howto-step" data-step="${index}">
              ${STEP_CHIPS[index]}
              <span class="howto-step__text">${step}</span>
              <span class="howto-step__check" aria-hidden="true"></span>
            </li>`).join('')}
        </ol>
      </div>`;
    els.overlays.appendChild(card);
    playClassAnimation(card, 'is-entering', 620);
  }

  function highlightStep(index) {
    card.querySelectorAll('.howto-step').forEach((step, k) => {
      step.classList.toggle('is-active', k === index);
      step.classList.toggle('is-done', k < index);
    });
  }

  /** The card's own controls copy what the demo is doing with the real ones. */
  function cardJoystick(direction) {
    card?.querySelector('.howto-chip--move')?.setAttribute('data-dir', direction ?? '');
  }
  function cardPress(kind) {
    const chip = card?.querySelector(`.howto-chip--${kind}`);
    if (chip) playClassAnimation(chip, 'is-pressed', 400);
  }
  function demoAxis(x) {
    input.showDemoAxis(x ? { x, y: 0 } : null);
    cardJoystick(x < 0 ? 'left' : x > 0 ? 'right' : '');
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
    demoAxis(-1);
    await crane.glideTo(760, { signal: scope.signal });
    demoAxis(1);
    await crane.glideTo(1060, { signal: scope.signal });
    demoAxis(0);
  }

  async function demoPickAndPlace() {
    const item = triangles.pileItems()[DEMO_PILE_INDEX];
    if (!item) return;
    const grab = { x: item.homeCenterX - item.width / 2 + item.grabX * item.width, y: item.baseY - item.baseOffset + item.grabY };
    await sayStep(1);
    demoAxis(grab.x < crane.position.x ? -1 : 1);
    await crane.glideTo(grab.x, { signal: scope.signal });
    demoAxis(0);
    cardPress('pick');
    await input.demoPress('pick');
    await crane.pickUp({ ...item, id: 'demo', grabStageX: grab.x, grabStageY: grab.y }, { signal: scope.signal });
    input.setActionState({ mode: 'drop', enabled: false });            // the button flips to DROP
    await wait(200, scope.signal);
    await sayStep(2);
    // DROP: the same transport the player gets: lift, into depth, align over the middle spot, lower, release.
    cardPress('drop');
    await input.demoPress('drop');
    const released = await crane.transportToBridge((scale) => bridgeSeatTarget(item, DEMO_TARGET.x, scale), { signal: scope.signal });
    if (!released) return;
    input.setActionState({ mode: 'pick', enabled: false });            // and back to PICK
    triangles.placeInWorld(item, released.left, released.top, released.scale);
    await triangles.seat(item);
    await crane.liftAway({ signal: scope.signal });
    const homeTrip = crane.returnHome({ signal: scope.signal, x: 1100 });   // parks clear of the how-to card
    await wait(prefersReducedMotion() ? 0 : 500, scope.signal);
    await playClassAnimation(item.element, 'is-demo-ghost', 600);
    await triangles.returnToSlot(item);
    await homeTrip;
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
        demoAxis(0);
        input.setActionState({ mode: 'pick', enabled: false });
      }
      highlightStep(copy.steps.length);
      // PDF p6: the card closes with this line; the builder says it and the practice round begins.
      const footer = document.createElement('p');
      footer.className = 'howto-card__footer';
      footer.textContent = copy.cta;
      card.querySelector('.howto-card__body').appendChild(footer);
      playClassAnimation(footer, 'is-entering', 600);
      // Not awaited: this screen finishes entering first, then the line plays and the round begins.
      voice.say(copy.cta, { speaker: 'builder' }).finished
        .then(() => wait(700))
        .then(() => { if (screenManager.currentName === 'how-to-play') screenManager.go('gameplay'); });
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
