"""Write the YouTube title, description with chapters, and tags from the assembled video's receipt.

  python video/youtube_meta.py   <work>/output/youtube.json from <work>/output/receipt.json

<work> is HESTIA_VIDEO_ROOT, by default video/work.
"""

import json
import os
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
WORK = pathlib.Path(os.environ.get("HESTIA_VIDEO_ROOT") or HERE / "work").resolve()
CHAPTERS = {
    "intro": "Hestia",
    "elena": "Who it is for",
    "moment": "The problem",
    "pile": "Why it matters",
    "solution": "The solution in three steps",
    "aws": "How it runs on AWS",
    "agents": "Two Strands agents",
    "open": "Live demo: open a private copy",
    "home": "Home: the decisions waiting",
    "paste": "Reading agent: paste an order email",
    "review": "Review agent: briefing and tool trace",
    "notice": "The exact notice, approved",
    "case": "Case file timeline",
    "about": "What runs and what does not",
    "close": "Links",
}
TITLE = (
    "Hestia: an everyday agent for household paperwork, built with Strands Agents on Amazon Bedrock"
)
TAGS = [
    "Strands Agents", "Amazon Bedrock", "AWS", "AI agents", "AWS Lambda", "Claude Haiku",
    "hackathon", "Agents for Humans", "household", "consumer rights",
]  # fmt: skip


def stamp(seconds):
    seconds = int(seconds)
    return f"{seconds // 60}:{seconds % 60:02d}"


def describe(chapters: str) -> str:
    lines = [
        "Hestia keeps a household's receipts, guarantees, subscriptions and repair cases "
        "together. A Strands agent on Amazon Bedrock reviews the records and points at the "
        "decisions waiting; the household reads the exact notice and approves it. In this demo "
        "the approval is recorded and nothing is sent.",
        "",
        "Live demo (no login, a private copy of a fictional household for 30 minutes): "
        "https://drusjukc9d4oc.cloudfront.net/",
        "Code (MIT license): https://github.com/upgradedev/hestia-aws",
        "",
        "Built for the AWS Agents for Humans hackathon, Everyday Agents track.",
        "",
        "Chapters",
        chapters,
        "",
        "What you see",
        "- Two Strands Agents on Amazon Bedrock (Claude Haiku 4.5): a review agent with four "
        "read-only tools and a guard that withholds unsupported briefings, and a reading agent "
        "with no tools that turns pasted text into proposed records the household confirms.",
        "- AWS: Amazon CloudFront, Amazon API Gateway, AWS Lambda (a read-only function and a "
        "writer), Amazon S3 with conditional writes, AWS Secrets Manager, AWS CloudFormation, "
        "GitHub Actions.",
        "- The demo was recorded on the deployed app. Waits on the live model are shortened in "
        "the edit and labelled with their real duration.",
        "",
        "Not connected in this demo: email sending (Amazon SES is denied by IAM), bank feeds, "
        "mailbox or retailer sync, receipt photo OCR, Amazon Bedrock AgentCore and Bedrock "
        "Guardrails. The household is fictional and its amounts are synthetic. Legal references "
        "are general information, not legal advice.",
    ]
    return "\n".join(lines) + "\n"


def main():
    output = WORK / "output"
    receipt = json.loads((output / "receipt.json").read_text(encoding="utf-8"))
    chapters = "\n".join(f"{stamp(s['start'])} {CHAPTERS[s['id']]}" for s in receipt["scenes"])
    description = describe(chapters)
    meta = {"title": TITLE, "description": description, "tags": TAGS}
    (output / "youtube.json").write_text(
        json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    print(len(TITLE), "title chars;", len(description), "description chars")
    print(chapters)


if __name__ == "__main__":
    main()
