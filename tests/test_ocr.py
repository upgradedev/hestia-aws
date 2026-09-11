"""Unit tests for the receipt multimodal OCR extraction service."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock

from hestia.domain.ocr import extract_receipt_metadata


def test_ocr_deterministic_ikea_fallback():
    data = extract_receipt_metadata(image_bytes=b"dummy small bytes")
    assert "IKEA" in data["merchant"]
    assert data["total_amount_eur"] == 85.00
    assert "BILLY-2026-MOD" in data["model_number"]
    assert data["confidence_score"] > 0.95


def test_ocr_deterministic_mediamarkt_fallback():
    data = extract_receipt_metadata(image_bytes=b"MediaMarkt Saturn Kassenbon Re-9912")
    assert "MediaMarkt" in data["merchant"]
    assert data["total_amount_eur"] == 849.00
    assert "WAV28M43EU" in data["model_number"]


def test_ocr_deterministic_rewe_fallback():
    data = extract_receipt_metadata(image_bytes=b"Rewe City Supermarkt")
    assert "Rewe" in data["merchant"]
    assert data["total_amount_eur"] == 18.40


def test_ocr_base64_decoding():
    raw = b"IKEA Deutschland #88412"
    b64 = f"data:image/png;base64,{base64.b64encode(raw).decode('ascii')}"
    data = extract_receipt_metadata(image_base64=b64)
    assert "IKEA" in data["merchant"]
    assert data["total_amount_eur"] == 85.00


def test_ocr_invalid_base64():
    # Should not raise, falls back safely
    data = extract_receipt_metadata(image_base64="not-valid-base64!@#$")
    assert data["total_amount_eur"] == 85.00


def test_ocr_mocked_bedrock_converse(monkeypatch):
    mock_boto = MagicMock()
    mock_client = MagicMock()
    mock_boto.return_value = mock_client

    mock_resp = {
        "output": {
            "message": {
                "content": [
                    {
                        "text": json.dumps({
                            "merchant": "Bauhaus München",
                            "invoice_date": "2026-09-08",
                            "item_name": "Hammer & Tool Set",
                            "model_number": "BAU-99",
                            "total_amount_eur": 45.50,
                            "vat_pct": 19.0,
                            "confidence_score": 0.99,
                        })
                    }
                ]
            }
        }
    }
    mock_client.converse.return_value = mock_resp
    monkeypatch.setattr("boto3.client", mock_boto)

    raw_payload = b"PNG dummy receipt with enough bytes to trigger bedrock API call 123456789012345"
    data = extract_receipt_metadata(image_bytes=raw_payload, mime_type="image/png")
    assert data["merchant"] == "Bauhaus München"
    assert data["total_amount_eur"] == 45.50
    assert data["engine"] == "Amazon Bedrock Multimodal Vision"
