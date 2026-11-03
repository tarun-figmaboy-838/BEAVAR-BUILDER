/** Single requestAnimationFrame loop shared by every per-frame system. */
export function createGameLoop() {
  const subscribers = new Set();
  let running = false;
  let lastTime = 0;

  function frame(now) {
    if (!running) return;
    const deltaSeconds = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    for (const update of subscribers) update(deltaSeconds, now);
    requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(frame);
    },
    stop() {
      running = false;
    },
    add(update) {
      subscribers.add(update);
      return () => subscribers.delete(update);
    },
  };
}
