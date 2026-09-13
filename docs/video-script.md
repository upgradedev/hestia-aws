# Hestia demo video: script and production notes

Target length: about 150 seconds of narration plus a 0.65 second tail per beat, well under the 5 minute hackathon limit. The seven beats below are the seven segments of `video/narration.json`, in the order `web/video/capture-production.mjs` enforces: hook, surface, trigger, live, sponsor, evidence, close. The caption text carries the exact figures; the speech text spells acronyms for the voice engine. Word counts and the measured total come from `python video/generate-narration.py`, which refuses a narration outside 90 to 174 seconds.

Record only when the live URL serves this branch: `GET https://drusjukc9d4oc.cloudfront.net/healthz` must report the released commit and `live_model` `true`. If `live_model` is `false`, the review runs the four tools deterministically and beat 3 would show the fallback chip instead of the live model chip. Every frame is the deployed product; nothing is mocked or animated.

## Beats

### 1. hook (about 20 s): the landing page

Screen: the landing page. H1 "Your receipt is the start. Keep the whole case together." and the sample repair card "The washing machine broke. The repair cost EUR 185.00."

Caption: Elena Georgiou's washing machine failed 22 months after purchase, and the repair cost 185 EUR. The receipt, the repair invoice and the seller's address live in three places, and nobody keeps the case together. Hestia starts from that receipt and asks Elena before anything is sent.

### 2. surface (about 21 s): one click, then Home

Screen: click **Start with the sample household** (`data-testid="launch-cockpit"`), which creates the 30-minute private copy. Home appears, in this order: the "Start here" block (`data-testid="start-here"`) with its three doors into the household's own records, the review card, the four fact tiles and "Decisions waiting for you" with the repair, the trial, the price change, the missing receipt and the utility bill. Scroll past "Start here" to keep the beat on the decisions queue the caption names; beat 3 begins from the review card just below it.

Caption: One click on the landing page opens a private demo space with a fictional Athens household: no account, no login, a 30-minute limit. Home shows what needs a decision this week: the recorded repair, a trial ending, a price change from 9.99 to 13.99 EUR, and a receipt missing for 85.50 EUR.

### 3. trigger (about 23 s): the Strands agent reads

Screen: click **Ask Hestia to review this household** (`data-testid="agent-review"`), wait for the mode chips (`data-testid="agent-mode"`): Live model via Strands Agents, the model id, tokens and seconds, "2 of 3 model reviews left in this space". The three-section briefing renders. Open **Tool trace** to show the four calls and their outputs.

Caption: Ask Hestia to review this household, and a Strands agent on Amazon Bedrock reads the records through four tools: repair evidence, subscriptions, receipts and utilities, and the case timeline. It writes a short briefing that points at decisions; a guard withholds any sentence that claims an entitlement or invents an amount. The tool trace stays visible.

### 4. live (about 22 s): the exact notice, approved and recorded

Screen: click **Review the exact notice** (`data-testid="review-claim"`), wait for the server notice (`data-testid="server-notice"`) with claimant, seller and address, subject and the recorded repair cost. Click **Approve this notice (recorded, not sent)** (`data-testid="approve-claim"`), wait for "Simulated approval recorded. No email sent and no reimbursement recorded." (`data-testid="claim-result"`).

Caption: Then Hestia stops. The notice to Kotsovolos Megastore is prepared on the server from the recorded facts: recipient, subject, the 185 EUR repair cost and the exact text. Elena reads it and approves it with a single-use token bound to that exact draft. The approval is recorded as a simulation. No email is sent.

### 5. sponsor (about 23 s): the saved case, and what AWS carries

Screen: click **Continue to the saved case and next step** (`data-testid="open-persisted-case"`), wait for the status chip (`data-testid="case-status"`) reading Authorized. The timeline shows the Draft, In review and Authorized entries, each with its note, source label, evidence reference and time; the update form is below.

Caption: The saved case now carries the draft, the approval and the next step; every reply, deadline or outcome Elena records later stays on that timeline. Remove AWS and the product stops: the Strands Agents SDK runs Claude Haiku 4.5 through Amazon Bedrock inside Lambda, and Amazon S3 conditional writes keep every case revision consistent.

### 6. evidence (about 24 s): the About page

Screen: click the **About** navigation button. "One journey, five steps", then the four mode cards (Inputs, Agent, Rules, Storage and sending) with their on and off chips. Click **Send request** on the read-only console so `GET /healthz` returns the live JSON with `live_model`, `model_id` and the agent limits.

Caption: Every claim is checkable without asking us. The About page lists what runs and what does not: bank feeds, mailbox sync, receipt OCR, Guardrails, AgentCore and email sending are not connected. Its read-only console returns the live health check with the model limits: 3 reviews per demo space, 200 per day. Independent human testing is reported as not run.

### 7. close (about 17 s): the sentence and the URL

Screen: click the Hestia mark to return to the landing page; the H1 and the button "Continue your household case" are on screen with the URL in the browser bar.

Caption: Hestia reads a household's receipts, subscriptions and repair records with a Strands agent on Amazon Bedrock, and nothing is sent until the household has approved the exact text. Open source under the MIT license, running on AWS, no login. Try it now at drusjukc9d4oc.cloudfront.net.

## What the video must not say

No live email, no OCR, no AgentCore, no Guardrails, no coverage percentage, no test count, no cost, no savings, no legal entitlement. Every figure spoken above is a recorded synthetic fact (185 EUR, 9.99 to 13.99 EUR, 85.50 EUR) or a configured limit (30 minutes, 3 per space, 200 per day). `tools/prose_gate.py` scans `video/narration.json` for em dashes and stale claims, and `tests/test_claims_inventory.py` scans it for unsupported claims.

## Production pipeline

1. `python video/generate-narration.py` with `ELEVENLABS_API_KEY` set and `HESTIA_VIDEO_ROOT` pointing at a work directory. It synthesizes one MP3 per beat (cached per beat by text and voice), measures each with ffprobe, writes `narration/timing.json` and `narration/captions.en.srt`, and prints the total. Spoken text is `speechText`; captions come from `captionText`.
2. `node web/video/capture-production.mjs` with `HESTIA_VIDEO_ROOT` and `HESTIA_RELEASE_SHA` (the 40-character released commit). It drives the live URL in a 1920 by 1080 Chromium, holds each beat for its measured length, fails on any page or console error from the owned origin, and writes `capture/production.webm` and `capture/capture-receipt.json`.
3. `python video/build-video.py` with the same `HESTIA_VIDEO_ROOT` and `HESTIA_RELEASE_SHA`. It trims the capture lead, mixes the measured audio at the measured offsets, burns the captions, and refuses a result whose length differs from the narration by more than one frame. Output: `output/hestia-demo.mp4` and `output/video-receipt.json` with the SHA-256 of the file. Optional `HESTIA_BACKEND_RUN_ID` and `HESTIA_FRONTEND_RUN_ID` bind the two CI runs into the receipt.
4. `python scripts/verify_video_sync.py output/hestia-demo.mp4` is the generic audio, video and caption sync gate; it needs a manifest and caption windows for the four-segment layout it checks.

Upload the MP4 to YouTube as public, not unlisted, and put the link in the Devpost form.
