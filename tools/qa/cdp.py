"""Minimal Chrome DevTools Protocol client on the Python standard library.

Used by the QA play-through and the voice recorder when Node/Playwright are not available.
"""
import base64
import json
import os
import socket
import struct
import subprocess
import time
import urllib.request

DEFAULT_CHROME = os.path.expanduser(
    "~/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
)


class WebSocket:
    def __init__(self, url, timeout=60):
        rest = url[len("ws://"):]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode())
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("websocket handshake failed")
            response += chunk
        head, _, self.buf = response.partition(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise ConnectionError(head[:200])

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(max(65536, n - len(self.buf)))
            if not chunk:
                raise ConnectionError("socket closed")
            self.buf += chunk
        data, self.buf = self.buf[:n], self.buf[n:]
        return bytes(data)

    def _send_frame(self, opcode, payload):
        header = bytearray([0x80 | opcode])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def send_text(self, text):
        self._send_frame(0x1, text.encode())

    def recv_message(self):
        message = bytearray()
        while True:
            b1, b2 = self._recv_exact(2)
            fin, opcode, masked, n = b1 & 0x80, b1 & 0x0F, b2 & 0x80, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._recv_exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._recv_exact(8))[0]
            mask = self._recv_exact(4) if masked else None
            payload = self._recv_exact(n)
            if mask:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode == 0x8:
                raise ConnectionError("closed by peer")
            if opcode == 0x9:
                self._send_frame(0xA, payload)
                continue
            if opcode == 0xA:
                continue
            message += payload
            if fin:
                return message.decode()


class CDP:
    def __init__(self, ws_url, timeout=60):
        self.ws = WebSocket(ws_url, timeout)
        self.next_id = 0
        self.console = []
        self.errors = []
        self.events = []
        self.event_handlers = []

    def _handle_event(self, msg):
        method = msg.get("method")
        params = msg.get("params", {})
        if method == "Runtime.consoleAPICalled":
            text = " ".join(str(a.get("value", a.get("description", ""))) for a in params.get("args", []))
            self.console.append((params.get("type"), text))
        elif method == "Runtime.exceptionThrown":
            details = params.get("exceptionDetails", {})
            self.errors.append(details.get("exception", {}).get("description") or details.get("text"))
        elif method == "Log.entryAdded":
            entry = params.get("entry", {})
            if entry.get("level") in ("error", "warning"):
                self.console.append((entry.get("level"), f"{entry.get('text')} {entry.get('url', '')}"))
        self.events.append(msg)
        for handler in self.event_handlers:
            handler(msg)

    def send(self, method, params=None, timeout=60):
        self.next_id += 1
        msg_id = self.next_id
        self.ws.send_text(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        self.ws.sock.settimeout(timeout)
        while True:
            msg = json.loads(self.ws.recv_message())
            if msg.get("id") == msg_id:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            self._handle_event(msg)
            if time.time() > deadline:
                raise TimeoutError(method)

    def pump(self, seconds):
        """Process events for a while (sleep that keeps the console log flowing)."""
        end = time.time() + seconds
        while True:
            remaining = end - time.time()
            if remaining <= 0:
                return
            self.ws.sock.settimeout(remaining)
            try:
                self._handle_event(json.loads(self.ws.recv_message()))
            except socket.timeout:
                return

    def enable(self):
        for domain in ("Page", "Runtime", "Log"):
            self.send(f"{domain}.enable")

    def evaluate(self, expression, await_promise=True, timeout=60):
        result = self.send(
            "Runtime.evaluate",
            {"expression": expression, "awaitPromise": await_promise, "returnByValue": True},
            timeout,
        )
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            raise RuntimeError(details.get("exception", {}).get("description") or details.get("text"))
        return result.get("result", {}).get("value")

    def navigate(self, url, timeout=60):
        self.events = [e for e in self.events if e.get("method") != "Page.loadEventFired"]
        self.send("Page.navigate", {"url": url})
        deadline = time.time() + timeout
        target = url.rstrip("/")
        while time.time() < deadline:
            if any(e.get("method") == "Page.loadEventFired" for e in self.events):
                self.events = [e for e in self.events if e.get("method") != "Page.loadEventFired"]
                return
            try:
                state = self.evaluate("[document.readyState, location.href]", await_promise=False, timeout=10)
                if state and state[0] == "complete" and state[1].rstrip("/") == target:
                    return
            except Exception:
                pass
            self.pump(0.2)
        raise TimeoutError("page load")

    def wait_for(self, expression, timeout=30, interval=0.15, label=None):
        deadline = time.time() + timeout
        while time.time() < deadline:
            value = self.evaluate(expression, await_promise=False)
            if value:
                return value
            self.pump(interval)
        raise TimeoutError(label or expression)

    def screenshot(self, path):
        data = self.send("Page.captureScreenshot", {"format": "png"})["data"]
        with open(path, "wb") as handle:
            handle.write(base64.b64decode(data))

    def click(self, x, y):
        for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
            params = {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1}
            if kind == "mouseMoved":
                params["button"] = "none"
            self.send("Input.dispatchMouseEvent", params)

    def rect(self, selector):
        return self.evaluate(
            "(() => { const el = document.querySelector(%s); if (!el) return null; const r = el.getBoundingClientRect();"
            " return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()" % json.dumps(selector),
            await_promise=False,
        )

    def click_selector(self, selector):
        rect = self.rect(selector)
        if not rect:
            raise RuntimeError(f"no element for {selector}")
        self.click(rect["x"], rect["y"])
        return rect

    def hold_selector(self, selector, seconds):
        rect = self.rect(selector)
        if not rect:
            raise RuntimeError(f"no element for {selector}")
        self.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": rect["x"], "y": rect["y"], "button": "none"})
        self.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": rect["x"], "y": rect["y"], "button": "left", "clickCount": 1})
        self.pump(seconds)
        self.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": rect["x"], "y": rect["y"], "button": "left", "clickCount": 1})

    def drag_hold(self, selector, dx, dy, seconds):
        """Press at the element's centre, drag by (dx, dy) screen px, hold, release."""
        rect = self.rect(selector)
        if not rect:
            raise RuntimeError(f"no element for {selector}")
        x, y = rect["x"], rect["y"]
        self.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})
        self.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        for step in range(1, 6):
            self.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x + dx * step / 5, "y": y + dy * step / 5, "button": "left", "buttons": 1})
            self.pump(0.02)
        self.pump(seconds)
        self.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x + dx, "y": y + dy, "button": "left", "clickCount": 1})

    def key(self, key, code, hold=0.0):
        self.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": key, "code": code})
        if hold:
            self.pump(hold)
        self.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code})


def launch_chrome(port, profile_dir, chrome_path=None, extra_args=()):
    chrome = chrome_path or os.environ.get("CHROME") or DEFAULT_CHROME
    os.makedirs(profile_dir, exist_ok=True)
    args = [
        chrome, "--headless=new", f"--remote-debugging-port={port}", "--window-size=1920,1080",
        "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
        "--use-mock-keychain", "--password-store=basic", "--disable-features=TranslateUI",
        f"--user-data-dir={profile_dir}", "--autoplay-policy=no-user-gesture-required", *extra_args, "about:blank",
    ]
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2).read()
            return process
        except Exception:
            time.sleep(0.3)
    raise RuntimeError("chrome did not start")


def connect_page(port, timeout=60):
    pages = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5).read())
    page = next(p for p in pages if p.get("type") == "page")
    cdp = CDP(page["webSocketDebuggerUrl"], timeout)
    cdp.enable()
    return cdp


def start_static_server(root, port):
    return subprocess.Popen(
        ["python3", "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", root],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
