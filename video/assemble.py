"""Join slide and demo scenes, lay each narration clip at its scene start, and write captions.

  python video/assemble.py   <work>/output/hestia-demo.mp4, hestia-demo.en.srt, receipt.json

The scene order and each scene's kind come from video/narration.json, and the captions from
each segment's captionText. <work> is HESTIA_VIDEO_ROOT, by default video/work.
"""

import hashlib
import json
import os
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
WORK = pathlib.Path(os.environ.get("HESTIA_VIDEO_ROOT") or HERE / "work").resolve()
OUTPUT = WORK / "output"
OUTPUT.mkdir(parents=True, exist_ok=True)
LEAD = 0.3
IVORY = "0xF6F2EA"
SPEC = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
TIMING = {
    s["id"]: s for s in json.loads((WORK / "timing.json").read_text(encoding="utf-8"))["scenes"]
}
ORDER = [s["id"] for s in SPEC["segments"]]
DEMO = {s["id"] for s in SPEC["segments"] if s["kind"] == "demo"}


def seconds(path):
    probe = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0"]
    result = subprocess.run([*probe, str(path)], capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def stamp(value):
    ms = int(round(value * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main():
    clips, starts, cursor = [], [], 0.0
    for scene in ORDER:
        path = (WORK / "demo_out" if scene in DEMO else WORK / "slides_out") / f"{scene}.mp4"
        length = seconds(path)
        clips.append((scene, path, length))
        starts.append(cursor)
        cursor += length
    total = cursor
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for _scene, path, _length in clips:
        args += ["-i", str(path)]
    for scene in ORDER:
        args += ["-i", str(WORK / TIMING[scene]["audio"])]
    filters, labels = [], []
    for index, (scene, _path, length) in enumerate(clips):
        prev_demo = index > 0 and clips[index - 1][0] in DEMO and scene in DEMO
        next_demo = index + 1 < len(clips) and clips[index + 1][0] in DEMO and scene in DEMO
        chain = f"[{index}:v]fps=30,scale=1920:1080,setsar=1"
        if not prev_demo:
            chain += f",fade=t=in:st=0:d=0.25:color={IVORY}"
        if not next_demo:
            chain += f",fade=t=out:st={length - 0.3:.3f}:d=0.3:color={IVORY}"
        filters.append(chain + f"[v{index}]")
        labels.append(f"[v{index}]")
    filters.append("".join(labels) + f"concat=n={len(clips)}:v=1:a=0,format=yuv420p[v]")
    audio_labels = []
    for index, _scene in enumerate(ORDER):
        delay = int(round((starts[index] + LEAD) * 1000))
        filters.append(f"[{len(clips) + index}:a]aresample=48000,adelay={delay}:all=1[a{index}]")
        audio_labels.append(f"[a{index}]")
    filters.append(
        "".join(audio_labels)
        + f"amix=inputs={len(ORDER)}:duration=longest:normalize=0,"
        + f"apad,atrim=0:{total:.3f},loudnorm=I=-16:LRA=7:TP=-1.5[a]"
    )
    final = OUTPUT / "hestia-demo.mp4"
    args += [
        "-filter_complex", ";".join(filters), "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(final),
    ]  # fmt: skip
    subprocess.run(args, check=True)
    cues = []
    for index, segment in enumerate(SPEC["segments"]):
        caption = segment["captionText"]
        sentences = [s for s in re.split(r"(?<=[.!?])\s+", caption) if s]
        weight = sum(len(s) for s in sentences)
        at = starts[index] + LEAD
        for sentence in sentences:
            share = TIMING[segment["id"]]["speech"] * len(sentence) / weight
            cues.append((at, at + share, sentence))
            at += share
    srt = []
    for number, (a, b, text) in enumerate(cues, start=1):
        srt += [str(number), f"{stamp(a)} --> {stamp(b)}", text, ""]
    (OUTPUT / "hestia-demo.en.srt").write_text("\n".join(srt), encoding="utf-8")
    receipt = {
        "seconds": round(seconds(final), 3),
        "bytes": final.stat().st_size,
        "sha256": hashlib.sha256(final.read_bytes()).hexdigest(),
        "scenes": [
            {"id": s, "start": round(starts[i], 2), "seconds": round(clips[i][2], 2)}
            for i, s in enumerate(ORDER)
        ],
    }
    (OUTPUT / "receipt.json").write_text(json.dumps(receipt, indent=1), encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ("seconds", "bytes")}))


if __name__ == "__main__":
    main()
