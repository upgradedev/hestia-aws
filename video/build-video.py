#!/usr/bin/env python3
"""Compose the browser capture, the measured narration and the captions into the demo video.

Inputs, all under HESTIA_VIDEO_ROOT:
  narration/timing.json and narration/*.mp3   from video/generate-narration.py
  narration/captions.en.srt                   from video/generate-narration.py
  capture/production.webm                     from web/video/capture-production.mjs
  capture/capture-receipt.json                from web/video/capture-production.mjs

Output: output/hestia-demo.mp4 and output/video-receipt.json.

Contract:
  1. The output directory may already exist, so one beat can be re-rendered in place.
  2. The receipt always carries the release SHA (HESTIA_RELEASE_SHA). The two CI run ids
     (HESTIA_BACKEND_RUN_ID, HESTIA_FRONTEND_RUN_ID) are written only when supplied.
  3. The composed length must equal the measured narration length within one frame. A
     capture shorter than the trim lead plus the narration would otherwise produce a short
     video with the last beats of speech missing.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(os.environ.get("HESTIA_VIDEO_ROOT", "."))
NARRATION = ROOT / "narration"
CAPTURE = ROOT / "capture" / "production.webm"
OUTPUT = ROOT / "output"
FRAME_SECONDS = 1 / 25  # matches fps=25 in the video filter below


def run(args: list[str]) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(result.stderr[-3000:] or "media command failed")
    return result.stdout.strip()


def probe(path: pathlib.Path) -> dict[str, object]:
    return json.loads(
        run(
            [
                os.environ.get("FFPROBE", "ffprobe"),
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(path),
            ]
        )
    )


def main() -> None:
    timing = json.loads((NARRATION / "timing.json").read_text(encoding="utf-8"))
    capture_receipt = json.loads(
        (ROOT / "capture" / "capture-receipt.json").read_text(encoding="utf-8")
    )
    scenes = timing["scenes"]
    total = float(timing["totalSeconds"])
    trim_lead = float(capture_receipt["trimLeadSeconds"])
    if not 0 <= trim_lead <= 30:
        raise SystemExit("capture trim lead is outside the bounded contract")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    filters: list[str] = []
    labels: list[str] = []
    args = [os.environ.get("FFMPEG", "ffmpeg"), "-y", "-i", str(CAPTURE)]
    for index, scene in enumerate(scenes, start=1):
        audio = NARRATION / str(scene["audio"])
        args.extend(["-i", str(audio)])
        delay = round(float(scene["startSeconds"]) * 1000)
        hold = float(scene["holdSeconds"])
        label = f"a{index}"
        filters.append(
            f"[{index}:a]aresample=48000,apad=pad_dur={hold},atrim=0:{hold},"
            f"adelay={delay}:all=1[{label}]"
        )
        labels.append(f"[{label}]")
    captions = str(NARRATION / "captions.en.srt").replace("\\", "/").replace(":", "\\:")
    style = (
        "FontName=DejaVu Sans,FontSize=14,PrimaryColour=&H00FFFFFF,"
        "BackColour=&HA0000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=38,Alignment=2"
    )
    filters.append(
        f"[0:v]trim=start={trim_lead}:end={trim_lead + total},setpts=PTS-STARTPTS,"
        "fps=25,scale=1920:1080:"
        "force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x07111f,"
        f"subtitles='{captions}':force_style='{style}',format=yuv420p[v]"
    )
    filters.append(
        f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,"
        f"loudnorm=I=-16:LRA=7:TP=-1.5,atrim=0:{total}[a]"
    )
    final = OUTPUT / "hestia-demo.mp4"
    args.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-shortest",
            str(final),
        ]
    )
    run(args)
    media = probe(final)
    duration = float(media["format"]["duration"])
    streams = media["streams"]
    videos = [item for item in streams if item.get("codec_type") == "video"]
    audios = [item for item in streams if item.get("codec_type") == "audio"]
    if not 90 <= duration < 179 or len(videos) != 1 or len(audios) != 1:
        raise SystemExit("final media contract failed")
    if videos[0].get("width") != 1920 or videos[0].get("height") != 1080:
        raise SystemExit("final video dimensions are not 1920x1080")
    if abs(duration - total) > FRAME_SECONDS:
        raise SystemExit(
            f"composed {duration:.3f}s but the narration measures {total:.3f}s. "
            "The capture is shorter than the trim lead plus the narration, so -shortest "
            "cut the last beats off both streams. Record a longer capture. Do not widen "
            "this tolerance."
        )
    captions_out = OUTPUT / "captions.en.srt"
    captions_out.write_bytes((NARRATION / "captions.en.srt").read_bytes())
    digest = hashlib.sha256(final.read_bytes()).hexdigest()
    receipt = {
        "schemaVersion": "hestia.submission-video-receipt/v1",
        "releaseSha": os.environ["HESTIA_RELEASE_SHA"],
        "durationSeconds": round(duration, 3),
        "width": 1920,
        "height": 1080,
        "sceneCount": len(scenes),
        "sha256": digest,
        "bytes": final.stat().st_size,
    }
    for field, name in (
        ("backendRunId", "HESTIA_BACKEND_RUN_ID"),
        ("frontendRunId", "HESTIA_FRONTEND_RUN_ID"),
    ):
        value = os.environ.get(name, "").strip()
        if value:
            receipt[field] = int(value)
    (OUTPUT / "video-receipt.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(receipt, separators=(",", ":")))


if __name__ == "__main__":
    main()
