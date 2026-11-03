import { playClassAnimation } from '../core/motion.js';

/** The one "next" button style every intro screen shares (bottom-right action corner). */
export function createCtaButton({ overlaysEl, audio, label, onPress }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cta-button overlay-cta';
  button.textContent = label;
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
