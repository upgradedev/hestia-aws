"""Regression tests for Hestia frontend and API hosting templates."""
from __future__ import annotations

import unittest

try:
    from infra.frontend_stack import (
        DISABLED,
        EXCEPT_HOST,
        OPTIMIZED,
    )
    from infra.frontend_stack import template as frontend_tmpl
    from infra.hestia_api_stack import template as api_tmpl
except ImportError:
    from frontend_stack import (
        DISABLED,
        EXCEPT_HOST,
        OPTIMIZED,
    )
    from frontend_stack import template as frontend_tmpl
    from hestia_api_stack import template as api_tmpl



class FrontendHostingTests(unittest.TestCase):
    def test_hestia_frontend_template_structure(self):
        tmpl = frontend_tmpl("hestia", "upgradedev/hestia-aws", "api.example.com")
        resources = tmpl["Resources"]

        # Site bucket
        site = resources["Site"]["Properties"]
        self.assertTrue(site["BucketName"]["Fn::Sub"].startswith("hestia-web-"))
        self.assertTrue(all(site["PublicAccessBlockConfiguration"].values()))

        # Origin Access Control
        oac = resources["Access"]["Properties"]["OriginAccessControlConfig"]
        self.assertEqual(oac["SigningBehavior"], "always")
        self.assertEqual(oac["SigningProtocol"], "sigv4")

        # Distribution config
        dist_config = resources["Distribution"]["Properties"]["DistributionConfig"]
        self.assertEqual(dist_config["DefaultRootObject"], "index.html")

        # Origins: site and api
        origins = dist_config["Origins"]
        self.assertEqual(len(origins), 2)
        site_origin = next(o for o in origins if o["Id"] == "site")
        api_origin = next(o for o in origins if o["Id"] == "api")
        self.assertIn("Access", site_origin["OriginAccessControlId"]["Ref"])
        self.assertEqual(api_origin["DomainName"]["Ref"], "ApiDomain")

        # Cache behaviors: api routes never cached
        behaviors = dist_config["CacheBehaviors"]
        api_behaviors = [b for b in behaviors if b["TargetOriginId"] == "api"]
        self.assertTrue(any(b["PathPattern"] == "/action/*" for b in api_behaviors))
        self.assertTrue(any(b["PathPattern"] == "/healthz" for b in api_behaviors))
        for b in api_behaviors:
            self.assertEqual(b["CachePolicyId"], DISABLED)
            self.assertEqual(b["OriginRequestPolicyId"], EXCEPT_HOST)

        # Assets behavior: optimized caching
        assets_b = next(b for b in behaviors if b["PathPattern"] == "/assets/*")
        self.assertEqual(assets_b["CachePolicyId"], OPTIMIZED)

        # OIDC release role
        role = resources["ReleaseRole"]["Properties"]
        self.assertEqual(role["RoleName"], "hestia-frontend-release")
        trust = role["AssumeRolePolicyDocument"]["Statement"][0]["Condition"]["StringEquals"]
        sub_claim = trust["token.actions.githubusercontent.com:sub"]["Fn::Sub"]
        self.assertIn("ref:refs/heads/main", sub_claim)

    def test_public_demo_has_no_provider_or_legacy_state_authority(self):
        tmpl = api_tmpl()
        resources = tmpl["Resources"]
        statements = resources["Role"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
        object_policy = statements[0]
        self.assertEqual(object_policy["Action"], ["s3:GetObject", "s3:PutObject"])
        self.assertEqual(object_policy["Resource"], {"Fn::Sub": "${State.Arn}/demo/workspaces/*"})
        deny = next(s for s in statements if s["Effect"] == "Deny")
        self.assertIn("ses:*", deny["Action"])
        self.assertNotIn("bedrock:*", deny["Action"])
        self.assertIn("s3:DeleteObject", deny["Action"])
        bedrock = next(s for s in statements if "bedrock:InvokeModel" in s.get("Action", []))
        self.assertEqual(bedrock["Effect"], "Allow")
        self.assertEqual(len(bedrock["Resource"]), 2)
        self.assertIn("inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0",
                      bedrock["Resource"][0]["Fn::Sub"])
        self.assertEqual(bedrock["Resource"][1],
                         "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0")
        self.assertNotIn("bedrock:*", bedrock["Action"])
        env = resources["Function"]["Properties"]["Environment"]["Variables"]
        self.assertIn("resolve:secretsmanager", env["HESTIA_DEMO_SECRET"]["Fn::Sub"])
        self.assertNotIn("Default", tmpl["Parameters"]["DemoSecretArn"])
        self.assertEqual(resources["Function"]["Properties"]["ReservedConcurrentExecutions"], 2)
        reader = resources["ReaderRole"]["Properties"]["Policies"][0]["PolicyDocument"]
        reader_deny = next(s for s in reader["Statement"] if s["Effect"] == "Deny")
        self.assertIn("s3:PutObject", reader_deny["Action"])
        self.assertIn("bedrock:*", reader_deny["Action"])
        self.assertEqual(env["HESTIA_LIVE_MODEL"], "bedrock")
        self.assertEqual(env["HESTIA_AGENT_SESSION_CAP"], "3")
        self.assertEqual(env["HESTIA_AGENT_DAILY_CAP"], "200")
        self.assertEqual(resources["ReaderFunction"]["Properties"]["MemorySize"], 512)
        self.assertEqual(resources["Function"]["Properties"]["MemorySize"], 1024)
        self.assertEqual(resources["Route"]["Properties"]["Target"],
                         {"Fn::Sub": "integrations/${ReaderIntegration}"})
        writes = [r["Properties"] for name, r in resources.items() if name.startswith("WriteRoute")]
        self.assertTrue(all(r["RouteKey"].startswith("POST ") for r in writes))
        self.assertTrue(any(r["RouteKey"] == "POST /action/claim" for r in writes))

    def test_conditional_write_sdk_contract(self):
        from botocore.session import get_session

        operation = get_session().get_service_model("s3").operation_model("PutObject")
        self.assertIn("IfMatch", operation.input_shape.members)
        self.assertIn("IfNoneMatch", operation.input_shape.members)

    def test_hestia_api_template_structure(self):
        tmpl = api_tmpl()
        resources = tmpl["Resources"]

        # State bucket
        state = resources["State"]["Properties"]
        self.assertTrue(state["BucketName"]["Fn::Sub"].startswith("hestia-afh-state-"))
        self.assertTrue(all(state["PublicAccessBlockConfiguration"].values()))

        # Lambda function
        fn = resources["Function"]["Properties"]
        self.assertEqual(fn["FunctionName"], "hestia-afh-api")
        self.assertEqual(fn["Handler"], "hestia.app.web.lambda_handler")
        self.assertEqual(fn["Timeout"], 28)

        # HTTP API
        api = resources["Api"]["Properties"]
        self.assertEqual(api["ProtocolType"], "HTTP")
        self.assertEqual(resources["Route"]["Properties"]["RouteKey"], "$default")


if __name__ == "__main__":
    unittest.main()
