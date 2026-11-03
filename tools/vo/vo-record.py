"""Records the narration clips with the "Ai Wala Human By Aamir" studio (Batch Generation tab),
driving the bundled Chromium over the DevTools Protocol, then builds the line→clip map.

  python3 tools/vo/vo-record.py check            upload a one-row sheet and print the batch controls (no generation)
  python3 tools/vo/vo-record.py batch [ids...]   record the lines that have no clip yet (or only the given ids)
  python3 tools/vo/vo-record.py build            measure the clips, write js/data/vo-lines.js and docs/VOICEOVER.md

Settings follow the Fishing Frenzy convention: language Hindi (English written in Devanagari is spoken as
English with a clear Indian accent), narrator = Female Teacher (Standard), builder = Male Teacher (Formal),
MP3 from the studio shipped as-is in assets/audio/vo/. The studio proxy allows 100 requests per 15 minutes
per IP and every line costs two, so batches are kept under 48 rows and the limit is read before each one.
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qa"))
from cdp import CDP, DEFAULT_CHROME  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPT_PATH = os.path.join(ROOT, "tools", "vo", "vo_script.json")
CLIP_DIR = os.path.join(ROOT, "assets", "audio", "vo")
LINES_JS = os.path.join(ROOT, "js", "data", "vo-lines.js")
DOC_PATH = os.path.join(ROOT, "docs", "VOICEOVER.md")
STUDIO = "https://ai-wala-human-by-aamir-809572708022.asia-southeast1.run.app/"
VOICES = {"narrator": "Female Teacher (Standard)", "builder": "Male Teacher (Formal)"}
LANGUAGE = "hi"
PORT = 9444
WORK = os.environ.get("VO_WORK") or os.path.join(os.path.expanduser("~"), ".cache", "bridge-builder-vo")
MAX_ROWS = 40


def load_script():
    with open(SCRIPT_PATH, encoding="utf-8") as handle:
        return json.load(handle)


def save_script(entries):
    with open(SCRIPT_PATH, "w", encoding="utf-8") as handle:
        json.dump(entries, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def clip_path(entry_id):
    return os.path.join(CLIP_DIR, f"{entry_id}.mp3")


# ---------- minimal .xlsx writer (inlineStr cells) ----------
def xml_escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def make_xlsx(rows, path):
    def cell(ref, value):
        return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{xml_escape(value)}</t></is></c>'
    lines = ['<row r="1">' + cell("A1", "filename") + cell("B1", "text") + "</row>"]
    for index, (name, text) in enumerate(rows, start=2):
        lines.append(f'<row r="{index}">' + cell(f"A{index}", name) + cell(f"B{index}", text) + "</row>")
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             + "".join(lines) + "</sheetData></worksheet>")
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '</Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="voiceovers" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '</Relationships>',
        "xl/worksheets/sheet1.xml": sheet,
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return path


# ---------- browser ----------
def launch_browser(download_dir):
    os.makedirs(download_dir, exist_ok=True)
    profile = os.path.join(WORK, "chrome-profile")
    args = [os.environ.get("CHROME") or DEFAULT_CHROME, "--headless=new", f"--remote-debugging-port={PORT}",
            "--window-size=1400,1100", "--no-first-run", "--no-default-browser-check", "--disable-gpu",
            "--hide-scrollbars", "--use-mock-keychain", "--password-store=basic", f"--user-data-dir={profile}", "about:blank"]
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1).read()
            break
        except Exception:
            time.sleep(0.3)
    pages = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
    page = next(p for p in pages if p["type"] == "page")
    cdp = CDP(page["webSocketDebuggerUrl"], timeout=90)
    cdp.send("Page.enable")
    cdp.send("Runtime.enable")
    cdp.send("Network.enable")
    try:
        cdp.send("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": download_dir, "eventsEnabled": True})
    except Exception:
        cdp.send("Page.setDownloadBehavior", {"behavior": "allow", "downloadPath": download_dir})
    return process, cdp


def open_batch_tab(cdp):
    cdp.send("Page.navigate", {"url": STUDIO})
    for _ in range(80):
        cdp.pump(0.5)
        try:
            if cdp.evaluate("document.querySelectorAll('button').length", await_promise=False, timeout=10) > 0:
                break
        except Exception:
            pass
    cdp.pump(1.5)
    clicked = cdp.evaluate("(() => { const b = [...document.querySelectorAll('button')].find(b => /batch generation/i.test(b.textContent)); if (!b) return false; b.click(); return true; })()", await_promise=False)
    if not clicked:
        raise RuntimeError("Batch Generation tab not found")
    cdp.pump(1.2)


def upload(cdp, xlsx_path):
    root = cdp.send("DOM.getDocument", {"depth": 1})["root"]["nodeId"]
    node = cdp.send("DOM.querySelector", {"nodeId": root, "selector": "input[type=file]"})["nodeId"]
    cdp.send("DOM.setFileInputFiles", {"files": [xlsx_path], "nodeId": node})
    cdp.pump(2.5)


CONTROLS_JS = """(() => {
  const near = (el) => (el.closest('label')?.textContent || el.parentElement?.previousElementSibling?.textContent || el.previousElementSibling?.textContent || el.parentElement?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  return {
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean),
    selects: [...document.querySelectorAll('select')].map((s, i) => ({ index: i, near: near(s), value: s.value, options: [...s.options].map((o) => o.value + '|' + o.textContent.trim()) })),
    inputs: [...document.querySelectorAll('input')].map((inp, i) => ({ index: i, type: inp.type, value: inp.value, placeholder: inp.placeholder, near: near(inp) })),
    text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 900),
  };
})()"""


def set_select_value(cdp, index, value):
    ok = cdp.evaluate("""((index, value) => {
      const select = document.querySelectorAll('select')[index];
      if (!select) return 'no select';
      const option = [...select.options].find((o) => o.value === value || o.textContent.trim() === value || o.textContent.trim().startsWith(value));
      if (!option) return 'no option ' + value;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, option.value);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })(%d, %s)""" % (index, json.dumps(value)), await_promise=False)
    if ok != "ok":
        raise RuntimeError(f"select {index}: {ok}")


def set_input_value(cdp, index, value):
    ok = cdp.evaluate("""((index, value) => {
      const input = document.querySelectorAll('input')[index];
      if (!input) return 'no input';
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })(%d, %s)""" % (index, json.dumps(str(value))), await_promise=False)
    if ok != "ok":
        raise RuntimeError(f"input {index}: {ok}")


def click_button(cdp, pattern):
    return cdp.evaluate("""((pattern) => {
      const re = new RegExp(pattern, 'i');
      const button = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent.replace(/\\s+/g, ' ').trim()));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })(%s)""" % json.dumps(pattern), await_promise=False)


def rate_limit():
    request = urllib.request.Request(STUDIO + "gemini-api-proxy/v1beta/models?__applet_proxy=true")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            headers = response.headers
    except urllib.error.HTTPError as error:
        headers = error.headers
    return int(headers.get("ratelimit-remaining", "0") or 0), int(headers.get("ratelimit-reset", "0") or 0)


def configure_batch(cdp, controls, voice, row_count):
    """Finds each control by its options/labels (the studio has no ids) and fills it in."""
    for select in controls["selects"]:
        values = [o.split("|")[0] for o in select["options"]]
        if LANGUAGE in values and "en" in values:
            set_select_value(cdp, select["index"], LANGUAGE)
        elif any(v.startswith("Female Teacher") for v in values):
            set_select_value(cdp, select["index"], voice)
        elif any(v.lower() in ("mp3", ".mp3") for v in values):
            set_select_value(cdp, select["index"], next(v for v in values if v.lower() in ("mp3", ".mp3")))
        elif any(re.fullmatch(r"3.*", v) for v in values) and "concurrency" in select["near"].lower():
            set_select_value(cdp, select["index"], next(v for v in values if v.startswith("3")))
        elif "text" in values and "filename" in values:
            wanted = "text" if "text column" in select["near"].lower() else "filename" if "filename" in select["near"].lower() else None
            if wanted:
                set_select_value(cdp, select["index"], wanted)
    # Two number inputs, in page order: Start Row, then Quantity.
    number_inputs = [inp for inp in controls["inputs"] if inp["type"] == "number"]
    if len(number_inputs) >= 2:
        set_input_value(cdp, number_inputs[0]["index"], 1)
        set_input_value(cdp, number_inputs[1]["index"], row_count)
    cdp.pump(0.8)


def wait_for_download(download_dir, before, timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        current = {f for f in os.listdir(download_dir) if f.endswith(".zip")}
        new = current - before
        if new:
            path = os.path.join(download_dir, sorted(new)[0])
            if not os.path.exists(path + ".crdownload"):
                time.sleep(0.5)
                return path
        time.sleep(0.5)
    raise TimeoutError("zip download")


def run_batch(cdp, entries, voice, download_dir, devanagari_log):
    rows = [(entry["id"], entry["spoken"]) for entry in entries]
    xlsx = make_xlsx(rows, os.path.join(WORK, f"batch-{entries[0]['id']}.xlsx"))
    open_batch_tab(cdp)
    upload(cdp, xlsx)
    controls = cdp.evaluate(CONTROLS_JS, await_promise=False)
    configure_batch(cdp, controls, voice, len(rows))
    controls = cdp.evaluate(CONTROLS_JS, await_promise=False)
    print("  controls:", json.dumps({k: v for k, v in controls.items() if k != 'text'}, ensure_ascii=False)[:1200])
    for stale in [f for f in os.listdir(download_dir) if f.endswith(".zip")]:
        os.remove(os.path.join(download_dir, stale))  # the studio always names its zip voiceovers_batch.zip
    before = set()
    if not click_button(cdp, r"^GENERATE \("):
        raise RuntimeError("GENERATE (N) button not found: " + json.dumps(controls["buttons"]))
    print("  generating", len(rows), "rows…")
    deadline = time.time() + 60 * 12
    captured = {}

    def on_event(msg):
        if msg.get("method") == "Network.responseReceived":
            params = msg["params"]
            if "generateContent" in params["response"]["url"] and "tts" not in params["response"]["url"]:
                captured[params["requestId"]] = params["response"]["url"]

    cdp.event_handlers.append(on_event)
    retries = 0
    while time.time() < deadline:
        cdp.pump(3)
        text = cdp.evaluate("document.body.innerText", await_promise=False)
        if "Processing" not in text:
            if retries < 3 and re.search(r"\bFailed\b", text) and click_button(cdp, r"^Retry"):
                retries += 1
                print("  retrying failed rows")
                cdp.pump(20)
                continue
            break
    for request_id in list(captured):
        try:
            body = cdp.send("Network.getResponseBody", {"requestId": request_id})["body"]
            data = json.loads(body)
            devanagari_log.append(data["candidates"][0]["content"]["parts"][0]["text"])
        except Exception:
            pass
    cdp.event_handlers.remove(on_event)
    if not click_button(cdp, r"DOWNLOAD ALL"):
        print("  nothing to download (all rows failed, probably the rate limit)")
        return None
    path = wait_for_download(download_dir, before)
    print("  zip:", path)
    return path


def extract_clips(zip_path, wanted_ids):
    os.makedirs(CLIP_DIR, exist_ok=True)
    added = []
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            base = os.path.splitext(os.path.basename(name))[0]
            if base in wanted_ids and name.lower().endswith(".mp3"):
                with archive.open(name) as source, open(clip_path(base), "wb") as target:
                    shutil.copyfileobj(source, target)
                added.append(base)
    return added


def duration_seconds(path):
    output = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
    match = re.search(r"estimated duration:\s*([\d.]+)\s*sec", output)
    return round(float(match.group(1)), 2) if match else 0.0


def cmd_check():
    download_dir = os.path.join(WORK, "downloads")
    process, cdp = launch_browser(download_dir)
    try:
        open_batch_tab(cdp)
        upload(cdp, make_xlsx([("vo000", "Hello")], os.path.join(WORK, "check.xlsx")))
        controls = cdp.evaluate(CONTROLS_JS, await_promise=False)
        print(json.dumps(controls, indent=1, ensure_ascii=False))
        remaining, reset = rate_limit()
        print("rate limit remaining:", remaining, "reset in", reset, "s")
    finally:
        process.terminate()


def cmd_batch(only_ids):
    entries = load_script()
    todo = [e for e in entries if (not only_ids or e["id"] in only_ids) and not os.path.exists(clip_path(e["id"]))]
    if not todo:
        print("nothing to record")
        return
    download_dir = os.path.join(WORK, "downloads")
    process, cdp = launch_browser(download_dir)
    devanagari_log = []
    try:
        for speaker, voice in VOICES.items():
            group = [e for e in todo if e["speaker"] == speaker]
            while group:
                remaining, reset = rate_limit()
                budget = max(0, remaining // 2 - 1)
                if budget < 1:
                    print(f"  rate limit: waiting {reset + 30}s")
                    time.sleep(reset + 30)
                    continue
                chunk, group = group[:min(budget, MAX_ROWS)], group[min(budget, MAX_ROWS):]
                print(f"{speaker} ({voice}): {len(chunk)} lines, {remaining} requests left in the window")
                zip_path = run_batch(cdp, chunk, voice, download_dir, devanagari_log)
                added = extract_clips(zip_path, {e["id"] for e in chunk}) if zip_path else []
                print("  clips:", added)
                missing = [e["id"] for e in chunk if e["id"] not in added]
                if missing:
                    print("  MISSING:", missing)
        if devanagari_log:
            with open(os.path.join(WORK, "devanagari.log"), "a", encoding="utf-8") as handle:
                handle.write("\n".join(devanagari_log) + "\n")
            print("  devanagari captured:", len(devanagari_log))
    finally:
        process.terminate()
    cmd_build()


def cmd_build():
    entries = load_script()
    lines = []
    missing = []
    for entry in entries:
        path = clip_path(entry["id"])
        if not os.path.exists(path):
            missing.append(entry["id"])
            continue
        entry["seconds"] = duration_seconds(path)
        lines.append(entry)
    save_script(entries)
    with open(LINES_JS, "w", encoding="utf-8") as handle:
        handle.write("// GENERATED by tools/vo/vo-record.py from tools/vo/vo_script.json. Do not edit by hand.\n")
        handle.write("// line as shown (plain text) -> { id, file in assets/audio/vo/, seconds, speaker }\n")
        handle.write("export const VO_LINES = {\n")
        for entry in lines:
            key = re.sub(r"\s+", " ", entry["line"]).strip()
            handle.write(f"  {json.dumps(key, ensure_ascii=False)}: {{ id: {json.dumps(entry['id'])}, file: {json.dumps(entry['id'] + '.mp3')}, seconds: {entry['seconds']}, speaker: {json.dumps(entry['speaker'])} }},\n")
        handle.write("};\n")
    rows = ["| Clip | Speaker | Line as shown | Spoken as | s |", "|---|---|---|---|---|"]
    for entry in lines:
        rows.append(f"| {entry['id']} | {entry['speaker']} | {entry['line']} | {entry['spoken']} | {entry['seconds']} |")
    table = "\n".join(rows)
    if os.path.exists(DOC_PATH):
        doc = open(DOC_PATH, encoding="utf-8").read()
        doc = re.sub(r"<!-- table:start -->.*<!-- table:end -->", "<!-- table:start -->\n" + table + "\n<!-- table:end -->", doc, flags=re.S)
        open(DOC_PATH, "w", encoding="utf-8").write(doc)
    print(f"{len(lines)} clips mapped; missing: {missing or 'none'}")
    for entry in lines:
        pace = len(entry["spoken"]) / entry["seconds"] if entry["seconds"] else 0
        flag = "" if 6 <= pace <= 22 else "  <-- check pace"
        print(f"  {entry['id']} {entry['seconds']:5.2f}s {pace:5.1f} chars/s{flag}")


if __name__ == "__main__":
    os.makedirs(WORK, exist_ok=True)
    command = sys.argv[1] if len(sys.argv) > 1 else "check"
    if command == "check":
        cmd_check()
    elif command == "batch":
        cmd_batch(sys.argv[2:])
    elif command == "build":
        cmd_build()
    else:
        print(__doc__)
