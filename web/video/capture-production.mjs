import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.HESTIA_VIDEO_ROOT || process.env.ARCHON_VIDEO_ROOT;
const releaseSha = process.env.HESTIA_RELEASE_SHA || process.env.ARCHON_RELEASE_SHA;
if (!root || !/^[a-f0-9]{40}$/u.test(releaseSha ?? "")) {
  throw new Error("The exact video root and release SHA are required.");
}

const captureDir = path.join(root, "capture");
mkdirSync(captureDir, { recursive: true });
const timing = JSON.parse(
  readFileSync(path.join(root, "narration", "timing.json"), "utf8"),
);
const holds = Object.fromEntries(
  timing.scenes.map((scene) => [scene.id, Number(scene.holdSeconds) * 1000]),
);
const expectedScenes = [
  "hook",
  "surface",
  "trigger",
  "live",
  "sponsor",
  "evidence",
  "close",
];
if (JSON.stringify(timing.scenes.map((scene) => scene.id)) !== JSON.stringify(expectedScenes)) {
  throw new Error("The narration and production journey scene order differ.");
}

const browser = await chromium.launch({ args: ["--force-device-scale-factor=1"] });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: path.join(captureDir, "raw"), size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const video = page.video();
if (!video) throw new Error("Playwright did not create a video recorder.");
const errors = [];
const onOwnedOrigin = () => page.url().startsWith("https://drusjukc9d4oc.cloudfront.net");
page.on("pageerror", (error) => {
  if (onOwnedOrigin()) errors.push(`page:${error.name}`);
});
page.on("console", (message) => {
  if (onOwnedOrigin() && message.type() === "error") errors.push("console:error");
});
const captureStarted = Date.now();
const appUrl = `https://drusjukc9d4oc.cloudfront.net/?release=${releaseSha}`;
await page.goto(appUrl, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForSelector("text=HESTIA", { timeout: 30_000 });
const timelineStarted = Date.now();

async function holdScene(id, action) {
  const started = Date.now();
  await action();
  const elapsed = Date.now() - started;
  const remaining = Math.max(0, (holds[id] ?? 10_000) - elapsed);
  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  }
}

// 1. Hook: Focus on Elena's Bosch washer warranty card with 24-month statutory guarantee
await holdScene("hook", async () => {
  const washerCard = page.locator("text=Bosch Serie 8").first();
  if (await washerCard.isVisible()) {
    await washerCard.scrollIntoViewIfNeeded();
  }
});

// 2. Surface: 3-column cockpit overview
await holdScene("surface", async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
});

// 3. Trigger: Active Sentinel Radar alerts
await holdScene("trigger", async () => {
  const radar = page.locator("text=Sentinel Radar").first();
  if (await radar.isVisible()) {
    await radar.scrollIntoViewIfNeeded();
  }
  const breach = page.locator("text=Statutory Breach").first();
  if (await breach.isVisible()) {
    await breach.click();
  }
});

// 4. Live: Return-of-Control approval action
await holdScene("live", async () => {
  const approveBtn = page.locator("button:has-text('Approve & Dispatch Notice')").first();
  if (await approveBtn.isVisible()) {
    await approveBtn.click();
    await page.waitForTimeout(1_000);
  }
});

// 5. Sponsor: Bedrock AgentCore & serverless cryptographic receipt
await holdScene("sponsor", async () => {
  const sealedBadge = page.locator("text=SEALED").first();
  if (await sealedBadge.isVisible()) {
    await sealedBadge.scrollIntoViewIfNeeded();
  }
});

// 6. Evidence: Tests, invariants and coverage
await holdScene("evidence", async () => {
  const headerBadge = page.locator("text=37 Tests").first();
  if (await headerBadge.isVisible()) {
    await headerBadge.scrollIntoViewIfNeeded();
  }
});

// 7. Close: Final clean overview
await holdScene("close", async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
});

await context.close();
await browser.close();
const rawPath = await video.path();
const finalPath = path.join(captureDir, "production.webm");
renameSync(rawPath, finalPath);
const bytes = readFileSync(finalPath);
const receipt = {
  schemaVersion: "archon.submission-video-capture/v1",
  releaseSha,
  sceneCount: expectedScenes.length,
  trimLeadSeconds: Math.max(0, (timelineStarted - captureStarted) / 1000),
  timelineSeconds: Number(timing.totalSeconds),
  pageErrors: errors,
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
writeFileSync(
  path.join(captureDir, "capture-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
if (errors.length !== 0) throw new Error(`Production journey emitted ${errors.length} browser errors.`);
console.log(JSON.stringify(receipt));
