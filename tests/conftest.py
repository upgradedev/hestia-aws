"""Offline test boundary. Every cloud adapter test must inject its own client."""
import boto3
import pytest


@pytest.fixture(autouse=True)
def no_implicit_aws(monkeypatch):
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    monkeypatch.delenv("HESTIA_STATE_BUCKET", raising=False)
    monkeypatch.delenv("HESTIA_DEMO_SECRET", raising=False)

    def forbidden(*args, **kwargs):
        raise RuntimeError("Implicit AWS clients are forbidden in offline CI")

    monkeypatch.setattr(boto3, "client", forbidden)
