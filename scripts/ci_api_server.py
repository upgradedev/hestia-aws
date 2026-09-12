"""CI-only HTTP bridge to the real Lambda handler, with isolated synthetic storage.

Do not deploy this development server. It binds loopback, holds no AWS credentials,
and exercises the same HTTP/auth/approval contracts as Lambda. No routes are mocked.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from hestia.adapters.storage import S3HouseholdStore
from hestia.app import api
from hestia.app.web import lambda_handler


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Never log bearer tokens or request bodies.
        return

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def do_OPTIONS(self):
        self.handle_request()

    def handle_request(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 65536:
            self.send_error(413)
            return
        event = {
            "rawPath": self.path.split("?")[0],
            "requestContext": {"http": {"method": self.command}},
            "headers": dict(self.headers.items()),
        }
        if length:
            event["body"] = self.rfile.read(length).decode("utf-8")
        result = lambda_handler(event, None)
        payload = result["body"].encode("utf-8")
        self.send_response(result["statusCode"])
        for name, value in result["headers"].items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if os.environ.get("CI") != "true":
        raise SystemExit("This bridge is CI-only; no local build/test runs.")
    os.environ["HESTIA_DEMO_SECRET"] = secrets.token_hex(32)
    os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
    os.environ.pop("HESTIA_STATE_BUCKET", None)
    api.store_for = lambda scope: S3HouseholdStore(bucket_name="", workspace_id=scope)
    print(json.dumps({"mode": "isolated-ci", "port": args.port}), flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
