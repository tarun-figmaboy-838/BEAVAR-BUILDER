# Crane controls: asset prompts

The arrow pad art was generated with Figma AI (Figma MCP `generate_image`, file `0s4piKMIWWC06V7BAFAp3T`) on a flat
magenta background, keyed out and cropped in code. Gemini (direct) and Magnific were **not connected**; the
Magnific brief below is ready for when it is.

| File (assets/images/kit) | Size | Transparent | Used at (stage px) |
| --- | --- | --- | --- |
| `dpad-plate.png` | 640 × 640 | yes | 327 × 327 |
| `key-up.png`, `key-right.png`, `key-down.png`, `key-left.png` | 256 × 256 each (key art 90.7 % of the tile) | yes | 95 × 95 |
| `btn-pick.png`, `btn-drop.png` (existing kit art) | 487 × 538, 463 × 535 (6 % clear margin, 12 % below) | yes | 108 px (PICK), 210 px (DROP) |

## Arrow keys (one sheet, sliced into four files)

> 2D mobile game UI sprite sheet: exactly 4 separate square arcade control keys in ONE horizontal row, evenly
> spaced with wide gaps, all exactly the same size, seen straight from the front (flat, no perspective). Each
> key: a chunky rounded-square button, glossy bright warm yellow top face with a soft highlight near its top
> edge, a thick darker amber-orange bottom lip giving it 3D thickness, a crisp dark navy outline. On each key
> one bold rounded dark navy chevron arrow, centred: key 1 arrow points UP, key 2 RIGHT, key 3 DOWN, key 4 LEFT.
> Same lighting from the top on all four keys. Polished cartoon construction-game style matching a yellow tower
> crane. Isolated on a perfectly flat solid pure magenta background (#FF00FF), nothing touching the edges, no
> text, no letters, no shadows on the background.

## Pad plate

> 2D mobile game UI element, seen straight from the front (flat, no perspective): an empty directional-pad base
> plate shaped like a plus sign (a cross with four equal rounded arms), made of dark navy painted steel with a
> soft top highlight, a thin bright yellow rim around the whole outline, a dark navy outer keyline, four small
> silver bolt heads in the four inner corners of the cross, and a round recessed dark socket in the exact
> centre. No buttons, no arrows, no text. Polished cartoon construction-game style matching a yellow tower
> crane, clean and simple. Isolated, centred, on a perfectly flat solid pure magenta background (#FF00FF),
> wide empty margin, nothing touching the edges.

## Magnific (not connected): upscale only, after the art is final

Input: each file above. Output: 2× the input size, PNG with the alpha channel kept.

> Upscale 2×, preserve the exact geometry, proportions, outline thickness, arrow shapes and colours. Sharpen
> edges and the glossy highlight only. Do not add texture, text, glow, shadows or new elements. Keep the
> background fully transparent.

Quality check before use: same perspective (flat, front-on), no text or watermark, transparent background,
no new glow, arrow shapes unchanged, palette matches the crane (warm yellow, amber lip, navy).
