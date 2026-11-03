/** Preloads raster assets before the game starts. Optional assets may be missing (documented hooks). */
export function preloadImages(entries, onProgress) {
  const loaded = new Set();
  const missing = new Set();
  let finished = 0;

  const tasks = entries.map(({ key, src, optional = false }) =>
    new Promise((resolve) => {
      const image = new Image();
      const done = (ok) => {
        finished += 1;
        (ok ? loaded : missing).add(key);
        onProgress?.(finished / entries.length, key, ok);
        resolve();
      };
      image.onload = () => done(true);
      image.onerror = () => {
        if (!optional) console.error(`[assets] missing required asset: ${src}`);
        done(false);
      };
      image.decoding = 'async';
      image.src = src;
    })
  );

  return Promise.all(tasks).then(() => ({ loaded, missing }));
}
