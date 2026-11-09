import { prefersReducedMotion } from '../core/motion.js';

const CONFETTI_COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];

function random(min, max) {
  return min + Math.random() * (max - min);
}

/** Short-lived effects: hot-metal sparks, glows and smoke (CSS), splashes (ripple sprites), confetti. */
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

  /**
   * Real hot-metal sparks: tiny white-hot points thrown up and out that arc over and fall under gravity,
   * cooling from white to orange as they fly. Each spark is two layers: the outer one carries the
   * sideways drift at a steady speed, the inner one rises then falls (an eased up-and-down = a parabola).
   */
  function sparkShower(x, y, { count = 12, spread = 1, power = 1 } = {}) {
    for (let i = 0; i < count; i += 1) {
      const angle = (-90 + random(-85, 85) * spread) * (Math.PI / 180);   // mostly upward, fanned out wide
      const speed = random(70, 160) * power;
      const ms = random(520, 900);
      const outer = spawn('fx-spark-x', x, y, {
        lifetime: ms + 60,
        vars: { '--dx': `${(Math.cos(angle) * speed).toFixed(1)}px`, '--ms': `${ms.toFixed(0)}ms` },
      });
      const dot = document.createElement('i');
      dot.className = 'fx-spark-dot';
      dot.style.setProperty('--up', `${(Math.sin(angle) * speed * 0.55).toFixed(1)}px`);
      dot.style.setProperty('--fall', `${random(45, 95).toFixed(0)}px`);
      dot.style.setProperty('--size', `${random(3, 6).toFixed(1)}px`);
      outer.appendChild(dot);
    }
  }

  return {
    /** A few sparks where a beam is fixed in place (no sticker, no twinkle). */
    sparks(x, y, { small = false } = {}) {
      if (prefersReducedMotion()) return;
      spawn('fx-weld-core fx-weld-core--small', x, y, { lifetime: 320 });
      sparkShower(x, y, { count: small ? 4 : 7, power: small ? 0.6 : 0.8 });
    },
    /**
     * The fit: a weld at a joint. A small white-hot point, the joint glowing yellow then cooling to orange,
     * a shower of falling sparks and a thin wisp of smoke. Transform/opacity only.
     */
    weld(x, y) {
      if (prefersReducedMotion()) {
        spawn('fx-weld-glow fx-weld-glow--still', x, y, { lifetime: 600 });
        return;
      }
      spawn('fx-weld-core', x, y, { lifetime: 320 });
      spawn('fx-weld-glow fx-weld-glow--hot', x, y, { lifetime: 700 });
      spawn('fx-weld-glow fx-weld-glow--warm', x, y, { lifetime: 1300 });
      sparkShower(x, y, { count: 13 });
      setTimeout(() => spawn('fx-smoke', x + random(-6, 6), y - 6, { lifetime: 1500 }), 140);
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
