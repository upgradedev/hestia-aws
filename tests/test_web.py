"""Tests for the Hestia web cockpit and AWS Lambda handler."""

import json

from hestia.app.web import build_audit, lambda_handler, render_html


def test_build_audit_default():
    digest, data = build_audit("family_flat")
    assert digest.total_reimbursable_cents == 18500  # €185.00
    assert digest.monthly_subscription_waste_cents > 0
    assert digest.has_urgent_actions is True
    assert len(data["warranties"]) == 2


def test_render_html():
    html = render_html("family_flat")
    assert "HESTIA AWS" in html
    assert "EU Directive 2019/771/EU" in html
    assert "Bosch Series 6" in html
    assert "Return-of-Control" in html
    assert "€185.00" in html


def test_lambda_handler_healthz():
    event = {"rawPath": "/healthz", "requestContext": {"http": {"method": "GET"}}}
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    assert resp["headers"]["Content-Type"] == "application/json"
    body = json.loads(resp["body"])
    assert body["status"] == "ok"
    assert body["service"] == "hestia-aws"


def test_lambda_handler_root_get():
    event = {"rawPath": "/", "requestContext": {"http": {"method": "GET"}}}
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    assert "text/html" in resp["headers"]["Content-Type"]
    assert "HESTIA AWS" in resp["body"]


def test_lambda_handler_post_claim():
    event = {"rawPath": "/action/claim", "requestContext": {"http": {"method": "POST"}}}
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    assert "Return-of-Control Executed" in resp["body"]
    assert "Merkle Proof" in resp["body"]


def test_lambda_handler_post_cancel():
    event = {"rawPath": "/action/cancel_trial", "httpMethod": "POST"}
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    assert "Trial cancellation webhook triggered" in resp["body"]


def test_render_html_no_repairs(monkeypatch):
    import hestia.app.web as web
    custom = dict(web.SCENARIOS['family_flat'])
    custom['repairs'] = []
    monkeypatch.setitem(web.SCENARIOS, 'empty_repairs', custom)
    html = web.render_html('empty_repairs')
    assert 'HESTIA AWS' in html


def test_lambda_handler_options():
    event = {"rawPath": "/api/state", "requestContext": {"http": {"method": "OPTIONS"}}}
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


def test_lambda_handler_api_state():
    event = {"rawPath": "/api/state", "requestContext": {"http": {"method": "GET"}}}
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    data = json.loads(resp["body"])
    assert "appliances" in data
    assert len(data["appliances"]) >= 2


def test_lambda_handler_api_action_claim_json(monkeypatch):
    import hestia.app.web as web
    monkeypatch.setattr(
        web,
        "draft_bedrock_claim_notice",
        lambda **k: {
            "notice": "Mocked claim notice",
            "model_id": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
            "statutory_basis": "Directive (EU) 2019/771, Article 10(1)",
            "seller": k.get("seller_name", "Kotsovolos"),
            "seller_email": k.get("seller_email", "support@kotsovolos.example.gr"),
        },
    )
    body = json.dumps({"item_id": "app-001"})
    event = {
        "rawPath": "/api/action/claim",
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"content-type": "application/json"},
        "body": body,
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"
    assert "dispatch_record" in res
    assert res["dispatch_record"]["item_id"] == "app-001"


def test_lambda_handler_api_action_claim_fallback_item(monkeypatch):
    import hestia.app.web as web
    monkeypatch.setattr(
        web,
        "draft_bedrock_claim_notice",
        lambda **k: {
            "notice": "Mocked claim notice",
            "model_id": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
            "statutory_basis": "Directive (EU) 2019/771, Article 10(1)",
            "seller": "Kotsovolos",
            "seller_email": "support@kotsovolos.example.gr",
        },
    )
    body = json.dumps({"item_id": "app-non-existent"})
    event = {
        "rawPath": "/api/action/claim",
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"content-type": "application/json"},
        "body": body,
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_action_claim_no_appliances(monkeypatch):
    from unittest.mock import MagicMock

    import hestia.app.web as web
    mock_store = MagicMock()
    mock_store.load_state.return_value = {"appliances": []}
    monkeypatch.setattr(web, "S3HouseholdStore", lambda: mock_store)

    event = {
        "rawPath": "/api/action/claim",
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"content-type": "application/json"},
        "body": json.dumps({"item_id": "app-001"}),
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 404


def test_lambda_handler_api_action_claim_invalid_json(monkeypatch):
    import hestia.app.web as web
    monkeypatch.setattr(
        web,
        "draft_bedrock_claim_notice",
        lambda **k: {
            "notice": "Mocked claim notice",
            "model_id": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
            "statutory_basis": "Directive (EU) 2019/771, Article 10(1)",
            "seller": "Kotsovolos",
            "seller_email": "support@kotsovolos.example.gr",
        },
    )
    event = {
        "rawPath": "/action/claim",
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"content-type": "application/json"},
        "body": "{invalid-json}",
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_action_cancel_json():
    body = json.dumps({"service_name": "Fitness Stream Pro"})
    event = {
        "rawPath": "/api/action/cancel",
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"content-type": "application/json"},
        "body": body,
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_action_cancel_invalid_json():
    event = {
        "rawPath": "/action/cancel_trial",
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"content-type": "application/json"},
        "body": "{bad-json}",
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_action_receipt():
    body = json.dumps({
        "merchant": "Leroy Merlin DIY",
        "amount_cents": 8550,
        "receipt_id": "REC-2026-TEST-99",
    })
    event = {
        "rawPath": "/api/action/receipt",
        "requestContext": {"http": {"method": "POST"}},
        "body": body,
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"
    assert res["result"]["matched"] is True


def test_lambda_handler_api_action_receipt_invalid_json():
    event = {
        "rawPath": "/api/action/receipt",
        "requestContext": {"http": {"method": "POST"}},
        "body": "{corrupt-body}",
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_action_receipt_no_body():
    event = {
        "rawPath": "/api/action/receipt",
        "requestContext": {"http": {"method": "POST"}},
        "body": None,
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_action_reset():
    event = {
        "rawPath": "/api/action/reset",
        "requestContext": {"http": {"method": "POST"}},
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"
    assert "state" in res
    assert res["state"]["household_name"] == "Athens Apartment 4B (Urban Household)"


def test_lambda_handler_api_action_utility_dispute():
    body = json.dumps({
        "provider": "Stadtwerke Munich",
        "excess_cents": 5400,
        "legal_basis": "AVBWasserV § 18",
    })
    event = {
        "rawPath": "/api/action/utility_dispute",
        "requestContext": {"http": {"method": "POST"}},
        "body": body,
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"
    assert res["result"]["status"] == "disputed"


def test_lambda_handler_api_action_utility_dispute_invalid_json():
    event = {
        "rawPath": "/action/utility_dispute",
        "requestContext": {"http": {"method": "POST"}},
        "body": "{bad-json}",
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_action_utility_dispute_no_body():
    event = {
        "rawPath": "/api/action/utility_dispute",
        "requestContext": {"http": {"method": "POST"}},
        "body": None,
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"


def test_lambda_handler_api_receipt_scan():
    event = {
        "rawPath": "/api/receipt/scan",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({"image_base64": "SUtFQSBEZXV0c2NobGFuZA==", "mime_type": "image/png"}),
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"
    assert "IKEA" in res["extraction"]["merchant"]


def test_lambda_handler_api_ingest_sync():
    event = {
        "rawPath": "/api/ingest/sync",
        "requestContext": {"http": {"method": "POST"}},
        "body": "{}",
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["status"] == "success"
    assert res["ingest_result"]["invoices_matched"] == 14


def test_lambda_handler_api_simulation_mcts():
    event = {
        "rawPath": "/api/simulation/mcts",
        "requestContext": {"http": {"method": "GET"}},
    }
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    res = json.loads(resp["body"])
    assert res["iterations"] == 500
    assert len(res["actions"]) == 4
    assert res["optimal_action"] is not None



