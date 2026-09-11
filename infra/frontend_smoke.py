"""Smoke test a deployed Hestia CloudFront frontend and same-origin API."""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request


def smoke_test(url: str, expected_sha: str | None = None) -> dict:
    base = url.rstrip("/")
    # 1. Root page
    req = urllib.request.Request(f"{base}/", headers={"User-Agent": "HestiaSmoke/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
        headers = {k.lower(): v for k, v in resp.headers.items()}
        assert resp.status == 200, f"Root returned status {resp.status}"

    # Verify security headers
    ct_opts = headers.get("x-content-type-options", "").lower()
    assert "nosniff" in ct_opts, "Missing X-Content-Type-Options: nosniff"
    fo_opts = headers.get("x-frame-options", "").lower()
    assert "deny" in fo_opts, "Missing X-Frame-Options: DENY"

    # Verify commit marker if expected_sha provided
    if expected_sha:
        assert f'<meta name="application-commit" content="{expected_sha}">' in body, (
            f"Expected commit {expected_sha} not found in HTML"
        )

    # 2. Healthz endpoint
    req_healthz = urllib.request.Request(
        f"{base}/healthz", headers={"User-Agent": "HestiaSmoke/1.0"}
    )
    with urllib.request.urlopen(req_healthz, timeout=15) as resp:
        assert resp.status == 200, f"Healthz returned status {resp.status}"
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("ok") is True or data.get("status") == "ok", f"Healthz failed: {data}"
        assert data.get("service") == "hestia-aws", f"Unexpected service: {data}"

    # 3. Action endpoint (POST /action/claim)
    claim_payload = b"scenario=family_flat"
    req_claim = urllib.request.Request(
        f"{base}/action/claim",
        data=claim_payload,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "HestiaSmoke/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req_claim, timeout=15) as resp:
        assert resp.status == 200, f"Action claim returned status {resp.status}"
        claim_body = resp.read().decode("utf-8")
        assert "Return-of-Control Executed" in claim_body, (
            "Action claim did not execute Return-of-Control banner"
        )
        assert "Directive 2019/771/EU" in claim_body, (
            "Claim letter missing statutory Directive citation"
        )

    return {
        "status": "PASS",
        "url": base,
        "commit": expected_sha,
        "healthz": data,
        "action_claim": "Return-of-Control Executed",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--sha", default=None)
    args = parser.parse_args()
    print(json.dumps(smoke_test(args.url, args.sha), indent=2))
