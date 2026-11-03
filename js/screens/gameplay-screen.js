import { playClassAnimation } from '../core/motion.js';

/** The seven tasks: the level engine takes over straight away (the task card is the only text). */
export function createGameplayScreen({ els, feedback, triangles, camera, builder, levelEngine }) {
  return {
    async enter() {
      camera.reset(1000).catch(() => {});
      if (els.controls.hidden) {
        els.controls.hidden = false;
        playClassAnimation(els.controls, 'is-entering', 700);
      }
      builder.show();
      await feedback.hideBubble();
      await triangles.clearIntroPile();
      await levelEngine.begin();
    },
    async exit() {
      await feedback.hideBubble();
    },
  };
}
