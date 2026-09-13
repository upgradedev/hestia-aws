"""Document bytes cannot become canned OCR facts or trigger paid inference."""
from __future__ import annotations

import base64
import hashlib
import json
import struct
import zlib

import pytest

from hestia.domain.ocr import (
    MAX_DOCUMENT_BYTES,
    PNG_SIGNATURE,
    extract_receipt_metadata,
    validate_records,
)


def chunk(kind, content):
    return (struct.pack(">I", len(content)) + kind + content
            + struct.pack(">I", zlib.crc32(kind + content)))


def png(width=1, height=1, color=2, depth=8, interlace=0, pixels=b"\0\xff\0\0"):
    return (PNG_SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, depth,
                                                     color, 0, 0, interlace))
            + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))


def test_valid_png_preserves_real_input_hash_with_no_invented_facts_or_provider(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Document import must never construct an AWS client")
    monkeypatch.setattr("boto3.client", forbidden)
    raw = png()
    result = extract_receipt_metadata(image_bytes=raw)
    assert result["input_sha256"] == hashlib.sha256(raw).hexdigest()
    assert result["byte_count"] == len(raw)
    assert result["source"] == "manual_assisted_png"
    assert result["records"] == [] and result["confidence_score"] is None
    assert result["ocr_status"] == "unavailable"
    assert "merchant" not in result and "model_id" not in result
    assert extract_receipt_metadata(image_base64=base64.b64encode(raw).decode()) == result


def test_json_returns_only_supplied_facts_and_hashes_exact_bytes():
    raw = b'{"records":[{"merchant":"My shop","amount_cents":1234}]}'
    result = extract_receipt_metadata(image_bytes=raw, mime_type="application/json")
    assert result["records"] == [{"merchant": "My shop", "amount_cents": 1234}]
    assert result["input_sha256"] == hashlib.sha256(raw).hexdigest()
    other = extract_receipt_metadata(image_bytes=raw + b"\n", mime_type="application/json")
    assert other["input_sha256"] != result["input_sha256"]
    assert other["records"] == result["records"]


@pytest.mark.parametrize("arguments", [
    {}, {"image_bytes": b""}, {"image_bytes": b"IKEA Deutschland"},
    {"image_bytes": b"MediaMarkt"}, {"image_bytes": b"Rewe City"},
    {"image_base64": "%%%"}, {"image_base64": "data:image/png;base64,AAAA"},
    {"image_bytes": png(), "image_base64": "AAAA"},
    {"image_bytes": png(), "mime_type": "image/jpeg"},
    {"image_bytes": png(), "mime_type": "application/pdf"},
    {"image_bytes": b"x" * (MAX_DOCUMENT_BYTES + 1)},
    {"image_base64": "A" * 22000}, {"image_base64": 1}, {"image_bytes": "not bytes"},
])
def test_malformed_missing_or_unsupported_documents_never_fabricate_receipts(arguments):
    with pytest.raises(ValueError):
        extract_receipt_metadata(**arguments)


@pytest.mark.parametrize("raw", [
    PNG_SIGNATURE, png()[:-1], png() + b"trailing", png()[:20] + b"corrupt" + png()[27:],
    PNG_SIGNATURE + chunk(b"IDAT", b"wrong first chunk"),
    PNG_SIGNATURE + chunk(b"IHDR", b"short"),
    png(width=0), png(width=4097), png(width=2000, height=2000), png(height=0),
    png(depth=16), png(color=3), png(interlace=1), png(pixels=b"\5\0\0\0"),
    png(pixels=b"\0"), png(pixels=b"\0" * 100000),
    png()[:-12] + chunk(b"tEXt", b"metadata") + chunk(b"IEND", b""),
    png()[:33] + chunk(b"IDAT", b"corrupt-zlib") + chunk(b"IEND", b""),
    png()[:33] + chunk(b"IDAT", zlib.compress(b"\0\0\0\0") + b"extra")
    + chunk(b"IEND", b""),
])
def test_png_structure_crc_pixels_and_decompression_are_bounded(raw):
    with pytest.raises(ValueError):
        extract_receipt_metadata(image_bytes=raw)


@pytest.mark.parametrize("raw", [
    b'{}', b'[]', b'{"records":[]}', b'{"records":[{},{}],"mode":"live"}',
    b'{"records":[{"merchant":"a","merchant":"b"}]}',
    b'{"records":[{"amount_cents":NaN}]}', b'{"records":[{"amount_cents":12.34}]}',
    b'{"records":[{"nested":{}}]}', b'{"records":[{"nested":[]}]}',
    b'{"records":[{"note":"\\n"}]}', b'\xff', b'not-json',
])
def test_json_strict_shape_duplicate_fields_and_nonfinite_rejected(raw):
    with pytest.raises(ValueError):
        extract_receipt_metadata(image_bytes=raw, mime_type="application/json")


@pytest.mark.parametrize("rows", [None, [], [{}] * 21, [1], [{"x": "x" * 201}],
                                  [{"x" * 81: 1}], [dict.fromkeys(map(str, range(21)), 1)],
                                  [dict.fromkeys(map(str, range(20)), "x" * 200)] * 20])
def test_record_shape_and_total_bytes_bounded(rows):
    with pytest.raises(ValueError):
        validate_records(rows)


def test_json_boundary_preserves_unicode_and_manual_scalars():
    rows = [{"merchant": "Αθήνα", "amount_cents": 5000, "is_trial": False, "optional": None}]
    assert extract_receipt_metadata(image_bytes=json.dumps({"records": rows}).encode(),
                                    mime_type="application/json")["records"] == rows
