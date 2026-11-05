import { BRIDGE_GEOMETRY } from '../data/bridge-geometry.js';
import { prefersReducedMotion, wait } from '../core/motion.js';

/**
 * The ending (PDF p19): the beaver opens the new bridge by cutting a ribbon, then the animal town uses it,
 * a car, a scooter, a bicycle and walkers crossing both ways on the deck road. Everything moves on the
 * road between the deck and the truss, so the truss bars pass in front of it, as on a real through-truss.
 * Sprites: assets/images/celebration (generated in Figma for this game, cut out of a flat background).
 */
const ROAD_Y = BRIDGE_GEOMETRY.deckY + 4;          // where wheels and feet meet the road plates
const RIBBON_X = 960;
const ENTER_X = -260;
const EXIT_X = 2180;

/** Each traveller: sprite, height on screen (px), speed (px/s), the way it bounces, its lane. */
const TRAVELLERS = Object.freeze({
  car: { src: 'assets/images/celebration/car.png', height: 112, speed: 360, bob: 'ride' },
  scooter: { src: 'assets/images/celebration/scooter.png', height: 106, speed: 300, bob: 'ride' },
  cyclist: { src: 'assets/images/celebration/cyclist.png', height: 104, speed: 210, bob: 'pedal' },
  walkers: { src: 'assets/images/celebration/walkers.png', height: 96, speed: 120, bob: 'walk' },
});
/** Who crosses, which way, in turn (the near lane goes right, the far lane comes back left). */
const TRAFFIC = Object.freeze([
  ['car', 1], ['cyclist', -1], ['scooter', 1], ['walkers', -1], ['cyclist', 1], ['car', -1], ['walkers', 1], ['scooter', -1],
]);
const BEAVER = Object.freeze({ src: 'assets/images/celebration/beaver-scissors.png', height: 118, speed: 260 });

export const TOWN_LIFE_IMAGES = [BEAVER.src, ...Object.values(TRAVELLERS).map((t) => t.src)];

export function createTownLife({ bridgeEl, fx, audio }) {
  const layer = document.createElement('div');
  layer.className = 'town-life';
  layer.setAttribute('aria-hidden', 'true');
  bridgeEl.insertBefore(layer, bridgeEl.querySelector('svg.truss'));
  let running = false;
  let trafficTimer = 0;
  let turn = 0;

  /** A sprite standing on the road at x, facing `dir` (1 right, -1 left). Returns { el, moveTo }. */
  function sprite({ src, height, bob }, x, dir, lane = 0) {
    const el = document.createElement('div');
    el.className = `townie townie--${bob}${lane ? ' townie--far' : ''}`;
    el.style.setProperty('--h', `${height}px`);
    el.style.left = '0px';
    el.style.top = `${ROAD_Y - (lane ? 6 : 0)}px`;
    el.style.transform = `translateX(${x}px)`;
    el.innerHTML = `<span class="townie__face" style="--dir:${dir}"><img src="${src}" alt="" draggable="false"></span>`;
    layer.appendChild(el);
    const moveTo = (toX, speed) => new Promise((resolve) => {
      const from = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
      const ms = (Math.abs(toX - from) / speed) * 1000;
      el.classList.add('is-moving');
      const animation = el.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${toX}px)` }], { duration: ms, easing: 'linear', fill: 'forwards' });
      animation.onfinish = () => {
        el.style.transform = `translateX(${toX}px)`;
        animation.cancel();
        el.classList.remove('is-moving');
        resolve();
      };
      animation.oncancel = () => resolve();
    });
    return { el, moveTo };
  }

  function buildRibbon() {
    const ribbon = document.createElement('div');
    ribbon.className = 'ribbon';
    ribbon.style.left = `${RIBBON_X}px`;
    ribbon.style.top = `${ROAD_Y}px`;
    ribbon.innerHTML = `
      <span class="ribbon__post ribbon__post--l"></span><span class="ribbon__post ribbon__post--r"></span>
      <span class="ribbon__half ribbon__half--l"></span><span class="ribbon__half ribbon__half--r"></span>
      <span class="ribbon__bow"><i></i><i></i><b></b></span>`;
    layer.appendChild(ribbon);
    return ribbon;
  }

  /** PDF p19: two tall banners, purple and blue, hanging from the bridge's top chords, one each side. */
  function buildBanners(text) {
    const [lx, ly] = BRIDGE_GEOMETRY.nodes.L;
    const [ax, ay] = BRIDGE_GEOMETRY.nodes.A;
    const chordY = (x) => ly + ((x - lx) / (ax - lx)) * (ay - ly);       // the left chord; the right one mirrors it
    const group = document.createElement('div');
    group.className = 'town-banners';
    group.innerHTML = [[600, 'purple'], [2 * ax - 600, 'blue']].map(([x, colour], i) => `
      <span class="town-banner town-banner--${colour}" style="left:${x}px;top:${chordY(Math.min(x, 2 * ax - x)).toFixed(1)}px;--i:${i}">
        <span class="town-banner__rod"></span>
        <span class="town-banner__cloth">${text.split(' ').map((w) => `<b>${w}</b>`).join('')}<i></i></span>
      </span>`).join('');
    bridgeEl.appendChild(group);        // in front of the truss: they hang from its chords
    return group;
  }

  function spawnTraveller() {
    if (!running) return;
    const [kind, dir] = TRAFFIC[turn % TRAFFIC.length];
    turn += 1;
    const traveller = TRAVELLERS[kind];
    const startX = dir > 0 ? ENTER_X : EXIT_X;
    const endX = dir > 0 ? EXIT_X : ENTER_X;
    const { el, moveTo } = sprite(traveller, startX, dir, dir < 0 ? 1 : 0);
    moveTo(endX, traveller.speed).then(() => el.remove());
    trafficTimer = setTimeout(spawnTraveller, 1700 + Math.random() * 900);
  }

  return {
    /** Ribbon and banner in place, before the beaver comes down. */
    prepare() {
      layer.replaceChildren();
      this.ribbon = buildRibbon();
    },
    /** The beaver walks out onto the bridge, cuts the ribbon, cheers, and walks back to his crane. */
    async inaugurate({ bannerText, signal } = {}) {
      const ribbon = this.ribbon ?? buildRibbon();
      const reduced = prefersReducedMotion();
      const beaver = sprite({ ...BEAVER, bob: 'walk' }, reduced ? RIBBON_X - 120 : ENTER_X, 1);
      if (!reduced) await beaver.moveTo(RIBBON_X - 118, BEAVER.speed);
      if (signal?.aborted) return;
      await wait(reduced ? 0 : 260, signal);
      beaver.el.classList.add('is-snipping');
      audio.play('clank', { variant: 2 });
      await wait(reduced ? 0 : 220, signal);
      ribbon.classList.add('is-cut');
      audio.play('bolt');
      fx.weld?.(RIBBON_X, ROAD_Y - 52);
      fx.confetti(70);
      audio.play('celebration');
      this.banner = buildBanners(bannerText);
      await wait(reduced ? 0 : 500, signal);
      beaver.el.classList.remove('is-snipping');
      beaver.el.classList.add('is-cheering');
      await wait(reduced ? 0 : 1100, signal);
      beaver.el.classList.remove('is-cheering');
      beaver.el.querySelector('.townie__face').style.setProperty('--dir', '-1');
      if (!reduced) await beaver.moveTo(ENTER_X, BEAVER.speed * 1.2);
      beaver.el.remove();
    },
    /** The town crosses the new bridge, both ways, until stop(). */
    startTraffic() {
      if (running || prefersReducedMotion()) return;
      running = true;
      spawnTraveller();
    },
    stop() {
      running = false;
      clearTimeout(trafficTimer);
      layer.replaceChildren();
      this.banner?.remove();
      this.banner = null;
      this.ribbon = null;
    },
  };
}

/* ---------- The bridge from the road: three shots like PDF p19 (entrance, inside, far end) ----------
   Painted backgrounds (generated in Figma for this game) with the townsfolk moving along each road in
   true perspective: every shot knows its vanishing point and how fast the road widens either side of
   it, so a traveller's place, size and speed follow from its distance down the road. */
const SHOT_SPRITES = Object.freeze({
  carFront: { src: 'assets/images/celebration/car-front.png', ratio: 429 / 420, size: 0.62 },
  cyclistBack: { src: 'assets/images/celebration/cyclist-back.png', ratio: 191 / 420, size: 0.7 },
  scooterBack: { src: 'assets/images/celebration/scooter-back.png', ratio: 238 / 420, size: 0.68 },
  walkersFront: { src: 'assets/images/celebration/walkers-front.png', ratio: 325 / 420, size: 0.5 },
});
/**
 * vp: vanishing point; slopeL/slopeR: road half-width per px below it, on each side.
 * Each traveller: sprite, side offset (in road half-widths: -0.5 left lane, 0.5 right lane, 1.3 footpath),
 * distance from z0 to z1 (1 = the bottom of the picture, larger = further away), bob style.
 */
const SHOTS = Object.freeze([
  {
    src: 'assets/images/celebration/shot-front.png', ms: 3800, vp: [958, 548], slopeL: 1.8, slopeR: 1.8,
    travellers: [
      { sprite: 'cyclistBack', side: -0.5, z0: 1.6, z1: 7, delay: 0, bob: 'pedal' },
      { sprite: 'carFront', side: 0.5, z0: 9, z1: 1.25, delay: 500, bob: 'ride' },
      { sprite: 'scooterBack', side: -0.45, z0: 1.4, z1: 8, delay: 1500, bob: 'ride' },
    ],
  },
  {
    src: 'assets/images/celebration/shot-inside.png', ms: 4200, vp: [940, 499], slopeL: 1.6, slopeR: 1.23,
    travellers: [
      { sprite: 'walkersFront', side: 1.32, z0: 4.5, z1: 1.15, delay: 0, bob: 'walk' },
      { sprite: 'scooterBack', side: -0.5, z0: 1.3, z1: 6, delay: 300, bob: 'ride' },
      { sprite: 'carFront', side: 0.5, z0: 8, z1: 1.2, delay: 1300, bob: 'ride' },
      { sprite: 'cyclistBack', side: -0.45, z0: 1.4, z1: 6, delay: 2100, bob: 'pedal' },
    ],
  },
  {
    src: 'assets/images/celebration/shot-back.png', ms: 3600, vp: [950, 543], slopeL: 1.32, slopeR: 1.38,
    travellers: [
      { sprite: 'scooterBack', side: -0.5, z0: 1.3, z1: 7, delay: 0, bob: 'ride' },
      { sprite: 'walkersFront', side: 0.82, z0: 5, z1: 1.6, delay: 300, bob: 'walk' },
      { sprite: 'cyclistBack', side: -0.42, z0: 1.5, z1: 8, delay: 1000, bob: 'pedal' },
    ],
  },
]);
const SHOT_FADE_MS = 550;

export const BRIDGE_SHOT_IMAGES = [...SHOTS.map((shot) => shot.src), ...Object.values(SHOT_SPRITES).map((sprite) => sprite.src)];

/** Plays the three road-level shots over `host` (cross-fading, each with a slow push-in). Resolves when done. */
export async function playBridgeShots(host, { signal } = {}) {
  if (prefersReducedMotion()) return;
  const layer = document.createElement('div');
  layer.className = 'bridge-shots';
  layer.setAttribute('aria-hidden', 'true');
  host.appendChild(layer);
  const frames = [];
  let alive = true;
  signal?.addEventListener('abort', () => { alive = false; }, { once: true });

  function runTraveller(shotEl, shot, t) {
    const sprite = SHOT_SPRITES[t.sprite];
    const el = document.createElement('div');
    el.className = `shot-townie townie--${t.bob}`;
    el.innerHTML = `<img src="${sprite.src}" alt="" draggable="false">`;
    shotEl.appendChild(el);
    const [vx, vy] = shot.vp;
    const slope = t.side < 0 ? shot.slopeL : shot.slopeR;
    const yNear = 1080;
    const duration = shot.ms - t.delay;
    const start = performance.now() + t.delay;
    const place = (now) => {
      const p = Math.max(0, Math.min(1, (now - start) / duration));
      const z = t.z0 + (t.z1 - t.z0) * p;               // steady speed along the road
      const d = 1 / z;                                   // perspective: depth 1 at the bottom of the picture
      const y = vy + (yNear - vy) * d;
      const halfWidth = slope * (y - vy);
      const x = vx + t.side * halfWidth;
      const h = sprite.size * halfWidth;
      el.style.transform = `translate(${(x - (h * sprite.ratio) / 2).toFixed(1)}px, ${(y - h).toFixed(1)}px)`;
      el.style.height = `${h.toFixed(1)}px`;
      el.style.width = `${(h * sprite.ratio).toFixed(1)}px`;
      el.style.zIndex = String(Math.round(d * 1000));    // nearer in front
      el.style.opacity = now < start ? '0' : '1';
      if (alive && p < 1) requestAnimationFrame(place);
    };
    requestAnimationFrame(place);
  }

  try {
    for (const [index, shot] of SHOTS.entries()) {
      const shotEl = document.createElement('div');
      shotEl.className = 'bridge-shot';
      shotEl.innerHTML = `<img class="bridge-shot__bg" src="${shot.src}" alt="" draggable="false">`;
      layer.appendChild(shotEl);
      frames.push(shotEl);
      shotEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: index ? SHOT_FADE_MS : 700, easing: 'ease-in-out', fill: 'forwards' });
      shotEl.querySelector('.bridge-shot__bg').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], { duration: shot.ms + SHOT_FADE_MS, easing: 'linear', fill: 'forwards' });
      shot.travellers.forEach((t) => runTraveller(shotEl, shot, t));
      await wait(shot.ms, signal);
      if (index) frames[index - 1].remove();
    }
    await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-in-out', fill: 'forwards' }).finished;
  } catch {
    /* skipped */
  } finally {
    alive = false;
    layer.remove();
  }
}
