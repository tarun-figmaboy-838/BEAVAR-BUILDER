# Bridge Builder: Triangles

A crane game for grade 8. The beaver builder runs a tower crane over a canal. The learner picks the triangle frame each task asks for and drops it on the glowing spot under the place it fits. The frame resizes in place to fill that panel, a copy grows into every other panel of the same type, and the panels keep their PDF p7 colour (green equilateral, blue isosceles, purple scalene, red right, yellow obtuse, orange acute). A wrong frame makes the bridge sway and collapse, and construction starts again from task 1, as the source deck says.

## Play

Double-click `index.html`. The game runs straight from disk (no server needed) because `index.html` loads one bundled script, `js/game.bundle.js`.

`Play Game.command` serves the folder on http://localhost:8787 and opens the browser. Narration clips are prefetched when served this way.

## Deploy (production build)

```sh
python3 tools/build_dist.py
```

writes `dist/`, the compressed copy to put online (about 2.8 MB instead of about 7 MB): sprites as WebP, the canal backdrop as AVIF with a WebP fallback, narration as Ogg Opus with the MP3 kept for browsers that cannot play Ogg (older iPhones and iPads), and one minified stylesheet. `vercel.json` tells Vercel to serve `dist/`, so commit `dist/` after each build. The build needs Pillow (`pip3 install pillow`) and macOS `afconvert`.

## Controls

- **Joystick (bottom-left):** drag it, or use the arrow keys / WASD. Left and right move the trolley; up and down raise and lower the hook.
- Each correct frame is drawn in code as an exact smaller copy of the bridge panel it fits (same shape and orientation), so after the drop it only grows in place. Frames carry the PDF's tick marks, angle arcs and right-angle square (`SHOW_PDF_MARKS` in `js/data/triangles.js`).
- **Action button (bottom-right):** reads PICK when the claw is empty and flips to DROP while a frame is carried. It lights up only when it can be used. Space presses it.
- Tapping a frame or the glowing spot also sends the crane there.
- The ♪ button mutes all sound.

## Flow (from the PDF)

Start → G0.1 Meet the Builder → G0.2 Your Help Is Needed → G0.3 How to Play (the real crane demonstrates move, pick, place) → tasks 1–7 → "Excellent work! Our bridge is complete." → BRIDGE BUILT! celebration → Build it again.

| Task | Instruction (PDF wording) | Frames offered | Correct | What gets built (PDF page) |
|---|---|---|---|---|
| 1 | Choose a triangle with exactly 2 equal sides. | isosceles, scalene, equilateral | isosceles | outer frame (p12) |
| 2 | Choose an equilateral triangle. | same | equilateral | both apex diagonals (p13) |
| 3 | Choose an equilateral triangle. | same | equilateral | the middle bar, making a second equilateral (p14 adds no beam, so this bar from p16 comes in one step early, so the two equilateral tasks look different) |
| 4 | Choose a triangle where all 3 sides have different lengths. | same | scalene | side struts (p15) |
| 5 | Choose an acute-angled triangle. | acute, obtuse, right | acute | the crown bar (p16) |
| 6 | Choose a triangle with one 90° angle. | same | right | centre posts and end braces (p17) |
| 7 | Choose a triangle with one angle greater than 90°. | same | obtuse | upper diagonals (p18) |

The frames are the PDF's, arranged so the correct frame never starts under its own drop spot (in the PDF order the answer sat right under the drop spot in tasks 1 and 5). `tests/level-data.test.js` checks all of this, including that every task needs the hook to travel: wording, order, answers, that exactly one frame fits each task (classified from the measured sprite corners), and that every bridge panel a task lights up really is that triangle type.

## Develop

Edit the ES modules in `js/`, then rebuild the bundle:

```sh
python3 tools/build.py
```

Tests and QA (no Node needed):

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/level-data.test.js   # maths QA
python3 tools/qa/playthrough.py                                                                                  # full play-through in headless Chrome, screenshots in test-results/
python3 tools/qa/devices.py                                                                                      # laptops, tablets, phones in Chromium + WebKit (Safari); GAME_ROOT=dist to test the build
```

The play-through drives the real controls: wrong answers first, a full collapse, then all seven tasks, replay, and resizing. It fails on any console error.

Set `DEBUG_MODE = true` in `js/config.js` for a live state overlay and `window.__bridgeGame`. URL options: `?vo=0` turns narration off; `?vorate=2` plays it faster.

## Structure

```
index.html            stage markup, controls
styles/               tokens, base, layout, components, gameplay, animations, responsive
js/app.js             boot: preload, wire modules, register screens
js/core/              game state, loop, motion helpers, camera, input, audio (synthesised SFX), voice (narration), screens
js/gameplay/          crane (state machine), claw, triangles, placement, bridge, level engine, builder, environment, FX
js/screens/           title, story (G0.1, G0.2), how-to-play, gameplay, completion
js/data/              copy (PDF text), levels, triangles (measured sprites), triangle geometry, bridge geometry, layout, vo-lines
tools/                build.py (bundle), build_dist.py (compressed production build), qa/ (play-through, cross-device screenshots), vo/ (narration recorder + script)
assets/               images (see docs/ASSETS.md), audio/vo (narration clips)
dist/                 production build (generated by tools/build_dist.py)
```
