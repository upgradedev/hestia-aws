import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

// Drives the deployed product through the seven narration beats and records the screen.
// Requires HESTIA_VIDEO_ROOT (where narration/timing.json lives and capture/ is written)
// and HESTIA_RELEASE_SHA (the 40-character released commit written into the receipt).
const root = process.env.HESTIA_VIDEO_ROOT;
const releaseSha = process.env.HESTIA_RELEASE_SHA;
if (!root || !/^[a-f0-9]{40}$/u.test(releaseSha ?? "")) {
  throw new Error("The exact video root and release SHA are required.");
}

const appOrigin = "https://drusjukc9d4oc.cloudfront.net";
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
const onOwnedOrigin = () => page.url().startsWith(appOrigin);
page.on("pageerror", (error) => {
  if (onOwnedOrigin()) errors.push(`page:${error.name}`);
});
page.on("console", (message) => {
  if (onOwnedOrigin() && message.type() === "error") errors.push("console:error");
});
const captureStarted = Date.now();
const appUrl = `${appOrigin}/?release=${releaseSha}`;
await page.goto(appUrl, { waitUntil: "networkidle", timeout: 60_000 });
// The landing H1 is the first frame of the timeline.
await page.locator("h1#welcome-title").waitFor({ state: "visible", timeout: 30_000 });
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

// 1. Hook: the landing page with the sample repair card stays on screen.
await holdScene("hook", async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
});

// 2. Surface: one click creates the demo space and opens Home.
await holdScene("surface", async () => {
  await page.locator('[data-testid="launch-cockpit"]').click();
  await page.locator('[data-testid="agent-review"]').waitFor({ state: "visible", timeout: 30_000 });
});

// 3. Trigger: the Strands agent reviews the household; the mode chips and the tool trace appear.
await holdScene("trigger", async () => {
  await page.locator('[data-testid="agent-review"]').click();
  await page.locator('[data-testid="agent-mode"]').waitFor({ state: "visible", timeout: 45_000 });
  const trace = page.locator('[data-testid="agent-trace"] summary').first();
  if (await trace.isVisible()) {
    await trace.click();
  }
});

// 4. Live: the exact server notice is reviewed and approved; the approval is recorded, not sent.
await holdScene("live", async () => {
  await page.locator('[data-testid="review-claim"]').click();
  await page.locator('[data-testid="server-notice"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await page.locator('[data-testid="approve-claim"]').click();
  await page.locator('[data-testid="claim-result"]').waitFor({ state: "visible", timeout: 30_000 });
});

// 5. Sponsor: the saved case timeline is on screen while the narration names the AWS pieces.
await holdScene("sponsor", async () => {
  await page.locator('[data-testid="open-persisted-case"]').click();
  await page.locator('[data-testid="case-status"]').waitFor({ state: "visible", timeout: 30_000 });
});

// 6. Evidence: the About page lists the modes; the read-only console shows the live health check.
await holdScene("evidence", async () => {
  await page.getByRole("button", { name: "About", exact: true }).click();
  await page.locator('[data-testid="architecture-tiers"]').waitFor({ state: "visible", timeout: 30_000 });
  const request = page.locator('[data-testid="console-request"]');
  if (await request.isVisible()) {
    await request.click();
  }
});

// 7. Close: back to the landing page for the closing sentence and the URL.
await holdScene("close", async () => {
  await page.getByRole("button", { name: "Hestia home", exact: true }).click();
  await page.locator("h1#welcome-title").waitFor({ state: "visible", timeout: 30_000 });
});

await context.close();
await browser.close();
const rawPath = await video.path();
const finalPath = path.join(captureDir, "production.webm");
renameSync(rawPath, finalPath);
const bytes = readFileSync(finalPath);
const receipt = {
  schemaVersion: "hestia.submission-video-capture/v1",
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
