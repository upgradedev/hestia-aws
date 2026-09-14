"""Render slide scenes frame by frame: pause every CSS animation, seek it, screenshot, encode.

  python video/render_slides.py preview <scene> <t1,t2,...>   PNG stills at those seconds
  python video/render_slides.py render <scene> [<scene> ...]   <work>/slides_out/<scene>.mp4

Reads the measured speech from <work>/timing.json (written by tts.py) and the tail from
video/narration.json. <work> is HESTIA_VIDEO_ROOT, by default video/work.
"""

import json
import math
import os
import pathlib
import subprocess
import sys

from playwright.sync_api import sync_playwright

FPS = 30
LEAD = 0.3
HOLD_END = {"close": 2.0, "aws": 1.5, "agents": 1.5}
HERE = pathlib.Path(__file__).resolve().parent
WORK = pathlib.Path(os.environ.get("HESTIA_VIDEO_ROOT") or HERE / "work").resolve()
SPEC = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
TAIL = SPEC["tailSeconds"]
TIMING = {
    s["id"]: s for s in json.loads((WORK / "timing.json").read_text(encoding="utf-8"))["scenes"]
}
OUT = WORK / "slides_out"
OUT.mkdir(parents=True, exist_ok=True)


def clip_seconds(scene: str) -> float:
    return LEAD + TIMING[scene]["speech"] + TAIL + HOLD_END.get(scene, 0.0)


def activate(page, scene: str) -> None:
    page.evaluate(
        """([id, dur, lead]) => {
            document.querySelectorAll('.scene').forEach(
                s => s.classList.toggle('active', s.id === 's-' + id));
            const s = document.getElementById('s-' + id);
            s.style.setProperty('--dur', dur + 's');
            s.style.setProperty('--lead', lead + 's');
        }""",
        [scene, TIMING[scene]["speech"], LEAD],
    )
    page.wait_for_timeout(150)


def seek(page, seconds: float) -> None:
    page.evaluate(
        "ms => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; } }",
        seconds * 1000,
    )


def main() -> None:
    mode, scenes = sys.argv[1], sys.argv[2:]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        page.goto((HERE / "slides.html").as_uri(), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        if mode == "preview":
            scene, stamps = scenes[0], [float(x) for x in scenes[1].split(",")]
            activate(page, scene)
            for stamp in stamps:
                seek(page, stamp)
                page.screenshot(path=str(OUT / f"{scene}-{stamp:05.2f}.png"))
            print("preview", scene, stamps)
        else:
            for scene in scenes:
                activate(page, scene)
                frames = math.ceil(clip_seconds(scene) * FPS)
                target = OUT / f"{scene}.mp4"
                encoder = subprocess.Popen(
                    [
                        "ffmpeg", "-y", "-loglevel", "error",
                        "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "16",
                        "-pix_fmt", "yuv420p", "-r", str(FPS), str(target),
                    ],
                    stdin=subprocess.PIPE,
                )  # fmt: skip
                for frame in range(frames):
                    seek(page, frame / FPS)
                    encoder.stdin.write(page.screenshot(type="jpeg", quality=95))
                encoder.stdin.close()
                encoder.wait()
                print("rendered", scene, frames, "frames", round(frames / FPS, 2), "s")
        browser.close()


if __name__ == "__main__":
    main()
