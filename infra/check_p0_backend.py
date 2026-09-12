"""Read-only compatibility gate before an explicitly approved frontend release."""
from __future__ import annotations

import argparse
import json
import os
import re
import urllib.request


def validate(data: dict, expected_sha: str) -> None:
    if not re.fullmatch(r"[a-f0-9]{40}", expected_sha):
        raise ValueError("A complete approved backend SHA is required")
    if data.get("commit") != expected_sha or data.get("service") != "hestia-aws":
        raise ValueError("The approved backend revision is not active")
    required = {"status": "ok", "mode": "simulated", "live_send": False, "live_model": False,
                "storage_configured": True, "demo_sessions_configured": True}
    for key, value in required.items():
        if type(data.get(key)) is not type(value) or data.get(key) != value:
            raise ValueError(f"Backend capability mismatch: {key}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    if args.url.rstrip("/") != "https://drusjukc9d4oc.cloudfront.net":
        raise SystemExit("Unexpected release target")
    with urllib.request.urlopen(args.url.rstrip("/") + "/healthz", timeout=15) as response:
        if response.status != 200:
            raise SystemExit("Backend health is unavailable")
        data = json.load(response)
    validate(data, os.environ.get("HESTIA_APPROVED_BACKEND_SHA", ""))
    print(json.dumps({"approved_backend_sha": data["commit"], "mode": data["mode"]}))


if __name__ == "__main__":
    main()
