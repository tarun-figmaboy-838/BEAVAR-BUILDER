# Assets

The scenery and mechanical crane parts are cut from the supplied sheets. The enlarged three-quarter cabin and seated beaver animation atlas are newly generated raster artwork. The triangle frames are drawn in code from exact vertices (`js/gameplay/frame-shapes.js`, on request), so the shape on screen is exactly the shape the maths tests check, with the PDF's tick marks, angle arcs and right-angle square. Otherwise nothing is redrawn as vectors except the grey arches under the deck, the truss beams and corner plates (drawn in the triangle frames' own yellow-and-grey style so they match the PDF geometry exactly), and the yellow joystick and the PICK / DROP button, which were redesigned on request.

The source sheets were removed from the working tree to keep the project small; they are still in git history (`git checkout 0ca8ab7 -- ASSET assets/images/bever.png "assets/images/crane kit.png"` brings them back).

| Used as | File(s) | Source sheet |
|---|---|---|
| Canal background, clouds painted out | `images/background/canal.png` | `ASSET/image.png` |
| Option platform | `images/bridge/yard-platform.png` | `Glossy Yellow Hazard Stripe Platform.png` (supplied) |
| Road deck (left cap, road-plate tile, right cap, yellow bracket) | `images/bridge/deck-*.png` | sliced from the supplied deck art (under-truss removed) |
| Piers (three, in the canal) | `images/bridge/pier.png` | cut from the supplied bridge reference (stone cap, brick column) |
| Sparkles, ripples, water glints | `images/fx/*` (the moving water itself is drawn by the GPU (WebGL, with a 2D-canvas fallback): soft highlights on a perspective plane, `js/gameplay/environment.js`) | `ASSET/image copy.png` |
| Tower crane, jib tiles, trolley, cable, claw states, beacons | `images/crane-kit/*` | `assets/images/crane kit.png` |
| Claw icons on the PICK / DROP button | `images/crane-kit/claw-open.png`, `claw-closed.png` | `assets/images/crane kit.png` |
| Seated beaver, 24-frame action atlas | `images/characters/operator/beaver-seated-atlas.png` | Generated with built-in image generation, using the original beaver as identity reference |
| Controls-facing idle blink atlas | `images/characters/operator/beaver-idle-atlas.png` | Generated raster idle sequence; fixed right-facing seated pose |
| Enlarged angled operator cabin | `images/crane-v2/operator-cabin.png` | Generated with built-in image generation, using the original crane kit as style reference |
| Joint bolts | `images/crane/bolt.png` | `ASSET/image copy 3.png` |

Frames were sliced with a small CoreGraphics tool: component detection, exact-rectangle crops for seamless tiles, faint-alpha clean-up, and registration of the beaver frames on the top of the hard hat so they do not jitter.

Sound effects are synthesised at run time (`js/core/audio-manager.js`). Narration clips are in `assets/audio/vo/` (see `docs/VOICEOVER.md`).

## Operator animation

The main sprite sheet uses four columns and six rows: idle/blink, front-facing speech, happy, sad/recovery, right-facing side-console operation, and pick/carry/drop/completion. A separate 2×2 idle atlas replaces the main sheet’s front-facing idle row. Idle stays facing the controls and blinks without turning toward the player. Every pose is seated. The cabin remains at a three-quarter angle. `builder-character.js` selects poses from narration, crane state, joystick direction, and game outcomes. Idle holds for 3.2 seconds before a short blink; reactions return to the appropriate live pose. Reduced motion disables sprite loops and body movement. Atlas paths are explicit so the production build discovers and compresses them automatically.

The old source frames remain available for reference; the production build ships only the new action and idle atlases. No generated vector character or cabin is used.

Generation briefs (built-in image tool):
- Cabin: a large golden-yellow, navy-trimmed, three-quarter right-facing crane cabin, broad unobstructed cyan window, dark operator chair, low right-side console, silver bolts, amber roof beacon, richly shaded raster game art, transparent exterior, no character or text.
- Beaver: the same brown builder, yellow hardhat, orange vest, cream muzzle and buck teeth, fully seated with bent knees and boots; four columns by six rows with fixed hip and hat registration. Face the viewer for speech and reactions; turn head, shoulders and arms right toward a far-right side joystick while operating. Include idle blink, speech, happy, sad/recovery, directional operation, pick, carry, drop and completion. Transparent alpha, no background or labels.
- Final alpha pass: remove the brown studio background and glow without changing the 24 sprite poses, positions, or console artwork; preserve the four-column, six-row atlas and clean transparent edges.

- Dedicated idle prompt: same seated beaver in a 2×2 atlas, three-quarter right throughout, one hand resting on the far-right side joystick; open, half-closed, closed, open eyelids. No looking at viewer, head turning, waving, talking, drop shadows, background haze or outer glow. Consistent hip, hat and boot registration; transparent raster artwork. The loop reuses the first open-eye pose to avoid drift.
