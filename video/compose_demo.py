"""Compose demo scenes from a capture: shorten model waits, draw the cursor, zoom and label.

  python video/compose_demo.py <take> [scene ...]         <work>/demo_out/<scene>.mp4 and .json
  python video/compose_demo.py <take> --still <scene> <t>  one PNG at output second t

A long wait on the model keeps its first and last 0.6 s and shows a badge with the real
duration, so the video never pretends the model answered faster than it did. The demo scenes
and the tail come from video/narration.json, the zooms from video/zooms.json, and the capture
and timing from <work>. <work> is HESTIA_VIDEO_ROOT, by default video/work.
"""

import bisect
import json
import os
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
WORK = pathlib.Path(os.environ.get("HESTIA_VIDEO_ROOT") or HERE / "work").resolve()
TAKE = sys.argv[1]
RUN = WORK / "capture" / TAKE
OUT = WORK / "demo_out"
OUT.mkdir(parents=True, exist_ok=True)
SPEC = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
FPS, W, H, LEAD, KEEP_WAIT, EASE = 30, 1920, 1080, 0.3, 0.6, 0.6
TAIL = SPEC["tailSeconds"]
DATA = json.loads((RUN / "events.json").read_text(encoding="utf-8"))
TIMING = {
    s["id"]: s for s in json.loads((WORK / "timing.json").read_text(encoding="utf-8"))["scenes"]
}
EVENTS, FRAMES = DATA["events"], DATA["frames"]
FRAME_T = [f["t"] for f in FRAMES]
SX = DATA["dpr"]
SRC_W, SRC_H = DATA["view"]["width"] * SX, DATA["view"]["height"] * SX
DEMO = [s["id"] for s in SPEC["segments"] if s["kind"] == "demo"]
MODEL_WAITS = {"reading agent", "review agent"}
FONT_CSS = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700&display=block"

LABELS = {
    "open": "Live app on AWS  ·  drusjukc9d4oc.cloudfront.net",
    "home": "Home: the decisions waiting",
    "paste": "Reading agent: Strands, no tools",
    "review": "Review agent: Strands, four read-only tools",
    "notice": "The exact notice, approved by the household",
    "case": "Case file: one timeline",
    "about": "About: what runs and what does not",
}
# scene -> [(anchor event, offset s, hold s, [x, y, width] in CSS px)]; height follows 16:9
ZOOMS = (
    json.loads((HERE / "zooms.json").read_text(encoding="utf-8"))
    if (HERE / "zooms.json").exists()
    else {}
)


def pill_png(page, text, dark=True, small=False):
    size = 24 if small else 27
    bg = "rgba(31,26,23,.9)" if dark else "rgba(255,255,255,.96)"
    fg = "#FFFFFF" if dark else "#1F1A17"
    page.set_content(
        f"""<html><head><link href="{FONT_CSS}" rel="stylesheet">
    <style>html,body{{margin:0;background:transparent}}
    .p{{display:inline-flex;align-items:center;gap:16px;padding:16px 28px;border-radius:999px;
    background:{bg};color:{fg};font:700 {size}px 'Plus Jakarta Sans',sans-serif}}
    .d{{width:14px;height:14px;border-radius:50%;background:#E07A2E}}</style></head>
    <body><span class="p"><span class="d"></span>{text}</span></body></html>"""
    )
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(150)
    path = OUT / f"_pill_{abs(hash(text + str(dark) + str(small)))}.png"
    page.locator(".p").screenshot(path=str(path), omit_background=True)
    return Image.open(path).convert("RGBA")


def cursor_sprite():
    scale = 4
    points = [(0, 0), (0, 23), (6, 17.5), (10.5, 27), (14.5, 25.2), (10.2, 16), (17, 16)]
    big = Image.new("RGBA", (40 * scale, 40 * scale), (0, 0, 0, 0))
    shadow = Image.new("RGBA", big.size, (0, 0, 0, 0))
    pts = [(4 * scale + x * scale, 4 * scale + y * scale) for x, y in points]
    ImageDraw.Draw(shadow).polygon(
        [(x + 2 * scale, y + 3 * scale) for x, y in pts], fill=(0, 0, 0, 90)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(2.5 * scale))
    draw = ImageDraw.Draw(big)
    draw.polygon(pts, fill=(20, 20, 20, 255))
    inner = [
        (4 * scale + x * scale * 0.8 + 1.6 * scale, 4 * scale + y * scale * 0.8 + 3.2 * scale)
        for x, y in points
    ]
    draw.polygon(inner, fill=(255, 255, 255, 255))
    sprite = Image.alpha_composite(shadow, big)
    return sprite.resize((52, 52), Image.LANCZOS)


def scene_bounds(scene):
    start = next(e["t"] for e in EVENTS if e["kind"] == "scene_start" and e["id"] == scene)
    end = next(e["t"] for e in EVENTS if e["kind"] == "scene_end" and e["id"] == scene)
    return start, end


def segments(start, end):
    cuts, opened = [], {}
    for event in EVENTS:
        if not start <= event["t"] <= end:
            continue
        if event["kind"] == "wait_start":
            opened[event["label"]] = event["t"]
        elif event["kind"] == "wait_end" and event["label"] in opened:
            a, b = opened.pop(event["label"]), event["t"]
            if b - a > 2 * KEEP_WAIT + 0.3:
                cuts.append((a + KEEP_WAIT, b - KEEP_WAIT, event["label"], b - a))
    kept, cursor = [], start
    for a, b, _label, _seconds in cuts:
        kept.append((cursor, a))
        cursor = b
    kept.append((cursor, end))
    return kept, cuts


def to_source(u, kept):
    for a, b in kept:
        if u <= b - a:
            return a + u
        u -= b - a
    return kept[-1][1]


def to_output(t, kept):
    acc = 0.0
    for a, b in kept:
        if t < a:
            return acc
        if t <= b:
            return acc + t - a
        acc += b - a
    return acc


def cursor_at(t):
    moves = [e for e in EVENTS if e["kind"] == "move"]
    pos = (1180.0, 640.0)
    for move in moves:
        if t < move["t0"]:
            break
        if t >= move["t1"]:
            pos = (move["x1"], move["y1"])
            continue
        k = (t - move["t0"]) / max(1e-3, move["t1"] - move["t0"])
        k = k * k * (3 - 2 * k)
        pos = (
            move["x0"] + (move["x1"] - move["x0"]) * k,
            move["y0"] + (move["y1"] - move["y0"]) * k,
        )
        break
    return pos


def ease(k):
    k = min(1.0, max(0.0, k))
    return k * k * (3 - 2 * k)


def faded(image, k):
    """A copy of an RGBA image with its alpha scaled by k."""
    copy = image.copy()
    copy.putalpha(copy.getchannel("A").point(lambda v: int(v * k)))
    return copy


def wait_badge(seconds):
    return f"Waiting on the live model: {seconds:.1f} s, shortened here"


class Frames:
    def __init__(self):
        self.index, self.image, self.full = None, None, None

    def at(self, t):
        index = max(0, bisect.bisect_right(FRAME_T, t) - 1)
        if index != self.index:
            self.index = index
            path = RUN / "frames" / f"{FRAMES[index]['i']:05d}.jpg"
            self.image = Image.open(path).convert("RGB")
            self.full = None
        return self.image

    def full_frame(self, t):
        image = self.at(t)
        if self.full is None:
            self.full = image.resize((W, H), Image.BICUBIC)
        return self.full


def compose(scene, pills, cursor, still=None):
    start, end = scene_bounds(scene)
    kept, cuts = segments(start, end)
    length = sum(b - a for a, b in kept)
    narration = LEAD + TIMING[scene]["speech"] + TAIL
    speed = min(1.8, max(1.0, length / narration))
    duration = max(narration, length / speed)
    frames = Frames()
    zooms = []
    for anchor, offset, hold, rect in ZOOMS.get(scene, []):
        kind, name = anchor.split(":", 1)
        hits = [
            e["t"]
            for e in EVENTS
            if e["kind"] == kind
            and e.get("name", e.get("label")) == name
            and start <= e["t"] <= end
        ]
        if hits:
            at = to_output(hits[0], kept) / speed + offset
            zooms.append((max(0.3, min(at, duration - hold - 2 * EASE - 0.2)), hold, rect))
    badges = [
        (to_output(a, kept) / speed - KEEP_WAIT, wait_badge(seconds))
        for a, _b, label, seconds in cuts
        if label in MODEL_WAITS
    ]
    clicks = [e for e in EVENTS if e["kind"] == "click" and start <= e["t"] <= end]
    label = pills[LABELS[scene]]
    encoder = None
    if still is None:
        target = OUT / f"{scene}.mp4"
        encoder = subprocess.Popen(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
                str(target),
            ],
            stdin=subprocess.PIPE,
        )  # fmt: skip
    total = int(round(duration * FPS))
    numbers = range(total) if still is None else [int(round(still * FPS))]
    for n in numbers:
        u = n / FPS
        t = to_source(min(u * speed, length), kept)
        zoom, rect = 0.0, None
        for at, hold, zrect in zooms:
            if at <= u <= at + hold + EASE:
                if u < at + EASE:
                    zoom = ease((u - at) / EASE)
                else:
                    zoom = 1.0 - ease((u - at - hold) / EASE)
                rect = zrect
                break
        source = frames.at(t)
        src_w, src_h = source.size
        sx = src_w / DATA["view"]["width"]
        if rect and zoom > 0:
            cx, cy = (rect[0] * sx) * zoom, (rect[1] * sx) * zoom
            cw = src_w + (rect[2] * sx - src_w) * zoom
            ch = cw * 9 / 16
            cx, cy = min(max(0, cx), src_w - cw), min(max(0, cy), src_h - ch)
            box = (int(cx), int(cy), int(cx + cw), int(cy + ch))
            frame = source.crop(box).resize((W, H), Image.BICUBIC)
        else:
            cx, cy, cw = 0.0, 0.0, float(src_w)
            frame = frames.full_frame(t).copy()
        scale = W / cw
        canvas = frame.convert("RGBA")
        for click in clicks:
            age = t - click["t"]
            if 0 <= age <= 0.5:
                ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                px, py = (click["x"] * sx - cx) * scale, (click["y"] * sx - cy) * scale
                radius = 14 + 46 * ease(age / 0.5)
                alpha = int(150 * (1 - age / 0.5))
                ImageDraw.Draw(ring).ellipse(
                    (px - radius, py - radius, px + radius, py + radius),
                    outline=(224, 122, 46, alpha),
                    width=6,
                )
                canvas = Image.alpha_composite(canvas, ring)
        x, y = cursor_at(t)
        px, py = (x * sx - cx) * scale, (y * sx - cy) * scale
        if 0 <= px < W and 0 <= py < H:
            canvas.alpha_composite(cursor, (int(px) - 6, int(py) - 6))
        fade = min(ease((u - 0.4) / 0.3), ease((3.8 - u) / 0.4))
        if fade > 0:
            shown = faded(label, fade)
            canvas.alpha_composite(shown, (48, H - 48 - shown.height))
        for at, text in badges:
            if at <= u <= at + 3.2:
                k = min(ease((u - at) / 0.3), ease((at + 3.2 - u) / 0.3))
                badge = faded(pills[text], k)
                canvas.alpha_composite(badge, (W - 48 - badge.width, H - 48 - badge.height))
        rgb = canvas.convert("RGB")
        if still is not None:
            rgb.save(OUT / f"{scene}-{still:05.2f}.png")
            return
        encoder.stdin.write(rgb.tobytes())
    encoder.stdin.close()
    encoder.wait()
    meta = {
        "scene": scene,
        "seconds": round(total / FPS, 3),
        "narration": round(LEAD + TIMING[scene]["speech"] + TAIL, 3),
        "speed": round(speed, 3),
        "cuts": [{"label": c[2], "seconds": round(c[3], 2)} for c in cuts],
        "zooms": [round(at + EASE + hold / 2, 2) for at, hold, _r in zooms],
    }
    (OUT / f"{scene}.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(json.dumps(meta))


def main():
    args = sys.argv[2:]
    still = None
    if args and args[0] == "--still":
        scenes, still = [args[1]], float(args[2])
    else:
        scenes = args or DEMO
    texts = set(LABELS.values())
    for scene in scenes:
        start, end = scene_bounds(scene)
        for _a, _b, label, seconds in segments(start, end)[1]:
            if label in MODEL_WAITS:
                texts.add(wait_badge(seconds))
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 200})
        pills = {}
        for text in texts:
            waiting = text.startswith("Waiting on")
            pills[text] = pill_png(page, text, dark=not waiting, small=waiting)
        browser.close()
    cursor = cursor_sprite()
    for scene in scenes:
        compose(scene, pills, cursor, still)


if __name__ == "__main__":
    main()
