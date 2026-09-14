"""Drive the live app through the demo journey while recording a CDP screencast.

  python video/capture_demo.py <take>   <work>/capture/<take>/frames/*.jpg, events.json, media/*.png

The cursor is not drawn by the browser: every move and click is logged in viewport pixels,
and the composer draws it. Waits on the model are logged so the composer can shorten them.
Scene lengths come from <work>/timing.json and the pasted order email from
video/narration.json. <work> is HESTIA_VIDEO_ROOT, by default video/work.
"""

import base64
import json
import os
import pathlib
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = "https://drusjukc9d4oc.cloudfront.net/"
HERE = pathlib.Path(__file__).resolve().parent
WORK = pathlib.Path(os.environ.get("HESTIA_VIDEO_ROOT") or HERE / "work").resolve()
TAKE = sys.argv[1] if len(sys.argv) > 1 else "take0"
RUN = WORK / "capture" / TAKE
FRAMES, MEDIA = RUN / "frames", RUN / "media"
for folder in (FRAMES, MEDIA):
    folder.mkdir(parents=True, exist_ok=True)
SPEC = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
TIMING = {
    s["id"]: s for s in json.loads((WORK / "timing.json").read_text(encoding="utf-8"))["scenes"]
}
VIEW, DPR = {"width": 1280, "height": 720}, 2
events, frames, notes = [], [], {}
HIT_TEST = (
    "(el, p) => { const hit = document.elementFromPoint(p[0], p[1]); "
    "return !!hit && (el === hit || el.contains(hit)); }"
)


def mark(kind, **fields):
    events.append({"t": time.time(), "kind": kind, **fields})


class Director:
    def __init__(self, page):
        self.page, self.x, self.y = page, 330.0, 650.0
        self.scene, self.scene_t0, self.waited = None, 0.0, 0.0

    def pause(self, seconds):
        self.page.wait_for_timeout(max(1, int(seconds * 1000)))

    def move(self, locator, seconds=0.8, fx=0.5, fy=0.5):
        locator.wait_for(state="visible", timeout=20000)
        box = locator.bounding_box()
        x, y = box["x"] + box["width"] * fx, box["y"] + box["height"] * fy
        hidden = (
            box["y"] < 70
            or box["y"] + box["height"] > VIEW["height"] - 20
            or not locator.evaluate(HIT_TEST, [x, y])
        )
        if hidden:
            locator.evaluate("el => el.scrollIntoView({behavior: 'smooth', block: 'center'})")
            self.pause(0.8)
            box = locator.bounding_box()
            x, y = box["x"] + box["width"] * fx, box["y"] + box["height"] * fy
        t0 = time.time()
        self.page.mouse.move(x, y, steps=max(6, int(seconds * 30)))
        rest = seconds - (time.time() - t0)
        if rest > 0:
            self.pause(rest)
        mark("move", t0=t0, t1=time.time(), x0=self.x, y0=self.y, x1=x, y1=y)
        self.x, self.y = x, y

    def click(self, locator, seconds=0.8, fx=0.5, fy=0.5, settle=0.3):
        self.move(locator, seconds, fx, fy)
        mark("click", x=self.x, y=self.y)
        self.page.mouse.down()
        self.pause(0.08)
        self.page.mouse.up()
        self.pause(settle)

    def scroll_to(self, locator, top=90, seconds=1.1):
        locator.wait_for(state="attached", timeout=20000)
        y = locator.evaluate(
            "(el, top) => el.getBoundingClientRect().top + window.scrollY - top", top
        )
        self.page.evaluate("y => window.scrollTo({top: Math.max(0, y), behavior: 'smooth'})", y)
        self.pause(seconds)

    def scroll_by(self, dy, seconds=1.1):
        self.page.evaluate("dy => window.scrollBy({top: dy, behavior: 'smooth'})", dy)
        self.pause(seconds)

    def wait_for(self, locator, label, timeout=75):
        t0 = time.time()
        mark("wait_start", label=label)
        locator.wait_for(state="visible", timeout=timeout * 1000)
        mark("wait_end", label=label, seconds=round(time.time() - t0, 2))
        self.waited += max(0.0, time.time() - t0 - 1.2)

    def begin(self, scene):
        self.scene, self.scene_t0, self.waited = scene, time.time(), 0.0
        mark("scene_start", id=scene)
        print("scene", scene, flush=True)

    def pad(self, reserve=0.0, extra=0.3):
        budget = TIMING[self.scene]["speech"] + 0.9 + extra - reserve
        used = time.time() - self.scene_t0 - self.waited
        if used < budget:
            self.pause(budget - used)

    def end(self, extra=0.3):
        self.pad(0.0, extra)
        mark("scene_end", id=self.scene)

    def shot(self, name):
        self.page.screenshot(path=str(MEDIA / f"{name}.png"))
        mark("shot", name=name)


def dump(page, label):
    has_modal = page.locator(".modal-backdrop").count()
    notes[label] = {
        "buttons": page.eval_on_selector_all(
            "button",
            "els => els.filter(e => e.offsetParent).map(e => e.innerText.trim()).filter(Boolean)",
        ),
        "ids": sorted(
            set(page.eval_on_selector_all("[data-testid]", "els => els.map(e => e.dataset.testid)"))
        ),
        "modal": page.inner_text(".modal-backdrop")[:7000] if has_modal else "",
        "modal_buttons": page.eval_on_selector_all(
            ".modal-backdrop button",
            "els => els.map(e => [e.innerText.trim(), !!e.offsetParent, e.disabled])",
        ),
    }


def journey(d, page):
    tid = page.get_by_test_id
    d.begin("open")
    d.pause(1.3)
    d.shot("01-landing")
    d.click(tid("launch-cockpit"), 1.1)
    d.wait_for(tid("agent-review"), "open copy")
    d.pause(0.4)
    d.move(tid("session-status"), 0.9)
    d.end()

    d.begin("home")
    d.shot("02-home")
    for key in ("start-repair", "start-appliance", "start-paste"):
        d.move(tid(key), 0.65, fy=0.4)
        d.pause(0.3)
    d.scroll_to(page.get_by_text("Decisions waiting for you").first, top=70)
    d.shot("03-decisions")
    d.move(tid("alert-warranty"), 0.7, fx=0.7, fy=0.3)
    d.pause(0.5)
    d.move(tid("cancel-trial"), 0.7)
    d.pause(0.4)
    price = tid("alert-price_creep").filter(has_text="Cloud Backup Vault")
    d.scroll_to(price, top=160)
    d.move(price, 0.6, fx=0.6, fy=0.35)
    d.pause(0.4)
    d.move(tid("alert-receipt_gap"), 0.6, fx=0.6, fy=0.35)
    d.end()

    d.begin("paste")
    d.scroll_to(tid("start-here"), top=90, seconds=1.0)
    d.click(tid("start-paste"), 0.8)
    dialog = page.locator(".modal-backdrop")
    dialog.wait_for(state="visible")
    d.pause(0.6)
    dump(page, "paste_open")
    kind = dialog.locator("select").first
    d.click(kind, 0.7)
    page.keyboard.press("Escape")
    kind.select_option("order")
    d.pause(0.4)
    area = dialog.locator("textarea").first
    d.click(area, 0.6)
    area.fill(SPEC["pasteEmail"])
    d.pause(0.9)
    d.shot("04-paste-email")
    d.click(dialog.get_by_role("button", name="Ask Hestia to read it"), 0.7)
    d.wait_for(dialog.get_by_text("Check what Hestia read").first, "reading agent")
    d.pause(1.0)
    dump(page, "paste_result")
    d.shot("05-proposed-facts")
    fields = dialog.get_by_text("Purchase date", exact=True).first
    fields.evaluate("el => el.scrollIntoView({behavior: 'smooth', block: 'center'})")
    d.pause(1.4)
    d.shot("05b-proposed-fields")
    d.click(dialog.get_by_role("button", name="Review exact changes"), 0.8, settle=1.4)
    agree = dialog.get_by_text(re.compile(r"^I confirm these exact changes")).first
    d.click(agree, 0.8, fx=0.02, settle=0.5)
    dump(page, "paste_checked")
    d.click(dialog.get_by_role("button", name="Confirm and save"), 0.7, settle=1.6)
    dump(page, "paste_saved")
    d.shot("05c-saved")
    d.end()

    d.begin("review")
    if page.locator(".modal-backdrop").count():
        d.click(page.locator(".modal-backdrop").get_by_role("button", name="Close").last, 0.6)
    d.scroll_to(tid("agent-card"), top=80)
    d.click(tid("agent-review"), 0.8)
    d.wait_for(tid("agent-mode").first, "review agent")
    d.pause(1.3)
    d.shot("06-briefing")
    dump(page, "briefing")
    d.move(tid("agent-card").get_by_text("Decisions waiting for you").first, 0.8, fx=0.2)
    d.pause(2.2)
    d.move(tid("agent-mode").first, 0.8)
    d.shot("06b-chips")
    d.pause(1.6)
    trace = tid("agent-trace").first
    d.scroll_to(trace, top=380, seconds=1.0)
    d.click(trace, 0.7, fx=0.12, fy=0.5 if trace.bounding_box()["height"] < 80 else 0.05)
    d.pause(0.8)
    d.scroll_to(trace, top=110, seconds=1.2)
    d.shot("07-tool-trace")
    d.end()

    d.begin("notice")
    d.scroll_to(tid("alert-warranty"), top=130)
    d.click(tid("review-claim"), 0.8)
    notice = tid("server-notice")
    d.wait_for(notice, "notice")
    d.pause(1.0)
    d.shot("08-notice")
    d.move(notice, 0.6, fx=0.55, fy=0.25)
    for _ in range(5):
        page.mouse.wheel(0, 45)
        d.pause(0.4)
    d.pause(0.6)
    d.click(tid("approve-claim"), 0.9)
    d.wait_for(tid("claim-result"), "approval")
    d.pause(1.0)
    d.shot("09-approved")
    dump(page, "approved")
    d.pad(reserve=1.5)
    d.click(tid("open-persisted-case"), 0.8, settle=0.1)
    mark("scene_end", id="notice")

    d.begin("case")
    d.wait_for(tid("case-status"), "case")
    d.pause(0.8)
    d.shot("10-case-summary")
    next_step = page.get_by_text("Your next step").first
    if next_step.count():
        d.move(next_step, 0.8, fx=0.3)
    d.pause(2.2)
    d.scroll_by(420)
    d.shot("11-case-timeline")
    save = page.get_by_role("button", name="Save case update")
    if save.count():
        d.move(save, 0.9)
    dump(page, "case")
    d.end()

    d.begin("about")
    d.click(page.get_by_role("button", name="About", exact=True).first, 0.7)
    d.pause(0.8)
    d.scroll_to(tid("architecture-tiers"), top=90)
    d.shot("12-about-modes")
    for text in ("PSD2 bank feeds", "SES: disabled"):
        row = page.get_by_text(text).first
        if row.count():
            d.move(row, 0.7, fx=0.3)
            d.pause(0.5)
    d.end()


def main():
    with sync_playwright() as p:
        # A real device scale factor, not an emulated one, so the screencast itself arrives
        # at 2560x1440.
        window = [VIEW["width"] + 30, VIEW["height"] + 95]
        for _attempt in range(3):
            browser = p.chromium.launch(
                channel="msedge",
                headless=True,
                args=[
                    f"--force-device-scale-factor={DPR}",
                    f"--window-size={window[0]},{window[1]}",
                    "--lang=en-GB",
                ],
            )
            context = browser.new_context(no_viewport=True, locale="en-GB")
            page = context.new_page()
            page.goto(URL, wait_until="networkidle")
            inner = page.evaluate("[innerWidth, innerHeight, devicePixelRatio]")
            if inner[:2] == [VIEW["width"], VIEW["height"]] and inner[2] == DPR:
                break
            window = [window[0] + VIEW["width"] - inner[0], window[1] + VIEW["height"] - inner[1]]
            browser.close()
        else:
            raise SystemExit(f"could not size the window to {VIEW}: {inner}")
        page.evaluate("document.fonts.ready")
        health = page.request.get(URL + "healthz").json()
        cdp = context.new_cdp_session(page)

        def on_frame(params):
            index = len(frames)
            (FRAMES / f"{index:05d}.jpg").write_bytes(base64.b64decode(params["data"]))
            frames.append({"i": index, "t": params["metadata"]["timestamp"]})
            try:
                cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
            except Exception:
                pass

        cdp.on("Page.screencastFrame", on_frame)
        director = Director(page)
        page.mouse.move(director.x, director.y)
        screencast = {
            "format": "jpeg",
            "quality": 90,
            "maxWidth": 2560,
            "maxHeight": 1440,
            "everyNthFrame": 1,
        }
        cdp.send("Page.startScreencast", screencast)
        mark("capture_start")
        ok = True
        try:
            journey(director, page)
        except Exception as error:
            ok = False
            mark("error", message=str(error)[:800])
            print("ERROR", str(error)[:800])
            page.screenshot(path=str(RUN / "error.png"))
            dump(page, "error")
        director.pause(0.6)
        mark("capture_end")
        cdp.send("Page.stopScreencast")
        browser.close()
    payload = {
        "ok": ok,
        "health": health,
        "view": VIEW,
        "dpr": DPR,
        "frames": frames,
        "events": events,
        "notes": notes,
    }
    (RUN / "events.json").write_text(
        json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    commit = health.get("commit", "")[:7]
    print("frames", len(frames), "events", len(events), "ok", ok, "commit", commit)


if __name__ == "__main__":
    main()
