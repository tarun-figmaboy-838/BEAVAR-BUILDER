import { playClassAnimation } from '../core/motion.js';

const ICONS = {
  'replay-art': '<img src="assets/images/kit/replay-button.png" alt="" draggable="false">',
  replay: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 12a20 20 0 1 1-18.4 12.2" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M6 14 L17 30 L26 13 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
};

/** Round icon button (no text: `label` is only its accessible name), e.g. replay on the completion screen. */
export function createCtaButton({ overlaysEl, audio, label, icon = 'replay', onPress }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `cta-button icon-cta icon-cta--${icon} overlay-cta`;
  button.setAttribute('aria-label', label);
  button.innerHTML = ICONS[icon] ?? '';
  let pressed = false;
  button.addEventListener('click', () => {
    if (pressed) return;
    pressed = true;
    audio.unlock();
    audio.play('uiTap');
    onPress();
  });
  overlaysEl.appendChild(button);
  playClassAnimation(button, 'is-entering', 600);
  button.focus({ preventScroll: true });
  return button;
}
