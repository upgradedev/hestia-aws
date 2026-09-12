"""Expiring capabilities for isolated synthetic demo workspaces.

These tokens grant no production, SES, model, billing or administration authority.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
from dataclasses import dataclass

SESSION_TTL = 1800
TOKEN_RE = re.compile(r"v1\.([a-f0-9]{32})\.([0-9]{10})\.([a-f0-9]{64})")


class APIError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class DemoAccess:
    workspace_id: str
    expires_at: int


def _secret() -> bytes:
    value = os.environ.get("HESTIA_DEMO_SECRET", "").encode("utf-8")
    if len(value) < 32:
        raise APIError(503, "Demo sessions are not configured. Read-only preview is available.")
    return value


def issue_demo_access() -> tuple[str, DemoAccess]:
    key = _secret()
    access = DemoAccess(secrets.token_hex(16), int(time.time()) + SESSION_TTL)
    content = f"v1.{access.workspace_id}.{access.expires_at}"
    signature = hmac.new(key, ("demo:" + content).encode(), hashlib.sha256).hexdigest()
    return f"{content}.{signature}", access


def authorize_demo(headers: dict[str, str]) -> DemoAccess:
    raw = headers.get("authorization", "")
    if not raw.startswith("Bearer ") or len(raw) > 200:
        raise APIError(401, "Start or explicitly restart an isolated demo session.")
    match = TOKEN_RE.fullmatch(raw[7:])
    if match is None:
        raise APIError(401, "Invalid demo session.")
    workspace, expires, signature = match.groups()
    content = f"v1.{workspace}.{expires}"
    expected = hmac.new(_secret(), ("demo:" + content).encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise APIError(401, "Invalid demo session.")
    now = int(time.time())
    if not now < int(expires) <= now + SESSION_TTL:
        raise APIError(401, "Demo session expired. Start a new session explicitly.")
    return DemoAccess(workspace, int(expires))
