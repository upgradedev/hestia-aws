# Hestia demo video: script and production notes

The published video is [VIDEO_URL]. It runs 3:32 (the hackathon limit is 5 minutes), at 1920 by 1080 with a narrated voice track. The demo scenes are a screen recording of the live URL, https://drusjukc9d4oc.cloudfront.net/, while it served the released revision `f8694a0` recorded in [deployment.md](deployment.md).

## Structure

The video follows the order the owner asked for: a title slide, the problem, the solution and the architecture on AWS, the live demo, and a closing slide. The pitch covers the problem, who it is for and why it matters, and the narration names Strands Agents and how the two agents are used.

| # | Scene | Starts | Length | On screen | Narration |
|---|---|---|---|---|---|
| 1 | intro | 0:00 | 9.1 s | Title slide: the Hestia mark, the one-line pitch and the two roles (the agent points, the household decides). | This is Hestia, an everyday agent for the paperwork a household never keeps together. It points at the decisions, and the household makes them. |
| 2 | elena | 0:09 | 7.9 s | Who it is for: Elena, a fictional household in Athens, with receipts, guarantees, repair invoices and subscriptions scattered. | Meet Elena, in Athens. Her receipts sit in her inbox, her guarantees in a drawer, and her subscriptions renew quietly. |
| 3 | moment | 0:17 | 17.4 s | The problem: a timeline to the repair 22 months after purchase, the EUR 185 repair cost, the EU two-year legal guarantee as a general reference, and the three documents a request needs. | Then her washing machine breaks, 22 months in, and the repair costs 185 euros. EU rules give at least two years of legal guarantee for faulty goods, but using it needs the receipt, the invoice and the seller's details together. |
| 4 | pile | 0:34 | 10.3 s | Why it matters: a trial about to turn paid, a price rise from 9.99 to 13.99 EUR, a purchase with no receipt. | Add a trial about to turn paid, a price that crept up and a missing receipt: small amounts, real deadlines, and nobody keeping watch. |
| 5 | solution | 0:45 | 14.9 s | The solution in three steps: add records, agent review, Elena approves the exact notice; the stamp says recorded, never sent. | Elena adds records by hand or from a pasted email. A Strands agent on Amazon Bedrock points at what needs a decision. Elena approves the exact notice herself; it is recorded, never sent. |
| 6 | aws | 1:00 | 18.9 s | Animated AWS architecture: CloudFront and the S3 site bucket, API Gateway, the read-only Lambda and the writer Lambda with two Strands agents, Amazon Bedrock with Claude Haiku 4.5, the S3 state bucket with conditional writes, and what is not connected. | On AWS, CloudFront serves the app, and API Gateway routes its calls. A read-only Lambda answers reads, and a writer Lambda runs two Strands agents with Claude Haiku on Amazon Bedrock, and saves each private copy to Amazon S3. |
| 7 | agents | 1:19 | 19.3 s | The two Strands agents: the review agent with four read-only tools and the guard, the reading agent with no tools turning a pasted order email into proposed records, and the model limits. | The review agent only reads, through four tools, and a guard withholds any briefing with entitlement wording or a euro amount no tool returned. The reading agent has no tools: it proposes records from pasted text, and nothing is added until Elena confirms. |
| 8 | open | 1:38 | 8.4 s | Live app: the landing page, one click on Start with the sample household, and the 30 minute private copy chip. | This is the live app. One click opens a private copy of Elena's household, with no account, for 30 minutes. |
| 9 | home | 1:46 | 12.0 s | Home: the three ways to add records, then the decisions waiting. | Home starts with three ways to add records. Below them are five decisions waiting, from the washing machine repair and a trial ending in three days, to a price rise and a missing receipt. |
| 10 | paste | 1:58 | 14.1 s | Paste a receipt or order email: the reading agent proposes the product, seller, date and price; Elena reviews the exact change and confirms it. | Elena pastes the order email for a new coffee machine. The reading agent proposes the product, the seller, the date and the price. She checks them, and confirms before anything is added. |
| 11 | review | 2:12 | 21.0 s | Ask Hestia to review this household: the live briefing, the chips with the model, tokens and reviews left, and the tool trace. | Then she asks Hestia to review the household. The Strands agent calls its four tools, and Claude Haiku on Bedrock writes a short briefing that points at the decisions. The chips show the live model, the tokens and the reviews left, and the tool trace shows every call and what it returned. |
| 12 | notice | 2:34 | 19.1 s | Review the exact notice: the server-prepared notice, then Approve this notice (recorded, not sent), then the saved case. | The repair matters most. Hestia prepares the exact notice from the recorded facts: the seller, the subject and the repair cost. Elena reads it and approves it with a single-use token bound to that exact text. The approval is recorded, and no email is sent. |
| 13 | case | 2:53 | 10.6 s | Case file: the summary with the next step, then the timeline and the case update form. | The case file keeps the story in one place: the approved notice and the next step, then every reply, deadline and outcome she records. |
| 14 | about | 3:03 | 7.5 s | About: what runs and what is not connected, with the read-only console. | And the About page shows what runs, and what is not connected yet, such as bank feeds and email sending. |
| 15 | close | 3:11 | 21.4 s | Closing slide: the three ideas, the code link (MIT license), the live demo link, and the services it is built with. | Hestia turns scattered household paperwork into decisions a person can act on. Two Strands agents read and point, the household decides, and every step stays in one case file. It is open source, and the live demo needs no login. The links are in the description. |

## What the edit does, and does not do

- Every demo frame comes from the deployed app. Nothing in the app is mocked or redrawn; the cursor and click rings are drawn from the recorded pointer positions, and a short label names each demo scene.
- Waits on the live model are shortened and a badge on screen gives the measured wait: paste: reading agent 1.9 s; review: review agent 5.4 s.
- Where a demo stretch took longer than its narration it plays faster: notice (1.06x), paste (1.80x).
- The model output on screen is whatever the live model returned during the capture. Briefing quality is unmeasured.

## What the video must not say

No live email, no receipt photo reading, no AgentCore, no Guardrails, no bank or mailbox sync, no coverage percentage, no test count, no cost, no savings and no legal entitlement. Figures are recorded synthetic facts (22 months from purchase to repair, 185 EUR, 9.99 to 13.99 EUR, 85.50 EUR) or configured limits (30 minutes, 3 reviews and 3 text readings per private copy, 200 a day shared by both agents, 700 output tokens per model call, 20 seconds). The EU two-year legal guarantee is mentioned only as a general reference. The household and its sellers are fictional.

## Production pipeline

The tools live in `video/` and read `video/narration.json`: each segment's `speechText` is what the voice says, and its `captionText` is the caption. They need Python 3.11 with Playwright for Python and Pillow, a Chromium-based browser (the capture used Microsoft Edge), ffmpeg and an ElevenLabs API key in `ELEVENLABS_API_KEY`. Every generated file (the timing, the audio, the slide clips, the capture takes, the demo clips and the output) goes under the folder named by `HESTIA_VIDEO_ROOT`, by default `video/work`, which git ignores.

1. Narration, `python video/tts.py`: synthesize one clip per scene with ElevenLabs and measure each clip with ffprobe. The measured lengths drive everything after this step.
2. Slides, `python video/render_slides.py render <scene>`: `video/slides.html` holds the eight slide scenes as HTML and CSS animations. Each animated element names its moment as a fraction of its scene's speech, so the slides follow the measured narration. The renderer pauses every animation, seeks it frame by frame at 30 frames per second and encodes the frames.
3. Capture, `python video/capture_demo.py <take>`: a Playwright script drives the live URL through the demo journey in a 1280 by 720 window at a real device scale factor of 2, records the page with the Chrome DevTools screencast at 2560 by 1440, logs every pointer move, click and wait, and saves full-resolution screenshots.
4. Compose, `python video/compose_demo.py <take>`: each demo scene is cut from the capture to its narration length, waits on the model are shortened and labelled, the cursor and the zooms in `video/zooms.json` are drawn, and the scene label is shown for its first seconds.
5. Assemble, `python video/assemble.py`: the fifteen scenes are joined with short fades, each narration clip is placed 0.3 s after its scene starts, loudness is normalised, and captions and a receipt with the SHA-256 of the file are written.
6. YouTube text, `python video/youtube_meta.py`: the title, the description with chapters and the tags are written from that receipt.
