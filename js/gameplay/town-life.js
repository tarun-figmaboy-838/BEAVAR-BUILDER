import { BRIDGE_GEOMETRY } from '../data/bridge-geometry.js';
import { prefersReducedMotion, wait } from '../core/motion.js';

/**
 * The ending (PDF p19), side view: once the bridge is opened, the animal town uses it: a car, a scooter,
 * a bicycle and walkers crossing both ways on the deck road. Everything moves on the
 * road between the deck and the truss, so the truss bars pass in front of it, as on a real through-truss.
 * Sprites: assets/images/celebration (generated in Figma for this game, cut out of a flat background).
 */
const ROAD_Y = BRIDGE_GEOMETRY.deckY + 4;          // where wheels and feet meet the road plates
const ENTER_X = -260;
const EXIT_X = 2180;

/** Each traveller: sprite, height on screen (px), speed (px/s), the way it bounces, its lane. */
const TRAVELLERS = Object.freeze({
  // Every traveller is a 4-frame cycle (wheels turning, pedalling, stepping); `cycleMs` is one loop.
  car: { src: 'assets/images/celebration/anim-car-side.png', frames: 4, ratio: 623 / 432, cycleMs: 320, height: 107, speed: 360, bob: 'cycle' },
  scooter: { src: 'assets/images/celebration/anim-scooter-side.png', frames: 4, ratio: 471 / 432, cycleMs: 340, height: 107, speed: 300, bob: 'cycle' },
  cyclist: { src: 'assets/images/celebration/anim-cyclist-side.png', frames: 4, ratio: 431 / 432, cycleMs: 480, height: 107, speed: 210, bob: 'cycle' },
  walkers: { src: 'assets/images/celebration/walk-hedgehogs-side.png', frames: 4, ratio: 412 / 432, cycleMs: 600, height: 99, speed: 120, bob: 'cycle' },
});
/** Who crosses, which way, in turn (the near lane goes right, the far lane comes back left). */
const TRAFFIC = Object.freeze([
  ['car', 1], ['cyclist', -1], ['scooter', 1], ['walkers', -1], ['cyclist', 1], ['car', -1], ['walkers', 1], ['scooter', -1],
]);
export const TOWN_LIFE_IMAGES = [...Object.values(TRAVELLERS).map((t) => t.src)];

export function createTownLife({ bridgeEl, fx, audio }) {
  const layer = document.createElement('div');
  layer.className = 'town-life';
  layer.setAttribute('aria-hidden', 'true');
  bridgeEl.insertBefore(layer, bridgeEl.querySelector('svg.truss'));
  let running = false;
  let trafficTimer = 0;
  let turn = 0;

  /** A sprite standing on the road at x, facing `dir` (1 right, -1 left). Returns { el, moveTo }. */
  function sprite({ src, height, bob, frames, ratio, cycleMs = 600 }, x, dir, lane = 0) {
    const el = document.createElement('div');
    el.className = `townie townie--${bob}${lane ? ' townie--far' : ''}`;
    el.style.setProperty('--h', `${height}px`);
    el.style.left = '0px';
    el.style.top = `${ROAD_Y - (lane ? 6 : 0)}px`;
    el.style.transform = `translateX(${x}px)`;
    el.innerHTML = frames
      // A real walk cycle: the frames of a strip, stepped through (gameplay.css .walk-strip).
      ? `<span class="townie__face" style="--dir:${dir}"><span class="walk-strip" style="background-image:url('${src}');width:${(height * ratio).toFixed(1)}px;height:${height}px;--cycle:${cycleMs}ms"></span></span>`
      : `<span class="townie__face" style="--dir:${dir}"><img src="${src}" alt="" draggable="false"></span>`;
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


  function spawnTraveller() {
    if (!running) return;
    const [kind, dir] = TRAFFIC[turn % TRAFFIC.length];
    turn += 1;
    const traveller = TRAVELLERS[kind];
    const startX = dir > 0 ? ENTER_X : EXIT_X;
    const endX = dir > 0 ? EXIT_X : ENTER_X;
    const { el, moveTo } = sprite(traveller, startX, dir, dir < 0 ? 1 : 0);
    moveTo(endX, traveller.speed).then(() => el.remove());
    const cue = { car: 'horn', cyclist: 'bell', scooter: 'scooter' }[kind];
    if (cue && turn % 2) setTimeout(() => running && audio.play(cue), 900);
    trafficTimer = setTimeout(spawnTraveller, 1700 + Math.random() * 900);
  }

  return {
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
    },
  };
}

/* ---------- The bridge from the road: three shots like PDF p19 (entrance, inside, far end) ----------
   Painted backgrounds (generated in Figma for this game) with the townsfolk moving along each road in
   true perspective: every shot knows its vanishing point and how fast the road widens either side of
   it, so a traveller's place, size and speed follow from its distance down the road. */
const SHOT_SPRITES = Object.freeze({
  carFront: { src: 'assets/images/celebration/anim-car-front.png', ratio: 502 / 432, size: 0.617, frames: 4, cycleMs: 360 },
  cyclistBack: { src: 'assets/images/celebration/anim-cyclist-back.png', ratio: 245 / 432, size: 0.72, frames: 4, cycleMs: 460 },
  scooterBack: { src: 'assets/images/celebration/anim-scooter-back.png', ratio: 288 / 432, size: 0.699, frames: 4, cycleMs: 380 },
  walkersFront: { src: 'assets/images/celebration/walk-hedgehogs-front.png', ratio: 372 / 432, size: 0.514, frames: 4, cycleMs: 600 },
});
/**
 * vp: vanishing point; slopeL/slopeR: road half-width per px below it, on each side.
 * Each traveller: sprite, side offset (in road half-widths: -0.5 left lane, 0.5 right lane, 1.3 footpath),
 * distance from z0 to z1 (1 = the bottom of the picture, larger = further away), bob style.
 */
const SHOTS = Object.freeze([
  {
    // The entrance: the beaver cuts the ribbon tied between the two posts, then the town drives in.
    src: 'assets/images/celebration/shot-front.png', ms: 4200, vp: [958, 548], slopeL: 1.8, slopeR: 1.8, ceremony: true, sfx: [['bell', 300], ['horn', 1100], ['scooter', 1700]],
    travellers: [
      { sprite: 'cyclistBack', side: -0.5, z0: 1.15, z1: 7, delay: 0, bob: 'pedal' },
      { sprite: 'carFront', side: 0.52, z0: 9, z1: 1.2, delay: 400, bob: 'ride' },
      { sprite: 'scooterBack', side: -0.45, z0: 1.1, z1: 8, delay: 1500, bob: 'ride' },
    ],
  },
  {
    // Inside: the road ends at the bridge's far end (y 702), so nobody is placed further than that (z <= 2.75).
    src: 'assets/images/celebration/shot-inside.png', ms: 4000, vp: [940, 499], slopeL: 1.6, slopeR: 1.23, sfx: [['scooter', 300], ['horn', 1500], ['bell', 2300]],
    travellers: [
      { sprite: 'walkersFront', side: 1.22, z0: 2.7, z1: 1.12, delay: 0, bob: 'walk' },
      { sprite: 'scooterBack', side: -0.5, z0: 1.05, z1: 2.7, delay: 200, bob: 'ride' },
      { sprite: 'carFront', side: 0.5, z0: 2.75, z1: 1.05, delay: 1200, bob: 'ride' },
      { sprite: 'cyclistBack', side: -0.45, z0: 1.05, z1: 2.7, delay: 2000, bob: 'pedal' },
    ],
  },
  {
    // The far end looking back at the crane: the road on the bridge is visible to y 690 (z <= 3.5).
    src: 'assets/images/celebration/shot-back.png', ms: 3600, vp: [950, 543], slopeL: 1.32, slopeR: 1.38, sfx: [['scooter', 100], ['bell', 1200]],
    travellers: [
      { sprite: 'scooterBack', side: -0.5, z0: 1.05, z1: 3.5, delay: 0, bob: 'ride' },
      // No footpath at this end of the bridge (only a kerb under the railing): walkers stay inside, the car comes back.
      { sprite: 'carFront', side: 0.5, z0: 3.5, z1: 1.1, delay: 300, bob: 'ride' },
      { sprite: 'cyclistBack', side: -0.42, z0: 1.05, z1: 3.4, delay: 1100, bob: 'pedal' },
    ],
  },
]);
/** The entrance ceremony: the ribbon between the posts (measured on shot-front), the beaver who cuts it. */
const CEREMONY = Object.freeze({
  // Tied at the knots under the posts' gold balls, at his chest height, so the open blades close right on it.
  ribbon: { x1: 566, x2: 1356, y: 598, sag: 12 },
  // He walks on the entrance shot's road (vanishing point 958, 548; half-width 1.8 px per px below it):
  // size = 0.597 x the road's half-width at his row, so he is the right size at every distance.
  // His box is his body (hat to boots), size 0.597 x the road's half-width; every strip below is drawn at
  // one scale (body 300 px of a 440 px frame, feet 6 px above the frame's bottom), so they swap seamlessly.
  beaver: { size: 0.597, frameH: 440, bodyH: 300, foot: 6,
    away: { src: 'assets/images/celebration/beaver-walk-back.png', cell: 270 },     // back view: walking up to the ribbon
    toward: { src: 'assets/images/celebration/beaver-walk-front.png', cell: 250 },  // front view: walking back to the camera
    poses: { src: 'assets/images/celebration/beaver-snip.png', cell: 494 },         // raise, open, snip (back view), cheer (front)
    road: { vx: 958, vy: 548, slope: 1.8 },
    // At the ribbon: depth 2.18 (feet at y 792), just left of the centre line so the scissors meet the bow.
    stand: { z: 2.18, side: -0.141 },
    // Off-camera, near-left: he enters from (and leaves to) behind the camera, never from the canal.
    offstage: { z: 0.9, side: -1.32 } },
  walkMs: 2100,
});
const SHOT_FADE_MS = 850;      // cross-dissolves between shots, eased, with the camera still drifting

export const BRIDGE_SHOT_IMAGES = [...SHOTS.map((shot) => shot.src), ...Object.values(SHOT_SPRITES).map((sprite) => sprite.src), CEREMONY.beaver.away.src, CEREMONY.beaver.toward.src, CEREMONY.beaver.poses.src];

/**
 * Plays the opening and the three road-level shots over `host` (cross-fading, each with a slow push-in).
 * `onLastShot` fires as the last shot starts (so the side view can already show the open bridge).
 */
export async function playBridgeShots(host, { signal, audio, onLastShot, onEnding } = {}) {
  // (audio: snip, steps, horn, bell, scooter and cheer cues; see audio-manager.js)
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
    el.className = `shot-townie townie--${sprite.frames ? 'cycle' : t.bob}`;
    el.style.opacity = '0';
    el.innerHTML = sprite.frames
      ? `<span class="walk-strip" style="background-image:url('${sprite.src}');--cycle:${sprite.cycleMs}ms"></span>`
      : `<img src="${sprite.src}" alt="" draggable="false">`;
    shotEl.appendChild(el);
    const [vx, vy] = shot.vp;
    const slope = t.side < 0 ? shot.slopeL : shot.slopeR;
    const yNear = 1080;
    const duration = shot.ms - t.delay;
    const start = performance.now() + t.delay;   // `t.delay` counts from when the road opens
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
      el.style.zIndex = String(Math.round(d * 1000) + 10); // nearer in front, always over the ribbon
      // Seamless: whoever is at the far end of the road fades in (arriving) or out (leaving); nobody pops.
      const farEnd = Math.max(t.z0, t.z1);
      const nearFar = 1 - Math.min(1, (farEnd - z) / (farEnd * 0.18));
      el.style.opacity = now < start ? '0' : String(Math.max(0, Math.min(1, 1 - nearFar)).toFixed(3));
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
      shotEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: index ? SHOT_FADE_MS : 1000, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' });
      shotEl.querySelector('.bridge-shot__bg').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }], { duration: shot.ms + SHOT_FADE_MS + (shot.ceremony ? 5200 : 0), easing: 'linear', fill: 'forwards' });
      if (index === SHOTS.length - 1) onLastShot?.();
      if (shot.ceremony) await openRibbon(shotEl, { signal, audio });
      shot.travellers.forEach((t) => runTraveller(shotEl, shot, t));
      (shot.sfx ?? []).forEach(([name, at]) => setTimeout(() => alive && audio?.play(name), at));
      await wait(shot.ms, signal);
      if (index) frames[index - 1].remove();
    }
    onEnding?.();                                                  // the side view pulls back as the last shot dissolves
    await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1100, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' }).finished;
  } catch {
    /* skipped */
  } finally {
    alive = false;
    layer.remove();
  }
}

/** At the entrance: the ribbon is up; the beaver walks in, snips, the halves drop to the posts, confetti, cheers. */
async function openRibbon(shotEl, { signal, audio } = {}) {
  const { ribbon: r, beaver: b, walkMs } = CEREMONY;
  const ribbon = document.createElement('div');
  ribbon.className = 'shot-ribbon';
  const mid = (r.x1 + r.x2) / 2;
  ribbon.innerHTML = `
    <svg viewBox="0 0 1920 1080" aria-hidden="true">
      <path class="shot-ribbon__half shot-ribbon__half--l" d="M ${r.x1} ${r.y} Q ${(r.x1 + mid) / 2} ${r.y + r.sag} ${mid} ${r.y + r.sag * 0.7}"/>
      <path class="shot-ribbon__half shot-ribbon__half--r" d="M ${mid} ${r.y + r.sag * 0.7} Q ${(mid + r.x2) / 2} ${r.y + r.sag} ${r.x2} ${r.y}"/>
    </svg>
    <span class="shot-ribbon__bow" style="left:${mid}px;top:${r.y + r.sag * 0.7}px"><i></i><i></i><b></b></span>`;
  shotEl.appendChild(ribbon);
  const beaver = document.createElement('div');
  beaver.className = 'shot-beaver';
  // Each strip: as tall as frameH / bodyH of his body, its feet line on his feet, centred on his body.
  const strip = (cls, art) => `<span class="${cls}" style="background-image:url('${art.src}');`
    + `height:${((b.frameH / b.bodyH) * 100).toFixed(2)}%;width:${((art.cell / b.bodyH) * 100).toFixed(2)}%;`
    + `bottom:${((-b.foot / b.bodyH) * 100).toFixed(2)}%"></span>`;
  beaver.innerHTML = strip('walk-strip walk-strip--away', b.away) + strip('walk-strip walk-strip--toward', b.toward) + strip('pose-strip', b.poses);
  const pose = (i) => beaver.style.setProperty('--pose', String(i));
  pose(0);
  shotEl.appendChild(beaver);
  /** Place him on the road at depth z (1 = bottom of the picture) and lateral position `side` (road half-widths). */
  const place = (z, side) => {
    const { vx, vy, slope } = b.road;
    const y = vy + (1080 - vy) / z;
    const halfWidth = slope * (y - vy);
    const h = b.size * halfWidth;
    const w = h;
    const x = vx + side * halfWidth;
    beaver.style.width = `${w.toFixed(1)}px`;
    beaver.style.height = `${h.toFixed(1)}px`;
    beaver.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - h).toFixed(1)}px)`;
  };
  place(b.offstage.z, b.offstage.side);
  // A beaver waddles: each step lifts and rocks the body (CSS), and every step lands with a soft footstep.
  const STEP_MS = 300;
  // Walks in perspective: steady through depth, and he reaches the road's middle early in the walk (and
  // leaves it late), so his feet are always on the road, never over the canal or the railing.
  const walk = (from, to, ms) => new Promise((resolve) => {
    const away = to.z > from.z;
    beaver.classList.add('is-walking', away ? 'is-away' : 'is-toward');
    let n = 0;
    const steps = setInterval(() => audio?.play('step', { variant: n++ }), STEP_MS);
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const zt = t * t * (3 - 2 * t);                                  // eases off at both ends
      const st = away ? 1 - Math.pow(1 - t, 2.2) : Math.pow(t, 2.2);
      place(from.z + (to.z - from.z) * zt, from.side + (to.side - from.side) * st);
      if (t < 1 && !signal?.aborted) requestAnimationFrame(frame);
      else {
        clearInterval(steps);
        beaver.classList.remove('is-walking', 'is-away', 'is-toward');
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
  await walk(b.offstage, b.stand, walkMs);
  await wait(300, signal);
  // The cut: he raises the scissors, the blades close on the ribbon (snip, a glint), the halves spring apart.
  pose(0);                                   // raises the scissors
  await wait(360, signal);
  pose(1);                                   // blades open at the ribbon
  await wait(300, signal);
  pose(2);                                   // snip!
  audio?.play('snip');
  await wait(110, signal);
  const glint = document.createElement('span');
  glint.className = 'shot-glint';
  glint.style.left = `${mid}px`;
  glint.style.top = `${r.y + r.sag * 0.7}px`;
  shotEl.appendChild(glint);
  setTimeout(() => glint.remove(), 700);
  ribbon.classList.add('is-cut');
  audio?.play('cheer');
  for (let i = 0; i < 46; i += 1) {
    const c = document.createElement('i');
    c.className = 'shot-confetti';
    c.style.left = `${mid + (Math.random() - 0.5) * 900}px`;
    c.style.background = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'][i % 6];
    c.style.setProperty('--dur', `${1600 + Math.random() * 1400}ms`);
    c.style.setProperty('--delay', `${Math.random() * 500}ms`);
    c.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    shotEl.appendChild(c);
  }
  await wait(320, signal);
  pose(3);                                   // cheers, scissors held high
  beaver.classList.add('is-cheering');
  await wait(1100, signal);
  beaver.classList.remove('is-cheering');
  walk(b.stand, b.offstage, 1500).then(() => beaver.remove());    // heads back the way he came, toward the camera
  await wait(500, signal);
}
