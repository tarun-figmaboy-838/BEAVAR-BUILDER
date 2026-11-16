"""Automated play-through of the Triangle Workshop (the learning section) with real mouse input.

Run:  python3 tools/qa/learning.py [output-dir] [STOP_AT=screen-id]
Opens the game at ?start=learning, plays every screen: wrong answers first, then right ones; drags
corners to each goal (and once off the board, fast); sorts the cards (one wrong drop first); multi-select
and the two-way classifier (wrong first); rapid NEXT clicks; resizes mid-lesson. Screenshots of every
learner-facing state go to test-results/learning/. Fails on any console error or warning.
"""
import json
import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(__file__))
from cdp import launch_chrome, connect_page, start_static_server  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = sys.argv[1] if len(sys.argv) > 1 and "=" not in sys.argv[1] else os.path.join(ROOT, "test-results", "learning")
STOP_AT = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("STOP_AT=")), None)
os.makedirs(OUT, exist_ok=True)
PORT, DEBUG_PORT = 8795, 9339
GAME_URL = os.environ.get("GAME_URL") or f"http://127.0.0.1:{PORT}/?vo=0&vorate=4&start=learning&qa=1"

# The deck's answer keys, typed in again here so the content map is checked against a second source.
CORRECT = {
    "L05": "All three are different", "L12": "All are acute angles", "L19": "Isosceles", "L20": "Right-angled",
}
WRONG = {"L05": "Two sides are equal", "L12": "One angle is right angle", "L19": "Scalene", "L20": "Acute-angled"}
SORT_ANSWERS = {"A": "scalene", "B": "isosceles", "C": "equilateral"}
MULTI_CORRECT = ["A", "D"]
DUAL_CORRECT = {"sides": "Scalene", "angles": "Obtuse"}
TEACH_KINDS = {"draw", "count", "morph", "measureSides", "measureAngles", "compare90", "discover", "dualReveal", "lenses"}
FORBIDDEN_WORDS = ["Not quite", "Great choice", "Compare the three", "TRIANGLE WORKSHOP", "MEASURE MODE", "ANGLE MEASURE", "reference"]

failures = []

# Every screenshot also checks that no two visible pieces of UI on the card sit on top of each other
# (numbers, corners, the narration box, widgets, the beaver), except pairs that belong together: the
# beaver stands on corners and peeks over widgets, and a container may hold its children.
OVERLAP_JS = """
(() => {
  const card = document.querySelector('.workshop__card');
  if (!card) return [];
  const visible = (el) => {
    if (el.closest('[hidden], .ws-hidden')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const items = [];
  const add = (sel, kind) => card.querySelectorAll(sel).forEach((el, i) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    items.push({ el, kind, tag: `${kind}${i}`, text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24), l: r.left, t: r.top, r: r.right, b: r.bottom });
  });
  add('.ws-narration', 'narration');
  add('.ws-side-label', 'cm');
  add('.ws-angle__label', 'deg');
  add('.ws-vertex__point', 'corner');
  add('.ws-coin', 'count');
  // A screen's root wrapper spans the whole overlay: check its children instead of the wrapper itself.
  const overlay = card.querySelector('.ws-overlay');
  const ob = overlay ? overlay.getBoundingClientRect() : null;
  const isWrapper = (el) => { const r = el.getBoundingClientRect(); return ob && r.width > ob.width * 0.85 && r.height > ob.height * 0.85; };
  const leaves = (el) => (isWrapper(el) ? [...el.children].flatMap(leaves) : [el]);
  card.querySelectorAll('.ws-overlay > *').forEach((el) => {
    leaves(el).filter((x) => !x.matches('.ws-pill')).forEach((x) => {
      if (!visible(x)) return;
      const b = x.getBoundingClientRect();
      items.push({ el: x, kind: 'widget', tag: `widget${items.length}`, text: (x.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24), l: b.left, t: b.top, r: b.right, b: b.bottom });
    });
  });
  add('.ws-option--pill', 'option');
  add('.ws-pill', 'button');            // CHECK / CONTINUE: must touch nothing
  add('.ws-bin__label', 'tag');
  add('.guide__body', 'beaver');
  const together = new Set(['beaver|corner', 'beaver|widget', 'widget|option']);
  const hits = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const inCrate = (x, y) => x.el.matches('.ws-sort-card.is-placed, .ws-bin') && y.el.matches('.ws-bin, .ws-bin-front, .ws-bin__label');   // a sorted card sits in its crate by design
    if (inCrate(a, b) || inCrate(b, a)) continue;
    if (a.el.matches('.ws-sort-card.is-waiting') || b.el.matches('.ws-sort-card.is-waiting')) continue;   // the deck sits behind the bench card
    if (a.el.matches('.ws-ghost') || b.el.matches('.ws-ghost')) continue;                           // the ghost hand passes over things
    if (together.has(`${a.kind}|${b.kind}`) || together.has(`${b.kind}|${a.kind}`)) continue;
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (w > 4 && h > 4) hits.push(`${a.tag}"${a.text}" x ${b.tag}"${b.text}" ${Math.round(w)}x${Math.round(h)}px`);
  }
  return hits;
})()
"""


def check(condition, message):
    print(("  ok   " if condition else "  FAIL ") + message)
    if not condition:
        failures.append(message)


# Design QA: run at every screenshot. Each rule names the design parameter it guards.
DESIGN_JS = """
(() => {
  const card = document.querySelector('.workshop__card');
  if (!card) return [];
  const out = [];
  const shown = (el) => { if (el.closest('[hidden], .ws-hidden')) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false; } return true; };
  const surface = card.querySelector('.workshop__surface').getBoundingClientRect();
  const k = surface.width / 1560;                          // stage px per surface px
  const cardRect = card.getBoundingClientRect();
  const state = window.__learning?.state?.() ?? {};
  // 1. shape centred and big (screens that show the live triangle, not the sort / grid / summary)
  const tri = card.querySelector('.ws-tri');
  const busy = card.querySelector('.ws-sort, .ws-grid, .ws-summary, .ws-sort-result');
  if (tri && shown(tri) && !busy && Array.isArray(state.points)) {
    const xs = state.points.map((p) => p[0]); const ys = state.points.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (Math.abs(cx - 780) > 24 && state.state !== 'INTERACTING') out.push(`shape off-centre by ${Math.round(cx - 780)}px`);
    if (Math.max(w, h) < 330) out.push(`shape small (${Math.round(Math.max(w, h))}px)`);
    if (Math.max(w / 820, h / 380) < 0.78 && state.state !== 'INTERACTING') out.push(`shape leaves the card empty (${Math.round(w)} x ${Math.round(h)}px)`);   // space use
  }
  // 2. everything inside the card
  card.querySelectorAll('.ws-overlay > *, .ws-option--pill, .ws-badge, .ws-pill, .ws-side-label, .ws-angle__label').forEach((el) => {
    if (!shown(el) || el.matches('.ws-ghost, .ws-sort, .ws-grid, .ws-summary, .ws-sort-result')) return;
    const r = el.getBoundingClientRect();
    if (r.left < cardRect.left + 8 || r.right > cardRect.right - 8 || r.top < cardRect.top + 8 || r.bottom > cardRect.bottom - 8) out.push(`outside the card: ${(el.textContent || el.className.baseVal || el.className).toString().trim().slice(0, 24)}`);
  });
  // 3. readable text: size and contrast
  const lum = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return 1; const [r, g, b] = m.slice(0, 3).map((v) => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const textChecks = [
    ['.ws-narration__text', 'rgb(29, 58, 95)'], ['.ws-option--pill', 'rgb(255, 203, 51)'], ['.ws-badge', 'rgb(18, 52, 95)'],
    ['.ws-bin__label', 'rgb(29, 47, 107)'], ['.ws-side-label__text', 'rgb(255, 255, 255)'], ['.ws-angle__label', 'rgb(255, 255, 255)'], ['.ws-figure__label', 'rgb(255, 255, 255)'],
  ];
  for (const [sel, bg] of textChecks) card.querySelectorAll(sel).forEach((el) => {
    if (!shown(el) || el.closest('.is-placed, .is-waiting, .is-dimmed, .is-waiting') || el.matches(':disabled')) return;
    const cs = getComputedStyle(el); const size = parseFloat(cs.fontSize) * (el.closest('svg') ? (el.closest('svg').getBoundingClientRect().width / (el.closest('svg').viewBox.baseVal.width || 1)) : 1) / k;
    const color = el.closest('svg') ? cs.fill : cs.color;
    if (size < 17) out.push(`text too small (${size.toFixed(0)}px): ${el.textContent.trim().slice(0, 18)}`);
    const need = size >= 24 ? 3 : 4.5;
    const c = ratio(color, bg);
    if (c < need && !el.closest('.is-correct, .is-incorrect')) out.push(`low contrast ${c.toFixed(1)}:1 ${sel} "${el.textContent.trim().slice(0, 18)}"`);
  });
  // 4. chips hug their words
  card.querySelectorAll('.ws-badge').forEach((el) => {
    if (!shown(el)) return;
    const range = document.createRange(); range.selectNodeContents(el); const text = range.getBoundingClientRect().width;
    const spare = el.getBoundingClientRect().width - text;
    if (spare > 90 * k) out.push(`chip has empty space (${Math.round(spare / k)}px): ${el.textContent.trim()}`);
  });
  // 5. the narration is one line
  const nar = card.querySelector('.ws-narration');
  if (nar && shown(nar) && nar.getBoundingClientRect().height > 110 * k) out.push('narration wraps to two lines');
  // 6. corner marks share one size
  const radii = new Set([...card.querySelectorAll('.ws-tri .ws-angle__arc')].filter(shown).map((el) => (el.getAttribute('d').match(/A ([\\d.]+)/) || [])[1]).filter(Boolean).map((r) => Math.round(+r)));
  if (radii.size > 1) out.push(`corner marks differ in size: ${[...radii].join(', ')}`);
  // 7. CHECK / CONTINUE at the card's foot
  card.querySelectorAll('.ws-pill').forEach((el) => {
    if (!shown(el) || el.closest('.ws-summary')) return;
    const y = (el.getBoundingClientRect().top - surface.top) / k;
    if (Math.abs(y - 544) > 6 && !/ready/i.test(el.textContent)) out.push(`button not at the foot (${Math.round(y)}px): ${el.textContent.trim()}`);
  });
  return out;
})()
"""


class Lesson:
    def __init__(self, page):
        self.page = page
        self.shots = 0

    def state(self):
        return self.page.evaluate("window.__learning ? window.__learning.state() : null", await_promise=False)

    def wait(self, predicate, timeout, label):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            last = self.state()
            if last and predicate(last):
                return last
            self.page.pump(0.15)
        raise TimeoutError(f"{label}; last state: {json.dumps(last)[:600]}")

    def shot(self, name):
        self.shots += 1
        self.page.screenshot(os.path.join(OUT, f"{self.shots:02d}-{name}.png"))
        hits = self.page.evaluate(OVERLAP_JS, await_promise=False) or []
        check(not hits, f"{name}: no overlapping UI" + (f" -> {hits}" if hits else ""))
        design = self.page.evaluate(DESIGN_JS, await_promise=False) or []
        check(not design, f"{name}: design QA" + (f" -> {design}" if design else ""))

    def buttons(self):
        return self.page.evaluate("window.__learning.buttons()", await_promise=False) or []

    def click_button(self, match, label):
        for button in self.buttons():
            if match(button):
                self.page.click(button["x"], button["y"])
                return button
        raise RuntimeError(f"no button for {label}: {[b['text'] for b in self.buttons()]}")

    def click_option(self, text):
        return self.click_button(lambda b: b.get("option") == text, text)

    def click_class(self, cls, label=None):
        return self.click_button(lambda b: cls in b["cls"], label or cls)

    def drag(self, start, end, steps=14, fast=False):
        p = self.page
        p.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start["x"], "y": start["y"], "button": "none"})
        p.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": start["x"], "y": start["y"], "button": "left", "clickCount": 1})
        for i in range(1, steps + 1):
            t = i / steps
            p.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start["x"] + (end["x"] - start["x"]) * t, "y": start["y"] + (end["y"] - start["y"]) * t, "button": "left", "buttons": 1})
            if not fast:
                p.pump(0.03)
        p.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end["x"], "y": end["y"], "button": "left", "clickCount": 1})

    def next(self, state):
        """Teaching screens move on by themselves once their line has been read: wait for the reading pause, then the change."""
        before = state["id"]
        self.wait(lambda s: s["state"] in ("REINFORCING", "TRANSITIONING") or s["id"] != before, 90, f"{before} read out")
        if self.state()["id"] == before:
            self.page.pump(0.5)
            self.shot(f"{before}-done")
        return self.wait(lambda s: s["id"] != before, 60, f"advance from {before}")

    def wait_continue(self, state):
        self.wait(lambda s: s["state"] == "WAITING_FOR_INPUT" and any("CONTINUE" in b["text"] for b in self.buttons()), 60, f"{state['id']} CONTINUE")
        self.page.pump(0.6)
        self.shot(f"{state['id']}-success")
        before = state["id"]
        for _ in range(4):                       # rapid taps on CONTINUE must advance exactly one screen
            self.click_button(lambda b: "CONTINUE" in b["text"], "CONTINUE")
        return self.wait(lambda s: s["id"] != before, 30, f"advance from {before}")


def play_drag(lesson, state):
    page = lesson.page
    st = lesson.wait(lambda s: s["state"] == "INTERACTING", 60, f"{state['id']} draggable")
    page.pump(0.6)
    lesson.shot(f"{state['id']}-interact")
    target = page.evaluate("window.__learning.dragTarget()", await_promise=False)
    # Stress: a fast drag far outside the board, then release; the triangle must still be valid.
    stage = page.rect("#stage")
    lesson.drag(target["from"], {"x": stage["x"] - stage["w"] / 2 - 40, "y": stage["y"] - stage["h"] / 2 - 40}, steps=4, fast=True)
    page.pump(0.3)
    after = lesson.state()
    m = after["measured"]
    check(min(m["cm"]) > 1.0 and min(m["deg"]) > 9, f"{state['id']}: a wild drag off the board leaves a usable triangle (sides {[round(v, 1) for v in m['cm']]} cm, angles {[round(v) for v in m['deg']]}°)")
    if after["state"] != "INTERACTING" or after["id"] != state["id"]:
        # The clamped shape can already satisfy an open goal (an obtuse angle): that is a legitimate success.
        check(max(m["deg"]) > 90.5 and state["id"] in ("L17",), f"{state['id']}: the wild drag ended the screen only because it met the goal (largest angle {round(max(m['deg']))}°)")
        return lesson.wait(lambda s: s["id"] != state["id"] or s["state"] in ("REINFORCING", "NARRATING"), 60, f"{state['id']} after an early success")
    check(after["state"] == "INTERACTING", f"{state['id']}: still interactive after a drag off the board")
    # The real move: from wherever the corner is now to a point that makes the goal true.
    target = page.evaluate("window.__learning.dragTarget()", await_promise=False)
    lesson.drag(target["from"], target["to"], steps=18)
    done = lesson.wait(lambda s: s["state"] in ("FEEDBACK", "NARRATING", "WAITING_FOR_INPUT", "REINFORCING") or s["id"] != state["id"], 20, f"{state['id']} goal reached")
    page.pump(0.6)
    lesson.shot(f"{state['id']}-achieved")
    return done


def play(lesson):
    page = lesson.page
    seen = set()
    resized = False
    while True:
        state = lesson.wait(lambda s: s["id"] is not None, 30, "lesson state")
        sid, kind = state["id"], state["kind"]
        if sid not in seen:
            seen.add(sid)
            print(f"-- {sid} ({kind})")
            page.pump(0.4)
            lesson.shot(f"{sid}-{kind}")
            words = page.evaluate("document.querySelector('.workshop')?.innerText || ''", await_promise=False)
            bad = [w for w in FORBIDDEN_WORDS if w in words]
            check(not bad, f"{sid}: only the deck's wording on the card (found {bad})" if bad else f"{sid}: only the deck's wording on the card")
        if STOP_AT and sid == STOP_AT:
            print("stopping at", sid)
            return
        if kind in TEACH_KINDS:
            before = state["id"]
            if sid in ("L04", "L11"):
                walked = lesson.wait(lambda s: s["guide"] in ("walk", "walkStop", "protractor"), 60, f"{sid}: the beaver measuring at the shape")
                page.pump(0.5)
                lesson.shot(f"{sid}-beaver-measuring")
                check(walked["guide"] is not None, f"{sid}: the beaver walks the shape with his tool (pose {walked['guide']})")
            elif sid not in ("L04", "L11") and kind not in ("summary",):
                check(page.evaluate("!document.querySelector('.guide:not([hidden])')", await_promise=False), f"{sid}: no idle beaver standing by (he only appears to measure or to explain the summary)")
            if sid == "L02" and not resized:
                lesson.wait(lambda s: s["state"] in ("REINFORCING", "TRANSITIONING"), 60, "L02 read out")
                for width, height in ((1280, 720), (1366, 768), (1440, 900), (1600, 900), (1920, 1080)):
                    page.send("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
                    page.pump(0.5)
                    overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth || document.documentElement.scrollHeight > window.innerHeight", await_promise=False)
                    inside = page.evaluate("(() => { const r = document.getElementById('stage').getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })()", await_promise=False)
                    check(not overflow and inside, f"whole stage visible, no overflow at {width}x{height}")
                    lesson.shot(f"resize-{width}x{height}")
                page.send("Emulation.clearDeviceMetricsOverride")
                page.pump(0.4)
                resized = True
            after = lesson.next(state)
            check(page.evaluate("!document.querySelector('.ws-next, .workshop__header, .ws-chip--tool, .ws-reference')", await_promise=False), f"{sid}: no next button, header, tool tag or reference card on screen")
        elif kind == "question":
            lesson.wait(lambda s: s["state"] == "WAITING_FOR_INPUT", 60, f"{sid} options")
            lesson.shot(f"{sid}-ready")
            lesson.click_option(WRONG[sid])
            reshown = lesson.wait(lambda s: s["state"] == "REINFORCING", 20, f"{sid} measurements re-shown after a wrong answer")
            lesson.shot(f"{sid}-wrong")
            back = lesson.wait(lambda s: s["state"] == "WAITING_FOR_INPUT", 20, f"{sid} ready again")
            check(reshown["id"] == sid and back["id"] == sid and not back.get("sub"), f"{sid}: a wrong answer re-shows the measurements and stays on the question, no extra words")
            for _ in range(3):      # double/triple taps on the right option must not break anything
                lesson.click_option(CORRECT[sid])
            lesson.wait(lambda s: s["id"] != sid, 30, f"{sid} advances after the right answer")
        elif kind == "drag":
            play_drag(lesson, state)
            if sid in ("CFU02", "CFU04", "CFU06"):
                after = lesson.wait(lambda s: s["state"] in ("NARRATING", "REINFORCING") and s["badges"], 60, f"{sid} success badge")
                check(len(after["badges"]) >= (2 if sid == "CFU06" else 1), f"{sid}: badge(s) shown {after['badges']}")
                lesson.next(after)
            else:
                lesson.wait(lambda s: s["id"] != sid, 60, f"{sid} moves on to the discovery")
        elif kind == "sort":
            lesson.wait(lambda s: s["state"] == "INTERACTING", 60, "sort board")
            page.pump(1.0)
            lesson.shot("CFU01-ready")
            targets = page.evaluate("window.__learning.sortTargets()", await_promise=False)
            current = targets["current"]
            wrong = next(b for b in targets["bins"] if b != SORT_ANSWERS[current])
            lesson.drag(targets["cards"][current], targets["bins"][wrong], steps=12)
            page.pump(0.9)
            check(page.evaluate("!document.querySelector('.ws-sort-card.is-placed')", await_promise=False), "CFU01: a wrong crate does not take the card")
            lesson.shot("CFU01-wrong-drop")
            for _ in SORT_ANSWERS:                     # the triangle on the bench goes to its crate, then the next one comes
                targets = page.evaluate("window.__learning.sortTargets()", await_promise=False)
                current = targets["current"]
                lesson.drag(targets["cards"][current], targets["bins"][SORT_ANSWERS[current]], steps=12)
                page.pump(1.9)
            lesson.shot("CFU01-sorted")
            lesson.wait_continue(state)
        elif kind == "multi":
            lesson.wait(lambda s: s["state"] == "INTERACTING", 60, "multi grid")
            page.pump(1.0)
            lesson.shot("CFU03-ready")
            check(all(b["disabled"] for b in lesson.buttons() if "CHECK" in b["text"]), "CFU03: CHECK is disabled until something is picked")
            lesson.click_button(lambda b: b.get("option") == "B", "card B")
            page.pump(0.3)
            lesson.click_button(lambda b: "CHECK" in b["text"], "CHECK")
            lesson.wait(lambda s: s["state"] == "CHECKING", 10, "CFU03 checking")
            st = lesson.wait(lambda s: s["state"] == "INTERACTING", 20, "CFU03 open again")
            check(page.evaluate("!document.querySelector('.ws-pick.is-selected')", await_promise=False), "CFU03: a wrong set is cleared and the learner tries again")
            lesson.shot("CFU03-wrong")
            for card in MULTI_CORRECT:
                lesson.click_button(lambda b, c=card: b.get("option") == c, f"card {card}")
                page.pump(0.2)
            lesson.click_button(lambda b: "CHECK" in b["text"], "CHECK")
            lesson.wait_continue(state)
        elif kind == "dual":
            lesson.wait(lambda s: s["state"] == "INTERACTING", 60, "dual card")
            page.pump(1.0)
            lesson.shot("CFU05-ready")
            check(all(b["disabled"] for b in lesson.buttons() if "CHECK" in b["text"]), "CFU05: CHECK is disabled until both are chosen")
            lesson.click_option("Isosceles")
            lesson.click_option("Obtuse")
            page.pump(0.3)
            lesson.click_button(lambda b: "CHECK" in b["text"], "CHECK")
            lesson.wait(lambda s: s["state"] == "CHECKING", 10, "CFU05 checking")
            lesson.wait(lambda s: s["state"] == "INTERACTING", 20, "CFU05 open again")
            check(page.evaluate("document.querySelectorAll('.ws-dual .ws-option.is-selected').length === 1", await_promise=False), "CFU05: a half-wrong answer keeps the right half and clears the wrong one")
            lesson.shot("CFU05-wrong")
            lesson.click_option("Scalene")
            page.pump(0.3)
            lesson.click_button(lambda b: "CHECK" in b["text"], "CHECK")
            after = lesson.wait(lambda s: len(s["badges"]) == 2, 60, "CFU05 success badges")
            check(after["badges"] == ["SCALENE", "OBTUSE-ANGLED"], f"CFU05: badges in order {after['badges']}")
            lesson.next(after)
        elif kind == "summary":
            lesson.wait(lambda s: page.evaluate("!!document.querySelector('.ws-summary__big')", await_promise=False), 60, "the first summary card")
            page.pump(1.6)
            lesson.shot("SUMMARY-card")
            check(page.evaluate("(() => { const g = document.querySelector('.guide'); const c = document.querySelector('.ws-summary__big'); if (!g || !c) return false; const gr = g.querySelector('.guide__frame.is-on').getBoundingClientRect(); const cr = c.getBoundingClientRect(); return gr.top < cr.top && gr.bottom > cr.top; })()", await_promise=False), "summary: the beaver peeks out from behind the card (head above its top edge)")
            lesson.wait(lambda s: page.evaluate("document.querySelectorAll('.ws-summary__slot.is-filled').length >= 3", await_promise=False), 120, "three cards collected")
            lesson.shot("SUMMARY-collecting")
            lesson.wait(lambda s: s["state"] == "WAITING_FOR_INPUT", 120, "summary CTA")
            page.pump(0.6)
            lesson.shot("SUMMARY-ready")
            check(page.evaluate("document.querySelectorAll('.ws-summary__slot.is-filled').length === 6", await_promise=False), "summary: all six categories collected into the row")
            lesson.click_button(lambda b: "ready" in b["text"], "summary CTA")
            page.wait_for("!!document.querySelector('.howto-card, .learning-replay')", timeout=60, label="the game (or the replay button) after the workshop")
            page.pump(1.2)
            lesson.shot("back-to-game")
            check(page.evaluate("!document.querySelector('.workshop') && !document.querySelector('.learning-backdrop')", await_promise=False), "the card and the workshop backdrop are gone once the scene resumes")
            check(page.evaluate("!!document.querySelector('#crane .builder:not([hidden])')", await_promise=False), "the beaver is back in the cab")
            return
        else:
            raise RuntimeError(f"unhandled kind {kind}")


def open_game(profile):
    last_error = None
    for _ in range(3):
        chrome = launch_chrome(DEBUG_PORT, profile)
        try:
            page = connect_page(DEBUG_PORT, timeout=20)
            page.navigate("data:text/html,warm-up", timeout=20)
            page.navigate(GAME_URL, timeout=40)
            page.wait_for("!document.getElementById('loader')", timeout=40, label="loader removed")
            return chrome, page
        except Exception as error:
            last_error = error
            chrome.terminate()
            time.sleep(1)
    raise RuntimeError(f"could not open the game: {last_error}")


def run():
    server = start_static_server(ROOT, PORT)
    time.sleep(0.8)
    profile = tempfile.mkdtemp(prefix="learning-qa-")      # a throwaway browser profile, outside the screenshots
    chrome, page = open_game(profile)
    lesson = Lesson(page)
    started = time.time()
    try:
        page.wait_for("!!document.querySelector('.start-button')", timeout=20, label="Start")
        page.click_selector(".start-button")
        # The hook: a frame is tried on the bridge, does not fit and drops into the canal; he needs to learn first.
        page.wait_for("!!document.querySelector('.claw-cargo .triangle')", timeout=40, label="the operator lifts a frame")
        page.pump(0.8)
        lesson.shot("00-hook-lifting")
        page.wait_for("!!document.querySelector('.triangle.is-rejected, .triangle.is-falling')", timeout=40, label="the frame does not fit")
        page.pump(0.6)
        lesson.shot("00-hook-does-not-fit")
        page.wait_for("(document.querySelector('.speech-bubble__text .visually-hidden')?.textContent || '').includes('learn about triangles')", timeout=60, label="the hook line")
        page.pump(1.0)
        lesson.shot("00-hook-learn-first")
        page.wait_for("(document.querySelector('.speech-bubble__text .visually-hidden')?.textContent || '').includes('explore triangles')", timeout=60, label="Let's explore triangles!")
        page.pump(0.6)
        lesson.shot("00-hook-explore")
        page.wait_for("!!document.querySelector('.workshop.is-up')", timeout=40, label="the board is up")
        check(page.evaluate("!!document.querySelector('#crane .builder[hidden]') && !!document.querySelector('.learning-backdrop.is-on')", await_promise=False), "the operator climbed down into the workshop: cab empty, workshop backdrop on")
        play(lesson)
    except Exception as error:
        failures.append(f"exception: {error}")
        print("  EXCEPTION", error)
        try:
            lesson.shot("failure")
        except Exception:
            pass
    finally:
        problems = [c for c in page.console if c[0] in ("error", "warning")]
        print("console errors/warnings:", problems)
        print("exceptions:", page.errors)
        check(not problems and not page.errors, "no console errors or warnings")
        chrome.terminate()
        server.terminate()
        time.sleep(0.5)
        shutil.rmtree(profile, ignore_errors=True)
    print(f"\n{len(failures)} failure(s) in {time.time() - started:.0f}s")
    for failure in failures:
        print(" -", failure)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
