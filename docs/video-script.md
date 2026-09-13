# Hestia demo video: script and production notes

Target length: about 150 seconds of narration plus a 0.65 second tail per beat, well under the 5 minute hackathon limit. The seven beats below are the seven segments of `video/narration.json`, in the order `web/video/capture-production.mjs` enforces: hook, surface, trigger, live, sponsor, evidence, close. Each caption below matches that segment's `captionText` exactly and carries the exact figures; `speechText` spells acronyms and numbers for the voice engine. `python video/generate-narration.py` prints the measured total and refuses a narration outside 90 to 174 seconds, tails included.

Record only when the live URL serves the released commit: `GET https://drusjukc9d4oc.cloudfront.net/healthz` must report that commit and `live_model` `true`. The capture does not check this; it only adds `?release=<sha>` to the URL and copies the SHA into its receipt, so read `/healthz` yourself first. If `live_model` is `false`, the review runs the four tools deterministically and beat 3 would show the fallback chip instead of the live model chip. Every frame is the deployed product; nothing is mocked or animated.

## Beats

### 1. hook (about 20 s): the landing page

Screen: the landing page. H1 "Your receipt is the start. Keep the whole case together." and the sample repair card "The washing machine broke. The repair cost €185.00."

Caption: Elena Georgiou's washing machine failed 22 months after purchase, and the repair cost 185 EUR. The receipt, the repair invoice and the seller's address live in three places, and nobody keeps the case together. Hestia starts from that receipt and asks Elena to approve the exact notice; nothing is sent.

### 2. surface (about 21 s): one click, then Home

Screen: click **Start with the sample household** (`data-testid="launch-cockpit"`), which creates the 30-minute private copy. The capture then waits for the review card and does not scroll, so Home is recorded from the top: the Start here block with its three doors (Report a repair, Add an appliance you own, Paste a receipt or order email) above the review card. The decisions queue the caption names sits below them; to keep it on screen while the caption names it, add a scroll to this beat in `web/video/capture-production.mjs`.

Caption: One click on the landing page opens a private demo space with a fictional Athens household: no account, no login, a 30-minute limit. Home starts with three ways to add your own records, then shows what needs a decision this week: the recorded repair, a trial ending, a price change from 9.99 to 13.99 EUR, and a receipt missing for 85.50 EUR.

### 3. trigger (about 23 s): the Strands agent reads

Screen: click **Ask Hestia to review this household** (`data-testid="agent-review"`) and wait for the mode chips (`data-testid="agent-mode"`): Live model via Strands Agents, the model id, the framework version, tokens and seconds, and "2 of 3 model reviews left in this space". The three-section briefing renders (What I checked, Decisions waiting for you, Suggested next step). Open **Tool trace: N calls** (`data-testid="agent-trace"`) to show each call and its output. The live model is asked to use each tool once; only the deterministic fallback is guaranteed to run all four.

Caption: Ask Hestia to review this household, and a Strands agent on Amazon Bedrock reads the records through four tools: repair evidence, subscriptions, receipts and utilities, and the case timeline. It writes a short briefing that points at decisions; a guard withholds the whole briefing if it claims an entitlement or states an amount the tools did not return. The tool trace stays visible.

### 4. live (about 22 s): the exact notice, approved and recorded

Screen: click **Review the exact notice** (`data-testid="review-claim"`) and wait for the server notice (`data-testid="server-notice"`) with the claimant, the seller and the seller's email address, the subject and the recorded repair cost. Click **Approve this notice (recorded, not sent)** (`data-testid="approve-claim"`) and wait for "Simulated approval recorded. No email sent and no reimbursement recorded." (`data-testid="claim-result"`).

Caption: Then Hestia stops. The notice to Kotsovolos Megastore is prepared on the server from the recorded facts: recipient, subject, the 185 EUR repair cost and the exact text. Elena reads it and approves it with a single-use token bound to that exact draft. The approval is recorded as a simulation. No email is sent.

### 5. sponsor (about 23 s): the saved case, and what AWS carries

Screen: click **Continue to the saved case and next step** (`data-testid="open-persisted-case"`) and wait for the status chip (`data-testid="case-status"`), which reads Authorized; the capture waits for the chip, not for its text. The timeline shows the Draft, In review and Authorized entries, each with its note, source label, evidence reference and time, and the case update form sits in the right-hand column beside it.

Caption: The saved case now carries the draft, the approval and the next step; every reply, deadline or outcome Elena records later stays on that timeline. Remove AWS and the product stops: the Strands Agents SDK runs Claude Haiku 4.5 through Amazon Bedrock inside Lambda, and Amazon S3 conditional writes keep every case revision consistent.

### 6. evidence (about 24 s): the About page

Screen: click the **About** navigation button. "One journey, five steps", then the four mode cards (Inputs, Agent, Rules, Storage and sending) with their on and off chips. Click **Send request** on the read-only console so `GET /healthz` returns the live JSON with `live_model`, `model_id` and the agent limits.

Caption: Every claim is checkable without asking us. The About page lists what runs and what does not: bank feeds, mailbox sync, receipt OCR, Guardrails, AgentCore and email sending are not connected. Its read-only console returns the live health check with the model limits: 3 reviews and 3 text readings per demo space, 200 a day shared by both. Independent human testing is reported as not run.

### 7. close (about 17 s): the sentence and the URL

Screen: click the Hestia mark to return to the landing page; the H1 and the button "Continue your household case" are on screen. The recording shows the page only, so the URL reaches the viewer through the narration and the burned caption.

Caption: Hestia reads a household's receipts, subscriptions and repair records with Strands agents on Amazon Bedrock, and the household approves the exact text of every notice; the approval is recorded and nothing is sent. Open source under the MIT license, running on AWS, no login. Try it now at drusjukc9d4oc.cloudfront.net.

## What the video must not say

No live email, no OCR, no AgentCore, no Guardrails, no coverage percentage, no test count, no cost, no savings, no legal entitlement. Every figure spoken above is a recorded synthetic fact (22 months between the recorded purchase and repair dates, 185 EUR, 9.99 to 13.99 EUR, 85.50 EUR) or a configured limit (30 minutes, 3 reviews and 3 text readings per space, 200 a day shared by both). `tools/prose_gate.py` scans `video/narration.json` for em dashes and stale claims, and `tests/test_claims_inventory.py` scans it for unsupported claims and checks the seven beat ids in order.

## Production pipeline

1. `python video/generate-narration.py` with `ELEVENLABS_API_KEY` set and `HESTIA_VIDEO_ROOT` pointing at a work directory. Always run this step first. It synthesizes one MP3 per beat (cached per beat by text and voice), measures each with ffprobe, writes `narration/timing.json` and `narration/captions.en.srt`, and prints the total. Spoken text is `speechText`; captions come from `captionText`. Neither later step checks that the timing, audio or captions match the current `video/narration.json`.
2. `node web/video/capture-production.mjs` with `HESTIA_VIDEO_ROOT` and `HESTIA_RELEASE_SHA` (the 40-character released commit). It reads `narration/timing.json`, drives the live URL in a 1920 by 1080 Chromium, holds each beat for its measured length, and writes `capture/production.webm` and `capture/capture-receipt.json`, failing on any page or console error from the app origin. It imports `@playwright/test`, which this repository declares only in `frontend/package.json`, so run it where that package and its Chromium are installed. A beat whose on-screen action takes longer than its hold overruns without a warning, so watch the capture once before building.
3. `python video/build-video.py` with the same `HESTIA_VIDEO_ROOT` and `HESTIA_RELEASE_SHA`. It trims the capture lead, mixes the measured audio at the measured offsets, burns the captions, and refuses a result whose length differs from the narration by more than one frame. Output: `output/hestia-demo.mp4` and `output/video-receipt.json` with the SHA-256 of the file. Optional `HESTIA_BACKEND_RUN_ID` and `HESTIA_FRONTEND_RUN_ID` bind the two CI runs into the receipt.

`scripts/verify_video_sync.py` comes from an earlier project and checks a four-segment layout with title and outro cards. This pipeline renders neither card and writes neither of its input files, so it does not apply to the seven-beat video; the length gates that apply are the ones in steps 1 and 3.

Upload the MP4 to YouTube as public, not unlisted, and put the link in the Devpost form.
