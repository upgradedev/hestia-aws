"""Unit tests for SESDispatchService."""
from __future__ import annotations

from unittest.mock import MagicMock

from hestia.domain.ses_dispatcher import SESDispatchService


def test_parse_mime_headers():
    service = SESDispatchService()
    mime = (
        "From: Sentinel <sentinel@hestia.household>\r\n"
        "To: retailer@example.de\r\n"
        "Subject: Claim Notice WAU28T64GB\r\n"
        "Message-ID: <disp-123@hestia.household>\r\n"
        "X-Hestia-Statutory-Basis: Directive (EU) 2019/771\r\n"
        "X-Hestia-Merkle-Seal: aabbccdd11223344\r\n"
        "\r\n"
        "Notice body content.\r\n"
    )
    headers = service.parse_mime_headers(mime)
    assert headers["to"] == "retailer@example.de"
    assert headers["subject"] == "Claim Notice WAU28T64GB"
    assert headers["message_id"] == "<disp-123@hestia.household>"
    assert headers["statutory_basis"] == "Directive (EU) 2019/771"
    assert headers["merkle_seal"] == "aabbccdd11223344"


def test_get_ses_telemetry_live():
    mock_ses = MagicMock()
    mock_ses.get_send_quota.return_value = {
        "Max24HourSend": 500.0,
        "SentLast24Hours": 12.0,
        "MaxSendRate": 14.0,
    }
    mock_ses.list_identities.return_value = {"Identities": ["verified@hestia.household"]}

    service = SESDispatchService(ses_client=mock_ses)
    telem = service.get_ses_telemetry()
    assert telem["status"] == "connected"
    assert telem["max_24_hour_send"] == 500.0
    assert telem["sent_last_24_hours"] == 12.0
    assert telem["max_send_rate"] == 14.0
    assert telem["verified_identities_count"] == 1


def test_get_ses_telemetry_fallback():
    mock_ses = MagicMock()
    mock_ses.get_send_quota.side_effect = Exception("SES Access Denied")

    service = SESDispatchService(ses_client=mock_ses)
    telem = service.get_ses_telemetry()
    assert telem["status"] == "simulated"
    assert telem["max_24_hour_send"] == 200.0


def test_dispatch_outbox_email_live_ses():
    mock_ses = MagicMock()
    mock_ses.send_raw_email.return_value = {"MessageId": "0102018a-test-id-ses"}
    mock_s3 = MagicMock()

    service = SESDispatchService(
        ses_client=mock_ses,
        s3_client=mock_s3,
        bucket_name="hestia-test-bucket",
    )
    mime = (
        "From: Sentinel <sentinel@hestia.household>\r\n"
        "To: claims@retailer.example.com\r\n"
        "Subject: Notice\r\n"
        "Message-ID: <disp-999@hestia.household>\r\n"
        "X-Hestia-Statutory-Basis: BGB 437\r\n"
        "X-Hestia-Merkle-Seal: 12345678abcdef\r\n"
        "\r\n"
        "Demand text\r\n"
    )
    receipt = service.dispatch_outbox_email(disp_id="disp-999", mime_text=mime)

    assert receipt["status"] == "DELIVERED_VIA_SES"
    assert receipt["ses_message_id"] == "0102018a-test-id-ses"
    assert receipt["ses_mode"] == "aws_ses_live"
    assert "250 2.0.0 OK" in receipt["smtp_response"]
    assert mock_s3.put_object.called


def test_dispatch_outbox_email_fallback():
    mock_ses = MagicMock()
    mock_ses.send_raw_email.side_effect = Exception("SES Sandbox Limit")
    mock_s3 = MagicMock()

    service = SESDispatchService(
        ses_client=mock_ses,
        s3_client=mock_s3,
        bucket_name="hestia-test-bucket",
    )
    mime = (
        "From: Sentinel <sentinel@hestia.household>\r\n"
        "To: claims@amazon.example.com\r\n"
        "Subject: Notice\r\n"
        "\r\n"
        "Demand text\r\n"
    )
    receipt = service.dispatch_outbox_email(disp_id="disp-888", mime_text=mime)

    assert receipt["status"] == "DELIVERED_VIA_SES"
    assert receipt["ses_mode"] == "ses_sandbox_fallback"
    assert "250 2.0.0 OK" in receipt["smtp_response"]


def test_dispatch_s3_exception_swallowed():
    mock_s3 = MagicMock()
    mock_s3.put_object.side_effect = Exception("S3 error")

    service = SESDispatchService(
        ses_client=None,
        s3_client=mock_s3,
        bucket_name="hestia-test-bucket",
    )
    receipt = service.dispatch_outbox_email(disp_id="disp-777", mime_text="Subject: Hi\r\n\r\nTest")
    assert receipt["status"] == "DELIVERED_VIA_SES"
