"""Focused offline contract tests for bounded SES transport.

All AWS discovery is intercepted. No test can send mail or access real storage.
Historical delivered/fabricated-fallback expectations are replaced explicitly.
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Barrier, Lock
from types import SimpleNamespace

import pytest

from hestia.domain.ses_dispatcher import (
    MAX_MIME_BYTES,
    MAX_RECEIPT_BYTES,
    SESDispatchService,
)

BUCKET = "hestia-test-bucket"
PREFIX = "demo/workspaces/0123456789abcdef0123456789abcdef/outbox/"
DISPATCH_ID = "disp-999"
RESERVATION = PREFIX + "disp-999.reservation.json"
RECEIPT = PREFIX + "disp-999.delivery.json"
MIME = (
    "From: Hestia Sentinel <sentinel@hestia.household>\r\n"
    "To: success@simulator.amazonses.com\r\n"
    "Subject: Claim Notice WAU28T64GB\r\n"
    "Message-ID: <disp-999@hestia.household>\r\n"
    "MIME-Version: 1.0\r\n"
    "Content-Type: text/plain; charset=utf-8\r\n"
    "X-Hestia-Statutory-Basis: Directive (EU) 2019/771\r\n"
    "X-Hestia-Merkle-Seal: aabbccdd11223344\r\n"
    "\r\n"
    "Notice body content.\r\n"
)
_DEFAULT = object()


class AWSFailure(Exception):
    def __init__(self, code, http_status=None):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}
        if http_status is not None:
            self.response["ResponseMetadata"] = {"HTTPStatusCode": http_status}


class FakeS3:
    """Conditional object storage, including writes that lose their response."""

    def __init__(self):
        self.objects = {}
        self.read_calls = []
        self.put_calls = []
        self.read_error = None
        self.fail_before = None
        self.fail_after = None
        self.malformed_ack = None
        self.reserve_error = None
        self.before_reserve = None
        self.lock = Lock()

    def get_object(self, *, Bucket, Key):
        assert Bucket == BUCKET
        assert Key.startswith(PREFIX)
        self.read_calls.append(Key)
        if self.read_error:
            raise self.read_error
        with self.lock:
            if Key not in self.objects:
                raise AWSFailure("NoSuchKey")
            return {"Body": BytesIO(self.objects[Key])}

    def put_object(self, *, Bucket, Key, Body, ContentType, IfNoneMatch):
        assert Bucket == BUCKET
        assert Key.startswith(PREFIX)
        assert IfNoneMatch == "*"
        assert ContentType == "application/json"
        self.put_calls.append(Key)
        if Key == RESERVATION:
            if self.before_reserve:
                self.before_reserve()
            if self.reserve_error:
                raise self.reserve_error
        with self.lock:
            if Key in self.objects:
                raise AWSFailure("PreconditionFailed")
            if Key == self.fail_before:
                raise TimeoutError("Write never reached storage")
            self.objects[Key] = Body
            if Key == self.fail_after:
                raise TimeoutError("Write persisted; acknowledgement lost")
            if Key == self.malformed_ack:
                return {}
            return {"ResponseMetadata": {"HTTPStatusCode": 200}}


class FakeSES:
    def __init__(self, storage=None, response=_DEFAULT, error=None):
        self.storage = storage
        self.response = {"MessageId": "0102018a-test-id-ses"} if response is _DEFAULT else response
        self.error = error
        self.calls = []
        self.before_send = None
        self.quota_calls = 0
        self.quota_error = None
        self.quota = {"Max24HourSend": 500.0, "SentLast24Hours": 12.0, "MaxSendRate": 14.0}

    def send_raw_email(self, **kwargs):
        if self.storage is not None:
            assert RESERVATION in self.storage.objects, "Durable reservation must precede SES"
        self.calls.append(kwargs)
        if self.before_send:
            self.before_send()
        if self.error:
            raise self.error
        return self.response

    def get_send_quota(self):
        self.quota_calls += 1
        if self.quota_error:
            raise self.quota_error
        return self.quota


@pytest.fixture(autouse=True)
def aws_discovery(monkeypatch):
    # This per-test stub leaves the parent conftest's imported boto3 object untouched.
    # Its client guard and this module's stub are both restored by monkeypatch.
    calls = []

    def refuse_client(service, **kwargs):
        calls.append(service)
        raise RuntimeError("AWS discovery is disabled in these offline tests")

    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=refuse_client))
    return calls


def simulator(ses, storage, **kwargs):
    options = {
        "ses_client": ses, "s3_client": storage, "bucket_name": BUCKET,
        "outbox_prefix": PREFIX, "mode": "ses_simulator",
    }
    options.update(kwargs)
    return SESDispatchService(**options)


@pytest.fixture
def transport():
    storage = FakeS3()
    ses = FakeSES(storage)
    return simulator(ses, storage), ses, storage


def assert_no_delivery_claim(receipt):
    assert "DELIVERED" not in receipt["status"]
    assert receipt["smtp_response"] is None
    assert receipt["delivered_at"] is None


def assert_unknown(receipt):
    assert receipt["status"] == "UNKNOWN"
    assert receipt["ses_message_id"] is None
    assert_no_delivery_claim(receipt)


def test_parse_mime_headers():
    headers = SESDispatchService().parse_mime_headers(MIME)
    assert headers["to"] == "success@simulator.amazonses.com"
    assert headers["from"] == "Hestia Sentinel <sentinel@hestia.household>"
    assert headers["subject"] == "Claim Notice WAU28T64GB"
    assert headers["message_id"] == "<disp-999@hestia.household>"
    assert headers["statutory_basis"] == "Directive (EU) 2019/771"
    assert headers["merkle_seal"] == "aabbccdd11223344"


@pytest.mark.parametrize("injected", [False, True])
def test_default_simulation_never_discovers_or_uses_aws(monkeypatch, aws_discovery, injected):
    monkeypatch.setenv("HESTIA_STATE_BUCKET", "unrelated-production-bucket")
    monkeypatch.setenv("HESTIA_SES_MODE", "ses_simulator")
    storage, ses = FakeS3(), FakeSES()
    service = SESDispatchService(
        ses_client=ses if injected else None, s3_client=storage if injected else None,
    )
    ordinary_notice = MIME.replace(
        "success@simulator.amazonses.com", "claims@retailer.example.com",
    )
    receipt = service.dispatch_outbox_email(DISPATCH_ID, ordinary_notice)
    assert receipt["status"] == "SIMULATED"
    assert receipt["ses_mode"] == "simulated"
    assert receipt["recipient"] == "claims@retailer.example.com"
    assert receipt["ses_message_id"] is None
    assert receipt["receipt_persisted"] is False
    assert_no_delivery_claim(receipt)
    telemetry = service.get_ses_telemetry()
    assert telemetry["status"] == "disabled"
    assert all(telemetry[key] is None for key in (
        "max_24_hour_send", "sent_last_24_hours", "max_send_rate",
        "verified_identities_count", "sandbox_mode",
    ))
    assert aws_discovery == []
    assert ses.calls == []
    assert ses.quota_calls == 0
    assert storage.read_calls == storage.put_calls == []


@pytest.mark.parametrize("mode", ["simulated", "ses_simulator"])
def test_explicit_empty_bucket_never_falls_back_to_environment(monkeypatch, aws_discovery, mode):
    monkeypatch.setenv("HESTIA_STATE_BUCKET", "unrelated-production-bucket")
    service = SESDispatchService(bucket_name="", outbox_prefix=PREFIX, mode=mode)
    assert service.bucket == ""
    assert SESDispatchService().bucket == "unrelated-production-bucket"
    result = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert result["status"] == ("SIMULATED" if mode == "simulated" else "FAILED")
    assert service._get_s3() is None
    assert service._get_ses() is None
    assert aws_discovery == []


@pytest.mark.parametrize("mode", ["live", "aws_ses_live", "SES_SIMULATOR", "", None])
def test_only_two_explicit_modes_are_allowed(mode, aws_discovery):
    with pytest.raises(ValueError, match="mode"):
        SESDispatchService(mode=mode)
    assert aws_discovery == []


def test_existing_constructor_positions_and_public_methods_remain_supported():
    service = SESDispatchService("eu-west-1", FakeSES(), FakeS3(), "", "outbox/")
    minimal = "From: from@example.com\r\nTo: to@example.com\r\n\r\nBody"
    headers = service.parse_mime_headers(minimal)
    receipt = service.dispatch_outbox_email("disp-1", minimal, "outbox/disp-1.eml")
    assert headers["message_id"] == headers["statutory_basis"] == ""
    assert receipt["message_id"] is None
    assert receipt["ses_message_id"] is None
    assert receipt["statutory_basis"] == ""
    assert receipt["status"] == "SIMULATED"


def test_ses_acceptance_is_not_delivery_and_message_is_not_rewritten(transport):
    service, ses, storage = transport
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME, PREFIX + "disp-999.eml")
    assert receipt["status"] == "ACCEPTED_BY_SES"
    assert receipt["ses_message_id"] == "0102018a-test-id-ses"
    assert receipt["ses_mode"] == "ses_simulator"
    assert receipt["receipt_persisted"] is True
    assert_no_delivery_claim(receipt)
    assert ses.calls == [{
        "Source": "sentinel@hestia.household",
        "Destinations": ["success@simulator.amazonses.com"],
        "RawMessage": {"Data": MIME.encode("utf-8")},
    }]
    assert storage.put_calls == [RESERVATION, RECEIPT]
    assert json.loads(storage.objects[RESERVATION])["status"] == "RESERVED"
    assert json.loads(storage.objects[RECEIPT]) == receipt


@pytest.mark.parametrize("code", [
    "MessageRejected", "AccessDenied", "AccessDeniedException",
    "MailFromDomainNotVerifiedException", "AccountSendingPausedException", "Throttling",
])
def test_explicit_service_rejection_is_failed_and_retained(transport, code):
    service, ses, storage = transport
    ses.error = AWSFailure(code, 403 if "AccessDenied" in code else 400)
    first = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert first["status"] == "FAILED"
    assert first["reason"] == code
    assert first["ses_message_id"] is None
    assert first["receipt_persisted"] is True
    assert_no_delivery_claim(first)
    ses.error = None
    assert simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME) == first
    assert len(ses.calls) == 1
    assert storage.put_calls == [RESERVATION, RECEIPT]


@pytest.mark.parametrize("error", [
    TimeoutError("SES may already have accepted the request"),
    ConnectionError("Connection closed before response"),
    AWSFailure("InternalFailure"), AWSFailure("RequestTimeout"),
    AWSFailure("MessageRejected", 500), AWSFailure("AccessDenied", 500),
    RuntimeError("Unclassified SDK failure"),
])
def test_ambiguous_send_is_unknown_and_never_retried(transport, error):
    service, ses, storage = transport
    ses.error = error
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert_unknown(receipt)
    assert receipt["receipt_persisted"] is True
    ses.error = None
    assert simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME) == receipt
    assert len(ses.calls) == 1


@pytest.mark.parametrize("response", [
    None, {}, [], "success", {"MessageId": None}, {"MessageId": ""},
    {"MessageId": 123}, {"MessageId": " "}, {"MessageId": "id\r\ninjected"},
    {"MessageId": "x" * 257}, {"MessageId": "bad/id"},
    {"MessageId": "id", "ResponseMetadata": None},
    {"MessageId": "id", "ResponseMetadata": {"HTTPStatusCode": 500}},
])
def test_malformed_or_missing_message_id_is_unknown(transport, response):
    service, ses, storage = transport
    ses.response = response
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert_unknown(receipt)
    assert receipt["reason"] == "MALFORMED_SES_RESPONSE"
    assert simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME) == receipt
    assert len(ses.calls) == 1


def test_unavailable_ses_is_not_success_and_is_retained(aws_discovery):
    storage = FakeS3()
    service = simulator(None, storage)
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert receipt["status"] == "UNAVAILABLE"
    assert receipt["ses_message_id"] is None
    assert receipt["receipt_persisted"] is True
    assert_no_delivery_claim(receipt)
    assert aws_discovery == ["ses"]
    later_ses = FakeSES(storage)
    assert simulator(later_ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME) == receipt
    assert later_ses.calls == []


def test_unavailable_s3_prevents_ses_discovery(aws_discovery):
    service = simulator(None, None)
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert_unknown(receipt)
    assert receipt["reason"] == "STORAGE_UNAVAILABLE"
    assert aws_discovery == ["s3"]


@pytest.mark.parametrize("recipient", [
    "claims@amazon.example.com", "claims@retailer.example.com",
    "success@simulator.amazonses.com.evil.example",
    "unknown@simulator.amazonses.com", "Success@simulator.amazonses.com",
    "success@SIMULATOR.amazonses.com",
    "success+tag@simulator.amazonses.com",
    '"success@simulator.amazonses.com" <attacker@example.com>',
])
def test_simulator_recipient_mismatch_is_never_silently_rewritten(transport, recipient):
    service, ses, storage = transport
    mime = MIME.replace("success@simulator.amazonses.com", recipient)
    result = service.dispatch_outbox_email(DISPATCH_ID, mime)
    assert result["status"] == "FAILED"
    assert result["reason"] == "SIMULATOR_RECIPIENT_REQUIRED"
    assert ses.calls == []
    assert storage.read_calls == storage.put_calls == []


@pytest.mark.parametrize("line", [
    "From: attacker@example.com", "to: attacker@example.com",
    "SUBJECT: Injected", "Message-ID: <another@example.com>",
    "MIME-Version: 1.0", "Content-Type: text/html",
    "X-Hestia-Statutory-Basis: fabricated", "X-Hestia-Merkle-Seal: replaced",
    "Cc: attacker@example.com", "Bcc: attacker@example.com", "Bcc:",
    "Resent-To: attacker@example.com", "Resent-From: attacker@example.com",
    "Return-Path: attacker@example.com", "Sender: attacker@example.com",
    "Reply-To: attacker@example.com", "X-SES-SOURCE-ARN: injected",
])
def test_duplicate_and_routing_header_injection_fails_before_storage(transport, line):
    service, ses, storage = transport
    mime = MIME.replace("Subject: ", line + "\r\nSubject: ", 1)
    receipt = service.dispatch_outbox_email(DISPATCH_ID, mime)
    assert receipt["status"] == "FAILED"
    assert receipt["reason"] == "INVALID_MIME"
    with pytest.raises(ValueError):
        service.parse_mime_headers(mime)
    assert ses.calls == []
    assert storage.read_calls == storage.put_calls == []


@pytest.mark.parametrize("replacement", [
    "Subject: hi\rBcc: attacker@example.com",
    "Subject: hi\nBcc: attacker@example.com",
    "Subject: hi\r\n Bcc: attacker@example.com",
    "Subject: =?utf-8?Q?hello=0D=0ABcc=3A_attacker@example.com?=",
    "Subject: hi\x00there", "Subject: hi\x7fthere", "Subject : hi",
    "Subject: " + "x" * 999,
])
def test_crlf_and_encoded_control_injection_is_rejected(transport, replacement):
    service, ses, storage = transport
    mime = MIME.replace("Subject: Claim Notice WAU28T64GB", replacement)
    assert service.dispatch_outbox_email(DISPATCH_ID, mime)["reason"] == "INVALID_MIME"
    assert ses.calls == []
    assert storage.put_calls == []


@pytest.mark.parametrize(("field", "value"), [
    ("From", ""), ("From", "not-an-address"), ("From", "a@example.com, b@example.com"),
    ("From", "x@-invalid.example"), ("From", "x..y@example.com"),
    ("To", ""), ("To", "not-an-address"), ("To", "x@localhost"),
    ("To", "success@simulator.amazonses.com, attacker@example.com"),
    ("To", "Group: success@simulator.amazonses.com;"),
])
def test_one_valid_sender_and_recipient_are_required(transport, field, value):
    service, ses, storage = transport
    old = (
        "From: Hestia Sentinel <sentinel@hestia.household>"
        if field == "From" else "To: success@simulator.amazonses.com"
    )
    mime = MIME.replace(old, f"{field}: {value}")
    assert service.dispatch_outbox_email(DISPATCH_ID, mime)["reason"] == "INVALID_MIME"
    assert ses.calls == []
    assert storage.put_calls == []


@pytest.mark.parametrize("mime", [
    None, b"bytes", "", "Subject: Hi\r\n\r\nTest", MIME.replace("\r\n\r\n", "\r\n"),
    MIME.replace("To: success@simulator.amazonses.com\r\n", ""),
    MIME.replace("From: Hestia Sentinel <sentinel@hestia.household>\r\n", ""),
    MIME.replace("text/plain; charset=utf-8", 'multipart/mixed; boundary="x"'),
    MIME.replace("MIME-Version: 1.0", "MIME-Version: 2.0"),
    MIME.replace("Subject:", "Content-Transfer-Encoding: binary\r\nSubject:"),
    MIME + "\x00", MIME + "a" * MAX_MIME_BYTES,
    MIME + "é" * (MAX_MIME_BYTES // 2), MIME + "\ud800",
])
def test_malformed_oversized_or_unsupported_mime_is_bounded(transport, mime):
    service, ses, storage = transport
    receipt = service.dispatch_outbox_email(DISPATCH_ID, mime)
    assert receipt["status"] == "FAILED"
    assert receipt["reason"] == "INVALID_MIME"
    assert ses.calls == []
    assert storage.read_calls == storage.put_calls == []


def test_lf_notice_is_accepted_without_rewriting_bytes(transport):
    service, ses, _ = transport
    mime = MIME.replace("\r\n", "\n")
    receipt = service.dispatch_outbox_email(DISPATCH_ID, mime)
    assert receipt["status"] == "ACCEPTED_BY_SES"
    assert ses.calls[0]["RawMessage"]["Data"] == mime.encode("utf-8")


@pytest.mark.parametrize("dispatch_id", [
    "", ".", "../other", "a/b", "a\\b", "%2F", "x\r\nBcc: x", "é", "a" * 129, None, 42,
])
def test_dispatch_id_cannot_escape_or_expand_object_scope(transport, dispatch_id):
    service, ses, storage = transport
    receipt = service.dispatch_outbox_email(dispatch_id, MIME)
    assert receipt["reason"] == "INVALID_DISPATCH_ID"
    assert ses.calls == []
    assert storage.read_calls == storage.put_calls == []


@pytest.mark.parametrize("dispatch_id", ["a", "disp-123_456", "a" * 128])
def test_bounded_dispatch_ids_remain_supported(dispatch_id):
    assert SESDispatchService().dispatch_outbox_email(dispatch_id, MIME)["status"] == "SIMULATED"


@pytest.mark.parametrize("prefix", [
    "outbox/", "", "/", "demo/workspaces/short/outbox/",
    "demo/workspaces/" + "g" * 32 + "/outbox/",
    "demo/workspaces/" + "a" * 31 + "/outbox/",
    PREFIX + "../other/", PREFIX.rstrip("/"), "/" + PREFIX,
])
def test_enabled_mode_rejects_unscoped_prefix_before_any_aws_access(prefix, aws_discovery):
    service = SESDispatchService(bucket_name=BUCKET, outbox_prefix=prefix, mode="ses_simulator")
    assert service.dispatch_outbox_email(DISPATCH_ID, MIME)["reason"] == "SCOPED_STORAGE_REQUIRED"
    assert service.get_ses_telemetry()["status"] == "unavailable"
    assert aws_discovery == []


@pytest.mark.parametrize("key", ["", "outbox/disp-999.eml", PREFIX + "other.eml", PREFIX + "../x"])
def test_enabled_mode_requires_the_exact_scoped_eml_key(transport, key):
    service, ses, storage = transport
    assert service.dispatch_outbox_email(DISPATCH_ID, MIME, key)["reason"] == "OUTBOX_KEY_MISMATCH"
    assert ses.calls == []
    assert storage.read_calls == storage.put_calls == []


def test_replay_and_restart_return_immutable_outcome(transport):
    service, ses, storage = transport
    first = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    stored_bytes = dict(storage.objects)
    first["subject"] = "Caller mutated its own copy"
    for _ in range(2):
        receipt = simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME)
        assert receipt == json.loads(stored_bytes[RECEIPT])
    assert len(ses.calls) == 1
    assert storage.objects == stored_bytes
    assert storage.put_calls == [RESERVATION, RECEIPT]


def test_changed_payload_under_existing_dispatch_id_never_resends(transport):
    service, ses, storage = transport
    service.dispatch_outbox_email(DISPATCH_ID, MIME)
    saved = dict(storage.objects)
    altered = MIME.replace("Notice body content.", "Changed demand.")
    assert_unknown(simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, altered))
    assert storage.objects == saved
    assert len(ses.calls) == 1


def test_orphan_reservation_after_crash_never_sends(transport):
    service, ses, storage = transport
    storage.objects[RESERVATION] = b'{"status":"RESERVED"}'
    assert_unknown(service.dispatch_outbox_email(DISPATCH_ID, MIME))
    assert_unknown(simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME))
    assert ses.calls == []
    assert storage.put_calls == []


def test_duplicate_while_first_submission_is_in_flight_is_unknown(transport):
    service, ses, storage = transport
    observed = []

    def replay():
        observed.append(simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME))

    ses.before_send = replay
    first = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert first["status"] == "ACCEPTED_BY_SES"
    assert len(observed) == 1
    assert_unknown(observed[0])
    assert len(ses.calls) == 1


def test_concurrent_reservation_has_only_one_submission_winner(transport):
    _, ses, storage = transport
    barrier = Barrier(2, timeout=5)
    storage.before_reserve = barrier.wait

    def submit():
        return simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME)

    with ThreadPoolExecutor(max_workers=2) as workers:
        futures = [workers.submit(submit) for _ in range(2)]
        receipts = [future.result(timeout=10) for future in futures]
    assert len(ses.calls) == 1
    assert any(r["status"] == "ACCEPTED_BY_SES" for r in receipts)
    assert all(r["status"] in ("ACCEPTED_BY_SES", "UNKNOWN") for r in receipts)
    assert len(storage.objects) == 2


@pytest.mark.parametrize("code", [
    "AccessDenied", "NoSuchBucket", "InternalError", "InvalidObjectState",
])
def test_storage_read_failure_is_not_treated_as_absence(transport, code):
    service, ses, storage = transport
    storage.read_error = AWSFailure(code)
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert_unknown(receipt)
    assert receipt["reason"] == "STORAGE_READ_UNAVAILABLE"
    assert ses.calls == []
    assert storage.put_calls == []


@pytest.mark.parametrize("key", [RECEIPT, RESERVATION])
@pytest.mark.parametrize("body", [
    b"not-json", b"null", b"[]", b"{}", b"x" * (MAX_RECEIPT_BYTES + 1),
    b'{"status":"DELIVERED_VIA_SES"}',
])
def test_corrupt_legacy_or_oversized_storage_never_allows_send(transport, key, body):
    service, ses, storage = transport
    storage.objects[key] = body
    assert_unknown(service.dispatch_outbox_email(DISPATCH_ID, MIME))
    assert ses.calls == []
    assert storage.put_calls == []


@pytest.mark.parametrize("code", [
    "PreconditionFailed", "ConditionalRequestConflict", "AccessDenied",
])
def test_unconfirmed_reservation_is_never_retried_within_attempt(transport, code):
    service, ses, storage = transport
    storage.reserve_error = AWSFailure(code)
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert_unknown(receipt)
    assert receipt["reason"] == "RESERVATION_UNCONFIRMED"
    assert storage.put_calls == [RESERVATION]
    assert ses.calls == []


@pytest.mark.parametrize("failure", ["fail_before", "fail_after", "malformed_ack"])
def test_reservation_must_have_a_durable_ack_before_send(transport, failure):
    service, ses, storage = transport
    setattr(storage, failure, RESERVATION)
    assert_unknown(service.dispatch_outbox_email(DISPATCH_ID, MIME))
    assert ses.calls == []
    assert RECEIPT not in storage.objects
    if failure != "fail_before":
        setattr(storage, failure, None)
        assert_unknown(simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME))
        assert ses.calls == []


@pytest.mark.parametrize("ambiguous_ses", [False, True])
def test_lost_outcome_write_keeps_reservation_and_prevents_resend(transport, ambiguous_ses):
    service, ses, storage = transport
    if ambiguous_ses:
        ses.error = TimeoutError("SES response lost")
    storage.fail_before = RECEIPT
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert_unknown(receipt)
    assert receipt["reason"] == "OUTCOME_PERSISTENCE_UNCONFIRMED"
    assert receipt["receipt_persisted"] is False
    assert RESERVATION in storage.objects
    assert RECEIPT not in storage.objects
    storage.fail_before = None
    assert_unknown(simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME))
    assert len(ses.calls) == 1
    assert storage.put_calls == [RESERVATION, RECEIPT]


@pytest.mark.parametrize("phase", ["before_client", "during_submission"])
def test_process_death_after_reservation_prevents_restart_send(transport, monkeypatch, phase):
    service, ses, storage = transport

    def process_death():
        raise SystemExit("Process died with its reservation retained")

    if phase == "before_client":
        monkeypatch.setattr(service, "_get_ses", process_death)
    else:
        ses.before_send = process_death
    with pytest.raises(SystemExit):
        service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert RESERVATION in storage.objects
    assert RECEIPT not in storage.objects
    restarted_ses = FakeSES(storage)
    assert_unknown(simulator(restarted_ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME))
    assert restarted_ses.calls == []
    assert len(ses.calls) == (1 if phase == "during_submission" else 0)


@pytest.mark.parametrize("failure", ["fail_after", "malformed_ack"])
def test_lost_outcome_ack_returns_the_stored_immutable_receipt(transport, failure):
    service, ses, storage = transport
    setattr(storage, failure, RECEIPT)
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert receipt["status"] == "ACCEPTED_BY_SES"
    assert receipt["receipt_persisted"] is True
    assert simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME) == receipt
    assert len(ses.calls) == 1


def test_read_loss_after_submission_is_unknown_even_when_outcome_was_written(transport):
    service, ses, storage = transport

    def lose_reads():
        storage.read_error = AWSFailure("AccessDenied")

    ses.before_send = lose_reads
    storage.fail_after = RECEIPT
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert_unknown(receipt)
    storage.read_error = None
    retained = simulator(ses, storage).dispatch_outbox_email(DISPATCH_ID, MIME)
    assert retained["status"] == "ACCEPTED_BY_SES"
    assert len(ses.calls) == 1


def test_ses_client_creation_disables_sdk_retries(monkeypatch):
    storage = FakeS3()
    ses = FakeSES(storage)
    observed = []

    def client(name, **kwargs):
        observed.append((name, kwargs))
        return ses

    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=client))
    receipt = simulator(None, storage).dispatch_outbox_email(DISPATCH_ID, MIME)
    assert receipt["status"] == "ACCEPTED_BY_SES"
    assert len(observed) == 1
    assert observed[0][0] == "ses"
    config = observed[0][1]["config"]
    assert config.retries == {"mode": "standard", "total_max_attempts": 1}
    assert config.connect_timeout == 5
    assert config.read_timeout == 15


@pytest.mark.parametrize("retries", [
    {}, {"total_max_attempts": 2}, {"max_attempts": 1}, None,
])
def test_injected_sdk_client_with_automatic_retries_is_refused(transport, retries):
    service, ses, _ = transport
    ses.meta = SimpleNamespace(config=SimpleNamespace(retries=retries))
    receipt = service.dispatch_outbox_email(DISPATCH_ID, MIME)
    assert receipt["status"] == "UNAVAILABLE"
    assert ses.calls == []


@pytest.mark.parametrize("retries", [{"total_max_attempts": 1}, {"max_attempts": 0}])
def test_injected_sdk_client_with_one_attempt_is_allowed(transport, retries):
    service, ses, _ = transport
    ses.meta = SimpleNamespace(config=SimpleNamespace(retries=retries))
    assert service.dispatch_outbox_email(DISPATCH_ID, MIME)["status"] == "ACCEPTED_BY_SES"
    assert len(ses.calls) == 1


def test_telemetry_reports_only_observed_quota(transport):
    service, ses, _ = transport
    telemetry = service.get_ses_telemetry()
    assert telemetry["status"] == "connected"
    assert telemetry["max_24_hour_send"] == 500.0
    assert telemetry["sent_last_24_hours"] == 12.0
    assert telemetry["max_send_rate"] == 14.0
    assert telemetry["verified_identities_count"] is None
    assert telemetry["sandbox_mode"] is None
    assert ses.quota_calls == 1
    assert ses.calls == []


@pytest.mark.parametrize("quota", [
    {}, None, {"Max24HourSend": 500},
    {"Max24HourSend": True, "SentLast24Hours": 0, "MaxSendRate": 1},
    {"Max24HourSend": float("nan"), "SentLast24Hours": 0, "MaxSendRate": 1},
    {"Max24HourSend": 200, "SentLast24Hours": -1, "MaxSendRate": 1},
])
def test_malformed_telemetry_is_unavailable_without_default_quota(transport, quota):
    service, ses, _ = transport
    ses.quota = quota
    telemetry = service.get_ses_telemetry()
    assert telemetry["status"] == "unavailable"
    assert telemetry["max_24_hour_send"] is None
    assert telemetry["sent_last_24_hours"] is None
    assert telemetry["max_send_rate"] is None


def test_telemetry_denial_is_unavailable_without_fabricated_sandbox_metrics(transport):
    service, ses, _ = transport
    ses.quota_error = AWSFailure("AccessDenied")
    telemetry = service.get_ses_telemetry()
    assert telemetry["status"] == "unavailable"
    assert telemetry["max_24_hour_send"] is None
    assert telemetry["sent_last_24_hours"] is None
    assert telemetry["max_send_rate"] is None
    assert telemetry["verified_identities_count"] is None
    assert telemetry["sandbox_mode"] is None
