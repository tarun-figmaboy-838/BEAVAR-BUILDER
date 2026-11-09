"""Cross-device visual QA: plays into task 1 on a matrix of laptop, tablet and phone screens
in Chromium and WebKit (Safari's engine) and saves screenshots of each key moment.

Run:  python3 tools/qa/devices.py [output-dir] [device-name-filter]
Needs the Python Playwright package with its Chromium and WebKit browsers installed.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from cdp import start_static_server  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SERVE = os.path.join(ROOT, os.environ.get("GAME_ROOT", ""))  # GAME_ROOT=dist tests the production build
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "test-results", "devices")
ONLY = sys.argv[2] if len(sys.argv) > 2 else ""
PORT = int(os.environ.get("PORT", "8791"))
URL = f"http://127.0.0.1:{PORT}/?vo=0&vorate=4"

# name, engine, css width, css height, device pixel ratio, touch/mobile
DEVICES = [
    ("win-1366x657-chrome", "chromium", 1366, 657, 1, False),      # cheap 1366x768 laptop, Chrome toolbar showing
    ("win-1536x730-125pct", "chromium", 1536, 730, 1.25, False),   # 1080p laptop at 125% scaling
    ("win-1280x593-150pct", "chromium", 1280, 593, 1.5, False),    # 1080p laptop at 150% scaling
    ("chromebook-1366x768", "chromium", 1366, 768, 1, True),
    ("monitor-2560x1305", "chromium", 2560, 1305, 1, False),
    ("mac-1470x832-safari", "webkit", 1470, 832, 2, False),
    ("mac-1280x720-safari", "webkit", 1280, 720, 2, False),
    ("ipad-1180x820-land", "webkit", 1180, 820, 2, True),
    ("ipad-820x1180-port", "webkit", 820, 1180, 2, True),
    ("android-tab-1280x800", "chromium", 1280, 800, 1.5, True),
    ("iphone-844x390-land", "webkit", 844, 390, 3, True),
    ("android-915x412-land", "chromium", 915, 412, 2.625, True),
    ("phone-390x844-port", "webkit", 390, 844, 3, True),
]

LAYOUT_JS = """(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const stage = document.getElementById('stage');
  return {
    viewport: [innerWidth, innerHeight],
    scale: getComputedStyle(stage).getPropertyValue('--stage-scale').trim(),
    stage: r(stage),
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    action: r(document.getElementById('drop-button')),
    pick: r(document.getElementById('pick-button')),
    joystick: r(document.getElementById('dpad')),
    mute: r(document.getElementById('mute')),
    banner: r(document.getElementById('instruction')),
    bannerText: (() => { const el = document.getElementById('instruction'); return el && { scrollW: el.scrollWidth, clientW: el.clientWidth }; })(),
    fontDisplay: document.fonts ? [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family) : null,
  };
})()"""


def run_device(pw, name, engine, width, height, dpr, touch):
    browser = getattr(pw, engine).launch()
    context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=dpr,
                                  has_touch=touch, is_mobile=touch and engine == "chromium")
    page = context.new_page()
    problems = []
    page.on("console", lambda m: m.type in ("error", "warning") and problems.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
    shots = []

    def shot(label):
        path = os.path.join(OUT, f"{name}--{len(shots) + 1:02d}-{label}.png")
        page.screenshot(path=path)
        shots.append(path)

    def steer(done_js, offset_js, timeout=20):
        """Arrow keys only: frames and the drop spot are not tappable."""
        end = time.time() + timeout
        while time.time() < end:
            if page.evaluate(done_js):
                return
            dx = page.evaluate(offset_js) or 0
            key = "ArrowRight" if dx > 0 else "ArrowLeft"
            page.keyboard.down(key)
            page.wait_for_timeout(max(40, min(250, abs(dx) * 1.2)))
            page.keyboard.up(key)
            page.wait_for_timeout(120)
        raise TimeoutError("could not steer the crane into place")

    def press(selector):
        if touch:
            page.locator(selector).first.tap(timeout=15000, force=True)
        else:
            page.locator(selector).first.click(timeout=15000, force=True)

    result = {"device": name, "engine": engine, "ok": True}
    try:
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_function("!document.getElementById('loader')", timeout=60000)
        page.wait_for_selector(".start-button", timeout=20000)
        page.wait_for_timeout(1200)
        shot("title")
        press(".start-button")
        page.wait_for_selector(".speech-bubble", timeout=30000)
        page.wait_for_timeout(1500)
        shot("meet-builder")
        page.wait_for_selector(".howto-card", timeout=60000)   # the story advances on its own
        page.wait_for_timeout(5000)
        shot("how-to-play")
        page.wait_for_function("!document.getElementById('controls').hidden && document.querySelectorAll('.platform .triangle--option').length === 3 && !document.getElementById('instruction').hidden", timeout=90000)
        page.wait_for_timeout(1500)
        shot("task1")
        result["layout_task1"] = page.evaluate(LAYOUT_JS)
        steer("document.querySelector('.triangle--option.is-hovered')?.dataset.triangleId === 'isosceles' && !document.getElementById('pick-button').disabled",
              '(() => { const c = document.querySelector(\'.claw\').getBoundingClientRect(); const o = document.querySelector(\'.triangle--option[data-triangle-id="isosceles"]\'); const top = [...o.querySelectorAll(\'.frame__plate\')].map((p) => p.getBoundingClientRect()).sort((a, b) => a.top - b.top)[0]; return (top.left + top.width / 2) - (c.left + c.width / 2); })()')
        shot("hover-isosceles")
        press("#pick-button")
        page.wait_for_function("document.querySelector('.claw-cargo .triangle')?.dataset.triangleId === 'isosceles' && document.getElementById('crane').dataset.state === 'carrying' && !document.getElementById('drop-button').disabled", timeout=20000)
        page.wait_for_timeout(300)
        shot("carrying")
        press("#drop-button")
        page.wait_for_function("document.getElementById('crane').dataset.state === 'transportingDepth'", timeout=10000)
        page.wait_for_timeout(900)
        shot("transport")
        page.wait_for_timeout(2800)
        shot("built")
        page.wait_for_function("document.getElementById('instruction')?.textContent.includes('equilateral')", timeout=45000)
        page.wait_for_timeout(800)
        shot("task2")
    except Exception as error:
        result["ok"] = False
        result["error"] = str(error).splitlines()[0][:300]
        try:
            shot("failure")
        except Exception:
            pass
    result["problems"] = problems
    result["shots"] = shots
    browser.close()
    return result


def main():
    os.makedirs(OUT, exist_ok=True)
    server = start_static_server(SERVE, PORT)
    time.sleep(0.8)
    results = []
    try:
        with sync_playwright() as pw:
            for device in DEVICES:
                if ONLY and not any(part in device[0] for part in ONLY.split(",")):
                    continue
                print("->", device[0], flush=True)
                result = run_device(pw, *device)
                print(json.dumps({k: v for k, v in result.items() if k != "shots"}), flush=True)
                results.append(result)
    finally:
        server.terminate()
    with open(os.path.join(OUT, "results.json"), "w") as handle:
        json.dump(results, handle, indent=2)
    bad = [r for r in results if not r["ok"] or r["problems"]]
    print(f"\n{len(results) - len(bad)}/{len(results)} devices clean")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
