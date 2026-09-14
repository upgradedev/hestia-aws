"""Synthesize one narration clip per scene with ElevenLabs, cached by text, and measure it.

  python video/tts.py   <work>/audio/*.mp3 and <work>/timing.json

Reads video/narration.json: each segment's speechText is what the voice says, and the voice
settings and tailSeconds come from the same file. <work> is HESTIA_VIDEO_ROOT, by default
video/work. The key is read from ELEVENLABS_API_KEY and is never printed or written.
"""

import hashlib
import json
import os
import pathlib
import subprocess
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
WORK = pathlib.Path(os.environ.get("HESTIA_VIDEO_ROOT") or HERE / "work").resolve()
SPEC = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
OUT = WORK / "audio"
VOICE = SPEC["voice"]


def api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise SystemExit("ELEVENLABS_API_KEY is not set")
    return key


def synth(text: str, key: str) -> bytes:
    body = json.dumps(
        {"text": text, "model_id": VOICE["modelId"], "voice_settings": VOICE["settings"]}
    ).encode()
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE['voiceId']}"
        "?output_format=mp3_44100_192"
    )
    headers = {"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            if len(data) > 3000:
                return data
        except Exception as error:
            print("retry", attempt, error)
            time.sleep(3 * (attempt + 1))
    raise SystemExit("tts failed")


def seconds(path: pathlib.Path) -> float:
    probe = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0"]
    result = subprocess.run([*probe, str(path)], capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def main() -> None:
    key = api_key()
    OUT.mkdir(parents=True, exist_ok=True)
    timing = []
    total = 0.0
    for index, segment in enumerate(SPEC["segments"], start=1):
        speech_text = segment["speechText"]
        digest = hashlib.sha256(json.dumps([speech_text, VOICE], sort_keys=True).encode())
        mp3 = OUT / f"{index:02d}-{segment['id']}-{digest.hexdigest()[:16]}.mp3"
        if not mp3.exists():
            mp3.write_bytes(synth(speech_text, key))
            print("synthesized", mp3.name)
        speech = seconds(mp3)
        timing.append(
            {
                "id": segment["id"],
                "kind": segment["kind"],
                "audio": mp3.relative_to(WORK).as_posix(),
                "speech": round(speech, 3),
            }
        )
        total += speech + SPEC["tailSeconds"]
    summary = {"scenes": timing, "speechPlusTails": round(total, 2)}
    (WORK / "timing.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    for t in timing:
        print(f"{t['id']:9s} {t['kind']:5s} {t['speech']:6.2f}s")
    print("speech plus tails", round(total, 1), "s")


if __name__ == "__main__":
    main()
