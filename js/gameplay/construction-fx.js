import { prefersReducedMotion } from '../core/motion.js';

const CONFETTI_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];

function random(min, max) {
  return min + Math.random() * (max - min);
}

/** Short-lived sprites (existing sparkle/ripple assets) and light CSS particles. */
export function createConstructionFx({ fxLayer }) {
  function spawn(className, x, y, { tag = 'div', src, lifetime = 1000, vars = {} } = {}) {
    const element = document.createElement(tag);
    element.className = className;
    if (src) {
      element.src = src;
      element.alt = '';
      element.draggable = false;
    }
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
    fxLayer.appendChild(element);
    setTimeout(() => element.remove(), lifetime);
    return element;
  }

  return {
    sparks(x, y, { small = false } = {}) {
      if (prefersReducedMotion()) return;
      const element = spawn('fx-spark', x + random(-8, 8), y + random(-8, 8), { tag: 'img', src: 'assets/images/fx/sparkle-cluster.png', lifetime: 720 });
      element.style.width = `${small ? 64 : 96}px`;
    },
    /** Comic cartoon puff: three round cloud lobes that burst outward from a point and fade. */
    puff(x, y, { drift = 0 } = {}) {
      if (prefersReducedMotion()) return;
      const element = spawn('fx-puff', x, y, { lifetime: 760, vars: { '--drift': `${drift}px` } });
      element.innerHTML = '<i></i><i></i><i></i><i></i>';
    },
    dust(x, y) {
      if (prefersReducedMotion()) return;
      spawn('fx-dust', x + random(-14, 14), y + random(-6, 6), { lifetime: 800 });
    },
    splash(x, y) {
      spawn('fx-ripple', x, y, { tag: 'img', src: 'assets/images/fx/ripple-1.png', lifetime: 1000 });
      setTimeout(() => spawn('fx-ripple', x + random(-20, 20), y + 6, { tag: 'img', src: 'assets/images/fx/ripple-2.png', lifetime: 1000 }), 140);
      if (prefersReducedMotion()) return;
      for (let i = 0; i < 7; i += 1) {
        spawn('fx-drop', x + random(-30, 30), y - 6, { lifetime: 800, vars: { '--dx': `${random(-34, 34)}px` } });
      }
    },
    ding(x, y) {
      spawn('fx-ding', x, y, { tag: 'img', src: 'assets/images/fx/sparkle-big.png', lifetime: 820 });
    },
    confetti(count = 110) {
      if (prefersReducedMotion()) return;
      for (let i = 0; i < count; i += 1) {
        const piece = spawn('fx-confetti', random(0, 1920), -30, {
          lifetime: 6200,
          vars: { '--dur': `${random(2600, 4400)}ms`, '--delay': `${random(0, 1600)}ms` },
        });
        piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        piece.style.transform = `rotate(${random(0, 360)}deg)`;
      }
    },
    clear() {
      fxLayer.replaceChildren();
    },
  };
}
