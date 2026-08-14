#!/usr/bin/env python3
"""Build static/img/padel.gif: a racket swinging in and putting Vincent out of play.

Standard library only, like everything else here — there is no ffmpeg, no
ImageMagick and no Pillow on this machine, so the GIF encoder is below.
macOS `sips` does the one job Python cannot: turning a JPEG into something
readable (a BMP, which is a header and then rows of pixels).

    python3 tools/make_padel_gif.py

Re-run it after changing the source photo or any of the numbers up top.
"""

from __future__ import annotations

import math
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FACE = ROOT / "static" / "img" / "vincent.jpg"
OUT = ROOT / "static" / "img" / "padel.gif"
TMP = Path("/tmp/padel-gif-face.bmp")

W, H = 320, 240
BALL_R = 40
BALL_HOME = (206, 116)

# Site palette. These get exact slots so the flat areas stay flat.
PAPER = (255, 253, 248)
INK = (22, 18, 15)
RED = (255, 45, 85)
TAN = (201, 165, 130)
SAND = (247, 242, 236)


# --------------------------------------------------------------------- image
def read_bmp(path: Path) -> tuple[int, int, list[tuple[int, int, int]]]:
    """Just enough BMP for what sips writes: 24- or 32-bit, bottom-up."""
    raw = path.read_bytes()
    if raw[:2] != b"BM":
        raise SystemExit("not a BMP: " + str(path))
    offset = struct.unpack_from("<I", raw, 10)[0]
    width, height = struct.unpack_from("<ii", raw, 18)
    bpp = struct.unpack_from("<H", raw, 28)[0]
    if bpp not in (24, 32):
        raise SystemExit(f"{bpp}-bit BMP not handled")
    step = bpp // 8
    row_bytes = ((width * step + 3) // 4) * 4
    flip = height > 0
    height = abs(height)
    pixels: list[tuple[int, int, int]] = []
    for y in range(height):
        src = height - 1 - y if flip else y
        base = offset + src * row_bytes
        for x in range(width):
            p = base + x * step
            pixels.append((raw[p + 2], raw[p + 1], raw[p]))
    return width, height, pixels


def scale(src, sw, sh, dw, dh):
    """Bilinear. Nearest-neighbour on a face this small looks like a mistake."""
    out = []
    for y in range(dh):
        fy = (y + 0.5) * sh / dh - 0.5
        y0 = max(0, min(sh - 1, int(math.floor(fy))))
        y1 = min(sh - 1, y0 + 1)
        wy = fy - y0
        for x in range(dw):
            fx = (x + 0.5) * sw / dw - 0.5
            x0 = max(0, min(sw - 1, int(math.floor(fx))))
            x1 = min(sw - 1, x0 + 1)
            wx = fx - x0
            a = src[y0 * sw + x0]
            b = src[y0 * sw + x1]
            c = src[y1 * sw + x0]
            d = src[y1 * sw + x1]
            out.append(tuple(
                int(a[i] * (1 - wx) * (1 - wy) + b[i] * wx * (1 - wy)
                    + c[i] * (1 - wx) * wy + d[i] * wx * wy + 0.5)
                for i in range(3)
            ))
    return out


# ------------------------------------------------------------------ palette
def median_cut(colours, want):
    """Split the colour cube along its longest axis until there are `want`
    boxes, then average each one. Cheap, and kind to skin tones — a uniform
    cube banded his forehead into stripes."""
    boxes = [list(colours)]
    while len(boxes) < want:
        boxes.sort(key=lambda b: -box_span(b))
        if not boxes or box_span(boxes[0]) == 0:
            break
        box = boxes.pop(0)
        axis = longest_axis(box)
        box.sort(key=lambda c: c[axis])
        half = len(box) // 2
        if half == 0:
            boxes.append(box)
            break
        boxes.extend([box[:half], box[half:]])
    return [tuple(sum(c[i] for c in b) // len(b) for i in range(3)) for b in boxes if b]


def box_span(box):
    if not box:
        return 0
    return max(max(c[i] for c in box) - min(c[i] for c in box) for i in range(3))


def longest_axis(box):
    spans = [max(c[i] for c in box) - min(c[i] for c in box) for i in range(3)]
    return spans.index(max(spans))


# ------------------------------------------------------------------- canvas
class Canvas:
    """An index buffer. Everything is drawn straight into palette slots, so
    there is never a nearest-colour search in the frame loop."""

    def __init__(self, w, h, fill):
        self.w, self.h = w, h
        self.px = bytearray([fill]) * (w * h)

    def put(self, x, y, idx):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = idx

    def disc(self, cx, cy, r, idx):
        for y in range(max(0, int(cy - r)), min(self.h, int(cy + r) + 1)):
            dy = y - cy
            span = r * r - dy * dy
            if span < 0:
                continue
            dx = math.sqrt(span)
            for x in range(max(0, int(cx - dx)), min(self.w, int(cx + dx) + 1)):
                self.px[y * self.w + x] = idx

    def ring(self, cx, cy, r, thick, idx):
        outer, inner = r + thick / 2, r - thick / 2
        for y in range(max(0, int(cy - outer - 1)), min(self.h, int(cy + outer) + 2)):
            for x in range(max(0, int(cx - outer - 1)), min(self.w, int(cx + outer) + 2)):
                d = math.hypot(x - cx, y - cy)
                if inner <= d <= outer:
                    self.px[y * self.w + x] = idx

    def line(self, x0, y0, x1, y1, thick, idx):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for s in range(steps + 1):
            t = s / steps
            self.dot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick / 2, idx)

    def dot(self, cx, cy, r, idx):
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.put(x, y, idx)

    def poly(self, points, idx):
        if not points:
            return
        ys = [p[1] for p in points]
        for y in range(max(0, int(min(ys))), min(self.h, int(max(ys)) + 1)):
            xs = []
            for i in range(len(points)):
                x0, y0 = points[i]
                x1, y1 = points[(i + 1) % len(points)]
                if (y0 <= y < y1) or (y1 <= y < y0):
                    xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(max(0, int(xs[i])), min(self.w, int(xs[i + 1]) + 1)):
                    self.px[y * self.w + x] = idx


def rotate(points, angle, ox, oy):
    ca, sa = math.cos(angle), math.sin(angle)
    return [((x - ox) * ca - (y - oy) * sa + ox, (x - ox) * sa + (y - oy) * ca + oy)
            for x, y in points]


# -------------------------------------------------------------------- scene
def racket(canvas, pivot_x, pivot_y, angle, ink, paper, tan):
    """A padel racket: stubby handle, fat rounded head, holes through it.

    The head has to be big — about as wide as the ball. Drawn smaller it stops
    reading as a racket and starts reading as a lollipop, which it did."""
    head_len, head_w = 104, 88
    cx, cy = pivot_x + 92, pivot_y

    def at(px, py):
        return rotate([(px, py)], angle, pivot_x, pivot_y)[0]

    # handle, with a grip a little fatter than the shaft
    hx0, hy0 = at(pivot_x - 4, pivot_y)
    hx1, hy1 = at(pivot_x + 44, pivot_y)
    canvas.line(hx0, hy0, hx1, hy1, 15, ink)

    # head, drawn as a filled blob then hollowed so the outline stays even
    for fill, radius in ((ink, 1.0), (paper, 0.84)):
        pts = []
        for i in range(52):
            t = i / 52 * math.tau
            # Slightly teardrop: narrower where it meets the handle.
            taper = 1.0 - 0.14 * max(0.0, -math.cos(t))
            px = cx + math.cos(t) * head_len / 2 * radius
            py = cy + math.sin(t) * head_w / 2 * radius * taper
            pts.append(at(px, py))
        canvas.poly(pts, fill)

    # the holes
    for row in (-1, 0, 1):
        for col in (-2, -1, 0, 1, 2):
            px = cx + col * 17
            py = cy + row * 19
            if abs(col) == 2 and row != 0:
                continue
            hx, hy = at(px, py)
            canvas.dot(hx, hy, 4.0, tan)


def burst(canvas, cx, cy, size, idx):
    pts = []
    for i in range(16):
        t = i / 16 * math.tau
        r = size if i % 2 == 0 else size * 0.46
        pts.append((cx + math.cos(t) * r, cy + math.sin(t) * r))
    canvas.poly(pts, idx)


def build_frames(face_idx, face_size, slots):
    ink, paper, red, tan, sand = slots
    frames, delays = [], []

    # The racket carries its own offset. Deriving it from the ball's meant that
    # when the ball flew out of play — offset 999 — the racket went with it,
    # and the last two frames were an empty court.
    #
    #  angle, racket dx, ball dx, ball squash, burst, delay
    script = [
        (-1.15, 0,  0,   1.00, 0,  90),
        (-0.86, 4,  0,   1.00, 0,  70),
        (-0.55, 10, 0,   1.00, 0,  60),
        (-0.26, 18, 0,   1.00, 0,  50),
        (-0.05, 26, 0,   1.00, 0,  40),
        (0.06,  32, 6,   0.88, 34, 180),   # contact
        (0.20,  38, 52,  0.95, 26, 60),
        (0.34,  44, 104, 0.86, 16, 60),
        (0.46,  48, 158, 0.74, 0,  60),
        (0.56,  52, 214, 0.60, 0,  60),
        (0.62,  54, 999, 1.00, 0,  150),   # out of play, racket still there
        (0.48,  50, 999, 1.00, 0,  620),   # a beat, then round again
    ]

    for angle, rdx, dx, squash, flare, delay in script:
        c = Canvas(W, H, paper)
        # court line, so the ball has something to sit above
        c.line(0, 196, W, 196, 2, tan)

        bx = BALL_HOME[0] + dx
        by = BALL_HOME[1] - dx * 0.22
        if dx < 900:
            draw_ball(c, face_idx, face_size, bx, by, squash, ink, sand)
        if flare:
            burst(c, bx - 26, by - 6, flare, red)
            burst(c, bx - 26, by - 6, flare * 0.42, paper)
        racket(c, 30 + rdx, 128, angle, ink, paper, tan)
        frames.append(c.px)
        delays.append(delay)

    return frames, delays


def draw_ball(canvas, face_idx, face_size, cx, cy, squash, ink, sand):
    r = BALL_R
    canvas.disc(cx, cy, r + 2, ink)
    canvas.disc(cx, cy, r, sand)
    # Vincent, masked into the ball and squashed on impact
    half = face_size // 2
    for y in range(face_size):
        for x in range(face_size):
            px = cx + (x - half) * squash
            py = cy + (y - half)
            if (px - cx) ** 2 / (r * squash) ** 2 + (py - cy) ** 2 / (r * r) <= 0.82:
                canvas.put(int(px), int(py), face_idx[y * face_size + x])
    canvas.ring(cx, cy, r + 1, 3, ink)


# ---------------------------------------------------------------------- gif
def lzw(data, min_code_size):
    clear, end = 1 << min_code_size, (1 << min_code_size) + 1
    out = bytearray()
    state = {"buf": 0, "bits": 0, "size": min_code_size + 1}

    def emit(code):
        state["buf"] |= code << state["bits"]
        state["bits"] += state["size"]
        while state["bits"] >= 8:
            out.append(state["buf"] & 0xFF)
            state["buf"] >>= 8
            state["bits"] -= 8

    table = {bytes([i]): i for i in range(clear)}
    nxt = end + 1
    emit(clear)
    cur = b""
    for value in data:
        probe = cur + bytes([value])
        if probe in table:
            cur = probe
            continue
        emit(table[cur])
        table[probe] = nxt
        nxt += 1
        if nxt > (1 << state["size"]):
            if state["size"] < 12:
                state["size"] += 1
            else:
                emit(clear)                       # emitted at the old width
                table = {bytes([i]): i for i in range(clear)}
                nxt = end + 1
                state["size"] = min_code_size + 1
        cur = bytes([value])
    if cur:
        emit(table[cur])
    emit(end)
    if state["bits"]:
        out.append(state["buf"] & 0xFF)
    return bytes(out)


def blocks(data):
    out = bytearray()
    for i in range(0, len(data), 255):
        chunk = data[i:i + 255]
        out.append(len(chunk))
        out += chunk
    out.append(0)
    return bytes(out)


def write_gif(path, palette, frames, delays):
    bits = max(2, (len(palette) - 1).bit_length())
    size = 1 << bits
    table = bytearray()
    for i in range(size):
        table += bytes(palette[i] if i < len(palette) else (0, 0, 0))

    out = bytearray(b"GIF89a")
    out += struct.pack("<HHBBB", W, H, 0xF0 | (bits - 1), 0, 0)
    out += table
    out += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00"   # loop forever
    for px, delay in zip(frames, delays):
        out += b"\x21\xF9\x04\x00" + struct.pack("<H", delay // 10) + b"\x00\x00"
        out += b"\x2C" + struct.pack("<HHHHB", 0, 0, W, H, 0)
        out += bytes([bits]) + blocks(lzw(px, bits))
    out += b"\x3B"
    path.write_bytes(bytes(out))


# --------------------------------------------------------------------- main
def main():
    if not FACE.exists():
        raise SystemExit("missing " + str(FACE))
    subprocess.run(
        ["sips", "-s", "format", "bmp", str(FACE), "--out", str(TMP)],
        check=True, capture_output=True,
    )
    sw, sh, src = read_bmp(TMP)

    # Square the portrait off around the face before it goes on a round ball.
    # Biased low: the open mouth is the joke, and cropping from the middle put
    # the hairline in the ball and the mouth outside it.
    side = min(sw, sh)
    top = int((sh - side) * 0.72)
    left = (sw - side) // 2
    square = [src[(top + y) * sw + left + x] for y in range(side) for x in range(side)]

    face_size = BALL_R * 2
    face = scale(square, side, side, face_size, face_size)

    flats = [INK, PAPER, RED, TAN, SAND]
    photo = median_cut(face, 256 - len(flats))
    palette = photo + flats
    ink, paper, red, tan, sand = (len(photo) + i for i in range(5))

    cache: dict[tuple[int, int, int], int] = {}

    def nearest(colour):
        hit = cache.get(colour)
        if hit is None:
            hit = min(range(len(photo)),
                      key=lambda i: sum((photo[i][k] - colour[k]) ** 2 for k in range(3)))
            cache[colour] = hit
        return hit

    face_idx = bytearray(nearest(c) for c in face)

    frames, delays = build_frames(face_idx, face_size, (ink, paper, red, tan, sand))

    # `--frame N` writes that one frame on its own, which is the only way to
    # look at the middle of an animation in a still-image viewer.
    if len(sys.argv) > 2 and sys.argv[1] == "--frame":
        n = int(sys.argv[2])
        out = Path(f"/tmp/padel-frame-{n}.gif")
        write_gif(out, palette, [frames[n]], [delays[n]])
        print(f"wrote {out}")
        return

    write_gif(OUT, palette, frames, delays)
    print(f"wrote {OUT.relative_to(ROOT)} — {len(frames)} frames, {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    sys.exit(main())
