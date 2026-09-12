"""Bounded notice simulation and opt-in SES mailbox-simulator submission.

Default simulation never discovers AWS clients or writes transport receipts.
The simulator path reserves each operation durably before one submission attempt.
Reservations and outcomes must be retained: an incomplete reservation is UNKNOWN,
never permission to retry. This cannot guarantee exactly-once delivery; SES
acceptance is not evidence of delivery. Real recipient delivery is not enabled.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from email import policy
from email.errors import MessageError
from email.parser import HeaderParser
from typing import Any

SES_MAILBOX_SIMULATOR_SUCCESS = "success@simulator.amazonses.com"
# Deliberately only the success simulator, not arbitrary addresses on its domain.
SES_SIMULATOR_RECIPIENTS = frozenset({SES_MAILBOX_SIMULATOR_SUCCESS})
MAX_MIME_BYTES = 256 * 1024
MAX_HEADER_BYTES = 16 * 1024
MAX_RECEIPT_BYTES = 64 * 1024
_DISPATCH_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}")
_OUTBOX_PREFIX = re.compile(r"demo/workspaces/[0-9a-f]{32}/outbox/")
_SES_MESSAGE_ID = re.compile(r"[A-Za-z0-9_-]{1,256}")
_NOTICE_HEADERS = frozenset({
    "from", "to", "subject", "date", "message-id", "mime-version", "content-type",
    "content-transfer-encoding", "x-hestia-statutory-basis", "x-hestia-merkle-seal",
})
_SERVICE_REJECTIONS = frozenset({
    "MessageRejected", "MailFromDomainNotVerifiedException", "AccessDenied",
    "AccessDeniedException", "InvalidClientTokenId", "SignatureDoesNotMatch",
    "UnrecognizedClientException", "InvalidParameterValue", "ValidationError",
    "ValidationException", "Throttling", "ThrottlingException",
    "ConfigurationSetDoesNotExistException", "ConfigurationSetSendingPausedException",
    "AccountSendingPausedException",
})


def _error_code(exc: Exception) -> str | None:
    response = getattr(exc, "response", None)
    if isinstance(response, dict) and isinstance(response.get("Error"), dict):
        if "ResponseMetadata" in response:
            metadata = response["ResponseMetadata"]
            status = metadata.get("HTTPStatusCode") if isinstance(metadata, dict) else None
            if not isinstance(status, int) or not 400 <= status < 500:
                return None
        code = response["Error"].get("Code")
        if isinstance(code, str):
            return code
    return None


def _has_controls(value: str) -> bool:
    return any(ord(char) < 32 or ord(char) == 127 for char in value)


def _mailbox(header: Any) -> str:
    """Accept one ordinary ASCII mailbox, optionally with a display name."""
    if header is None or len(header.addresses) != 1:
        raise ValueError("Exactly one From and To mailbox is required")
    if any(group.display_name is not None for group in header.groups):
        raise ValueError("Address groups are not supported")
    address = header.addresses[0]
    local, domain = address.username, address.domain
    if (
        not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]{1,64}", local)
        or local.startswith(".") or local.endswith(".") or ".." in local
        or len(domain) > 253 or "." not in domain
        or any(
            not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
            for label in domain.split(".")
        )
    ):
        raise ValueError("Invalid mailbox")
    return address.addr_spec


class SESDispatchService:
    """Simulation by default; ses_simulator is for a future authenticated worker.

    This adapter does not authenticate callers. The worker must authorize the
    operation before explicitly enabling ses_simulator. Public claim flows own
    their atomic simulated artifacts independently and do not enable transport.

    Injected SES adapters must make at most one network submission per call.
    Known SDK clients with retries enabled are refused. Storage must support S3
    conditional writes and retain both operation objects without deletion/expiry.
    Any simulation receipt persistence belongs to the caller's atomic state update.
    """

    def __init__(
        self,
        region_name: str = "eu-west-1",
        ses_client: Any = None,
        s3_client: Any = None,
        bucket_name: str | None = None,
        outbox_prefix: str = "outbox/",
        *,
        mode: str = "simulated",
    ) -> None:
        if mode not in ("simulated", "ses_simulator"):
            raise ValueError("mode must be simulated or ses_simulator")
        self.region_name = region_name or os.environ.get("HESTIA_SES_REGION", "eu-west-1")
        self.bucket = (
            os.environ.get("HESTIA_STATE_BUCKET", "") if bucket_name is None else bucket_name
        )
        self.outbox_prefix = outbox_prefix
        self.mode = mode
        self._ses_client = ses_client
        self._s3_client = s3_client

    def _scoped(self) -> bool:
        return (
            isinstance(self.bucket, str) and bool(self.bucket)
            and isinstance(self.outbox_prefix, str)
            and _OUTBOX_PREFIX.fullmatch(self.outbox_prefix) is not None
        )

    def _get_ses(self) -> Any:
        if self.mode != "ses_simulator" or not self._scoped():
            return None
        try:
            if self._ses_client is None:
                import boto3
                from botocore.config import Config

                self._ses_client = boto3.client(
                    "ses", region_name=self.region_name,
                    config=Config(
                        retries={"mode": "standard", "total_max_attempts": 1},
                        connect_timeout=5, read_timeout=15,
                    ),
                )
            config = getattr(getattr(self._ses_client, "meta", None), "config", None)
            if config is not None:
                retries = getattr(config, "retries", None)
                if not isinstance(retries, dict):
                    return None
                attempts = retries.get("total_max_attempts")
                if attempts != 1 and not (attempts is None and retries.get("max_attempts") == 0):
                    return None
            return self._ses_client
        except Exception:
            return None

    def _get_s3(self) -> Any:
        if self.mode != "ses_simulator" or not self._scoped():
            return None
        if self._s3_client is not None:
            return self._s3_client
        try:
            import boto3

            self._s3_client = boto3.client("s3", region_name=self.region_name)
            return self._s3_client
        except Exception:
            return None

    def _parse_notice(self, mime_text: str) -> tuple[dict[str, str], str, str]:
        if not isinstance(mime_text, str) or len(mime_text) > MAX_MIME_BYTES:
            raise ValueError("MIME must be a bounded string")
        if len(mime_text.encode("utf-8")) > MAX_MIME_BYTES:
            raise ValueError("MIME is too large")
        normalized = mime_text.replace("\r\n", "\n")
        if "\r" in normalized or "\x00" in normalized:
            raise ValueError("Invalid MIME control characters")
        raw_headers, separator, _ = normalized.partition("\n\n")
        if not separator or len(raw_headers.encode("utf-8")) > MAX_HEADER_BYTES:
            raise ValueError("Missing or excessive MIME header block")
        seen = set()
        for line in raw_headers.split("\n"):
            name, colon, value = line.partition(":")
            name = name.lower()
            if (
                not colon or name not in _NOTICE_HEADERS or name in seen
                or _has_controls(value) or len(line.encode("utf-8")) > 998
            ):
                raise ValueError("Unsupported, duplicate or unsafe MIME header")
            seen.add(name)
        msg = HeaderParser(policy=policy.default).parsestr(mime_text)
        if msg.defects or any(h.defects or _has_controls(str(h)) for h in msg.values()):
            raise ValueError("Malformed MIME headers")
        if msg.get_content_type() != "text/plain":
            raise ValueError("Only plain-text notices are supported")
        if msg.get("MIME-Version", "1.0") != "1.0":
            raise ValueError("Unsupported MIME version")
        if msg.get("Content-Transfer-Encoding", "8bit") not in (
            "7bit", "8bit", "base64", "quoted-printable",
        ):
            raise ValueError("Unsupported content encoding")
        sender, recipient = _mailbox(msg["From"]), _mailbox(msg["To"])
        return {
            "from": str(msg["From"]),
            "to": str(msg["To"]),
            "subject": str(msg.get("Subject", "")),
            "message_id": str(msg.get("Message-ID", "")),
            "statutory_basis": str(msg.get("X-Hestia-Statutory-Basis", "")),
            "merkle_seal": str(msg.get("X-Hestia-Merkle-Seal", "")),
        }, sender, recipient

    def parse_mime_headers(self, mime_text: str) -> dict[str, str]:
        """Extract validated singleton headers without inventing absent values."""
        return self._parse_notice(mime_text)[0]

    def get_ses_telemetry(self) -> dict[str, Any]:
        """Report only measured quota; sandbox and verification state are unknown."""
        result = {
            "status": "disabled" if self.mode == "simulated" else "unavailable",
            "region": self.region_name,
            "mode": self.mode,
            "max_24_hour_send": None,
            "sent_last_24_hours": None,
            "max_send_rate": None,
            "verified_identities_count": None,
            "sandbox_mode": None,
        }
        ses = self._get_ses()
        if ses is None:
            return result
        try:
            quota = ses.get_send_quota()
            values = [quota[k] for k in ("Max24HourSend", "SentLast24Hours", "MaxSendRate")]
            if any(
                isinstance(v, bool) or not isinstance(v, (int, float))
                or not math.isfinite(v) or v < 0 for v in values
            ):
                return result
            result.update(
                status="connected", max_24_hour_send=values[0],
                sent_last_24_hours=values[1], max_send_rate=values[2],
            )
        except Exception:
            pass
        return result

    def _read_json(self, s3: Any, key: str) -> dict[str, Any] | None:
        try:
            response = s3.get_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            if _error_code(exc) in ("NoSuchKey", "404"):
                return None
            raise
        body = response["Body"]
        try:
            data = body.read(MAX_RECEIPT_BYTES + 1)
        finally:
            body.close()
        if len(data) > MAX_RECEIPT_BYTES:
            raise ValueError("Stored operation is too large")
        result = json.loads(data)
        if not isinstance(result, dict):
            raise ValueError("Invalid stored operation")
        return result

    def _write_once(self, s3: Any, key: str, value: dict[str, Any]) -> None:
        response = s3.put_object(
            Bucket=self.bucket, Key=key, IfNoneMatch="*",
            Body=json.dumps(value, sort_keys=True).encode("utf-8"),
            ContentType="application/json",
        )
        if response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 200:
            raise ValueError("Conditional write was not acknowledged")

    def _read_outcome(self, s3: Any, base: dict[str, Any]) -> dict[str, Any] | None:
        stored = self._read_json(s3, base["receipt_key"])
        if stored is None:
            return None
        variable = {"status", "reason", "ses_message_id", "receipt_persisted"}
        if set(stored) != set(base) or any(
            stored[key] != value for key, value in base.items() if key not in variable
        ):
            raise ValueError("Stored outcome does not match this request")
        if (
            stored["status"] not in ("ACCEPTED_BY_SES", "FAILED", "UNKNOWN", "UNAVAILABLE")
            or stored["receipt_persisted"] is not True
            or not isinstance(stored["reason"], str)
            or len(stored["reason"]) > 128
        ):
            raise ValueError("Invalid stored outcome")
        message_id = stored["ses_message_id"]
        if stored["status"] == "ACCEPTED_BY_SES":
            if not isinstance(message_id, str) or not _SES_MESSAGE_ID.fullmatch(message_id):
                raise ValueError("Missing SES acceptance identifier")
        elif message_id is not None:
            raise ValueError("Unexpected SES identifier")
        return stored

    def _retained_or_unknown(
        self, s3: Any, base: dict[str, Any], reason: str,
    ) -> dict[str, Any]:
        try:
            stored = self._read_outcome(s3, base)
            if stored is not None:
                return stored
        except Exception:
            pass
        return dict(base, status="UNKNOWN", reason=reason)

    def dispatch_outbox_email(
        self,
        disp_id: str,
        mime_text: str,
        eml_s3_key: str | None = None,
    ) -> dict[str, Any]:
        """Simulate, or reserve and attempt one SES simulator submission.

        A replay with changed MIME is UNKNOWN. An orphan reservation is UNKNOWN,
        including a crash before the call. Neither is eligible for an automatic
        retry or a new dispatch id to bypass an uncertain result.
        """
        base = {
            "schema_version": 1, "dispatch_id": disp_id,
            "message_id": None, "ses_message_id": None, "status": "FAILED",
            "transport": "SIMULATED" if self.mode == "simulated" else "AWS_SES",
            "ses_mode": self.mode, "smtp_response": None, "delivered_at": None,
            "recipient": None, "subject": "", "statutory_basis": "", "merkle_seal": "",
            "outbox_eml_key": None, "receipt_key": None, "request_sha256": None,
            "receipt_persisted": False, "reason": "INVALID_DISPATCH_ID",
        }
        if not isinstance(disp_id, str) or not _DISPATCH_ID.fullmatch(disp_id):
            return base
        try:
            headers, sender, recipient = self._parse_notice(mime_text)
        except (ValueError, TypeError, AttributeError, IndexError, MessageError, RecursionError):
            return dict(base, reason="INVALID_MIME")
        eml_key = f"{self.outbox_prefix}{disp_id}.eml"
        base.update(
            message_id=headers["message_id"] or None, recipient=recipient,
            subject=headers["subject"], statutory_basis=headers["statutory_basis"],
            merkle_seal=headers["merkle_seal"],
            outbox_eml_key=eml_key if eml_s3_key is None else eml_s3_key,
            receipt_key=f"{self.outbox_prefix}{disp_id}.delivery.json",
            request_sha256=hashlib.sha256(mime_text.encode("utf-8")).hexdigest(),
        )
        if self.mode == "simulated":
            return dict(base, status="SIMULATED", reason="NO_SEND_ATTEMPTED")
        if not self._scoped():
            return dict(base, reason="SCOPED_STORAGE_REQUIRED")
        if base["outbox_eml_key"] != eml_key:
            return dict(base, reason="OUTBOX_KEY_MISMATCH")
        if recipient not in SES_SIMULATOR_RECIPIENTS:
            return dict(base, reason="SIMULATOR_RECIPIENT_REQUIRED")
        s3 = self._get_s3()
        if s3 is None:
            return dict(base, status="UNKNOWN", reason="STORAGE_UNAVAILABLE")
        reservation_key = f"{self.outbox_prefix}{disp_id}.reservation.json"
        try:
            stored = self._read_outcome(s3, base)
            if stored is not None:
                return stored
            reservation = self._read_json(s3, reservation_key)
            if reservation is not None:
                return self._retained_or_unknown(s3, base, "OPERATION_ALREADY_RESERVED")
        except Exception:
            return dict(base, status="UNKNOWN", reason="STORAGE_READ_UNAVAILABLE")
        try:
            self._write_once(s3, reservation_key, {
                "schema_version": 1, "dispatch_id": disp_id, "ses_mode": self.mode,
                "request_sha256": base["request_sha256"], "status": "RESERVED",
            })
        except Exception:
            # Also covers a successful reservation whose acknowledgement was lost.
            return self._retained_or_unknown(s3, base, "RESERVATION_UNCONFIRMED")
        ses = self._get_ses()
        outcome = dict(base, status="UNAVAILABLE", reason="SES_UNAVAILABLE")
        if ses is not None:
            try:
                response = ses.send_raw_email(
                    Source=sender, Destinations=[recipient],
                    RawMessage={"Data": mime_text.encode("utf-8")},
                )
                message_id = response.get("MessageId") if isinstance(response, dict) else None
                metadata = (
                    response.get("ResponseMetadata", {}) if isinstance(response, dict) else {}
                )
                metadata_valid = isinstance(metadata, dict) and (
                    "HTTPStatusCode" not in metadata or metadata["HTTPStatusCode"] == 200
                )
                if (
                    isinstance(message_id, str) and _SES_MESSAGE_ID.fullmatch(message_id)
                    and metadata_valid
                ):
                    outcome.update(
                        status="ACCEPTED_BY_SES", reason="SES_ACCEPTED_NOT_DELIVERED",
                        ses_message_id=message_id,
                    )
                else:
                    outcome.update(status="UNKNOWN", reason="MALFORMED_SES_RESPONSE")
            except Exception as exc:
                code = _error_code(exc)
                if code in _SERVICE_REJECTIONS:
                    outcome.update(status="FAILED", reason=code)
                else:
                    outcome.update(status="UNKNOWN", reason="SES_RESULT_UNCONFIRMED")
        outcome["receipt_persisted"] = True
        try:
            self._write_once(s3, base["receipt_key"], outcome)
        except Exception:
            return self._retained_or_unknown(s3, base, "OUTCOME_PERSISTENCE_UNCONFIRMED")
        return outcome
