# Triangle Workshop (the learning section)

The lesson from `Triangles.pdf` (learning screens 01–20 and checkpoints 21–30), rebuilt inside the
Bridge Builder world: the beaver operator tries a frame on the bridge, it does not fit, and he takes the
learner into his workshop to learn about triangles before choosing frames. Only the deck's mathematics,
order, questions, answers, measurements and wording are used; its space/shooting framing is not.

## Flow

```
Start (play button: browsers need one tap before sound)
→ Hook: the crane lifts a frame, sets it on the glowing spot, it shakes loose and drops into the canal;
        he looks at the frames left in the yard: "We must identify them! But to do that we need to
        learn about triangles first."
        Then: "Let's explore triangles!"
→ The scene cross-fades to the quiet workshop (assets/images/workshop/learning-backdrop.webp); the cab empties
  and the lesson card rises.
→ 29 screens (js/learning/learning-content.js), no NEXT buttons: a teaching screen moves on once its line has
  been read, an interaction moves on at success; the deck's CHECK / CONTINUE buttons are the only ones pressed.
  The geometry moves on the spoken word: the sides are counted as "3 straight sides" is said, the name tag
  pops at "scalene", the square flashes at "90°" (cues in learning-flow.js, timed by the narration's word
  times). The beaver appears only to work: walking each side clockwise with the tape, reading each corner
  with the protractor, and peeking over the summary cards.
→ Summary: each category pops up as a card, the beaver peeks over it and explains it, the card shrinks into
  the row; last the "both" card. "You're ready!" returns to the scene (the game continues; the standalone
  build offers a replay).
```

Review aid: `?debug=1` (or the D key while the lesson runs) adds a screen list with Back / Next at the foot
of the stage. With it on nothing moves on by itself: every screen plays its dialogue and animation and waits
for Next; Back replays the previous screen from its start (js/learning/debug-panel.js).

| Step | Kind | Deck screen | What happens |
|---|---|---|---|
| L01 | draw | L01 | the triangle is built corner → side → corner … and clicks shut; "This is a triangle." |
| L02 | count | L02 | sides counted 1, 2, 3; "3 straight sides"; the closed shape pulses |
| L03 | morph | L03 | the same triangle slides into a tall, a wide and an asymmetric shape |
| L04 | measureSides | L04 | the beaver walks along each side with the tape: 5 cm, 4 cm, 6 cm |
| L05 | question | L05 | "What do you notice about the sides?" (wrong pick: the lengths are shown again) |
| L06 | discover | L06 | three colours, SCALENE |
| L07 | drag | L07 | drag a corner until two sides are equal (snap, tick marks) |
| L08 | discover | L08 | the learner's own triangle: ISOSCELES |
| L09 | drag | L09 | drag until all three are equal |
| L10 | discover | L10 | EQUILATERAL |
| CFU01 | sort | CFU 01 | drag A (5/4/6), B (5/5/7), C (6/6/6) into the crates; CONTINUE |
| CFU02 | drag | CFU 02 | "Make this triangle isosceles." (ghost hint only after 20 s) |
| L11 | measureAngles | L11 | the beaver walks to each corner with the protractor: 60°, 60°, 60° |
| L12 | question | L12 | "What do you notice about the angles?" |
| L13 | compare90 | L13 | each angle pulses: all less than 90° |
| L14 | discover | L13 | ACUTE-ANGLED |
| L15 | drag | L14 | make one angle exactly 90° (snap, right-angle square) |
| L16 | discover | L15 | RIGHT-ANGLED |
| L17 | drag | L16 | make an angle obtuse |
| L18 | discover | L17 | OBTUSE-ANGLED |
| CFU03 | multi | CFU 03 | which are acute-angled? (A and D), CHECK, CONTINUE |
| CFU04 | drag | CFU 04 | make it right-angled |
| L19 | question | L18 | the 5 / 5 / 7.1 cm triangle by its sides |
| L20 | question | L19 | the same triangle by its angles |
| L21 | dualReveal | L20 | ISOSCELES, then RIGHT-ANGLED |
| L22 | lenses | L20 | BY SIDES → Isosceles, BY ANGLES → Right-angled, merged |
| CFU05 | dual | CFU 05 | classify by sides and angles, CHECK |
| CFU06 | drag | CFU 06 | a right-angled isosceles triangle, both conditions at once; GREAT JOB! |
| SUMMARY | summary | p48 | the recap cards |

Two things differ from the master brief on purpose: CFU 02 ("Make this triangle isosceles") is kept
because the deck has six checkpoints; and the obtuse drag (L17) starts acute (78° / 54° / 48°) because the
brief's suggested start (94°) would already be obtuse.

## Geometry

`js/learning/triangle-model.js` is the engine: corners in canvas px, 1 cm = `PX_PER_CM` px. Side lengths,
angles and both classifications are computed from the corners on every frame; nothing is typed in.
Isosceles means exactly two equal sides. A dragged corner is kept inside the card, off the opposite side,
clear of the other corners and never needle-thin (`constrainVertex`). Near a position that makes the
screen's goal true the corner snaps onto it (`snapVertex`): the perpendicular bisector (two equal sides),
the circle on the diameter (a right angle), the equilateral apex, the right-isosceles points. The snap
reaches further than the label rounding, so two lengths never read the same while being different.
`tests/learning-model.test.js` checks every triangle in the content map, every answer key, the snaps
and the constraints under JavaScriptCore.

## Modules

```
js/learning/learning-content.js   every screen as data (deck wording, specs, answers)
js/learning/triangle-model.js     the maths
js/learning/triangle-draw.js      shared SVG geometry (labels, arcs, ticks)
js/learning/triangle-figure.js    static figures for the checkpoint cards and the summary
js/learning/triangle-canvas.js    the live triangle: drawing in, morphing, measuring, dragging, snapping
js/learning/workshop-board.js     the lesson card: narration box, surface, the beaver's place
js/learning/workshop-widgets.js   option card, multi-select, sorting crates, two-way classifier, badges, lenses, summary
js/learning/beaver-guide.js       the beaver's frames and poses (idle blink, talk, walk with the tape, protractor, peek)
js/learning/learning-flow.js      the state machine that runs the screens on one cancellable timeline
js/learning/debug-panel.js        the review aid (?debug=1)
js/screens/hook-screen.js         the intro
js/screens/learning-screen.js     scene in / lesson / scene out
styles/learning.css
```

States: ENTERING, NARRATING, DEMONSTRATING, WAITING_FOR_INPUT, INTERACTING, CHECKING, FEEDBACK,
REINFORCING, TRANSITIONING. The card's `data-state` gates pointer input in CSS, so taps land only in
WAITING_FOR_INPUT / INTERACTING and drags only in INTERACTING.

## Assets (generated with Figma for this section)

All raster art below was generated with Figma AI (`generate_image`, file `0s4piKMIWWC06V7BAFAp3T`) on a
flat magenta key colour and keyed out, despilled and cropped in code, then compressed to WebP by
`tools/media.py`. No words or numbers are baked into any image: every label is live text. Transparent unless noted.

| File (assets/images/workshop) | Size | Used as |
|---|---|---|
| `learning-backdrop.webp` | 1920 × 1080, opaque | the quiet workshop behind the lesson (softened 0.8 px) |
| `beaver-measure.webp` | 356 × 619 | idle (holding the tape) |
| `beaver-idle-blink.webp` | 324 × 607 | idle blink frame |
| `beaver-idle-talk.webp` | 321 × 607 | talking frame |
| `beaver-protractor-low.webp`, `-side.webp`, `-high.webp` | ≈ 900 × 980 | holding the protractor with its flat edge down / sideways / up, set onto a corner |
| `beaver-walk-1/2/3/4.webp` | ~332–374 × 520–534 | side-view walk cycle with the tape (walking along a side) |
| `beaver-peek-idle.webp`, `beaver-peek-talk.webp` | 867 × 909 | peeking over a summary card, hands on its edge (listening, talking) |
| `crate-back.webp`, `crate-front.webp` | 924 × 681 | the sorting crate in two layers, so a dropped card sinks in behind the front panel |
| `card-frame.webp` | 1477 × 775 | the lesson card itself: flat cream panel, navy edge, gold line, corner screws (stretched to 1600 × 820, shown at 110%) |
| `summary-card.webp` | 808 × 829 | the square summary card with its ribbon tab; the name and sentence are live text |
| `btn-uiPrimary/Nav/Success/Danger.webp` | | the pill buttons (gold, blue, green, red), 3-sliced in CSS |

Frames come from several sheets, so each is registered on the boots' centre (or the hat when peeking, the
protractor when measuring) and scaled to a common body height in `beaver-guide.js` (`GUIDE_FRAMES`); poses
are short frame cycles that switch at once, with CSS body motion on top (breathing, the walk-in steps).

Prompts used (abridged): a glossy 3D-rendered toy-like beaver construction worker matching the cab
operator (orange-brown fur, cream muzzle, buck teeth, paddle tail, yellow hard hat, yellow T-shirt under
an orange vest with two silver stripes, brown cargo trousers, brown boots with yellow laces), same size
and ground line in every frame, on pure magenta, no text; a calm workshop interior of light wooden planks
with a few tools far apart, a grey concrete floor, low detail in the middle.

## Voice-over

Only the beaver's studio voice is used: Gemini TTS with the prebuilt voice "Charon" (the "Male Teacher
(Formal)" voice of vo001.mp3), the English line first rewritten in Devanagari so it is spoken with a clear
Indian accent. Every line the lesson and its hook speak has an id in `tools/vo/vo_script.json`. A line
without a clip is shown at a reading pace, never read by another voice (`?speech=1` lets the device voice
read it, for review only).

```sh
export GEMINI_API_KEY=...                # from https://aistudio.google.com/apikey
python3 tools/vo/record.py --list        # the lines, their ids and which have clips
python3 tools/vo/record.py               # records the missing lines (.m4a + its Ogg Opus twin), updates js/data/vo-lines.js
python3 tools/vo/word_times.py           # per-word times: captions and animations follow the voice
python3 tools/build.py
```

Without a key, the same voice is cloned locally and for free: `tools/vo/clone.py` runs Chatterbox (Resemble AI,
MIT licence) on this Mac and learns the beaver's voice from his own studio clips (setup in the script's header).
`tools/vo/verify.py` then checks every clip without listening: Whisper must hear the line's exact words, and the
clip's voice fingerprint must sit within the studio clips' own range.

```sh
~/.cache/learning-triangle-voice/venv/bin/python tools/vo/clone.py     # every line without a clip
~/.cache/learning-triangle-voice/venv/bin/python tools/vo/verify.py    # words and voice, clip by clip
python3 tools/vo/word_times.py && python3 tools/build.py
```

The player (`js/core/voice-manager.js`) uses one reused `<audio>` unlocked by the Start tap, looks a line up
by its exact text, plays the Ogg where the browser supports Opus and the AAC / MP3 twin elsewhere, ducks the
effects under the voice, and prefetches every clip after Start.

## QA

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/learning-model.test.js
python3 tools/qa/learning.py            # the whole lesson in headless Chrome: wrong answers first, drags, sorting,
                                        # multi-select, the classifier, resizes, rapid taps; screenshots in test-results/learning/
```

URL options: `?lesson=L07` starts the lesson at that screen; `?qa=1` exposes `window.__learning` (state,
drag targets, sorting targets) for the play-through; `?vo=0` turns narration off; `?vorate=2` speeds it.

## Borrowed from the Polygon recap and Fishing Frenzy lessons

- Summary (Polygon recap): a card enters on the recap's curve (0.82 → 1.03 → 1 over 420 ms), flies to its
  slot on a small upward arc, the spoken name warms the name plate and the first word of the sentence pulses
  the figure, and once all six are home the row hops together towards the middle (70 ms apart).
- Sorting checkpoint (CFU01): one triangle at a time sits on the bench with its lengths and tick marks in
  view, the rest wait in a pile on the left, the three crates stand below. A right drop lights the equal
  sides (none on a scalene, all three on an equilateral) before the card flies into its crate; a wrong drop
  shakes the card back and pulses the three lengths so the learner reads them again.
- Measuring (Fishing Frenzy): the tape is a thin ticked strip (long tick per cm, short per half) running
  just beside the side as the beaver walks it; the length slides out of the side it was measured on; a
  filled wedge sweeps open with the arc (fill and arc are drawn beneath the sides, so nothing crosses a line)
  while the value counts up beside the corner. The beaver carries the protractor himself: three held poses
  (flat edge down, sideways, up: beaver-protractor-low/side/high.webp, each with the centre of its flat edge
  as the `tool` point) and `pickToolPose` in beaver-guide.js chooses the pose, flip and turn that lay the
  flat edge along a side with the round side into the angle while he stays outside the shape and near
  upright; he walks up, sets it onto the corner, it is read, he lifts it off. The tape runs from the side
  up to his hand (`handPoint`), with the case in his hand. He says the measuring line first, then works,
  and pops up from his feet when he arrives and sinks away when he leaves. A line longer than one box is
  shown in parts (sentence ends, then the natural join nearest the middle; `splitLine` in workshop-board.js),
  each part taking the box when its first word is due. The sides / angles that are not being named step
  back to 42%, and a
  bright spark runs along each named side.
- Buttons: answers and CHECK are the gold pill, CONTINUE / "You're ready!" the blue one, a right answer turns
  green and a wrong one red (`btn-ui*.webp`, 3-sliced in CSS, the same pill drawn again behind the label so
  no slice seam shows). Shape names are navy name tags with the card frame's gold line.
- The measuring screens (L04, L11) show the triangle 30% bigger (`zoom` on the screen; `setZoom` on the canvas
  scales px per cm, so every centimetre still reads true).
- Checkpoint cards (multi-pick, sort bench, sort result) are Fishing Frenzy's shape card: white to ice-blue,
  white border, blue rim, raised blue base; a picked card turns gold with a tick badge, a right one teal. The
  both-ways checkpoint labels its rows with Fishing Frenzy's gold chip ("BY SIDES", "BY ANGLES").
- While a side is measured only the tape shows, running beside the side and straight into the tape measure in
  the beaver's hand; the side itself is not over-drawn.
