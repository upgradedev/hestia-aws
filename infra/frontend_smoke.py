"""Smoke test a deployed Hestia CloudFront frontend and same-origin API."""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request


def smoke_test(
    url: str, expected_sha: str | None = None, expected_backend_sha: str | None = None,
) -> dict:
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

        assert data.get("live_send") is False and data.get("live_model") is False, (
            "Refuse action probes against a legacy or provider-enabled backend"
        )
        if expected_backend_sha:
            assert data.get("commit") == expected_backend_sha, "Backend changed during release"

    # 3. Negative authorization probe; no credentials or approval are supplied.
    claim_payload = b"{}"
    req_claim = urllib.request.Request(
        f"{base}/action/claim",
        data=claim_payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "HestiaSmoke/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req_claim, timeout=15):
            raise AssertionError("Anonymous claim must not succeed")
    except urllib.error.HTTPError as exc:
        assert exc.code == 401, f"Expected authorization rejection, got {exc.code}"
        assert json.load(exc).get("status") == "error"

    return {
        "status": "PASS",
        "url": base,
        "commit": expected_sha,
        "healthz": data,
        "action_claim": "anonymous write rejected",
        "backend_commit": data.get("commit"),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--sha", default=None)
    parser.add_argument("--backend-sha", default=None)
    args = parser.parse_args()
    print(json.dumps(smoke_test(args.url, args.sha, args.backend_sha), indent=2))
