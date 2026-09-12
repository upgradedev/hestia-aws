"""Release guards reject unsafe legacy or changed backends before an action probe."""
from __future__ import annotations

import copy
import json
from io import BytesIO
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest
from infra.check_p0_backend import validate
from infra.frontend_smoke import smoke_test
from scripts import deploy_api
from scripts.deploy_api import validate_release

SHA = "a" * 40
HEALTH = {
    "status": "ok", "service": "hestia-aws", "commit": SHA, "mode": "simulated",
    "live_send": False, "live_model": False, "storage_configured": True,
    "demo_sessions_configured": True,
}


def test_change_set_requires_ci_exact_revision_and_scoped_secret(monkeypatch):
    arn = "arn:aws:secretsmanager:eu-west-1:308857099262:secret:hestia-demo-signing-abcdef"
    monkeypatch.delenv("CI", raising=False)
    with pytest.raises(ValueError, match="CI-only"):
        validate_release(SHA, arn, SHA)
    monkeypatch.setenv("CI", "true")
    validate_release(SHA, arn, SHA)
    for approved, secret, actual in (
        ("short", arn, SHA), (SHA, arn, "b" * 40),
        (SHA, "secret-value", SHA), (SHA, arn.replace("308857099262", "000000000000"), SHA),
    ):
        with pytest.raises(ValueError):
            validate_release(approved, secret, actual)


def test_release_command_only_prepares_change_set(monkeypatch, tmp_path):
    arn = "arn:aws:secretsmanager:eu-west-1:308857099262:secret:hestia-demo-signing-abcdef"
    commands = []
    monkeypatch.setenv("CI", "true")
    monkeypatch.setattr(deploy_api, "BUILD_DIR", tmp_path)
    monkeypatch.setattr(deploy_api, "get_git_sha", lambda: SHA)
    monkeypatch.setattr(deploy_api, "package", lambda: None)

    def run(command, **kwargs):
        commands.append(command)
        return SimpleNamespace(stdout="[]")

    monkeypatch.setattr(deploy_api.subprocess, "run", run)
    deploy_api.deploy(SHA, arn)
    prepare = [command for command in commands if "deploy" in command]
    assert len(prepare) == 1
    assert "--no-execute-changeset" in prepare[0]
    assert f"DemoSecretArn={arn}" in prepare[0]
    assert f"CommitSha={SHA}" in prepare[0]
    assert not any("execute-change-set" in command for command in commands)


def test_backend_release_requires_exact_safe_revision():
    validate(HEALTH, SHA)
    for field, value in (
        ("commit", "b" * 40), ("live_send", True), ("live_model", True),
        ("live_send", 0), ("mode", "live"), ("demo_sessions_configured", False),
        ("storage_configured", False), ("service", "other"),
    ):
        with pytest.raises(ValueError):
            validate({**HEALTH, field: value}, SHA)
    with pytest.raises(ValueError):
        validate(HEALTH, "short")


class Response(BytesIO):
    status = 200
    headers = {"x-content-type-options": "nosniff", "x-frame-options": "DENY"}


def fake_open(health, calls, unauthorized=True):
    def open_request(request, timeout):
        calls.append(request.full_url)
        if request.full_url.endswith("/healthz"):
            return Response(json.dumps(health).encode())
        if request.full_url.endswith("/action/claim"):
            if not unauthorized:
                return Response(b"unsafe success")
            raise HTTPError(request.full_url, 401, "Unauthorized", {},
                            BytesIO(b'{"status":"error"}'))
        return Response(f'<meta name="application-commit" content="{SHA}">'.encode())
    return open_request


def test_smoke_rejects_legacy_before_any_mutation_probe(monkeypatch):
    calls = []
    legacy = copy.deepcopy(HEALTH)
    legacy.pop("live_send")
    monkeypatch.setattr("urllib.request.urlopen", fake_open(legacy, calls))
    with pytest.raises(AssertionError, match="Refuse"):
        smoke_test("https://demo.example", SHA, SHA)
    assert calls == ["https://demo.example/", "https://demo.example/healthz"]


def test_smoke_checks_anonymous_denial_and_paired_sha(monkeypatch):
    calls = []
    monkeypatch.setattr("urllib.request.urlopen", fake_open(HEALTH, calls))
    result = smoke_test("https://demo.example", SHA, SHA)
    assert result["action_claim"] == "anonymous write rejected"
    assert result["backend_commit"] == SHA
    calls.clear()
    with pytest.raises(AssertionError, match="changed"):
        smoke_test("https://demo.example", SHA, "b" * 40)
    assert len(calls) == 2
    monkeypatch.setattr("urllib.request.urlopen", fake_open(HEALTH, [], unauthorized=False))
    with pytest.raises(AssertionError, match="must not succeed"):
        smoke_test("https://demo.example", SHA, SHA)
