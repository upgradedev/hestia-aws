"""Prepare an approved API change set in CI; never execute a production cutover."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from infra.hestia_api_stack import template as api_tmpl  # noqa: E402

BUILD_DIR = ROOT / "build"
PKG_DIR = BUILD_DIR / "pkg"
ZIP_PATH = BUILD_DIR / "hestia-api.zip"
REGION = "eu-west-1"
ACCOUNT = "308857099262"
DEPLOY_BUCKET = f"hestia-afh-deploy-{ACCOUNT}-{REGION}"
STACK_NAME = "hestia-afh-api"
SDK_VERSION = "1.43.93"
STRANDS_VERSION = "1.53.0"


def validate_release(approved_commit: str, secret_arn: str, actual_commit: str) -> None:
    if os.environ.get("CI") != "true":
        raise ValueError("Packaging and change-set preparation are CI-only")
    if not re.fullmatch(r"[0-9a-f]{40}", approved_commit) or approved_commit != actual_commit:
        raise ValueError("The complete approved commit must match the checked-out revision")
    if not re.fullmatch(
        rf"arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:[A-Za-z0-9/_+=.@-]+",
        secret_arn,
    ):
        raise ValueError("A dedicated demo secret ARN in the deployment account is required")


def get_git_sha() -> str:
    res = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True
    )
    return res.stdout.strip()


def package():
    if os.environ.get("CI") != "true":
        raise ValueError("Packaging is CI-only")
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    if PKG_DIR.exists():
        shutil.rmtree(PKG_DIR)
    PKG_DIR.mkdir(parents=True, exist_ok=True)

    # Copy src/hestia into PKG_DIR/hestia
    src_hestia = ROOT / "src" / "hestia"
    dest_hestia = PKG_DIR / "hestia"
    shutil.copytree(src_hestia, dest_hestia, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    # Bundle the tested storage SDK and the pinned Strands SDK so conditional writes
    # and the bounded review agent do not depend on the Lambda runtime's changing SDK.
    subprocess.run([
        sys.executable, "-m", "pip", "install", "--only-binary=:all:",
        "--target", str(PKG_DIR), f"boto3=={SDK_VERSION}", f"strands-agents=={STRANDS_VERSION}",
    ], check=True)
    subprocess.run([
        sys.executable, "-S", "-c",
        "import strands, strands.models; from strands import Agent, tool; "
        "from strands.models import BedrockModel; print('strands bundled')",
    ], check=True, env={**os.environ, "PYTHONPATH": str(PKG_DIR),
                       "AWS_EC2_METADATA_DISABLED": "true"})
    subprocess.run([
        sys.executable, "-c",
        "from botocore.session import Session; "
        "operation = Session().get_service_model('s3').operation_model('PutObject'); "
        "members = operation.input_shape.members; "
        "assert {'IfMatch', 'IfNoneMatch'} <= members.keys()",
    ], check=True, env={**os.environ, "PYTHONPATH": str(PKG_DIR),
                       "AWS_EC2_METADATA_DISABLED": "true"})

    # Create zip
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in PKG_DIR.rglob("*"):
            if file.is_file():
                arcname = file.relative_to(PKG_DIR).as_posix()
                zf.write(file, arcname)
    print(f"Created deployment package {ZIP_PATH} ({ZIP_PATH.stat().st_size} bytes)")


def deploy(approved_commit: str, demo_secret_arn: str):
    sha = get_git_sha()
    validate_release(approved_commit, demo_secret_arn, sha)
    print(f"Current commit SHA: {sha}")
    key = f"releases/{sha}/hestia-api.zip"

    # 1. Package
    package()

    # 2. Upload zip
    print(f"Uploading {ZIP_PATH} to s3://{DEPLOY_BUCKET}/{key}...")
    subprocess.run([
        "aws", "s3api", "put-object",
        "--bucket", DEPLOY_BUCKET,
        "--key", key,
        "--body", str(ZIP_PATH),
        "--region", REGION,
        "--no-cli-pager"
    ], check=True)

    # 3. Write template
    tmpl_path = BUILD_DIR / "hestia-api-stack.json"
    tmpl_path.write_text(json.dumps(api_tmpl(), indent=2))
    print(f"Rendered template {tmpl_path}")

    # 4. Prepare only. Applying this IAM/auth/storage change needs a separately
    # reviewed execution against the exact change-set ARN and matching frontend.
    print(f"Preparing CloudFormation change set for {STACK_NAME} in {REGION}...")
    subprocess.run([
        "aws", "cloudformation", "deploy",
        "--template-file", str(tmpl_path),
        "--stack-name", STACK_NAME,
        "--region", REGION,
        "--capabilities", "CAPABILITY_NAMED_IAM",
        "--parameter-overrides",
        f"CodeBucket={DEPLOY_BUCKET}",
        f"CodeKey={key}",
        f"CommitSha={sha}",
        f"DemoSecretArn={demo_secret_arn}",
        "--no-execute-changeset",
        "--no-fail-on-empty-changeset",
        "--no-cli-pager"
    ], check=True)

    # 5. Query outputs
    desc = subprocess.run([
        "aws", "cloudformation", "describe-stacks",
        "--stack-name", STACK_NAME,
        "--region", REGION,
        "--query", "Stacks[0].Outputs",
        "--output", "json",
        "--no-cli-pager"
    ], check=True, capture_output=True, text=True)
    outputs = {item["OutputKey"]: item["OutputValue"] for item in json.loads(desc.stdout)}
    print("Existing (unchanged) stack outputs; the prepared change set has NOT been executed:")
    for k, v in outputs.items():
        print(f"  {k}: {v}")

    return outputs


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approved-commit", required=True)
    parser.add_argument("--demo-secret-arn", required=True)
    args = parser.parse_args()
    deploy(args.approved_commit, args.demo_secret_arn)
