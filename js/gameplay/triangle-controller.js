import { TRIANGLES, INTRO_PILE } from '../data/triangles.js';
import { buildFrameSvg } from './frame-shapes.js';
import { PLATFORM_LAYOUT } from '../data/layout.js';
import { wait, playClassAnimation, prefersReducedMotion } from '../core/motion.js';

/** Renders the option frames on the platform and tracks where each one lives. */
export function createTriangleController({ platformEl, placedLayerEl }) {
  const deck = new Image();
  deck.className = 'platform__deck';
  deck.src = PLATFORM_LAYOUT.src;
  deck.alt = '';
  deck.draggable = false;
  const optionsLayer = document.createElement('div');
  optionsLayer.className = 'platform__options';
  platformEl.append(deck, optionsLayer);

  const options = new Map();
  const pile = [];
  // Frames are not tappable: the crane is driven only with the arrow pad, PICK and DROP.

  /** A frame element plus its geometry: size, corner positions, and the top corner the claw grabs. */
  function buildTriangleElement(definition, scale, { interactive }) {
    const frame = buildFrameSvg(definition, { scale });
    const element = document.createElement('div');
    element.className = interactive ? 'triangle triangle--option' : 'triangle';
    element.style.width = `${frame.width}px`;
    element.style.height = `${frame.height}px`;
    element.appendChild(frame.svg);
    const { svg, ...geometry } = frame;
    return { element, ...geometry };
  }

  function placeAtHome(option) {
    option.element.style.left = `${option.homeCenterX - option.width / 2}px`;
    option.element.style.top = `${option.baseY - option.baseOffset}px`;
  }

  /** Keeps DOM (and tab) order equal to slot order, whichever frame is added back first. */
  function insertInSlotOrder(option) {
    const siblings = [...optionsLayer.querySelectorAll('.triangle--option')].filter((el) => el !== option.element);
    const next = siblings.find((el) => Number(el.dataset.slotIndex) > option.slotIndex);
    optionsLayer.insertBefore(option.element, next ?? null);
  }

  function enter(element, delayMs) {
    if (prefersReducedMotion()) return;
    element.style.animationDelay = `${delayMs}ms`;
    element.classList.add('is-entering');
    element.addEventListener('animationend', () => {
      element.classList.remove('is-entering');
      element.style.animationDelay = '';
    }, { once: true });
  }

  async function leave(elements) {
    if (!elements.length) return;
    if (!prefersReducedMotion()) {
      elements.forEach((element, index) => {
        element.style.animationDelay = `${index * 60}ms`;
        element.classList.add('is-leaving');
      });
      await wait(400 + elements.length * 60);
    }
    elements.forEach((element) => element.remove());
  }

  function createOption(id, slotIndex) {
    const built = buildTriangleElement(TRIANGLES[id], PLATFORM_LAYOUT.optionScale, { interactive: true });
    built.element.dataset.triangleId = id;
    built.element.dataset.slotIndex = String(slotIndex);
    built.element.setAttribute('aria-label', `Frame ${slotIndex + 1}`);
    const option = { id, ...built, slotIndex, homeCenterX: PLATFORM_LAYOUT.slotXs[slotIndex], baseY: PLATFORM_LAYOUT.baseY };
    placeAtHome(option);
    return option;
  }

  return {
    /** Shows the group's options; existing frames in the right slot stay, missing ones drop in. */
    async showOptions(ids, { refreshAll = false } = {}) {
      const stale = [];
      for (const [id, option] of options) {
        const slot = ids.indexOf(id);
        if (refreshAll || slot === -1 || slot !== option.slotIndex || option.element.parentElement !== optionsLayer) {
          stale.push(option.element);
          options.delete(id);
        }
      }
      await leave(stale);
      let added = 0;
      ids.forEach((id, slotIndex) => {
        if (options.has(id)) return;
        const option = createOption(id, slotIndex);
        options.set(id, option);
        insertInSlotOrder(option);
        enter(option.element, added * 110);
        added += 1;
      });
      if (added && !prefersReducedMotion()) await wait(560 + added * 110);
    },
    async clearOptions() {
      const elements = [...options.values()].map((option) => option.element);
      options.clear();
      await leave(elements);
    },
    getOption(id) {
      return options.get(id) ?? null;
    },
    allOptions() {
      return [...options.values()];
    },
    /** Stage-space point the claw must align with: the frame's top vertex at its home slot. */
    grabPointOf(option) {
      return { x: option.homeCenterX - option.width / 2 + option.grabX * option.width, y: option.baseY - option.baseOffset + option.grabY };
    },
    /** Returns true when a new frame became the hovered one (for the comic bloop). */
    setHovered(id) {
      let changed = false;
      for (const option of options.values()) {
        const on = option.id === id;
        if (on && !option.element.classList.contains('is-hovered')) changed = true;
        option.element.classList.toggle('is-hovered', on);
      }
      return changed;
    },
    /** Detach from the platform (the crane now owns the element). */
    lift(option) {
      option.element.classList.remove('is-hovered');
    },
    returnToSlot(option) {
      option.element.style.transform = '';
      option.placedScale = 1;
      option.element.style.width = `${option.width}px`;
      option.element.style.height = `${option.height}px`;
      option.element.classList.remove('is-scaled');
      placeAtHome(option);
      insertInSlotOrder(option);
      return playClassAnimation(option.element, 'is-returning', 500);
    },
    /** The frame now stands in the world at the scale its depth gave it (0.6 on the bridge). */
    placeInWorld(option, left, top, scale = 1) {
      option.placedScale = scale;
      option.element.style.left = `${left}px`;
      option.element.style.top = `${top}px`;
      option.element.style.width = `${option.width * scale}px`;
      option.element.style.height = `${option.height * scale}px`;
      option.element.classList.toggle('is-scaled', scale !== 1);
      placedLayerEl.appendChild(option.element);
    },
    seat: (option) => playClassAnimation(option.element, 'is-seated', 600),
    rejectShake: (option) => playClassAnimation(option.element, 'is-rejected', 720),
    /** Forget an option whose element now belongs to an animation (it flies into the bridge). */
    release(option) {
      options.delete(option.id);
    },
    async dissolvePlaced(option) {
      await playClassAnimation(option.element, 'is-dissolving', 720);
      option.element.remove();
      options.delete(option.id);
    },
    async dropIntoWater(option) {
      await playClassAnimation(option.element, 'is-falling', 980);
      option.element.remove();
      options.delete(option.id);
    },
    nudgePlatform: () => playClassAnimation(platformEl, 'is-nudged', 520),
    /** Spotlight one frame: the scene, the platform and the other frames go dark around it. */
    focusOn(option) {
      document.getElementById('focus-dim')?.classList.add('is-on');
      platformEl.classList.add('is-focusing');
      for (const other of options.values()) other.element.classList.toggle('is-focused', other === option);
    },
    clearFocus() {
      document.getElementById('focus-dim')?.classList.remove('is-on');
      platformEl.classList.remove('is-focusing');
      for (const other of options.values()) other.element.classList.remove('is-focused');
    },
    /** The yard slides away once a frame is lifted, so the bridge takes the whole view. */
    hidePlatform() {
      platformEl.classList.add('is-away');
    },
    /** The load heads into the scene: the foreground yard slides out of the bottom of the frame. */
    recedePlatform() {
      platformEl.classList.add('is-receding');
    },
    showPlatform() {
      if (!platformEl.classList.contains('is-away') && !platformEl.classList.contains('is-receding')) return Promise.resolve();
      platformEl.classList.remove('is-away', 'is-receding');
      return new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 460));
    },
    enterPlatform: () => playClassAnimation(platformEl, 'is-entering', 800),

    /* ---- Intro yard: decorative frames lying around (PDF p4-6) ---- */
    showIntroPile() {
      if (pile.length) return;
      INTRO_PILE.forEach((id, index) => {
        const built = buildTriangleElement(TRIANGLES[id], PLATFORM_LAYOUT.pileScale, { interactive: false });
        built.element.classList.add('triangle--pile');
        const item = { id: `pile-${index}`, ...built, homeCenterX: PLATFORM_LAYOUT.pileXs[index], baseY: PLATFORM_LAYOUT.pileBaseY };
        placeAtHome(item);
        optionsLayer.appendChild(item.element);
        pile.push(item);
        enter(item.element, index * 90);
      });
    },
    pileItems() {
      return [...pile];
    },
    async clearIntroPile() {
      const elements = pile.map((item) => item.element);
      pile.length = 0;
      await leave(elements);
    },
    /** Gentle one-after-another focus motion across the yard frames (never all at once). */
    async focusPulseSequence(signal) {
      const elements = pile.length ? pile.map((item) => item.element) : [...options.values()].map((option) => option.element);
      for (const element of elements) {
        playClassAnimation(element, 'is-focus-pulse', 800);
        await wait(prefersReducedMotion() ? 0 : 170, signal);
      }
    },
  };
}
