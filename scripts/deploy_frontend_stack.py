"""Deploy CloudFront and S3 frontend stack for Hestia in eu-west-1."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from infra.frontend_stack import template as frontend_tmpl  # noqa: E402

BUILD_DIR = ROOT / "build"
REGION = "eu-west-1"
STACK_NAME = "hestia-frontend"
API_DOMAIN = "5lxo2qd7ee.execute-api.eu-west-1.amazonaws.com"
GITHUB_PREFIX = "repo:upgradedev@25751981/hestia-aws@1366118570"


def deploy_frontend():
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    tmpl_path = BUILD_DIR / "hestia-frontend-stack.json"
    tmpl = frontend_tmpl("hestia", "upgradedev/hestia-aws", API_DOMAIN)
    tmpl_path.write_text(json.dumps(tmpl, indent=2))
    print(f"Rendered CloudFormation template to {tmpl_path}")

    print(f"Deploying {STACK_NAME} in {REGION}...")
    subprocess.run([
        "aws", "cloudformation", "deploy",
        "--template-file", str(tmpl_path),
        "--stack-name", STACK_NAME,
        "--region", REGION,
        "--capabilities", "CAPABILITY_NAMED_IAM",
        "--parameter-overrides",
        f"GitHubSubjectPrefix={GITHUB_PREFIX}",
        f"ApiDomain={API_DOMAIN}",
        "--no-fail-on-empty-changeset",
        "--no-cli-pager"
    ], check=True)

    desc = subprocess.run([
        "aws", "cloudformation", "describe-stacks",
        "--stack-name", STACK_NAME,
        "--region", REGION,
        "--query", "Stacks[0].Outputs",
        "--output", "json",
        "--no-cli-pager"
    ], check=True, capture_output=True, text=True)
    outputs = {item["OutputKey"]: item["OutputValue"] for item in json.loads(desc.stdout)}
    print("Frontend stack outputs:")
    for k, v in outputs.items():
        print(f"  {k}: {v}")

    return outputs


if __name__ == "__main__":
    deploy_frontend()
