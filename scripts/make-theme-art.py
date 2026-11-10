#!/usr/bin/env python3
"""Draws the Phantom theme's pixel art: an original grinning shade mascot, its
head for the header logo, and a haunted-wood scene for the picker swatch and
sign-in background.

Everything is generated from shapes in code, so the art is original and the
theme ships no third-party assets. Run from the project root:

    python3 scripts/make-theme-art.py

Outputs land in src/assets/ as phantom-*.png. Art is drawn small and scaled up
with nearest-neighbour, so every pixel stays square.
"""

import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets")

# Palette: void black through bruised purple to a hot magenta glow.
VOID = (11, 7, 20, 255)
DEEP = (29, 14, 48, 255)
SHADE_DARK = (74, 38, 110, 255)
SHADE = (108, 56, 158, 255)
SHADE_LIT = (142, 82, 196, 255)
SHADE_HI = (176, 118, 224, 255)
MAGENTA_HI = (255, 122, 190, 255)
CRIMSON = (178, 26, 74, 255)
EYE = (255, 58, 74, 255)
EYE_HI = (255, 150, 150, 255)
TOOTH = (247, 236, 255, 255)
CLEAR = (0, 0, 0, 0)


def blank(w, h):
    return Image.new("RGBA", (w, h), CLEAR)


def upscale(img, factor):
    return img.resize((img.width * factor, img.height * factor), Image.NEAREST)


def shade_body(d, cx, top, w, h, body, lit, hi):
    """A floating shade: domed head tapering into a scalloped, wispy tail."""
    half = w // 2
    dome_h = int(h * 0.62)
    d.ellipse([cx - half, top, cx + half, top + dome_h * 2], fill=body)
    waist = top + dome_h
    tail_top = top + int(h * 0.74)
    d.rectangle([cx - half, waist, cx + half, tail_top], fill=body)
    # Three scallops make the hem read as drifting smoke rather than feet.
    lobes = 3
    lobe_w = w / lobes
    for i in range(lobes):
        lx = cx - half + lobe_w * i
        depth = int(h * 0.16) if i % 2 == 0 else int(h * 0.10)
        d.ellipse([lx, tail_top - depth, lx + lobe_w, tail_top + depth], fill=body)
    # Lighting: a lit edge down the left, a highlight blob up top.
    d.ellipse([cx - half + 2, top + 2, cx + half - int(w * 0.30), top + dome_h], fill=lit)
    d.ellipse([cx - int(w * 0.26), top + int(h * 0.10), cx - int(w * 0.04), top + int(h * 0.26)], fill=hi)


def horns(d, cx, top, w, body):
    """A crown of uneven spikes."""
    for fx, fh in ((-0.44, 0.17), (-0.26, 0.26), (0.0, 0.30), (0.26, 0.26), (0.44, 0.17)):
        x = cx + int(w * fx)
        base = max(2, int(w * 0.09))
        d.polygon([(x - base, top + int(w * 0.10)), (x + base, top + int(w * 0.10)), (x, top - int(w * fh))], fill=body)


def face(d, cx, eye_y, w, grin_y, grin_w):
    """Narrow slanted eyes and a wide tooth-filled grin."""
    ew = max(3, int(w * 0.17))
    eh = max(2, int(w * 0.11))
    for side in (-1, 1):
        ex = cx + side * int(w * 0.21)
        d.polygon(
            [(ex - side * ew, eye_y + eh), (ex + side * ew, eye_y - eh // 2), (ex + side * ew, eye_y + eh)],
            fill=EYE,
        )
        d.point((ex + side * (ew - 1), eye_y), fill=EYE_HI)

    gh = max(4, int(grin_w * 0.30))
    d.chord([cx - grin_w, grin_y - gh, cx + grin_w, grin_y + gh], 0, 180, fill=TOOTH)
    step = max(2, grin_w // 4)
    for x in range(cx - grin_w + step, cx + grin_w, step):
        d.line([(x, grin_y - 1), (x, grin_y + gh)], fill=SHADE_DARK)
    d.line([(cx - grin_w, grin_y), (cx + grin_w, grin_y)], fill=SHADE_DARK)


def arms(d, cx, y, w, body, lit):
    """Stubby three-clawed hands held out from the body."""
    reach = int(w * 0.62)
    for side in (-1, 1):
        x = cx + side * reach
        r = max(3, int(w * 0.13))
        d.ellipse([x - r, y - r, x + r, y + r], fill=body if side > 0 else lit)
        for k in (-1, 0, 1):
            tx = x + side * (r + 2)
            ty = y + k * (r - 1)
            d.polygon([(x, ty), (tx, ty - 1), (tx, ty + 1)], fill=body if side > 0 else lit)


def outline(img, colour=(8, 4, 14, 255)):
    """One-pixel dark keyline, drawn by offsetting the alpha mask."""
    alpha = img.split()[3]
    edge = Image.new("RGBA", img.size, CLEAR)
    base = Image.new("RGBA", img.size, colour)
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        shifted = Image.new("L", img.size, 0)
        shifted.paste(alpha, (dx, dy))
        edge.paste(base, (0, 0), shifted)
    edge.alpha_composite(img)
    return edge


# ── The mascot ──────────────────────────────────────────────────────────────
# Drawn as per-row silhouette spans rather than stacked ellipses: at this size
# a few pixels either way decide whether it reads as a menacing shade or a
# lumpy egg, and spans give exact control over the outline.

CX = 28          # centre column
TOP = 17         # where the dome starts
WAIST = 34       # widest row
HEM = 43         # where the wispy tail begins
HALF = 18        # half-width at the waist


def profile(y):
    """Half-width of the body at row `y`, or 0 outside it."""
    if y < TOP or y > HEM + 7:
        return 0
    if y <= WAIST:                       # dome: round shoulders up to the waist
        t = (y - TOP) / float(WAIST - TOP)
        return HALF * math.sin(t * math.pi / 2)
    if y <= HEM:                         # chunky middle, barely tapering
        return HALF - (y - WAIST) * 0.12
    return HALF - (y - WAIST) * 0.12     # hem rows, trimmed by hem_bottom()


def hem_bottom(x):
    """Bottom edge of the scalloped tail at column `x` - three smoke lobes."""
    return HEM + 7 * abs(math.sin(math.pi * (x - (CX - HALF)) / 12.6))


HORNS = ((-0.78, 11), (-0.44, 14), (-0.04, 15), (0.40, 13), (0.74, 10))


def in_horn(x, y):
    """True inside one of the crown spikes above the dome."""
    for fx, h in HORNS:
        hx = CX + fx * HALF
        base_y = TOP + 6
        if y > base_y or y < base_y - h:
            continue
        # Triangle: full width at the base, a point at the tip.
        t = (base_y - y) / float(h)
        half_w = 3.1 * (1 - t)
        if abs(x - hx) <= half_w:
            return True
    return False


def in_arm(x, y):
    """Short arms angled down and out, with a three-claw hand at the tip.

    Kept thin and set low: at full body width they would merge with the torso
    into one solid bar instead of reading as limbs.
    """
    for side in (-1, 1):
        edge = CX + side * (profile(38) - 2)     # start just inside the torso
        tip = edge + side * 9
        if 36 <= y <= 39 and 0 <= side * (x - edge) <= 9:
            return True
        for k in (-3, 0, 3):                     # claws fan out at the hand
            if abs(y - (38 + k)) <= 1 and 0 <= side * (x - tip) <= 3:
                return True
    return False


def body_colour(x, y):
    """Flat cel shading: lit upper-left, core, shadowed right edge."""
    if math.hypot(x - (CX - 7), y - (TOP + 8)) < 7:
        return SHADE_HI
    half = profile(y)
    if half and x < CX - half * 0.25:
        return SHADE_LIT
    if half and x > CX + half * 0.55:
        return SHADE_DARK
    return SHADE


def draw_shade(size=56, with_arms=True, face_rows=(28, 37)):
    """The mascot: silhouette first, then the face painted on top."""
    img = blank(size, size)
    px = img.load()
    for y in range(size):
        for x in range(size):
            half = profile(y)
            inside = half > 0 and abs(x - CX) <= half and (y <= HEM or y <= hem_bottom(x))
            if inside or in_horn(x, y):
                px[x, y] = body_colour(x, y)
            elif with_arms and in_arm(x, y):
                # Mid-tone keeps the arms distinct from the lit left side and
                # the shadowed right side of the torso.
                px[x, y] = SHADE

    d = ImageDraw.Draw(img)
    eye_y, grin_y = face_rows

    # Eyes: narrow wedges slanting down towards the nose, so it scowls.
    for side in (-1, 1):
        ex = CX + side * 9
        d.polygon(
            [(ex - side * 5, eye_y + 2), (ex + side * 4, eye_y - 3), (ex + side * 4, eye_y + 1), (ex - side * 5, eye_y + 3)],
            fill=EYE,
        )
        d.point((ex + side * 2, eye_y - 1), fill=EYE_HI)

    # Grin: a wide band of teeth spanning most of the face.
    gx, gw, gh = CX, 13, 5
    d.rectangle([gx - gw, grin_y - gh, gx + gw, grin_y + 1], fill=TOOTH)
    d.polygon([(gx - gw, grin_y + 1), (gx + gw, grin_y + 1), (gx + gw - 3, grin_y + 4), (gx - gw + 3, grin_y + 4)], fill=TOOTH)
    for x in range(gx - gw + 4, gx + gw, 4):   # tooth gaps
        d.line([(x, grin_y - gh), (x, grin_y + 3)], fill=SHADE_DARK)
    d.line([(gx - gw, grin_y - gh), (gx + gw, grin_y - gh)], fill=SHADE_DARK)
    return img


def make_sprite():
    """The mascot, used as the Gym tab's section art."""
    return upscale(outline(draw_shade()), 3)


def make_head():
    """Head and shoulders only, for the header logo."""
    full = outline(draw_shade(with_arms=False))
    return upscale(full.crop((5, 3, 51, 47)), 3)


def make_moon(size=48):
    """Header eclipse: a dark disc rimmed in magenta, with a few craters."""
    img = blank(size, size)
    d = ImageDraw.Draw(img)
    r = size // 2 - 2
    c = size // 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=(58, 14, 54, 255))
    d.arc([c - r, c - r, c + r, c + r], 0, 360, fill=MAGENTA_HI, width=2)
    # Craters, offset so the disc does not read as a flat circle.
    for cx, cy, cr in ((-6, -5, 4), (5, 3, 3), (-2, 8, 2)):
        d.ellipse([c + cx - cr, c + cy - cr, c + cx + cr, c + cy + cr], fill=(44, 10, 44, 255))
    return upscale(img, 2)


def make_scene(W=184, H=327):
    """Haunted wood: dithered magenta sky, eclipse, treeline, drifting shades."""
    img = Image.new("RGBA", (W, H), VOID)
    d = ImageDraw.Draw(img)
    horizon = int(H * 0.58)

    # Sky: crimson at the top fading to void, checker-dithered where bands meet
    # so it reads like a 90s console gradient rather than a smooth ramp.
    bands = [(0.00, CRIMSON), (0.16, (150, 24, 80, 255)), (0.32, (96, 20, 72, 255)),
             (0.46, DEEP), (0.58, VOID)]
    for i in range(len(bands) - 1):
        y0, y1 = int(bands[i][0] * H), int(bands[i + 1][0] * H)
        d.rectangle([0, y0, W, y1], fill=bands[i][1])
        nxt = bands[i + 1][1]
        fade = max(4, (y1 - y0) // 3)
        for y in range(y1 - fade, y1):
            step = 2 if (y - (y1 - fade)) < fade // 2 else 1
            for x in range((y % 2) * step, W, max(2, step * 2)):
                d.point((x, y), fill=nxt)

    # Eclipse: a dark disc with a magenta rim.
    mr = int(W * 0.30)
    mcx, mcy = int(W * 0.52), int(H * 0.17)
    d.ellipse([mcx - mr, mcy - mr, mcx + mr, mcy + mr], fill=(60, 12, 50, 255))
    d.arc([mcx - mr, mcy - mr, mcx + mr, mcy + mr], 0, 360, fill=MAGENTA_HI, width=2)

    # Stars, skipped where they would sit on the eclipse.
    for i in range(70):
        x = (i * 73 + 11) % W
        y = (i * 137 + 29) % horizon
        if math.hypot(x - mcx, y - mcy) < mr + 6:
            continue
        d.point((x, y), fill=MAGENTA_HI if i % 5 == 0 else (200, 150, 220, 255))

    # Treeline: jagged silhouettes at two depths.
    for depth, (colour, base, spread) in enumerate(
        [((42, 16, 64, 255), horizon - 6, 26), (VOID, horizon + 6, 34)]
    ):
        x = -8
        i = depth * 7
        while x < W + 8:
            tw = 10 + (i * 37) % 14
            th = spread + (i * 53) % spread
            d.polygon([(x, base + 10), (x + tw // 2, base - th), (x + tw, base + 10)], fill=colour)
            x += max(6, tw - 4)
            i += 1

    # Ground, with a magenta mist line along the horizon.
    d.rectangle([0, horizon + 4, W, H], fill=(18, 8, 30, 255))
    for y in range(horizon + 4, horizon + 12):
        for x in range(y % 2, W, 3):
            d.point((x, y), fill=(70, 18, 70, 255))

    # Two small shades drifting in the wood, eyes catching the light.
    for sx, sy, s in ((int(W * 0.22), int(H * 0.70), 11), (int(W * 0.76), int(H * 0.78), 8)):
        g = blank(s * 3, s * 3)
        gd = ImageDraw.Draw(g)
        horns(gd, s + s // 2, s // 2, s * 2, SHADE_DARK)
        shade_body(gd, s + s // 2, s // 2, s * 2, int(s * 2.1), SHADE_DARK, SHADE, SHADE_LIT)
        gd.point((s + s // 2 - s // 3, s + s // 4), fill=EYE)
        gd.point((s + s // 2 + s // 3, s + s // 4), fill=EYE)
        img.alpha_composite(g, (sx - s, sy - s))

    return upscale(img, 2)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, img in (
        ("phantom-sprite.png", make_sprite()),
        # 1x for the stats card: the card snaps pixel art to whole-number
        # scales, so a pre-upscaled asset could only be drawn at 1x and would
        # sit tiny in the art window.
        ("phantom-card.png", outline(draw_shade())),
        ("phantom-head.png", make_head()),
        ("phantom-moon.png", make_moon()),
        ("phantom-scene.png", make_scene()),
    ):
        path = os.path.join(OUT, name)
        img.save(path)
        print("wrote", os.path.relpath(path), img.size)


if __name__ == "__main__":
    main()
