# Voice-over

Every line the game speaks has a recorded clip in `assets/audio/vo/`. The clips were recorded the same way as Fishing Frenzy, with the **Ai Wala Human By Aamir** studio (Batch Generation):

- Language Hindi, so English written in Devanagari is spoken as English with a clear Indian accent.
- Narrator: Female Teacher (Standard). Builder: Male Teacher (Formal).
- Numbers and symbols are written out in the spoken form ("2" → "two", "90°" → "ninety degrees"); the screen keeps the PDF wording.

| File | What it is |
|---|---|
| `tools/vo/vo_script.json` | every line: `id`, `speaker`, `line` (as shown), `spoken` (as said) |
| `tools/vo/vo-record.py` | `batch` records missing lines (respecting the studio's 100 requests / 15 min limit), `build` measures clips and writes the map |
| `js/data/vo-lines.js` | generated map: line as shown → clip, seconds, speaker |
| `js/core/voice-manager.js` | the player |

How the game uses them: one reused `<audio>` element, unlocked by the Start tap; a line is looked up by the exact text on screen; the words type at the voice's pace; sound effects duck under the voice; a new line stops the previous one; every clip is prefetched after Start. Without a clip (or with `?vo=0`) the device's speech voice reads the line, and without that the line simply shows.

## All clips

<!-- table:start -->
| Clip | Speaker | Line as shown | Spoken as | s |
|---|---|---|---|---|
| vo001 | builder | I have all these triangular frames, but I can't remember which ones go where! | I have all these triangular frames, but I can't remember which ones go where! | 5.57 |
| vo002 | builder | Can you help me choose the right frames? | Can you help me choose the right frames? | 2.9 |
| vo003 | narrator | Use the crane to pick the triangle we need and place it on the bridge. | Use the crane to pick the triangle we need and place it on the bridge. | 5.06 |
| vo004 | narrator | Move the crane | Move the crane. | 1.49 |
| vo005 | narrator | Pick the triangle | Pick the triangle. | 1.82 |
| vo006 | narrator | Place it on the bridge | Place it on the bridge. | 2.18 |
| vo007 | builder | Let's do a practice round first! | Let's do a practice round first! | 2.45 |
| vo009 | narrator | Choose a triangle with exactly 2 equal sides. | Choose a triangle with exactly two equal sides. | 4.1 |
| vo010 | narrator | Choose an equilateral triangle. | Choose an equilateral triangle. | 2.66 |
| vo011 | narrator | Choose a triangle where all 3 sides have different lengths. | Choose a triangle where all three sides have different lengths. | 4.85 |
| vo012 | narrator | Choose an acute-angled triangle. | Choose an acute-angled triangle. | 3.02 |
| vo013 | narrator | Choose a triangle with one 90° angle. | Choose a triangle with one ninety degree angle. | 3.86 |
| vo014 | narrator | Choose a triangle with one angle greater than 90°. | Choose a triangle with one angle greater than ninety degrees. | 4.78 |
| vo015 | narrator | Great choice! | Great choice! | 1.66 |
| vo016 | narrator | That frame does not fit. | That frame does not fit. | 2.57 |
| vo018 | narrator | Excellent work! Our bridge is complete. | Excellent work! Our bridge is complete. | 3.53 |
| vo019 | narrator | BRIDGE BUILT! Great work, Engineer! | Bridge built! Great work, Engineer! | 3.5 |
| vo020 | builder | The bridge is complete! Now the people of both towns can visit each other! | The bridge is complete! Now the people of both towns can visit each other! | 5.18 |
<!-- table:end -->
