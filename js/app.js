import { DEBUG_MODE, DRONE_INTRO } from './config.js';
import { STAGE } from './data/layout.js';
import { LEVELS } from './data/levels.js';
import { createGameState } from './core/game-state.js';
import { createGameLoop } from './core/game-loop.js';
import { preloadImages } from './core/asset-loader.js';
import { createAudioManager } from './core/audio-manager.js';
import { createVoiceManager } from './core/voice-manager.js';
import { createCameraController } from './core/camera-controller.js';
import { createInputManager } from './core/input-manager.js';
import { createScreenManager } from './core/screen-manager.js';
import { createDebugOverlay } from './core/debug-overlay.js';
import { buildCraneDom, createCraneController } from './gameplay/crane-controller.js';
import { createClawController } from './gameplay/claw-controller.js';
import { createTriangleController } from './gameplay/triangle-controller.js';
import { createBridgeController } from './gameplay/bridge-controller.js';
import { createPlacementController } from './gameplay/placement-controller.js';
import { createFeedbackController } from './gameplay/feedback-controller.js';
import { createConstructionFx } from './gameplay/construction-fx.js';
import { createLevelEngine } from './gameplay/level-engine.js';
import { buildEnvironment } from './gameplay/environment.js';
import { createBuilderCharacter, BUILDER_FRAME_SOURCES } from './gameplay/builder-character.js';
import { CRANE_RIG } from './data/layout.js';
import { createTitleScreen } from './screens/title-screen.js';
import { DRONE_SHOTS } from './screens/drone-intro.js';
import { createMeetBuilderScreen, createHelpNeededScreen } from './screens/story-screens.js';
import { createHowToPlayScreen } from './screens/how-to-play-screen.js';
import { createGameplayScreen } from './screens/gameplay-screen.js';
import { createCompletionScreen } from './screens/completion-screen.js';

// The canal backdrop is the page's own <img> (the production build serves it as AVIF with a WebP
// fallback through <picture>), so boot waits on that element instead of fetching it a second time.
const CRITICAL_IMAGES = [
  'assets/images/bridge/yard-platform.png',
  'assets/images/bridge/pier.png',
  'assets/images/bridge/deck-left.png',
  'assets/images/bridge/deck-tile.png',
  'assets/images/bridge/deck-right.png',
  'assets/images/bridge/deck-bracket.png',
  CRANE_RIG.cabin.src,
  CRANE_RIG.tower.mastSrc,
  CRANE_RIG.tower.baseSrc,
  CRANE_RIG.jibTile.src,
  CRANE_RIG.jibTip.src,
  ...BUILDER_FRAME_SOURCES,
  CRANE_RIG.trolley.src,
  ...CRANE_RIG.claw.states.map((state) => state.src),
  'assets/images/crane-kit/cable-tile.png',
  'assets/images/crane/bolt.png',
  'assets/images/fx/sparkle-cluster.png',
  'assets/images/fx/sparkle-big.png',
  'assets/images/fx/ripple-1.png',
  'assets/images/fx/ripple-2.png',
  ...(DRONE_INTRO ? DRONE_SHOTS.map((shot) => shot.src) : []),
].map((src) => ({ key: src, src }));

function queryElements() {
  const byId = (id) => document.getElementById(id);
  return {
    viewport: byId('viewport'), stage: byId('stage'), world: byId('world'), shake: byId('shake'),
    water: byId('water'), bridge: byId('bridge'), placed: byId('placed'), platform: byId('platform'),
    crane: byId('crane'), fx: byId('fx'), hud: byId('hud'), overlays: byId('overlays'),
    controls: byId('controls'), mute: byId('mute'), debug: byId('debug'), loader: byId('loader'),
  };
}

function whenImageReady(image) {
  if (!image || (image.complete && image.naturalWidth)) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', () => {
      console.error('[assets] required asset failed to load:', image.currentSrc || image.src);
      resolve();
    }, { once: true });
  });
}

function fitStage(stageEl) {
  const scale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  stageEl.style.setProperty('--stage-scale', scale.toFixed(4));
}

function wireMuteButton(button, audio, voice) {
  const render = () => {
    button.classList.toggle('is-muted', audio.muted);
    button.setAttribute('aria-pressed', String(audio.muted));
    button.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  };
  button.addEventListener('click', (event) => {
    if (event.detail > 0) button.blur();
    audio.unlock();
    const muted = audio.toggleMuted();
    voice.setMuted(muted);
    if (!muted) audio.play('uiTap');
    render();
  });
  voice.setMuted(audio.muted);
  render();
}

async function boot() {
  const els = queryElements();
  fitStage(els.stage);
  window.addEventListener('resize', () => fitStage(els.stage));
  // iOS reports the new size a moment after rotating; refit once it has settled.
  window.addEventListener('orientationchange', () => setTimeout(() => fitStage(els.stage), 300));

  const loaderFill = els.loader.querySelector('.loader__fill');
  const [{ missing }] = await Promise.all([
    preloadImages(CRITICAL_IMAGES, (progress) => {
      loaderFill.style.width = `${Math.round(progress * 100)}%`;
    }),
    whenImageReady(els.stage.querySelector('.backdrop img')),
  ]);
  if (missing.size) console.error('[assets] required assets failed to load:', [...missing]);

  const craneDom = buildCraneDom(els.crane, els.platform);
  buildEnvironment({ waterLayer: els.water });

  const gameState = createGameState();
  const audio = createAudioManager();
  const voice = createVoiceManager({ audio });
  const loop = createGameLoop();
  const camera = createCameraController({ worldEl: els.world, shakeEl: els.shake });
  const input = createInputManager({ controlsEl: els.controls, audio });
  const fx = createConstructionFx({ fxLayer: els.fx });
  const claw = createClawController({ clawEl: els.crane.querySelector('.claw') });
  const crane = createCraneController({ craneEl: els.crane, dom: craneDom, claw, gameState, audio });
  const triangles = createTriangleController({ platformEl: els.platform, placedLayerEl: els.placed });
  const bridge = createBridgeController({ bridgeEl: els.bridge, fxEl: els.fx, fx, audio });
  const placement = createPlacementController({ triangles });
  const builder = createBuilderCharacter({ hostEl: els.crane });
  input.on('axis', (axis) => builder.setAxis(axis));
  input.on('demo-axis', (axis) => builder.setAxis(axis));
  gameState.subscribe((state) => builder.setGameState(state));
  const feedback = createFeedbackController({ hudEl: els.hud, overlaysEl: els.overlays, voice, builder });
  const screenManager = createScreenManager({ gameState, onError: (error) => console.error('[screen]', error) });
  const levelEngine = createLevelEngine({
    gameState, crane, claw, triangles, bridge, placement, feedback, camera, input, audio, voice, builder,
    onComplete: () => screenManager.go('complete'),
  });

  const context = { els, gameState, audio, voice, camera, input, fx, claw, crane, triangles, bridge, placement, feedback, builder, screenManager, levelEngine };
  screenManager.register('title', createTitleScreen(context));
  screenManager.register('meet-builder', createMeetBuilderScreen(context));
  screenManager.register('help-needed', createHelpNeededScreen(context));
  screenManager.register('how-to-play', createHowToPlayScreen(context));
  screenManager.register('gameplay', createGameplayScreen(context));
  screenManager.register('complete', createCompletionScreen(context));

  loop.add(crane.update);
  loop.add(camera.update);
  loop.start();
  document.addEventListener('visibilitychange', () => {
    audio.setMusicPaused(document.hidden);
    if (document.hidden) {
      input.releaseAll();
      audio.stopAllLoops();
      voice.stop();
    }
  });
  wireMuteButton(els.mute, audio, voice);
  els.stage.addEventListener('pointerdown', () => audio.unlock(), { passive: true });

  createDebugOverlay({
    element: els.debug,
    gameState,
    getExtra: () => {
      const level = LEVELS[gameState.get().currentLevelIndex];
      return { correctAnswer: level?.correctTriangleId, bridgeStage: level?.bridgeStage, socketXY: JSON.stringify(bridge.socketFor(level?.bridgeStage)) };
    },
  });
  if (DEBUG_MODE) window.__bridgeGame = context;

  els.loader.classList.add('is-done');
  setTimeout(() => els.loader.remove(), 500);
  await screenManager.go('title');
}

boot().catch((error) => {
  console.error('[boot]', error);
  const text = document.querySelector('.loader__text');
  if (text) text.textContent = 'Something went wrong while loading the game. Please reload the page.';
});
