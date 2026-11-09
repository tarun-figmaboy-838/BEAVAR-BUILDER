"""End-to-end play-through with real mouse input: wrong answers first, then every right answer.

Run:  python3 tools/qa/playthrough.py [output-dir]
Needs the bundled Chromium (see cdp.DEFAULT_CHROME or set CHROME=/path/to/chrome).
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from cdp import launch_chrome, connect_page, start_static_server  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "test-results")
os.makedirs(OUT, exist_ok=True)
PORT, DEBUG_PORT = 8787, 9333
GAME_URL = os.environ.get("GAME_URL") or f"http://127.0.0.1:{PORT}/?vo=0&vorate=4"
CORRECT = ["isosceles", "equilateral", "scalene", "acute", "right", "obtuse"]
GROUPS = {"sides": ["isosceles", "scalene", "equilateral"], "angles": ["acute", "obtuse", "right"]}
INSTRUCTIONS = [
    "Choose a triangle with exactly 2 equal sides.",
    "Choose an equilateral triangle.",
    "Choose a triangle where all 3 sides have different lengths.",
    "Choose an acute-angled triangle.",
    "Choose a triangle with one 90° angle.",
    "Choose a triangle with one angle greater than 90°.",
]

STATE_JS = """(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.replace(/\\s+/g, ' ').trim() ?? null;
  const crane = document.getElementById('crane');
  return {
    instruction: document.getElementById('instruction')?.hidden ? null : text('#instruction .visually-hidden') ?? text('#instruction'),
    crane: crane?.dataset.state ?? null,
    craneX: Math.round(parseFloat(crane?.querySelector('.trolley-rig')?.style.transform.match(/translateX\\(([-\\d.]+)px\\)/)?.[1] ?? '0')),
    options: [...document.querySelectorAll('.platform .triangle--option')].map((e) => e.dataset.triangleId),
    carried: document.querySelector('.claw-cargo .triangle')?.dataset.triangleId ?? null,
    hovered: document.querySelector('.triangle--option.is-hovered')?.dataset.triangleId ?? null,
    socketVisible: !!document.querySelector('.socket.is-visible'),
    socketAligned: !!document.querySelector('.socket.is-aligned'),
    pickEnabled: !document.getElementById('pick-button')?.disabled,
    dropEnabled: !document.getElementById('drop-button')?.disabled,
    pressedKeys: [...document.querySelectorAll('.dpad__key.is-pressed')].map((k) => k.dataset.direction),
    stageInView: (() => { const r = document.getElementById('stage').getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })(),
    builtMembers: document.querySelectorAll('#bridge .member.is-built').length,
    cta: [...document.querySelectorAll('.cta-button')].map((b) => b.textContent.trim()).pop() ?? null,
    ctaCount: document.querySelectorAll('.cta-button').length,
    completion: !!document.querySelector('.completion'),
    bubble: text('.speech-bubble__text .visually-hidden'),
    builderInCab: !!document.querySelector('#crane .builder:not([hidden])'),
    platformAway: ['is-away', 'is-receding'].some((c) => document.getElementById('platform').classList.contains(c)),
    start: !!document.querySelector('.start-button'),
    hotspotVisible: !!document.querySelector('.socket.is-visible'),
    litPanels: document.querySelectorAll('.panel.is-lit').length,
    bolts: document.querySelectorAll('#bridge .truss-node.is-built').length,
    placed: document.querySelectorAll('.placed-layer .triangle').length,
    controlsVisible: !document.getElementById('controls').hidden,
  };
})()"""

failures = []
OPTION_OFFSET_JS = '(() => { const c = document.querySelector(\'.claw\').getBoundingClientRect(); const o = document.querySelector(\'.triangle--option[data-triangle-id="%s"]\'); const top = [...o.querySelectorAll(\'.frame__plate\')].map((p) => p.getBoundingClientRect()).sort((a, b) => a.top - b.top)[0]; return (top.left + top.width / 2) - (c.left + c.width / 2); })()'


def check(condition, message):
    print(("  ok   " if condition else "  FAIL ") + message)
    if not condition:
        failures.append(message)


class Game:
    def __init__(self, page):
        self.page = page
        self.shots = 0

    def state(self):
        return self.page.evaluate(STATE_JS, await_promise=False)

    def wait(self, predicate, timeout, label):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            last = self.state()
            if predicate(last):
                return last
            self.page.pump(0.15)
        raise TimeoutError(f"{label}; last state: {json.dumps(last)}")

    def shot(self, name):
        self.shots += 1
        self.page.screenshot(os.path.join(OUT, f"{self.shots:02d}-{name}.png"))

    def click(self, selector):
        return self.page.click_selector(selector)

    def steer(self, done, offset_js, timeout, label):
        """Drive the crane with the arrow keys (frames and the drop spot are not tappable) until done(state)."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            state = self.state()
            if done(state):
                return state
            dx = self.page.evaluate(offset_js, await_promise=False) or 0
            key = "ArrowRight" if dx > 0 else "ArrowLeft"
            self.page.key(key, key, hold=max(0.04, min(0.25, abs(dx) * 0.0012)))
            self.page.pump(0.12)
        raise TimeoutError(f"{label}; last state: {json.dumps(self.state())}")

    def hover(self, triangle_id):
        return self.steer(lambda s: s["crane"] == "alignedWithTriangle" and s["pickEnabled"] and s["hovered"] == triangle_id,
                          OPTION_OFFSET_JS % triangle_id, 15, f"hover over {triangle_id}")

    def pick(self, triangle_id):
        self.hover(triangle_id)
        self.click("#pick-button")
        return self.wait(lambda s: s["carried"] == triangle_id and s["crane"] == "carrying", 12, f"carrying {triangle_id}")


    def carry_to_socket(self):
        """DROP does the carrying now (lift, into depth, align, lower): wait until it is live."""
        return self.wait(lambda s: s["crane"] == "carrying" and s["dropEnabled"], 12, "DROP live")

    def drop(self):
        self.click("#drop-button")


def open_game(profile):
    last_error = None
    for attempt in range(3):
        chrome = launch_chrome(DEBUG_PORT, profile)
        try:
            page = connect_page(DEBUG_PORT, timeout=20)
            page.navigate("data:text/html,warm-up", timeout=20)
            page.navigate(GAME_URL, timeout=40)
            page.wait_for("!document.getElementById('loader')", timeout=40, label="loader removed")
            return chrome, page
        except Exception as error:  # flaky first launch of the bundled Chromium
            last_error = error
            chrome.terminate()
            time.sleep(1)
    raise RuntimeError(f"could not open the game: {last_error}")


def run():
    server = start_static_server(ROOT, PORT)
    time.sleep(0.8)
    chrome, page = open_game(os.path.join(OUT, "chrome-profile"))
    game = Game(page)
    try:
        # ---- Title / drone ----
        page.pump(1.3)
        game.shot("title-drone-mid")
        state = game.wait(lambda s: s["start"], 15, "Start button")
        game.shot("title-settled")
        check(state["start"], "title screen offers one Start button")
        title_banner_present = page.evaluate("!!document.querySelector('.title-banner')", await_promise=False)

        # ---- Meet the builder ----
        game.click(".start-button")
        state = game.wait(lambda s: "triangular frames" in (s["bubble"] or ""), 20, "G0.1 builder line")
        page.pump(2.2)
        game.shot("meet-builder")
        check(game.state()["builderInCab"], "the beaver operator speaks from the crane cab")
        check(not page.evaluate("!!document.querySelector('.title-banner')", await_promise=False), "title banner removed after Start")
        check(game.state()["ctaCount"] == 0, "no text buttons: the story moves on by itself")

        # ---- Your help is needed (advances on its own) ----
        state = game.wait(lambda s: "choose the right frames" in (s["bubble"] or ""), 25, "G0.2 builder line")
        page.pump(1.2)
        game.shot("help-needed-focus")

        # ---- How to play (advances on its own) ----
        state = game.wait(lambda s: page.evaluate("!!document.querySelector('.howto-card')", await_promise=False), 30, "G0.3 card")
        page.pump(3.5)
        game.shot("how-to-play-demo-move")
        page.pump(4.0)
        game.shot("how-to-play-demo-pick")
        footer = game.wait(lambda s: page.evaluate("document.querySelector('.howto-card__footer')?.textContent", await_promise=False), 60, "practice-round line after the demos")
        game.shot("how-to-play-done")
        check(page.evaluate("document.querySelector('.howto-card__footer')?.textContent", await_promise=False) == "Let's do a practice round first!", "PDF practice-round line, shown as text")
        check(not page.evaluate("[...document.querySelectorAll('.cta-button')].some(b => b.textContent.includes('practice'))", await_promise=False), "no practice-round button")

        # ---- Gameplay: task 1 (starts on its own after the line) ----
        state = game.wait(lambda s: s["controlsVisible"] and s["instruction"] == INSTRUCTIONS[0] and s["crane"] in ("idle", "moving", "alignedWithTriangle") and len(s["options"]) == 3, 40, "task 1 ready")
        game.shot("task1-ready")
        check(state["options"] == GROUPS["sides"], f"task 1 options: {state['options']}")
        check(state["socketVisible"], "drop socket visible at task 1")
        check(state["builderInCab"], "the beaver operator stays in the crane cab during play")
        check(not page.evaluate("!!document.querySelector('.progress, .screen-label, .control-hint, .toast')", await_promise=False), "no task panel, labels, hints or toasts on screen")

        # Input safety: hold the pad, drop disabled while not aligned, pick spam.
        check(game.state()["stageInView"], "whole 16:9 stage is inside the window")
        before = game.state()["craneX"]
        page.drag_hold(".dpad__key--left", 0, 0, 0.5)
        page.pump(0.4)
        after = game.state()["craneX"]
        check(after < before, f"holding the LEFT key moves the crane ({before} -> {after})")
        check(not game.state()["dropEnabled"], "DROP disabled while the claw is empty (no DROP before a pickup)")
        page.key("ArrowRight", "ArrowRight", hold=0.4)
        page.pump(0.4)
        check(game.state()["craneX"] > after, "keyboard arrow moves the crane")

        # Wrong answer at task 1 (nothing built yet): collapse path with an empty bridge.
        check(page.evaluate("getComputedStyle(document.querySelector('.triangle--option')).pointerEvents === 'none' && document.querySelector('.socket').tagName !== 'BUTTON'", await_promise=False), "frames and the drop spot are not tappable (arrow pad, PICK and DROP only)")
        game.hover("equilateral")
        for _ in range(4):
            game.click("#pick-button")
        state = game.wait(lambda s: s["carried"] == "equilateral" and s["crane"] == "carrying", 12, "carrying equilateral")
        page.pump(0.3)
        check(game.state()["carried"] == "equilateral", "PICK spam during the pick sequence is ignored")
        check(game.state()["dropEnabled"] and not game.state()["pickEnabled"], "DROP live and PICK disabled while a frame is on the hook")
        page.pump(0.7)
        check(not game.state()["platformAway"], "the yard stays in view while the frame hangs over it (it recedes on DROP)")
        game.shot("task1-carrying-wrong")
        game.carry_to_socket()
        game.drop()
        page.pump(1.6)
        game.shot("task1-wrong-reaction")
        state = game.wait(lambda s: s["instruction"] == INSTRUCTIONS[0] and s["crane"] in ("idle", "moving", "alignedWithTriangle") and len(s["options"]) == 3 and s["placed"] == 0 and not s["platformAway"], 40, "task 1 restarts after the wrong frame")
        check(state["builtMembers"] == 0, "nothing built after a wrong answer")
        check(state["carried"] is None, "claw is empty after the reset")

        # Carrying: the pad still moves the crane (the load swings), DROP stays live, PICK does nothing.
        game.wait(lambda s: not s["platformAway"] and len(s["options"]) == 3, 15, "platform back after the reset")
        game.pick("isosceles")
        before = game.state()["craneX"]
        page.drag_hold(".dpad__key--left", 0, 0, 0.55)
        page.pump(0.5)
        state = game.state()
        check(state["craneX"] < before and state["dropEnabled"] and state["carried"] == "isosceles", "carrying: the pad moves the crane and DROP stays live")
        game.click("#pick-button")
        page.pump(0.6)
        check(game.state()["carried"] == "isosceles", "a disabled PICK does nothing while carrying")

        # Correct answer at task 1.
        game.carry_to_socket()
        game.shot("task1-aligned")
        game.drop()
        page.pump(2.0)
        game.shot("task1-construction")
        state = game.wait(lambda s: s["instruction"] == INSTRUCTIONS[1] and s["crane"] in ("idle", "moving", "alignedWithTriangle"), 45, "task 2 ready")
        check(state["builtMembers"] == 3, f"PDF p12: outer frame built (3 members), got {state['builtMembers']}")
        game.shot("task2-ready")

        # Tasks 2 and 3 correct, then a wrong answer at task 4 to see a full collapse.
        for index in (1,):
            game.pick(CORRECT[index])
            game.carry_to_socket()
            game.drop()
            state = game.wait(lambda s, i=index: s["instruction"] == INSTRUCTIONS[i + 1] and s["crane"] in ("idle", "moving", "alignedWithTriangle"), 45, f"task {index + 2} ready")
        check(state["builtMembers"] == 5, f"level 2 adds both apex diagonals (5 beams), got {state['builtMembers']}")
        check(state["bolts"] == 5, f"5 joints after level 2, got {state['bolts']}")
        game.shot("task3-ready")
        game.pick("isosceles")
        game.carry_to_socket()
        game.drop()
        page.pump(3.2)
        game.shot("task3-wrong-sway")
        page.pump(1.4)
        game.shot("task3-wrong-collapse")
        state = game.wait(lambda s: s["instruction"] == INSTRUCTIONS[0] and s["builtMembers"] == 0 and s["crane"] in ("idle", "moving", "alignedWithTriangle") and len(s["options"]) == 3, 45, "back to task 1 after the collapse")
        check(state["instruction"] == INSTRUCTIONS[0], "task card back to task 1 after the collapse")
        game.shot("after-collapse-reset")

        # All six correct.
        for index, correct in enumerate(CORRECT):
            game.pick(correct)
            game.carry_to_socket()
            game.drop()
            if index == 3:
                page.pump(1.5)
                game.shot("task4-construction")
            if index < 5:
                state = game.wait(lambda s, i=index: s["instruction"] == INSTRUCTIONS[i + 1] and s["crane"] in ("idle", "moving", "alignedWithTriangle"), 45, f"task {index + 2} ready")
                if index == 2:
                    check(state["options"] == GROUPS["angles"], f"angle group appears at level 4: {state['options']}")
                    game.shot("task4-ready")
            else:
                state = game.wait(lambda s: s["completion"], 60, "completion overlay")
        check(state["builtMembers"] == 20, f"complete bridge matches PDF p18 (20 members), got {state['builtMembers']}")
        page.pump(1.5)
        game.shot("completion")
        state = game.wait(lambda s: page.evaluate("!!document.querySelector('.completion__replay')", await_promise=False), 30, "replay button")
        check(page.evaluate("(() => { const b = document.querySelector('.completion__replay'); return !b.textContent.trim() && b.getAttribute('aria-label') === 'Build it again'; })()", await_promise=False), "replay is an icon button (no text)")
        game.shot("completion-final")
        game.click(".completion__replay")
        state = game.wait(lambda s: s["instruction"] == INSTRUCTIONS[0] and s["crane"] in ("idle", "moving", "alignedWithTriangle") and len(s["options"]) == 3 and s["builtMembers"] == 0, 45, "replay returns to task 1")
        check(not state["completion"], "completion overlay removed on replay")
        game.shot("replay-task1")

        # Responsive scaling
        for width, height in ((1280, 720), (1024, 1366)):
            page.send("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
            page.pump(0.6)
            overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth || document.documentElement.scrollHeight > window.innerHeight", await_promise=False)
            scale = page.evaluate("getComputedStyle(document.getElementById('stage')).getPropertyValue('--stage-scale')", await_promise=False)
            check(not overflow, f"no page overflow at {width}x{height} (stage scale {scale.strip()})")
            check(game.state()["stageInView"], f"whole stage visible at {width}x{height}")
            game.shot(f"resize-{width}x{height}")
        page.send("Emulation.clearDeviceMetricsOverride")
    except Exception as error:
        failures.append(f"exception: {error}")
        print("  EXCEPTION", error)
        try:
            game.shot("failure")
        except Exception:
            pass
    finally:
        problems = [c for c in page.console if c[0] in ("error", "warning")]
        print("console errors/warnings:", problems)
        print("exceptions:", page.errors)
        check(not problems and not page.errors, "no console errors or warnings")
        chrome.terminate()
        server.terminate()
    print(f"\n{len(failures)} failure(s)")
    for failure in failures:
        print(" -", failure)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run())
