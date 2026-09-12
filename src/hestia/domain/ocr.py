"""Bounded document validation. No OCR provider or fabricated extraction fallback."""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import struct
import zlib
from typing import Any

MAX_DOCUMENT_BYTES = 16000
MAX_RECORDS = 20
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")


def content_hash(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def _object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def _constant(value: str) -> None:
    raise ValueError("Non-finite JSON number")


def validate_records(records: Any) -> list[dict[str, Any]]:
    if not isinstance(records, list) or not 1 <= len(records) <= MAX_RECORDS:
        raise ValueError("Provide 1 to 20 records")
    for record in records:
        if not isinstance(record, dict) or len(record) > 14:
            raise ValueError("Each record must be a flat object with at most 14 fields")
        for key, value in record.items():
            if len(key) > 80 or not isinstance(value, (str, int, bool, type(None))):
                raise ValueError("Record facts must be text, integer cents or booleans")
            if isinstance(value, str) and (len(value) > 200 or any(ord(c) < 32 for c in value)):
                raise ValueError("Record text exceeds bounds or contains control characters")
    if len(canonical_bytes(records)) > MAX_DOCUMENT_BYTES:
        raise ValueError("Records exceed the 16000 byte limit")
    return records


def _validate_png(raw: bytes) -> None:
    """Validate CRC, chunk order and bounded pixels for noninterlaced 8-bit PNG."""
    if not raw.startswith(PNG_SIGNATURE):
        raise ValueError("Document is not a PNG")
    offset, channels, width, height = 8, 0, 0, 0
    compressed = bytearray()
    ended = False
    while offset < len(raw):
        if offset + 12 > len(raw):
            raise ValueError("Truncated PNG chunk")
        size = int.from_bytes(raw[offset:offset + 4], "big")
        kind = raw[offset + 4:offset + 8]
        end = offset + 12 + size
        if end > len(raw):
            raise ValueError("Truncated PNG data")
        data = raw[offset + 8:end - 4]
        crc = int.from_bytes(raw[end - 4:end], "big")
        if zlib.crc32(kind + data) != crc:
            raise ValueError("PNG checksum mismatch")
        if offset == 8:
            if kind != b"IHDR" or size != 13:
                raise ValueError("PNG header is missing")
            width, height, depth, color, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", data,
            )
            channels = {0: 1, 2: 3, 4: 2, 6: 4}.get(color, 0)
            if (not 0 < width <= 4096 or not 0 < height <= 4096 or width * height > 1000000
                    or not channels or depth != 8 or compression or filtering or interlace):
                raise ValueError("Use a noninterlaced 8-bit grayscale/RGB PNG up to 1M pixels")
        elif kind == b"IDAT":
            compressed.extend(data)
        elif kind == b"IEND" and not data and compressed and end == len(raw):
            ended = True
        else:
            raise ValueError("Unsupported PNG chunks; export a simple PNG or use manual input")
        offset = end
    if not ended:
        raise ValueError("PNG is incomplete")
    expected = height * (width * channels + 1)
    try:
        decoder = zlib.decompressobj()
        pixels = decoder.decompress(bytes(compressed), expected + 1)
    except zlib.error as exc:
        raise ValueError("PNG pixels are corrupt") from exc
    if (len(pixels) != expected or not decoder.eof or decoder.unused_data
            or decoder.unconsumed_tail):
        raise ValueError("PNG pixels do not match the bounded dimensions")
    if any(pixels[row * (width * channels + 1)] > 4 for row in range(height)):
        raise ValueError("PNG contains an invalid row filter")


def extract_receipt_metadata(
    image_bytes: bytes | None = None,
    image_base64: str | None = None,
    mime_type: str = "image/png",
    model_id: str | None = None,
    region_name: str | None = None,
) -> dict[str, Any]:
    """Retain the callable boundary; returned facts are never asserted to be OCR."""
    if (image_bytes is None) == (image_base64 is None):
        raise ValueError("Provide exactly one document byte source")
    if image_base64 is not None:
        if not isinstance(image_base64, str) or len(image_base64) > 4 * (
            (MAX_DOCUMENT_BYTES + 2) // 3
        ):
            raise ValueError("Base64 document exceeds the 16000 byte limit")
        try:
            raw = base64.b64decode(image_base64, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Document must be strict base64 without a data URL") from exc
    else:
        raw = image_bytes
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_DOCUMENT_BYTES:
        raise ValueError("Document must contain 1 to 16000 bytes")
    records: list[dict[str, Any]] = []
    if mime_type == "image/png":
        _validate_png(raw)
        source = "manual_assisted_png"
    elif mime_type == "application/json":
        try:
            document = json.loads(raw.decode("utf-8"), object_pairs_hook=_object,
                                  parse_constant=_constant)
            if not isinstance(document, dict) or set(document) != {"records"}:
                raise ValueError("JSON document must contain only records")
            records = validate_records(document["records"])
        except (UnicodeError, RecursionError) as exc:
            raise ValueError("Invalid UTF-8 JSON document") from exc
        source = "user_supplied_json"
    else:
        raise ValueError("Supported types are simple PNG and JSON; use manual input otherwise")
    return {"input_sha256": hashlib.sha256(raw).hexdigest(), "byte_count": len(raw),
            "mime_type": mime_type, "source": source, "records": records,
            "ocr_status": "unavailable", "confidence_score": None,
            "message": "OCR is unavailable. Review and correct every fact before importing."}
