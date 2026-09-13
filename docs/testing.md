# Testing and verification

How Hestia is tested, what each check proves, and what has not been run. The release runbook and the deployed revision are in [deployment.md](deployment.md).

## Run the checks locally

Python 3.11:

```bash
pip install -e ".[dev]"
python -m ruff check src tests infra
python tools/prose_gate.py
python -m pytest --cov=hestia --cov-branch tests/ infra/
```

The browser suites need Node 22 and the CI harness. `scripts/ci_api_server.py` serves the real Lambda handler on loopback with in-memory state and refuses to start unless `CI=true`; the Vite dev server proxies `/api`, `/action` and `/healthz` to it.

```bash
cd frontend && npm ci && npx playwright install chromium && cd ..
CI=true python scripts/ci_api_server.py --port 8000 &
npm --prefix frontend run dev -- --port 3000 --strictPort &
npm --prefix frontend run test:e2e
```

## What CI runs

| Workflow | Trigger | What it runs |
|---|---|---|
| `ci.yml` | every pull request; pushes to `main`, `build/**` and `codex/**`; manual | ruff, the prose gate, pytest over `tests/` and `infra/` with at least 85% branch coverage, the synthetic measurement and ablation, the Lambda package with the pinned SDKs and a health call inside it, and the rendered CloudFormation template with checksums |
| `frontend-ci.yml` | every pull request; pushes to `main` and `codex/**`; manual; reused by the deploy workflow | TypeScript and Vite build, the Playwright suites against the CI harness, the acceptance spec calibrated against the same harness, ruff and the Python suite without a coverage gate |
| `frontend-deploy.yml` | pushes to `main` (verification only); manual dispatch on `main` to release | see [deployment.md](deployment.md) |
| `production-acceptance.yml` | manual dispatch on `main` | the acceptance spec against the live URL, see [deployment.md](deployment.md) |

Retained artifacts: `backend-p0-evidence` (coverage XML, JUnit, synthetic measurement, ablation, verification context), `backend-runtime-candidate` (Lambda zip, template, `SHA256SUMS`), `frontend-p0-evidence` (Playwright and acceptance reports), `frontend-dist`, `aws-frontend-release` and `aws-p0-acceptance-<phase>`.

A workflow file is not a result. Read the run for the revision you care about; test counts and the coverage figure come from the run, not from this page.

## Suites

Python, under `tests/` plus `infra/test_frontend_hosting.py`:

| File | What it covers |
|---|---|
| `tests/test_web.py` | the Lambda API contract: read-only preview, anonymous denial, session isolation, exact approval, tamper, replay and limits |
| `tests/test_storage.py` | S3 and in-memory conditional persistence, isolation, fail-closed reads and writes |
| `tests/test_intake.py` | stage, review, consent and commit of imported facts; replay, isolation and failure contracts |
| `tests/test_registry_intake.py` | household appliances and repairs, and the reading agent route with its limits |
| `tests/test_household_agent.py` | the review agent, its guard, fallback, counters and health report |
| `tests/test_case_api.py`, `tests/test_case_lifecycle.py` | the saved case: protected updates, statuses and evidence-bound outcomes |
| `tests/test_legal_guards.py` | warranty timing, currency, missing and contradictory facts, cautious wording, exact-preview approval |
| `tests/test_warranties.py`, `tests/test_subscriptions.py`, `tests/test_completeness.py`, `tests/test_tools.py` | the deterministic household rules and the agent tools |
| `tests/test_ocr.py` | document bytes cannot become canned facts; PNG and JSON bounds |
| `tests/test_claims_inventory.py` | claims in the README, the docs, the video narration and four UI copy files |
| `tests/test_measurement_truthfulness.py` | the synthetic measurement and ablation, and refusal to overwrite the historical files |
| `tests/test_release_guard.py` | the guards in the backend packager, the backend health gate and the frontend smoke probe |
| `tests/test_ses_dispatcher.py` | an offline email transport module; the dispatch route answers 403 and IAM denies SES |
| `tests/test_sentinel.py`, `tests/test_mcts.py` | earlier coordinator and negotiation-illustration modules kept in the source |
| `infra/test_frontend_hosting.py` | both CloudFormation templates and the conditional-write SDK contract |

Browser, under `frontend/tests/` (Playwright, Chromium):

| Spec | What it covers |
|---|---|
| `p0-session.spec.ts` | isolated session, exact server preview, simulated approval and the negative gates |
| `intake.spec.ts` | intake journeys: correction, consent, partial batch, invalid bytes, lost response, phone width |
| `registry.spec.ts` | an appliance with links, its repair and notice, pasting without a model, and a proposal served from a fixture |
| `agent-review.spec.ts` | the review card in tools-only mode, and live-model presentations served from fixtures |
| `case-lifecycle.spec.ts` | the saved case journey through replies, evidence and outcomes |
| `claims-inventory.spec.ts` | the About page modes and its read-only console |
| `snapshot-consistency.spec.ts`, `display-facts.spec.ts` | presentation fixtures and pure display functions |

Some browser cases serve responses from route fixtures because the CI harness has no model: the snapshot tests, the live-model briefings, the model proposal and a few fabricated bodies in `p0-session.spec.ts`. They test presentation, not backend writes. Intake and case journeys use the CI API and persisted isolated state.

<a id="integration-testbook"></a>

## Integration testbook

Each requirement maps to its regression evidence. CI runs these as part of the full suites. Automated checks do not complete deployed acceptance, legal review or independent human UAT (NOT_RUN).

| Requirement | Targeted regression evidence | Integration receipt |
|---|---|---|
| HE5 document bytes and manual correction | `tests/test_ocr.py`; `tests/test_intake.py::test_json_correction_exact_review_commit_and_reload_retain_real_input_provenance`; `frontend/tests/intake.spec.ts` JSON correction and reload journey | Backend JUnit plus browser HTTP state assertions; malformed bytes must fail without a draft |
| HE6 exact import, partial rows, dedupe and isolation | `tests/test_intake.py` partial-batch, stale digest, consent, cross-session, concurrent-write and lost-response tests; matching `frontend/tests/intake.spec.ts` journeys | Valid rows only after explicit subset consent; one persisted result after retry; no provider call |
| HE7 separate warranty facts and cautious wording | `tests/test_legal_guards.py` delivery and leap-day, statutory versus commercial, missing or contradictory facts, currency, draft tamper and redress tests | JUnit proves technical guards, not legal eligibility |
| HE8 coherent facts and unknown versus zero | `tests/test_intake.py::test_canonical_metric_projection_ignores_stale_summary_and_uses_inclusive_threshold`; `frontend/tests/display-facts.spec.ts`; `frontend/tests/snapshot-consistency.spec.ts` | Backend record projection plus presentation fixtures with changed amounts, reload and keyboard navigation; real recovery stays zero |
| HE9 complete saved case journey | `tests/test_case_api.py`, `tests/test_case_lifecycle.py`, `frontend/tests/case-lifecycle.spec.ts` | CI HTTP journey: review, exact approval, follow-up, partial, rejected and resolved outcomes, replay |
| HE10 truthful claims and read-only console | `tests/test_claims_inventory.py`; `frontend/tests/claims-inventory.spec.ts` | Injected false copy must fail the Python guard; the browser spec drives the About page and its GET-only console |
| HE10 executed synthetic measurement, not financial outcomes | `tests/test_measurement_truthfulness.py`; the measurement steps of `.github/workflows/ci.yml` | The CI artifact holds executed measurement and ablation JSON with fixture fingerprints and a verification context; altered fixtures and overwrite attempts must fail |
| HE14 bounded Strands review | `tests/test_household_agent.py`; `frontend/tests/agent-review.spec.ts` | Tools-only mode, guard, fallback on error and timeout, conditional daily counter, caps, health; no live Bedrock call in CI |
| HE18 household registry | `tests/test_registry_intake.py` appliance and repair tests; `frontend/tests/registry.spec.ts`; the acceptance case "deployed registry" | An appliance with links reaches the notice flow after a reported repair; a second repair is refused while one is open; reset keeps it |
| HE19 reading pasted text | `tests/test_registry_intake.py` reading tests; `frontend/tests/registry.spec.ts` paste journeys | Fails closed without a model, past the cap and on a model failure; identical text replays; nothing is saved before commit |
| Release guards | `tests/test_release_guard.py`; `infra/test_frontend_hosting.py` | Change-set-only backend packaging, backend health gate, smoke probe order and anonymous denial |
| Preserved P0 authority and deployment contract | `frontend/tests/p0-session.spec.ts`, Python authority and storage tests, `frontend/acceptance/p0-live.spec.ts` | Negative gates and exact-content acceptance calibration; calibration is not an AWS deployment receipt |

## Synthetic measurements

`tools/measure.py` runs six detectors on a fixed synthetic fixture against pinned expected values, and `tools/ablate.py` removes one detector at a time on the same facts. Both write new files only and refuse the two historical paths. The historical `docs/measurement.json` and `docs/ablation.json` remain unchanged and were not regenerated since commit 2754c47. Their recovery, exposure and delta labels describe synthetic amounts and rule assumptions, not real impact, seller confirmation or avoided household spending. `tests/test_measurement_truthfulness.py` checks the refusal; no test pins their content.

Briefing quality, extraction accuracy, hallucination rate, cost per review, latency, time saved and merchant settlement rates are unmeasured. A future measurement must name its command, input sample, exact SHA, UTC time and retained output.

## Not run

| Check | Status |
|---|---|
| Independent human UAT | NOT_RUN: needs a named human protocol and an attestation; browser automation is not a substitute |
| Live Bedrock call in CI | Not run in CI; the production acceptance run calls the deployed model, see [deployment.md](deployment.md) |
| Legal review | Not run; see [assurance.md](assurance.md) |
