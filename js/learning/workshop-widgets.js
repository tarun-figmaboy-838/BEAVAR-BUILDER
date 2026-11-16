/**
 * The board's reusable widgets: pill buttons, name badges, lenses, the option row, the multi-select grid,
 * the sorting crates, the two-way classifier, the summary view and the ghost hand.
 * Each returns plain DOM plus a small API; the flow (learning-flow.js) decides when they appear.
 * Before an answer every option has the same look: no colour, size or motion gives the answer away.
 */
import { buildTriangleFigure } from './triangle-figure.js';
import { LEARNING_COPY } from './learning-content.js';
import { playClassAnimation, prefersReducedMotion } from '../core/motion.js';

const ASSETS = 'assets/images/workshop/';
export const WIDGET_IMAGES = [`${ASSETS}btn-uiPrimary.webp`, `${ASSETS}btn-uiNav.webp`, `${ASSETS}btn-uiSuccess.webp`, `${ASSETS}btn-uiDanger.webp`, `${ASSETS}crate-back.webp`, `${ASSETS}crate-front.webp`, `${ASSETS}card-frame.webp`, `${ASSETS}summary-card.webp`];

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function element(tag, className, html = '') {
  const node = document.createElement(tag);
  node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

function place(node, { left, top, right, bottom, width, height } = {}) {
  if (left !== undefined) node.style.left = `${left}px`;
  if (top !== undefined) node.style.top = `${top}px`;
  if (right !== undefined) node.style.right = `${right}px`;
  if (bottom !== undefined) node.style.bottom = `${bottom}px`;
  if (width !== undefined) node.style.width = `${width}px`;
  if (height !== undefined) node.style.height = `${height}px`;
  return node;
}

const enter = (node, name = 'is-entering', ms = 520) => playClassAnimation(node, name, ms);
async function leave(node, ms = 320) {
  if (!node.isConnected) return;
  if (!prefersReducedMotion()) await playClassAnimation(node, 'is-leaving', ms);
  node.remove();
}

/* ---------- Buttons ---------- */

/** A pill button with words: CHECK (yellow), CONTINUE (green). */
export function createPillButton({ overlayEl, text, tone = 'yellow', at = {}, onPress, enabled = true }) {
  const button = element('button', `ws-pill ws-pill--${tone} ws-interactive`, escapeHtml(text));
  button.type = 'button';
  button.disabled = !enabled;
  place(button, at);
  if (at.center) button.classList.add('ws-pill--center');
  button.addEventListener('click', () => {
    if (button.disabled) return;
    onPress?.();
  });
  overlayEl.appendChild(button);
  enter(button, 'is-entering', 480);
  return {
    element: button,
    setEnabled(value) { button.disabled = !value; },
    pressOnce() { button.disabled = true; },
    remove: () => leave(button, 240),
  };
}

/* ---------- Chips, badges, cards ---------- */

export function createBadge({ overlayEl, text, tone, at }) {
  const badge = element('div', `ws-badge ws-badge--${tone}`, escapeHtml(text));
  const { center = false, ...where } = at ?? {};
  place(badge, where);
  if (center) badge.classList.add('ws-badge--centred');            // hugs its word, centred on `left`
  overlayEl.appendChild(badge);
  enter(badge, 'is-entering', 600);
  freshFocus(badge);
  return { element: badge, remove: () => leave(badge) };
}

/** A lens: "BY SIDES → Isosceles". Two of them merge into the badge stack (PDF L20). */
export function createLens({ overlayEl, title, result, tone, at }) {
  const lens = element('div', `ws-lens ws-lens--${tone}`, `<span class="ws-lens__title">${escapeHtml(title)}</span><span class="ws-lens__arrow" aria-hidden="true">→</span><span class="ws-lens__result">${escapeHtml(result)}</span>`);
  place(lens, at);
  overlayEl.appendChild(lens);
  enter(lens, 'is-entering', 560);
  freshFocus(lens);
  return { element: lens, merge: () => playClassAnimation(lens, 'is-merging', 700), remove: () => leave(lens) };
}

export function createGreatJob({ overlayEl, at }) {
  const chip = element('div', 'ws-greatjob', `<span class="ws-greatjob__tick" aria-hidden="true"></span>${escapeHtml(LEARNING_COPY.greatJob)}`);
  place(chip, at);
  overlayEl.appendChild(chip);
  enter(chip, 'is-entering', 620);
  freshFocus(chip);
  return { element: chip, remove: () => leave(chip) };
}

/** A newly shown chip is the focus for a moment: the rest of the overlay steps back, then comes back. */
function freshFocus(el, ms = 1500) {
  el.classList.add('is-fresh');
  setTimeout(() => el.classList.remove('is-fresh'), prefersReducedMotion() ? 0 : ms);
}

/* ---------- Single-choice question: a centred row of options under the triangle ---------- */

export function createOptionCard({ overlayEl, prompt, options, audio, onSelect, at = { top: 556 } }) {
  const row = element('div', 'ws-options-row');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', prompt);
  place(row, at);
  const buttons = options.map((option, index) => {
    const button = element('button', 'ws-option ws-option--pill ws-interactive', `<span class="ws-option__text">${escapeHtml(option)}</span>`);
    button.type = 'button';
    button.dataset.option = option;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.style.setProperty('--i', String(index));
    button.addEventListener('click', () => {
      if (!enabled || button.disabled) return;
      audio?.play('uiTap');
      for (const other of buttons) {
        other.classList.toggle('is-selected', other === button);
        other.setAttribute('aria-checked', String(other === button));
      }
      onSelect?.(option, button);
    });
    row.appendChild(button);
    return button;
  });
  let enabled = true;
  overlayEl.appendChild(row);
  enter(row, 'is-entering', 560);
  return {
    element: row,
    setEnabled(value) {
      enabled = Boolean(value);
      row.classList.toggle('is-locked', !enabled);
    },
    markCorrect(option) {
      for (const button of buttons) {
        button.classList.toggle('is-correct', button.dataset.option === option);
        button.disabled = true;
      }
    },
    /** A gentle shake; the choice is cleared so the learner can try again. */
    async markIncorrect(option) {
      const button = buttons.find((b) => b.dataset.option === option);
      if (!button) return;
      button.classList.add('is-incorrect');
      button.classList.remove('is-selected');
      button.disabled = true;                          // a wrong answer stays out: it cannot be tapped again
      button.setAttribute('aria-checked', 'false');
      await playClassAnimation(button, 'is-shaking', 520);
    },
    remove: () => leave(row),
  };
}

/* ---------- Multi-select grid (CFU: which are acute-angled?) ---------- */

export function createMultiGrid({ overlayEl, cards, audio, onChange }) {
  const root = element('div', 'ws-grid');
  const selection = new Set();
  const buttons = cards.map((card, index) => {
    const button = element('button', 'ws-pick ws-interactive');
    button.type = 'button';
    button.dataset.card = card.id;
    button.setAttribute('aria-pressed', 'false');
    button.style.setProperty('--i', String(index));
    button.setAttribute('aria-label', `Triangle ${card.id}`);
    const figure = buildTriangleFigure(card.spec, { width: 318, height: 270, labels: 'angles', arcs: true, square: true, pad: 6, strokeScale: 1.2, labelSize: 21 });
    button.append(figure.svg, element('span', 'ws-pick__tick', ''));     // picked: a tick badge, no words
    place(button, { left: 60 + index * 370, top: 70 });
    button.addEventListener('click', () => {
      if (!enabled) return;
      audio?.play('uiTap');
      const on = !selection.has(card.id);
      if (on) selection.add(card.id); else selection.delete(card.id);
      button.classList.toggle('is-selected', on);
      button.setAttribute('aria-pressed', String(on));
      onChange?.(new Set(selection));
    });
    root.appendChild(button);
    return button;
  });
  let enabled = true;
  overlayEl.appendChild(root);
  enter(root, 'is-entering', 560);
  return {
    element: root,
    get selection() { return new Set(selection); },
    setEnabled(value) { enabled = Boolean(value); root.classList.toggle('is-locked', !enabled); },
    /** After a wrong CHECK: wrong picks shake and clear, right picks stay. */
    async shakeWrong(correctIds) {
      const wrong = buttons.filter((b) => selection.has(b.dataset.card) && !correctIds.includes(b.dataset.card));
      await Promise.all(wrong.map((b) => playClassAnimation(b, 'is-shaking', 520)));
      for (const b of wrong) {
        selection.delete(b.dataset.card);
        b.classList.remove('is-selected');
        b.classList.add('is-ruled-out');
        b.disabled = true;                             // a wrong pick cannot be picked again
        b.setAttribute('aria-pressed', 'false');
      }
    },
    markResult(correctIds) {
      for (const b of buttons) {
        const right = correctIds.includes(b.dataset.card);
        b.classList.toggle('is-correct', right);
        b.classList.toggle('is-dimmed', !right);
      }
    },
    remove: () => leave(root),
  };
}

/* ---------- Sorting: drag each triangle card into its crate ---------- */

export function createSortBoard({ overlayEl, cards, bins, audio, onDrop, onAllSorted }) {
  const root = element('div', 'ws-sort');
  // One triangle at a time sits on the bench with its lengths in view; the rest wait in a small pile on
  // the left; the crates stand along the bottom. Reading the lengths (and the tick marks) is the task.
  const BENCH = Object.freeze({ left: 610, top: 0, width: 340, height: 340 });   // a square card on the bench
  const DECK_TILT = [0, -10, 10];                   // the waiting cards sit behind it, tilted left and right (a card stack)
  const BIN = Object.freeze({ width: 280, xs: [180, 640, 1100], top: 410 });
  const PLACED = Object.freeze({ width: 130, height: 130 });
  const cardEls = new Map();
  const binEls = new Map();
  let enabled = true;
  let selected = null;
  let current = null;

  cards.forEach((card, index) => {
    const node = element('div', 'ws-sort-card ws-interactive is-waiting');
    node.dataset.card = card.id;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `Triangle ${card.id}`);
    const figure = buildTriangleFigure(card.spec, { width: 320, height: 320, labels: 'sides', ticks: true, pad: 14, strokeScale: 1.5, labelSize: 25 });
    node.appendChild(figure.svg);
    node.style.setProperty('--i', String(index));
    node.style.zIndex = String(3 - index);
    place(node, BENCH);
    node.style.setProperty('--tilt', `${DECK_TILT[index % DECK_TILT.length]}deg`);
    root.appendChild(node);
    cardEls.set(card.id, { node, card, figure, placed: false });
  });
  bins.forEach((bin, index) => {
    const node = element('div', 'ws-bin ws-interactive');
    node.dataset.bin = bin.id;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `${bin.label} crate`);
    // Two layers: the crate's back (behind a dropped card) and its front panel with the name (in front of it),
    // so a card dropped in sinks into the box.
    node.innerHTML = `<img class="ws-bin__back" src="${ASSETS}crate-back.webp" alt="" draggable="false">`;
    node.style.setProperty('--i', String(index));
    place(node, { left: BIN.xs[index], top: BIN.top, width: BIN.width });
    const front = element('div', 'ws-bin-front', `<img src="${ASSETS}crate-front.webp" alt="" draggable="false"><span class="ws-bin__label">${escapeHtml(bin.label)}</span>`);
    front.style.setProperty('--i', String(index));
    place(front, { left: BIN.xs[index], top: BIN.top, width: BIN.width });
    root.append(node, front);
    binEls.set(bin.id, { node, front, bin });
  });

  const scaleFactor = () => (root.getBoundingClientRect().width / root.offsetWidth) || 1;
  /** The crate the dragged card is over: the one it overlaps most (its opening and the air just above count). */
  function binUnder(cardNode) {
    const c = cardNode.getBoundingClientRect();
    let best = null;
    let bestArea = 0;
    for (const { node, bin } of binEls.values()) {
      const r = node.getBoundingClientRect();
      const top = r.top - r.height * 0.45;
      const w = Math.min(c.right, r.right) - Math.max(c.left, r.left);
      const h = Math.min(c.bottom, r.bottom) - Math.max(c.top, top);
      if (w > 0 && h > 0 && w * h > bestArea) { bestArea = w * h; best = bin.id; }
    }
    return best;
  }
  function highlightBin(id) {
    for (const { node, front, bin } of binEls.values()) { node.classList.toggle('is-over', bin.id === id); front.classList.toggle('is-over', bin.id === id); }
  }
  function select(id) {
    selected = id;
    for (const entry of cardEls.values()) entry.node.classList.toggle('is-selected', entry.card.id === id);
  }
  /** The next waiting triangle grows out of the pile onto the bench. */
  function advance() {
    const next = [...cardEls.values()].find((e) => !e.placed && e !== current);
    current = next ?? null;
    if (!next) return;
    next.node.classList.remove('is-waiting');
    next.node.classList.add('is-current');
    next.node.style.zIndex = '4';
    place(next.node, BENCH);
    audio?.play('badge');
  }

  async function settleInto(entry, binId, { dropped = false } = {}) {
    const bin = binEls.get(binId);
    const k = bins.findIndex((b) => b.id === binId);
    entry.placed = true;
    // It stays where it was dropped (over its crate): no slide back to the bench.
    entry.node.classList.remove('is-dragging', 'is-selected', 'is-current');
    // The lesson's cue first: the equal sides light up (none on a scalene, all three on an equilateral).
    const equal = entry.figure.measured.equalSides;
    const bodies = entry.node.querySelectorAll('.ws-figure__body');
    bodies.forEach((line, i) => { if (equal[i]) line.classList.add('is-lit'); });
    audio?.play('snapEqual');
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 520));
    // Then it shrinks to just above its crate's opening and sinks in, behind the front panel, its top showing.
    // A card dropped on the crate stays low (no hop); a card sent from the bench with a tap flies over first.
    const left = BIN.xs[k] + (BIN.width - PLACED.width) / 2;
    entry.node.style.transform = '';
    entry.node.classList.add('is-placed');
    entry.node.classList.toggle('is-dropped-in', dropped);
    entry.node.style.zIndex = '5';
    place(entry.node, { left, top: dropped ? BIN.top - PLACED.height + 40 : BIN.top - PLACED.height - 30, width: PLACED.width, height: PLACED.height });
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 480));
    entry.node.style.zIndex = '2';                                     // between the crate's back and its front
    entry.node.classList.add('is-dropping');
    place(entry.node, { left, top: BIN.top - 22 });
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 420));
    entry.node.classList.remove('is-dropping');
    bodies.forEach((line) => line.classList.remove('is-lit'));
    bin.node.classList.add('is-filled');
    audio?.play('snapRight');
    playClassAnimation(bin.node, 'is-receiving', 520);
    playClassAnimation(bin.front, 'is-receiving', 520);
    playClassAnimation(bin.front.querySelector('.ws-bin__label'), 'is-pulse', 480);
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 260));
    advance();
    if (!current) onAllSorted?.();                // only once the last card is in its crate
  }
  async function bounceBack(entry) {
    entry.node.classList.remove('is-dragging');
    entry.node.style.transform = '';
    audio?.play('softNo');
    // Look again: the three lengths pulse one after another.
    entry.node.querySelectorAll('.ws-figure__label--side').forEach((el, i) => setTimeout(() => playClassAnimation(el, 'is-pulse', 560), 260 + i * 140));
    await playClassAnimation(entry.node, 'is-shaking', 520);
  }
  async function attempt(cardId, binId) {
    const entry = cardEls.get(cardId);
    if (!entry || entry.placed || entry !== current || !enabled) return;
    const ok = onDrop?.(cardId, binId);
    const dropped = Boolean(entry.node.style.transform);       // dragged onto the crate (not tapped there)
    select(null);
    highlightBin(null);
    if (ok) await settleInto(entry, binId, { dropped });
    else await bounceBack(entry);
  }

  for (const entry of cardEls.values()) {
    const { node } = entry;
    let drag = null;
    node.addEventListener('pointerdown', (event) => {
      if (!enabled || entry.placed || entry !== current) return;
      event.preventDefault();
      try { node.setPointerCapture(event.pointerId); } catch { /* older browsers */ }
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      node.classList.add('is-dragging');
      audio?.play('vertexPick');
    });
    node.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const k = scaleFactor();
      const dx = (event.clientX - drag.x) / k;
      const dy = (event.clientY - drag.y) / k;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      node.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.72)`;
      highlightBin(binUnder(node));
    });
    const finish = async (event) => {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      const { moved } = drag;
      drag = null;
      if (!moved) {                                  // a tap: pick it up; tapping a crate puts it there
        node.classList.remove('is-dragging');
        node.style.transform = '';
        select(selected === entry.card.id ? null : entry.card.id);
        return;
      }
      const target = binUnder(node);
      if (target) await attempt(entry.card.id, target);
      else {
        node.classList.remove('is-dragging');
        node.style.transform = '';
        highlightBin(null);
      }
    };
    node.addEventListener('pointerup', finish);
    node.addEventListener('pointercancel', finish);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (entry === current) select(selected === entry.card.id ? null : entry.card.id); }
    });
  }
  for (const { node, bin } of binEls.values()) {
    const choose = () => { if (selected) attempt(selected, bin.id); };
    node.addEventListener('click', choose);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
    });
  }

  overlayEl.appendChild(root);
  enter(root, 'is-entering', 560);
  setTimeout(advance, prefersReducedMotion() ? 0 : 620);
  return {
    element: root,
    setEnabled(value) { enabled = Boolean(value); root.classList.toggle('is-locked', !enabled); },
    /**
     * Overlay-space points for the ghost hand: it presses the card's blank lower edge (never the triangle)
     * and carries it along the crates' openings, all three alike, so the hint never gives the answer.
     */
    ghostPath() {
      if (!current) return null;
      return [[BENCH.left + BENCH.width / 2, BENCH.top + BENCH.height - 26], ...BIN.xs.map((x) => [x + BIN.width / 2, BIN.top + 14])];
    },
    /** The triangle on the bench, for the ghost hand to carry a copy of. */
    currentFigure: () => current?.figure.svg ?? null,
    /** Client-space centres and which triangle is on the bench (for the automated play-through). */
    targets() {
      const centre = (node) => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      return { current: current?.card.id ?? null, cards: Object.fromEntries([...cardEls].map(([id, e]) => [id, centre(e.node)])), bins: Object.fromEntries([...binEls].map(([id, e]) => [id, centre(e.node)])) };
    },
    remove: () => leave(root),
  };
}

/** After sorting: the three triangles in their categories with a tick each (PDF CFU01 success). */
export function createSortResult({ overlayEl, cards, bins }) {
  const root = element('div', 'ws-sort-result');
  bins.forEach((bin, index) => {
    const card = cards.find((c) => c.answer === bin.id);
    const panel = element('div', `ws-result-card ws-result-card--${bin.id}`);
    // Its lengths and tick marks stay on the figure (that is why it belongs here); the name sits on the card's edge.
    const figure = buildTriangleFigure(card.spec, { width: 360, height: 250, labels: 'sides', ticks: true, pad: 34 });
    panel.append(element('span', 'ws-result-card__tick', ''), figure.svg, element('span', `ws-badge ws-badge--small ws-result-card__name`, escapeHtml(bin.label)));
    panel.style.setProperty('--i', String(index));
    place(panel, { left: 130 + index * 450, top: 90 });
    root.appendChild(panel);
  });
  overlayEl.appendChild(root);
  enter(root, 'is-entering', 700);
  return { element: root, remove: () => leave(root) };
}

/* ---------- Two-way classifier (CFU: by sides and by angles): two rows under the triangle ---------- */

export function createDualCard({ overlayEl, prompt, groups, audio, onChange, at = { top: 388 } }) {
  const card = element('section', 'ws-dual');
  card.setAttribute('aria-label', prompt);
  place(card, at);
  const selections = {};
  const groupEls = {};
  let enabled = true;
  for (const group of groups) {
    const wrap = element('div', 'ws-group');
    wrap.dataset.group = group.id;
    wrap.innerHTML = `<span class="ws-group__label">${escapeHtml(group.label)}</span><div class="ws-group__options" role="radiogroup" aria-label="${escapeHtml(group.label)}"></div>`;
    const list = wrap.querySelector('.ws-group__options');
    const buttons = group.options.map((option) => {
      const button = element('button', 'ws-option ws-option--pill ws-interactive', `<span class="ws-option__text">${escapeHtml(option)}</span>`);
      button.type = 'button';
      button.dataset.option = option;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.addEventListener('click', () => {
        if (!enabled) return;
        audio?.play('uiTap');
        selections[group.id] = option;
        for (const other of buttons) {
          other.classList.toggle('is-selected', other === button);
          other.setAttribute('aria-checked', String(other === button));
        }
        onChange?.({ ...selections });
        focusNextGroup();
      });
      list.appendChild(button);
      return button;
    });
    card.appendChild(wrap);
    groupEls[group.id] = { wrap, buttons, group };
  }
  overlayEl.appendChild(card);
  enter(card, 'is-entering', 560);
  // One row is the focus at a time: the first is open, the next waits (dimmed) until the first has an answer.
  function focusNextGroup() {
    const rows = [...card.querySelectorAll('.ws-group')];
    const firstOpen = rows.findIndex((row) => !row.querySelector('.is-selected'));
    rows.forEach((row, k) => { row.classList.toggle('is-waiting', firstOpen >= 0 && k > firstOpen); row.classList.toggle('is-active', k === firstOpen); });
  }
  focusNextGroup();
  return {
    element: card,
    get selections() { return { ...selections }; },
    setEnabled(value) { enabled = Boolean(value); card.classList.toggle('is-locked', !enabled); },
    markCorrect() {
      for (const { buttons } of Object.values(groupEls)) for (const b of buttons) { b.disabled = true; if (b.classList.contains('is-selected')) b.classList.add('is-correct'); }
    },
    async markWrong(groupIds) {
      await Promise.all(groupIds.map(async (id) => {
        const { buttons } = groupEls[id];
        const chosen = buttons.find((b) => b.classList.contains('is-selected'));
        if (!chosen) return;
        chosen.classList.add('is-incorrect');
        chosen.classList.remove('is-selected');
        chosen.disabled = true;                        // stays out of the next try
        chosen.setAttribute('aria-checked', 'false');
        delete selections[id];
        await playClassAnimation(chosen, 'is-shaking', 520);
      }));
      onChange?.({ ...selections });
    },
    remove: () => leave(card),
  };
}

/* ---------- Summary ---------- */

/**
 * The summary (PDF p48), told as a recap: each category pops up as one big card the beaver explains from
 * behind, then shrinks into the collection row below; last comes the "both" card with its example.
 */
/** Adds `cls` to each element one after another (160 ms apart), each for `ms`. */
function inTurn(list, cls, ms) {
  [...(list ?? [])].forEach((el, i) => setTimeout(() => playClassAnimation(el, cls, ms), prefersReducedMotion() ? 0 : i * 160));
}
export function createSummaryView({ overlayEl, screen }) {
  const root = element('div', 'ws-summary');
  root.innerHTML = `<div class="ws-summary__row" aria-label="${escapeHtml(LEARNING_COPY.summary.sidesTitle)}, ${escapeHtml(LEARNING_COPY.summary.anglesTitle)}"></div>`;
  const row = root.querySelector('.ws-summary__row');
  const items = [...screen.bySides, ...screen.byAngles];
  // Collected cards gather in two columns: by sides on the left, by angles on the right (nothing shown until a card lands).
  const SLOT = Object.freeze({ width: 168, height: 168, top: 58, step: 196, xs: [90, 1302] });   // square, flat cards
  const sideCount = screen.bySides.length;
  const slotAt = (index) => {
    const col = index < sideCount ? 0 : 1;
    const k = col === 0 ? index : index - sideCount;
    return { left: SLOT.xs[col], top: SLOT.top + k * SLOT.step, col };
  };
  const slots = items.map((item, index) => {
    const slot = element('div', `ws-summary__slot ws-summary__slot--${item.tone}`);
    const at = slotAt(index);
    place(slot, { left: at.left, top: at.top, width: SLOT.width, height: SLOT.height });
    row.appendChild(slot);
    return slot;
  });
  const titles = [LEARNING_COPY.summary.sidesTitle, LEARNING_COPY.summary.anglesTitle].map((text, col) => {
    const chip = element('div', 'ws-summary__title', escapeHtml(text));
    place(chip, { left: SLOT.xs[col] + SLOT.width / 2, top: SLOT.top - 54 });
    row.appendChild(chip);
    return chip;
  });
  overlayEl.appendChild(root);
  const BIG = { left: 545, top: 110, width: 470, height: 470 };
  const BOTH = { left: 560, top: 92, width: 440, height: 430 };
  let big = null;

  function figureFor(item, size) {
    const [width, height] = size;
    return buildTriangleFigure(item.spec, { width, height, labels: null, ticks: item.labels === 'sides', arcs: item.labels === 'angles', square: true, pad: Math.round(width * 0.08), strokeScale: width > 200 ? 1.3 : 0.9 }).svg;
  }
  return {
    element: root,
    /** Pops the big card for one category (the beaver peeks over its top edge from behind). */
    popCard(index) {
      const item = items[index];
      big = element('div', `ws-summary__big ws-summary__big--${item.tone}`);
      // The figure fills the card with its lengths or angles; the name is a tag on the card's bottom edge.
      // The rule itself is said by the beaver (his bubble) while the figure shows it.
      const figure = buildTriangleFigure(item.spec, { width: 430, height: 370, labels: item.labels, ticks: item.labels === 'sides', arcs: item.labels === 'angles', square: true, pad: 8, strokeScale: 1.7, labelSize: 27 }).svg;
      big.append(figure, element('span', `ws-summary__tag ws-badge ws-badge--small ws-badge--${item.tone}`, escapeHtml(item.name)));
      place(big, BIG);
      root.appendChild(big);
      enter(big, 'is-entering', 620);
      return big;
    },
    /** The big card shrinks into its slot in the row and stays there as a small card. */
    async collectCard(index) {
      const item = items[index];
      const slot = slots[index];
      const card = big;
      big = null;
      if (!card) return;
      const target = slotAt(index);
      titles[target.col].classList.add('is-shown');
      card.classList.add('is-collecting');
      card.style.left = `${target.left}px`;
      card.style.top = `${target.top}px`;
      card.style.width = `${SLOT.width}px`;
      card.style.height = `${SLOT.height}px`;
      await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 560));
      card.remove();
      slot.classList.add('is-filled');
      slot.append(figureFor(item, [150, 122]), element('span', `ws-summary__slot-tag ws-badge ws-badge--small ws-badge--${item.tone}`, escapeHtml(item.name)));   // the same name tag, on the card's bottom edge
      playClassAnimation(slot, 'is-receiving', 480);
    },
    /** The closing card: the example classified both ways, and the sentence that says so. */
    popBothCard() {
      big = element('div', 'ws-summary__big ws-summary__big--both');
      const example = buildTriangleFigure(screen.example.spec, { width: 250, height: 170, labels: null, ticks: true, square: true, pad: 16, strokeScale: 1.3 }).svg;
      const badges = element('div', 'ws-summary__badges', screen.example.badges.map((b) => `<span class="ws-badge ws-badge--${b.tone} ws-badge--small">${escapeHtml(b.text)}</span>`).join(''));
      big.append(example, badges, element('p', 'ws-summary__both', escapeHtml(LEARNING_COPY.summary.both)));
      place(big, BOTH);
      root.appendChild(big);
      enter(big, 'is-entering', 620);
      return big;
    },
    /** Spoken-word cues on the open card: its name warms up, its figure pulses (Polygon recap style). */
    pulseName() { const el = big?.querySelector('.ws-summary__tag'); if (el) playClassAnimation(el, 'is-pulse', 700); },
    /** Word cues on the open card (dual coding): what he says lights up in the figure as he says it. */
    lightSides() { inTurn(big?.querySelectorAll('.ws-figure__body'), 'is-lit', 900); },
    pulseLengths() { inTurn(big?.querySelectorAll('.ws-figure__label--side'), 'is-pulse', 700); },
    pulseEqual() {
      if (!big) return;
      const labels = [...big.querySelectorAll('.ws-figure__label--side')];
      const count = (el) => labels.filter((x) => x.textContent === el.textContent).length;
      inTurn(labels.filter((el) => count(el) > 1), 'is-pulse', 700);
      inTurn(big.querySelectorAll('.ws-figure__tick'), 'is-pulse', 700);
    },
    pulseCorners() { inTurn(big?.querySelectorAll('.ws-figure__wedge'), 'is-pulse', 700); },
    pulseSpecial() {
      if (!big) return;
      const special = big.querySelectorAll('.ws-figure__square, .ws-figure__wedge.ws-corner--obtuse');
      inTurn(special.length ? special : big.querySelectorAll('.ws-figure__wedge'), 'is-pulse', 900);
      inTurn(big.querySelectorAll('.ws-figure__label--angle'), 'is-pulse', 700);
    },
    /** Once every card is home, the row hops together towards the middle, one after another. */
    gather() {
      slots.forEach((slot, i) => {
        const dx = slotAt(i).col === 0 ? 16 : -16;      // each column hops towards the middle
        slot.animate?.([{ translate: '0 0' }, { translate: `${dx}px -14px`, offset: 0.45 }, { translate: '0 0' }],   // a hop towards the middle and back: the columns stay under their titles
          { duration: prefersReducedMotion() ? 0 : 520, delay: prefersReducedMotion() ? 0 : i * 70, easing: 'cubic-bezier(0.3, 1.2, 0.5, 1)' });
      });
      return new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 440 + slots.length * 70));
    },
    remove: () => leave(root),
  };
}

/* ---------- The ghost hand: shows the gesture after a moment of idling (Fishing Frenzy's hand nudge) ---------- */
const HAND_SVG = `<svg class="ws-ghost__hand" viewBox="-4 -4 76 90" aria-hidden="true"><path d="M20 7c0-3.6 2.9-6.5 6.5-6.5S33 3.4 33 7v25.5l3.4-1.3c3.2-1.2 6.8.3 8.1 3.4l.3.7 2.7-1c3.2-1.1 6.7.4 8 3.6l.4 1 2-.6c3.3-1 6.8.8 7.8 4.1.2.7.3 1.4.3 2.1V58c0 11.6-9.4 21-21 21h-6.4c-7.8 0-15-4.3-18.6-11.3L2.6 47.4c-1.6-3.1-.4-6.9 2.7-8.5 2.8-1.5 6.2-.7 8.1 1.8L20 49V7z" fill="#fff" stroke="#123b63" stroke-width="3.2" stroke-linejoin="round"/><path d="M33 33v12M45 35v10M55 38v8" stroke="#123b63" stroke-width="2.6" stroke-linecap="round" opacity=".55"/></svg>`;
export function createGhostHand({ hostEl }) {
  const root = element('div', 'ws-ghost', `<span class="ws-ghost__card"></span><span class="ws-ghost__dot"></span><span class="ws-ghost__ring"></span>${HAND_SVG}`);
  const cardEl = root.querySelector('.ws-ghost__card');
  root.hidden = true;
  hostEl.appendChild(root);
  let anim = null;
  const reduced = () => prefersReducedMotion();
  const at = ([x, y], extra = {}) => ({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, ...extra });
  /** Appear on the first point, press, travel through the rest, hold, fade. */
  function dragFrames(pts) {
    const step = 0.62 / Math.max(1, pts.length - 1);
    const frames = [at(pts[0], { opacity: 0, offset: 0 }), at(pts[0], { opacity: 1, offset: 0.12 }), at(pts[0], { opacity: 1, offset: 0.22 })];
    pts.slice(1).forEach((p, i) => frames.push(at(p, { opacity: 1, offset: 0.22 + step * (i + 1) })));
    frames.push(at(pts[pts.length - 1], { opacity: 1, offset: 0.9 }), at(pts[pts.length - 1], { opacity: 0, offset: 1 }));
    return frames;
  }
  function play(frames, duration, { pressed = false, carrying = false } = {}) {
    anim?.cancel();
    if (reduced()) return Promise.resolve();
    root.hidden = false;
    root.classList.toggle('is-dragging', pressed);
    root.classList.toggle('is-carrying', carrying);
    anim = root.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' });
    return anim.finished.then(() => { root.hidden = true; }).catch(() => {});
  }
  return {
    element: root,
    /** Press on `from`, carry a ghost of it (a corner) along `path`, let go at the end. */
    drag(from, ...path) {
      return play(dragFrames([from, ...path]), 1100 + 650 * path.length, { pressed: true });
    },
    /** The same gesture with a small see-through copy of a card (`figure`, an SVG) held above the finger. */
    carry(figure, from, ...path) {
      cardEl.replaceChildren(...(figure ? [figure.cloneNode(true)] : []));
      return play(dragFrames([from, ...path]), 1100 + 650 * path.length, { pressed: true, carrying: true });
    },
    /** Point along the choices one after another (no tap: it never picks one). */
    point(points) {
      if (!points.length) return Promise.resolve();
      const step = 0.8 / points.length;
      const frames = [at(points[0], { opacity: 0, offset: 0 })];
      points.forEach((p, i) => { frames.push(at(p, { opacity: 1, offset: 0.08 + step * i })); frames.push(at([p[0], p[1] + 10], { opacity: 1, offset: 0.08 + step * i + step * 0.45 })); });
      frames.push(at(points[points.length - 1], { opacity: 0, offset: 1 }));
      return play(frames, 900 * points.length + 600);
    },
    stop() { anim?.cancel(); anim = null; root.hidden = true; },
    remove() { this.stop(); root.remove(); },
  };
}
