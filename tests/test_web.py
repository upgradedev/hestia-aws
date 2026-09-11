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
