# Assets

Every image is cut from the sheets supplied with the project. The triangle frames are drawn in code from exact vertices (`js/gameplay/frame-shapes.js`, on request), so the shape on screen is exactly the shape the maths tests check, with the PDF's tick marks, angle arcs and right-angle square. Otherwise nothing is redrawn as vectors except the truss beams and corner plates (drawn in the triangle frames' own yellow-and-grey style so they match the PDF geometry exactly), and the yellow joystick and the PICK / DROP button, which were redesigned on request.

The source sheets were removed from the working tree to keep the project small; they are still in git history (`git checkout 0ca8ab7 -- ASSET assets/images/bever.png "assets/images/crane kit.png"` brings them back).

| Used as | File(s) | Source sheet |
|---|---|---|
| Canal background, clouds painted out | `images/background/canal.png` | `ASSET/image.png` |
| Option platform | `images/bridge/yard-platform.png` | `Glossy Yellow Hazard Stripe Platform.png` (supplied) |
| Pillars | `images/bridge/pillar-brick.png` | `ASSET/image copy 2.png` |
| Road deck and railing (tiled) | `images/bridge/deck-*.png`, `railing-tile.png` | `ASSET/image copy.png` |
| Sparkles, ripples, water glints | `images/fx/*` (the moving water itself is drawn by the GPU (WebGL, with a 2D-canvas fallback): soft highlights on a perspective plane, `js/gameplay/environment.js`) | `ASSET/image copy.png` |
| Tower crane, jib tiles, trolley, cable, claw states, beacons | `images/crane-kit/*` | `assets/images/crane kit.png` |
| Claw icons on the PICK / DROP button | `images/crane-kit/claw-open.png`, `claw-closed.png` | `assets/images/crane kit.png` |
| Beaver builder, 40 frames | `images/characters/builder/beaver-NN.png` | `assets/images/bever.png` |
| Joint bolts | `images/crane/bolt.png` | `ASSET/image copy 3.png` |

Frames were sliced with a small CoreGraphics tool: component detection, exact-rectangle crops for seamless tiles, faint-alpha clean-up, and registration of the beaver frames on the top of the hard hat so they do not jitter.

Sound effects are synthesised at run time (`js/core/audio-manager.js`). Narration clips are in `assets/audio/vo/` (see `docs/VOICEOVER.md`).
