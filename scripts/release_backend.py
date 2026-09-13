# ruff: noqa: E501  (operator runbook; long CLI argument lines are deliberate)
"""Owner-approved backend release from the exact CI artifact, in reviewable steps.

Runs on the operator host with existing AWS credentials. Never packages locally: it downloads
the `backend-runtime-candidate` artifact of the main-branch CI run for the exact commit,
verifies SHA256SUMS, uploads the ZIP once to the release key, prepares a change set, prints
the change set for review, and executes it only with `--execute` (automatic rollback stays
enabled). Every step is idempotent and prints what it verified.

Usage:
  python scripts/release_backend.py --sha <40-hex> --run-id <ci run id> prepare
  python scripts/release_backend.py --sha <40-hex> --run-id <ci run id> --execute execute
  python scripts/release_backend.py --sha <40-hex> verify
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import time

REGION = "eu-west-1"
ACCOUNT = "308857099262"
STACK = "hestia-afh-api"
DEPLOY_BUCKET = f"hestia-afh-deploy-{ACCOUNT}-{REGION}"
REPO = "upgradedev/hestia-aws"
FUNCTIONS = ("hestia-afh-api", "hestia-afh-reader")


def run(args: list[str], check: bool = True) -> str:
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8")
    if check and result.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(args)}\n{result.stderr.strip()[-2000:]}")
    return result.stdout


def aws(*args: str, check: bool = True) -> str:
    return run(["aws", *args, "--region", REGION, "--no-cli-pager"], check=check)


def download_artifact(sha: str, run_id: str, workdir: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    info = json.loads(run(["gh", "run", "view", run_id, "--repo", REPO, "--json", "headSha,conclusion,headBranch"]))
    if info["headSha"] != sha or info["conclusion"] != "success" or info["headBranch"] != "main":
        raise SystemExit(f"run {run_id} is not a successful main run for {sha}: {info}")
    run(["gh", "run", "download", run_id, "--repo", REPO, "--name", "backend-runtime-candidate", "--dir", str(workdir)])
    zip_path = workdir / "hestia-api.zip"
    template = workdir / "hestia-api-stack.json"
    sums = (workdir / "SHA256SUMS").read_text(encoding="utf-8")
    for path in (zip_path, template):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if f"{digest}  build/{path.name}" not in sums and f"{digest}  {path.name}" not in sums:
            raise SystemExit(f"checksum mismatch for {path.name}: {digest}\n{sums}")
        print(f"verified {path.name} sha256 {digest}")
    return zip_path, template


def upload_once(sha: str, zip_path: pathlib.Path) -> str:
    key = f"releases/{sha}/hestia-api.zip"
    existing = aws("s3api", "head-object", "--bucket", DEPLOY_BUCKET, "--key", key, check=False)
    local = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    if existing.strip():
        print(f"release key already exists: s3://{DEPLOY_BUCKET}/{key}; verifying bytes")
        with tempfile.TemporaryDirectory() as tmp:
            target = pathlib.Path(tmp) / "remote.zip"
            aws("s3api", "get-object", "--bucket", DEPLOY_BUCKET, "--key", key, str(target))
            remote = hashlib.sha256(target.read_bytes()).hexdigest()
        if remote != local:
            raise SystemExit("existing release key differs from the CI artifact; refusing to overwrite")
        return key
    # The host CLI predates conditional and checksum flags: upload once, then read back and compare.
    aws("s3api", "put-object", "--bucket", DEPLOY_BUCKET, "--key", key, "--body", str(zip_path))
    with tempfile.TemporaryDirectory() as tmp:
        target = pathlib.Path(tmp) / "uploaded.zip"
        aws("s3api", "get-object", "--bucket", DEPLOY_BUCKET, "--key", key, str(target))
        remote = hashlib.sha256(target.read_bytes()).hexdigest()
    if remote != local:
        raise SystemExit("uploaded object does not match the CI artifact")
    print(f"uploaded s3://{DEPLOY_BUCKET}/{key} sha256 {local} (read back and verified)")
    return key


def current_parameters() -> dict[str, str]:
    stacks = json.loads(aws("cloudformation", "describe-stacks", "--stack-name", STACK, "--output", "json"))
    return {p["ParameterKey"]: p["ParameterValue"] for p in stacks["Stacks"][0]["Parameters"]}


def prepare(sha: str, key: str, template: pathlib.Path) -> str:
    params = current_parameters()
    name = f"hestia-agent-{sha[:8]}-{time.strftime('%Y%m%d%H%M')}"
    aws("cloudformation", "deploy", "--template-file", str(template), "--stack-name", STACK,
        "--capabilities", "CAPABILITY_NAMED_IAM", "--no-execute-changeset", "--no-fail-on-empty-changeset",
        "--parameter-overrides", f"CodeBucket={DEPLOY_BUCKET}", f"CodeKey={key}", f"CommitSha={sha}",
        f"DemoSecretArn={params['DemoSecretArn']}")
    sets = json.loads(aws("cloudformation", "list-change-sets", "--stack-name", STACK, "--output", "json"))
    latest = sorted(sets["Summaries"], key=lambda s: s["CreationTime"])[-1]
    if latest["Status"] != "CREATE_COMPLETE":
        raise SystemExit(f"change set not ready: {latest}")
    detail = json.loads(aws("cloudformation", "describe-change-set", "--change-set-name", latest["ChangeSetId"], "--output", "json"))
    print(f"change set {latest['ChangeSetName']} ({name} requested) status {detail['Status']}")
    for change in detail["Changes"]:
        rc = change["ResourceChange"]
        print(f"  {rc['Action']:8} {rc['LogicalResourceId']:22} {rc['ResourceType']:38} replacement={rc.get('Replacement')}")
    dangerous = [c for c in detail["Changes"] if c["ResourceChange"]["Action"] == "Remove"
                 or c["ResourceChange"].get("Replacement") == "True"]
    if dangerous:
        raise SystemExit(f"refusing: change set removes or replaces resources: {dangerous}")
    return latest["ChangeSetId"]


def execute(change_set_id: str) -> None:
    aws("cloudformation", "execute-change-set", "--change-set-name", change_set_id)
    print("executing with automatic rollback enabled; waiting for stack-update-complete")
    aws("cloudformation", "wait", "stack-update-complete", "--stack-name", STACK)
    status = json.loads(aws("cloudformation", "describe-stacks", "--stack-name", STACK, "--output", "json"))["Stacks"][0]
    print(f"stack {status['StackStatus']} at {status.get('LastUpdatedTime')}")


def verify(sha: str, zip_path: pathlib.Path | None) -> None:
    expected = base64.b64encode(hashlib.sha256(zip_path.read_bytes()).digest()).decode() if zip_path else None
    for function in FUNCTIONS:
        cfg = json.loads(aws("lambda", "get-function-configuration", "--function-name", function, "--output", "json"))
        env = cfg.get("Environment", {}).get("Variables", {})
        line = f"{function}: CodeSha256={cfg['CodeSha256']} commit={env.get('HESTIA_COMMIT_SHA')} live_model={env.get('HESTIA_LIVE_MODEL')} mem={cfg['MemorySize']} state={cfg.get('State')} update={cfg.get('LastUpdateStatus')}"
        print(line)
        if env.get("HESTIA_COMMIT_SHA") != sha:
            raise SystemExit(f"{function} does not carry commit {sha}")
        if expected and cfg["CodeSha256"] != expected:
            raise SystemExit(f"{function} code hash {cfg['CodeSha256']} differs from artifact {expected}")
    health = json.loads(run(["curl", "-s", "https://drusjukc9d4oc.cloudfront.net/healthz"]))
    print("healthz:", json.dumps({k: health.get(k) for k in ("commit", "live_model", "model_id", "live_send", "mode")}))
    if health.get("commit") != sha or health.get("live_send") is not False:
        raise SystemExit("public health does not match the released commit or live_send is not false")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--run-id")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("step", choices=["prepare", "execute", "verify"])
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        raise SystemExit("a full 40-hex commit is required")
    workdir = pathlib.Path(tempfile.gettempdir()) / f"hestia-release-{args.sha}"
    workdir.mkdir(exist_ok=True)
    if args.step == "verify":
        zip_path = workdir / "hestia-api.zip"
        verify(args.sha, zip_path if zip_path.exists() else None)
        return
    if not args.run_id:
        raise SystemExit("--run-id of the successful main CI run is required")
    zip_path, template = download_artifact(args.sha, args.run_id, workdir)
    key = upload_once(args.sha, zip_path)
    change_set = prepare(args.sha, key, template)
    (workdir / "change-set-id.txt").write_text(change_set, encoding="utf-8")
    if args.step == "execute":
        if not args.execute:
            raise SystemExit("pass --execute to run the reviewed change set")
        execute(change_set)
        verify(args.sha, zip_path)


if __name__ == "__main__":
    sys.exit(main())
