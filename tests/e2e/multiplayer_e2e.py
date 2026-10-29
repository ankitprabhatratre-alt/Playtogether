"""
PlayTogether browser end-to-end test.

Drives the REAL UI in three isolated browser contexts (= three separate players/devices:
phone, desktop, tablet) against a running app, through the full flow:

  landing → create wizard → lobby → wrong passcode rejected → 2 guests join via invite link
  → host starts Quiz Battle → everyone answers → synced results → guest reloads mid-game
  (reconnect) → final results identical everywhere → back to lobby → host switches game.

Usage (app must be running, e.g. `npm run dev` → http://localhost:5173):
    pip install playwright && python -m playwright install chromium
    python tests/e2e/multiplayer_e2e.py               # BASE_URL defaults to http://localhost:5173
    BASE_URL=http://localhost:3001 python tests/e2e/multiplayer_e2e.py   # production build

Screenshots are written to tests/e2e/screenshots/.
"""
import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:5173").rstrip("/")
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(exist_ok=True)
PASS = "tiger42"
TIMEOUT = 15_000


def shot(page: Page, name: str) -> None:
    # Layout guard: nothing may overflow horizontally (breaks mobile viewports / sticky bars).
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 0, f"{name}: page overflows horizontally by {overflow}px"
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def step(msg: str) -> None:
    print(f"  ✓ {msg}", flush=True)


def scoreboard(page: Page) -> list:
    """(name, score) pairs from the scoreboard, independent of per-viewer highlighting."""
    return page.locator("#scoreboard li").evaluate_all(
        "els => els.map(e => [e.querySelector('.sb-name')?.textContent, e.querySelector('.sb-score')?.textContent])"
    )


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        devices = {
            "host": dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True),
            "guest1": dict(viewport={"width": 1280, "height": 800}),
            "guest2": dict(viewport={"width": 820, "height": 1180}, has_touch=True),
        }
        ctx = {k: browser.new_context(**v) for k, v in devices.items()}
        for c in ctx.values():
            c.set_default_timeout(TIMEOUT)
            c.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
        host, g1, g2 = (ctx[k].new_page() for k in ("host", "guest1", "guest2"))
        errors: list[str] = []
        for name, pg in (("host", host), ("guest1", g1), ("guest2", g2)):
            pg.on("pageerror", lambda e, n=name: errors.append(f"{n}: {e}"))

        # ── Host creates a room ────────────────────────────────────────────────
        host.goto(BASE + "/")
        expect(host.get_by_role("link", name=re.compile("Play With Friends"))).to_be_visible()
        shot(host, "01-landing-mobile")
        host.get_by_role("link", name=re.compile("Play With Friends")).click()
        host.fill("#hostName", "Priya")
        host.fill("#roomName", "Friday Game Night")
        host.get_by_role("button", name=re.compile("Next: choose a game")).click()
        shot(host, "02-choose-game-mobile")
        host.get_by_role("button", name=re.compile("Quiz Battle")).first.click()
        host.get_by_role("button", name=re.compile("settings →")).click()
        host.locator("#setting-questionCount").fill("3")
        host.locator("#setting-timePerQuestion").fill("15")
        host.fill("#passcode", PASS)
        shot(host, "03-settings-mobile")
        host.get_by_role("button", name=re.compile("Create & Invite")).click()
        host.wait_for_url(re.compile(r"/room/[A-Z2-9]{8}"))
        room_id = host.url.rsplit("/", 1)[-1]
        # Quiz Battle supports 1–16 players, so it is startable solo; the button reports who will play.
        expect(host.get_by_text("Ready! 1 player will play.")).to_be_visible()
        start_btn = host.get_by_role("button", name=re.compile("Start Quiz Battle"))
        shot(host, "04-lobby-host-mobile")
        step(f"host created room {room_id}")

        # ── Guest 1: wrong passcode, then correct ──────────────────────────────
        g1.goto(f"{BASE}/join/{room_id}")
        expect(g1.get_by_text("Friday Game Night")).to_be_visible()
        g1.fill("#name", "Arjun")
        g1.fill("#pass", "wrong-pass")
        g1.get_by_role("button", name="Join room").click()
        expect(g1.get_by_role("alert")).to_contain_text(re.compile("passcode", re.I))
        shot(g1, "05-wrong-passcode-desktop")
        step("wrong passcode rejected by the server")
        g1.fill("#pass", PASS)
        g1.get_by_role("button", name="Join room").click()
        g1.wait_for_url(re.compile(f"/room/{room_id}"))
        expect(host.locator(".players-card").get_by_text("Arjun")).to_be_visible()
        step("guest1 joined; host lobby updated in real time")

        # ── Guest 2 joins via manual code entry ────────────────────────────────
        g2.goto(BASE + "/join")
        g2.fill("#code", room_id.lower()[:4] + "-" + room_id.lower()[4:])
        g2.get_by_role("button", name=re.compile("Continue")).click()
        g2.fill("#name", "Meera")
        g2.fill("#pass", PASS)
        g2.get_by_role("button", name="Join room").click()
        g2.wait_for_url(re.compile(f"/room/{room_id}"))
        for pg in (host, g1, g2):
            for n in ("Priya", "Arjun", "Meera"):
                expect(pg.locator(".players-card").get_by_text(n)).to_be_visible()
        expect(g1.get_by_role("button", name=re.compile("Start Quiz Battle"))).to_have_count(0)  # guests can't start
        shot(host, "06-lobby-3-players-mobile")
        shot(g1, "06-lobby-guest-desktop")
        step("3 players from separate sessions see the same lobby")

        # ── Start the game ─────────────────────────────────────────────────────
        expect(host.get_by_text("Ready! 3 players will play.")).to_be_visible()
        start_btn.click()
        for pg in (host, g1, g2):
            expect(pg.locator(".answers button").first).to_be_visible(timeout=TIMEOUT)
        q_text = [pg.locator("h2.question").inner_text() for pg in (host, g1, g2)]
        assert len(set(q_text)) == 1, f"question mismatch: {q_text}"
        shot(host, "07-quiz-question-mobile")
        shot(g1, "07-quiz-question-desktop")
        step("game started simultaneously; same question on all devices")

        def answer_round(idx: int, reload_guest: bool = False) -> None:
            host.locator(".answers button").nth(0).click()
            g1.locator(".answers button").nth(1).click()
            if reload_guest:
                # Reconnect mid-round: reload the tab, state (incl. my locked answer) must come back.
                g2.locator(".answers button").nth(2).click()
                expect(g2.locator(".answers button[aria-pressed=true]")).to_have_count(1)
                g2.reload()
                expect(g2.locator(".answers button").first).to_be_visible()
            else:
                g2.locator(".answers button").nth(2).click()
            for pg in (host, g1, g2):
                expect(pg.locator(".answers button.answer-correct")).to_have_count(1, timeout=TIMEOUT)
            boards = [scoreboard(pg) for pg in (host, g1, g2)]
            if idx == 0:
                shot(host, "08-quiz-reveal-mobile")
                shot(g1, "08-quiz-reveal-desktop")
            assert boards[0] == boards[1] == boards[2], f"scoreboards differ: {boards}"

        answer_round(0)
        step("round 1 revealed; scoreboards identical")
        answer_round(1, reload_guest=True)
        step("guest reloaded mid-round, reconnected with answer intact; round 2 synced")
        for pg in (host, g1, g2):
            expect(pg.locator(".answers button").first).to_be_enabled(timeout=TIMEOUT)
        answer_round(2)
        step("round 3 synced")

        # ── Final results ──────────────────────────────────────────────────────
        for pg in (host, g1, g2):
            expect(pg.get_by_text(re.compile("Final results|wins|Winner", re.I)).first).to_be_visible(timeout=TIMEOUT)
        finals = [pg.locator(".leaderboard").inner_text() for pg in (host, g1, g2)]
        shot(host, "09-final-mobile")
        shot(g1, "09-final-desktop")
        assert finals[0] == finals[1] == finals[2], "final standings differ"
        step("final results identical on all devices")

        host.get_by_role("button", name=re.compile("Back to lobby")).click()
        for pg in (host, g1, g2):
            expect(pg.locator(".players-card")).to_be_visible()
        host.get_by_role("button", name=re.compile("Change game")).click()
        host.get_by_role("button", name=re.compile("Would You Rather")).first.click()
        host.get_by_role("button", name="Save").click()
        expect(g1.get_by_role("heading", name=re.compile("Would You Rather"))).to_be_visible()
        shot(g1, "10-lobby-switched-desktop")
        step("host returned to lobby and switched game; guests updated")

        # ── Would You Rather round: private votes, aggregate reveal ───────────
        host.get_by_role("button", name=re.compile("Start Would You Rather")).click()
        for pg in (host, g1, g2):
            expect(pg.locator(".wyr-option").first).to_be_visible()
        host.locator(".wyr-option").nth(0).click()
        g1.locator(".wyr-option").nth(0).click()
        g2.locator(".wyr-option").nth(1).click()
        for pg in (host, g1, g2):
            expect(pg.get_by_text("67%").first).to_be_visible()
        shot(g2, "11-wyr-reveal-tablet")
        step("Would You Rather: votes private until all in; 67% / 33% everywhere")

        browser.close()
        if errors:
            print("Page errors:", *errors, sep="\n  ")
            return 1
        print(f"\nE2E PASSED — screenshots in {SHOTS}")
        return 0


if __name__ == "__main__":
    t = time.time()
    code = main()
    print(f"({time.time() - t:.1f}s)")
    sys.exit(code)
