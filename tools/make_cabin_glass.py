"""Makes the cab's front layer: its body and window frame, plus a faint glass sheet with light streaks.

The operator sits between the cabin art (interior, seat, back wall) and this layer, so he is inside the
cab, behind glass. Writes assets/images/crane-v2/operator-cabin-front.png (same size as the cabin art).
Run after changing the cabin art.
"""
import os
from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "assets/images/crane-v2/operator-cabin-clear.png")
OUT = os.path.join(ROOT, "assets/images/crane-v2/operator-cabin-front.png")
FRAME_DEPTH = 14          # art px of frame kept in front, measured inward from the dark window ring


def main():
    cab = Image.open(SRC).convert("RGBA")
    w, h = cab.size
    px = cab.load()
    # The window's dark ring, thickened a little so the outside fill cannot leak through anti-aliasing.
    ring = Image.new("L", (w, h), 0)
    rp = ring.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 200 and r < 35 and g < 62 and b < 100:
                rp[x, y] = 255
    ring = ring.filter(ImageFilter.MaxFilter(5))
    rp = ring.load()
    # Everything reachable from the image corner without crossing the ring is outside the window.
    outside = Image.new("L", (w, h), 0)
    op = outside.load()
    queue = deque([(0, 0)])
    op[0, 0] = 255
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not op[nx, ny] and not rp[nx, ny]:
                op[nx, ny] = 255
                queue.append((nx, ny))
    window = ImageChops.invert(outside.filter(ImageFilter.MaxFilter(2 * FRAME_DEPTH + 1)))   # window opening, minus the frame
    window = window.filter(ImageFilter.GaussianBlur(1.2))
    # Front layer: the cab art where it is NOT window opening.
    alpha = ImageChops.multiply(cab.getchannel("A"), ImageChops.invert(window))
    front = cab.copy()
    front.putalpha(alpha)
    # Glass sheet over the opening: a faint cool tint, two diagonal light streaks, a soft rim shine.
    glass = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tint = Image.new("RGBA", (w, h), (200, 240, 255, 34))
    glass = Image.composite(tint, glass, window)
    streaks = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(streaks)
    for x0, width, strength in ((360, 70, 120), (470, 26, 90), (980, 34, 70)):
        d.polygon([(x0, 300), (x0 + width, 300), (x0 + width - 380, h), (x0 - 380, h)], fill=strength)
    streaks = streaks.filter(ImageFilter.GaussianBlur(10))
    streaks = ImageChops.multiply(streaks, window)
    shine = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    shine.putalpha(streaks)
    glass = Image.alpha_composite(glass, shine)
    result = Image.alpha_composite(glass, front)
    result.save(OUT, optimize=True)
    print(f"front layer {result.size} -> {os.path.relpath(OUT, ROOT)}; window opening {sum(1 for v in window.getdata() if v > 128)} px")


if __name__ == "__main__":
    main()
