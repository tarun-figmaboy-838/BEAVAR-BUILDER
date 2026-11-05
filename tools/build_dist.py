"""Production build: writes dist/, a compressed copy of the game ready to deploy (e.g. on Vercel).

What it does
  - rebuilds js/game.bundle.js, then copies only the files the game actually uses;
  - images: the canal backdrop as AVIF (served through <picture> with a WebP fallback), every
    sprite as WebP (high quality, full-quality alpha; repeating tiles lossless so no seams appear);
  - narration: each clip as Ogg Opus (speech-tuned, mono) next to the original MP3; the game picks
    Ogg where the browser can play it and MP3 elsewhere (older iPhones/iPads);
  - the seven stylesheets as one minified file.

Run:  python3 tools/build_dist.py
Needs Pillow with WebP + AVIF (pip3 install pillow) and macOS afconvert (encodes the Opus; this script packs it as Ogg).
"""
import os
import re
import shutil
import struct
import subprocess
import sys
import zlib

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
STYLES = ["tokens", "base", "layout", "components", "gameplay", "animations", "responsive"]
BACKDROP = "assets/images/background/canal.png"
# Sprites drawn as repeating backgrounds: lossless so tile edges stay seamless.
LOSSLESS = {
    "assets/images/crane-kit/cable-tile.png",
    "assets/images/crane-kit/jib-tile.png",
    "assets/images/crane-kit/tower-mast.png",
}
WEBP_QUALITY = 90
AVIF_QUALITY = 80
OPUS_BITRATE = 40000  # speech, mono: transparent at this rate
PNG_RE = re.compile(r"assets/images/[A-Za-z0-9_/.-]+?\.png")


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as handle:
        return handle.read()


def write(path, text):
    full = os.path.join(DIST, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as handle:
        handle.write(text)


def out_path(path, extension):
    full = os.path.join(DIST, os.path.splitext(path)[0] + extension)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    return full


def minify_css(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)
    css = re.sub(r";}", "}", css)
    return css.strip() + "\n"


def to_webp(path):
    image = Image.open(os.path.join(ROOT, path))
    image.load()
    target = out_path(path, ".webp")
    if path in LOSSLESS:
        image.save(target, "WEBP", lossless=True, quality=100, method=6, exact=True)
    else:
        image.save(target, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=6)
    return target


def to_avif(path):
    image = Image.open(os.path.join(ROOT, path)).convert("RGB")
    target = out_path(path, ".avif")
    image.save(target, "AVIF", quality=AVIF_QUALITY, speed=4, subsampling="4:4:4")
    return target


def _ogg_crc(data):
    crc = 0
    for byte in data:
        crc ^= byte << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) & 0xFFFFFFFF if crc & 0x80000000 else (crc << 1) & 0xFFFFFFFF
    return crc


def _ogg_page(packets, granule, serial, sequence, flags):
    lacing = b""
    for packet in packets:
        lacing += bytes([255] * (len(packet) // 255) + [len(packet) % 255])
    header = struct.pack("<4sBBqIII", b"OggS", 0, flags, granule, serial, sequence, 0) + bytes([len(lacing)]) + lacing
    page = bytearray(header + b"".join(packets))
    struct.pack_into("<I", page, 22, _ogg_crc(page))
    return bytes(page)


def _read_varint(data, offset):
    value = 0
    while True:
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, offset


def to_opus(path):
    """MP3 -> Opus with macOS afconvert (it only writes Opus into CAF), then repackaged as Ogg Opus (RFC 7845)."""
    target = out_path(path, ".ogg")
    pcm, caf = target + ".tmp.caf", target + ".opus.caf"
    try:
        subprocess.run(["afconvert", os.path.join(ROOT, path), pcm, "-f", "caff", "-d", "LEF32@48000"], check=True, capture_output=True)
        subprocess.run(["afconvert", pcm, caf, "-f", "caff", "-d", "opus", "-b", str(OPUS_BITRATE)], check=True, capture_output=True)
        with open(caf, "rb") as handle:
            data = handle.read()
    finally:
        for temp in (pcm, caf):
            if os.path.exists(temp):
                os.remove(temp)
    chunks, offset = {}, 8
    while offset < len(data):
        kind, length = data[offset:offset + 4], struct.unpack(">q", data[offset + 4:offset + 12])[0]
        body = data[offset + 12: len(data) if length == -1 else offset + 12 + length]
        chunks[kind] = body
        offset += 12 + len(body)
    _, format_id, _, _, frames_per_packet, channels, _ = struct.unpack(">d4sIIIII", chunks[b"desc"])
    if format_id != b"opus":
        raise SystemExit(f"{path}: expected Opus, got {format_id}")
    packet_count, valid_frames, priming, _ = struct.unpack(">qqii", chunks[b"pakt"][:24])
    sizes, cursor = [], 24
    for _ in range(packet_count):
        packet_size, cursor = _read_varint(chunks[b"pakt"], cursor)
        sizes.append(packet_size)
    audio, cursor, packets = chunks[b"data"][4:], 0, []
    for packet_size in sizes:
        packets.append(audio[cursor:cursor + packet_size])
        cursor += packet_size
    pre_skip = priming or 312
    serial = zlib.crc32(path.encode())
    head = b"OpusHead" + struct.pack("<BBHIhB", 1, channels, pre_skip, 48000, 0, 0)
    vendor = b"bridge-builder build_dist"
    tags = b"OpusTags" + struct.pack("<I", len(vendor)) + vendor + struct.pack("<I", 0)
    pages = [_ogg_page([head], 0, serial, 0, 0x02), _ogg_page([tags], 0, serial, 1, 0)]
    granule, sequence, final_granule = pre_skip, 2, pre_skip + valid_frames
    for start in range(0, len(packets), 50):  # ~1 s of audio per page
        group = packets[start:start + 50]
        granule += frames_per_packet * len(group)
        last = start + 50 >= len(packets)
        pages.append(_ogg_page(group, final_granule if last else granule, serial, sequence, 0x04 if last else 0))
        sequence += 1
    with open(target, "wb") as handle:
        handle.write(b"".join(pages))
    return target


def size(path):
    return os.path.getsize(path)


def main():
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py")], check=True)
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    html = read("index.html")
    bundle = read("js/game.bundle.js")
    css = "\n".join(read(f"styles/{name}.css") for name in STYLES)

    # Every image the game references, plus the beaver frames (built from a template in code).
    images = set(PNG_RE.findall(html + bundle + css.replace("../assets/", "assets/")))
    builder_dir = "assets/images/characters/builder"
    images |= {f"{builder_dir}/{name}" for name in os.listdir(os.path.join(ROOT, builder_dir)) if name.endswith(".png")}
    missing = [path for path in images if not os.path.isfile(os.path.join(ROOT, path))]
    if missing:
        raise SystemExit(f"referenced images not found: {missing}")

    before = after = 0
    for path in sorted(images):
        before += size(os.path.join(ROOT, path))
        after += size(to_webp(path))
    backdrop_avif = to_avif(BACKDROP)
    print(f"images: {len(images)} PNG {before / 1e6:.2f} MB -> WebP {after / 1e6:.2f} MB; "
          f"backdrop AVIF {size(backdrop_avif) / 1e3:.0f} KB (WebP {size(os.path.join(DIST, BACKDROP[:-4] + '.webp')) / 1e3:.0f} KB)")

    vo_dir = "assets/audio/vo"
    mp3_total = ogg_total = 0
    for name in sorted(os.listdir(os.path.join(ROOT, vo_dir))):
        if not name.endswith(".mp3"):
            continue
        path = f"{vo_dir}/{name}"
        shutil.copy2(os.path.join(ROOT, path), out_path(path, ".mp3"))
        mp3_total += size(os.path.join(ROOT, path))
        ogg_total += size(to_opus(path))
    print(f"narration: MP3 {mp3_total / 1e3:.0f} KB kept as fallback; Ogg Opus {ogg_total / 1e3:.0f} KB")

    # Point every reference at the compressed files.
    webp = lambda text: PNG_RE.sub(lambda m: m.group(0)[:-4] + ".webp", text)
    # The beaver frame paths are a template literal (`.../beaver-${nn}.png`), which PNG_RE cannot see.
    frame_template = "padStart(2, '0')}.png`"
    if frame_template not in bundle:
        raise SystemExit("beaver frame path template not found in the bundle; update build_dist.py")
    bundle = bundle.replace(frame_template, "padStart(2, '0')}.webp`")
    write("js/game.bundle.js", webp(bundle))
    write("styles/app.css", minify_css(webp(css)))

    links = re.compile(r'\s*<link rel="stylesheet" href="styles/[a-z]+\.css">')
    html = links.sub("", html).replace('<link rel="icon" href="data:,">',
                                        '<link rel="icon" href="data:,">\n  <link rel="stylesheet" href="styles/app.css">')
    html = html.replace('<html lang="en">', '<html lang="en" data-vo-ogg>')
    backdrop_img = f'<img src="{BACKDROP}" alt="" draggable="false">'
    if backdrop_img not in html:
        raise SystemExit("backdrop <img> not found in index.html")
    html = html.replace(backdrop_img, f'<picture><source srcset="{BACKDROP[:-4]}.avif" type="image/avif">'
                                      f'<img src="{BACKDROP[:-4]}.webp" alt="" draggable="false" fetchpriority="high"></picture>')
    write("index.html", webp(html))

    shipped = read_dist("index.html") + read_dist("styles/app.css") + read_dist("js/game.bundle.js")
    leftovers = PNG_RE.findall(shipped) + re.findall(r"[^\s]*\.png[`'\")]", shipped)
    if leftovers:
        raise SystemExit(f"PNG references left in dist: {sorted(set(leftovers))}")
    total = sum(size(os.path.join(dirpath, name)) for dirpath, _, names in os.walk(DIST) for name in names)
    print(f"dist/ ready: {total / 1e6:.2f} MB in all")


def read_dist(path):
    with open(os.path.join(DIST, path), encoding="utf-8") as handle:
        return handle.read()


if __name__ == "__main__":
    main()
