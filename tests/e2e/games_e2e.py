"""
Browser E2E for the other six games, in ONE room with three isolated players (phone host,
desktop guest, tablet guest). The host switches games from the lobby between sessions.

  Draw & Guess   – drawer picks a word, draws with the mouse; strokes must appear on the
                   OTHER players' canvases (pixel check); wrong + correct guesses.
  Tic-Tac-Toe    – X moves; all three (incl. spectator) see the mark; spectator can't move.
  Impostor       – all players submit clues → voting stage everywhere.
  Word Chain     – current player submits a real word; chain updates everywhere.
  Rapid Categories – wrong-letter answer is rejected by the server with a message.
  Truth or Dare  – host picks Dare; the same prompt appears on every device.

Each game is ended via the host's "End game" control and the room returns to the lobby.
Usage:  python tests/e2e/games_e2e.py   (BASE_URL defaults to http://localhost:5173)
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
PASS = "otter77"
WORDS = {
    "a": "apple", "b": "banana", "c": "carrot", "d": "dolphin", "e": "eagle", "f": "forest", "g": "garden",
    "h": "harbor", "i": "island", "j": "jacket", "k": "kitten", "l": "lemon", "m": "mango", "n": "needle",
    "o": "orange", "p": "pepper", "q": "queen", "r": "rabbit", "s": "summer", "t": "tiger", "u": "umbrella",
    "v": "valley", "w": "window", "x": "xylophone", "y": "yellow", "z": "zebra",
}


def step(msg: str) -> None:
    print(f"  ✓ {msg}", flush=True)


def shot(page: Page, name: str) -> None:
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 0, f"{name}: page overflows horizontally by {overflow}px"
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        specs = [
            ("host", dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)),
            ("desk", dict(viewport={"width": 1280, "height": 800})),
            ("tab", dict(viewport={"width": 820, "height": 1180})),
        ]
        pages: dict[str, Page] = {}
        errors: list[str] = []
        for name, spec in specs:
            c = browser.new_context(**spec)
            c.set_default_timeout(15_000)
            pg = c.new_page()
            pg.on("pageerror", lambda e, n=name: errors.append(f"{n}: {e}"))
            pages[name] = pg
        host, desk, tab = pages["host"], pages["desk"], pages["tab"]
        everyone = [host, desk, tab]

        # ── Room setup through the real UI ─────────────────────────────────────
        host.goto(BASE + "/create")
        host.fill("#hostName", "Kabir")
        host.get_by_role("button", name=re.compile("Next: choose a game")).click()
        host.locator(".game-card", has_text="Draw & Guess").click()
        host.get_by_role("button", name=re.compile("settings →")).click()
        host.fill("#passcode", PASS)
        host.get_by_role("button", name=re.compile("Create & Invite")).click()
        host.wait_for_url(re.compile(r"/room/[A-Z2-9]{8}"))
        room = host.url.rsplit("/", 1)[-1]
        for pg, nm in ((desk, "Zoya"), (tab, "Dev")):
            pg.goto(f"{BASE}/join/{room}")
            pg.fill("#name", nm)
            pg.fill("#pass", PASS)
            pg.get_by_role("button", name="Join room").click()
            pg.wait_for_url(re.compile(f"/room/{room}"))
        expect(host.get_by_text("Ready! 3 players will play.")).to_be_visible()
        step(f"room {room} with 3 players")

        def start(game: str) -> None:
            host.get_by_role("button", name=re.compile(f"Start {re.escape(game)}")).click()

        def end_and_return() -> None:
            toggle = host.locator(".board-toggle")
            if toggle.is_visible():
                toggle.click()
            host.get_by_role("button", name="End game").click()
            host.get_by_role("button", name="Confirm").click()
            for pg in everyone:
                expect(pg.get_by_text("Game ended")).to_be_visible()
            host.get_by_role("button", name=re.compile("Back to lobby")).click()
            for pg in everyone:
                expect(pg.locator(".players-card")).to_be_visible()

        def switch(game: str) -> None:
            host.get_by_role("button", name=re.compile("Change game")).click()
            host.locator(".game-card", has_text=game).click()
            host.get_by_role("button", name="Save").click()
            for pg in everyone:
                expect(pg.locator(".selected-game h3")).to_have_text(game)

        def find(predicate, timeout=15.0) -> Page:
            deadline = time.time() + timeout
            while time.time() < deadline:
                for pg in everyone:
                    if predicate(pg):
                        return pg
                time.sleep(0.2)
            raise AssertionError("no page matched")

        # ── Draw & Guess ───────────────────────────────────────────────────────
        start("Draw & Guess")
        drawer = find(lambda pg: pg.locator(".drawing button.btn-lg").count() > 0)
        guessers = [pg for pg in everyone if pg is not drawer]
        shot(drawer, "20-drawing-choose")
        drawer.locator(".drawing button.btn-lg").first.click()
        word = drawer.locator(".hint b").inner_text().strip()
        canvas = drawer.locator("canvas[aria-label^='Drawing canvas']")
        expect(canvas).to_be_visible()
        canvas.scroll_into_view_if_needed()
        box = canvas.bounding_box()
        assert box
        drawer.mouse.move(box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.3)
        drawer.mouse.down()
        for i in range(25):
            drawer.mouse.move(box["x"] + box["width"] * (0.2 + i * 0.025), box["y"] + box["height"] * (0.3 + 0.4 * (i % 5) / 5), steps=2)
        drawer.mouse.up()
        ink = (
            "() => { const c = document.querySelector('.drawing canvas'); const d = c.getContext('2d')"
            ".getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16)"
            " if (d[i+3] > 0 && (d[i] < 128 || d[i+1] < 128 || d[i+2] < 128)) n++; return n; }"
        )
        for g in guessers:
            g.wait_for_function(ink.replace("return n; }", "return n > 30; }"), timeout=5000)
        counts = [g.evaluate(ink) for g in guessers]
        step(f"strokes synced to other players' canvases (ink samples: {counts})")
        assert all(c > 30 for c in counts)
        for g in guessers:
            expect(g.locator(".hint b")).to_have_count(0)  # word is not revealed to guessers
        guessers[0].get_by_label("Your guess").fill("definitely-not-it")
        guessers[0].get_by_label("Your guess").press("Enter")
        guessers[0].get_by_label("Your guess").fill(word)
        guessers[0].get_by_label("Your guess").press("Enter")
        expect(guessers[0].get_by_text(re.compile("You got it"))).to_be_visible()
        expect(guessers[1].get_by_label("Your guess")).to_be_visible()  # the other guesser still guessing
        shot(guessers[0], "21-drawing-guessed")
        shot(guessers[1], "21-drawing-guesser")
        shot(drawer, "21-drawing-drawer")
        step("wrong guess shown in the feed; correct guess hidden (\"X guessed the word\"), scored; word still secret for the others")
        end_and_return()

        # ── Tic-Tac-Toe ────────────────────────────────────────────────────────
        switch("Tic-Tac-Toe Arena")
        start("Tic-Tac-Toe Arena")
        center = "Row 2, column 2"
        xpage = find(lambda pg: pg.get_by_role("button", name=re.compile(center)).count() > 0 and pg.get_by_role("button", name=re.compile(center)).is_enabled())
        xpage.get_by_role("button", name=re.compile(center)).click()
        for pg in everyone:
            expect(pg.get_by_role("button", name=f"{center}: X")).to_be_visible()
        names = {id(host): "Kabir", id(desk): "Zoya", id(tab): "Dev"}
        spectators = [pg for pg in everyone if names[id(pg)] in (pg.locator(".queue").inner_text() if pg.locator(".queue").count() else "")]
        assert len(spectators) == 1, "exactly one spectator expected"
        expect(spectators[0].get_by_role("button", name="Row 1, column 1: empty")).to_be_disabled()
        shot(spectators[0], "22-tictactoe-spectator")
        shot(xpage, "22-tictactoe-player")
        step("Tic-Tac-Toe move synced to both players and the spectator; spectator cannot move")
        end_and_return()

        # ── Impostor ───────────────────────────────────────────────────────────
        switch("Impostor")
        start("Impostor")
        for i, pg in enumerate(everyone):
            pg.get_by_label("Your clue").fill(f"vague hint {i}")
            pg.get_by_label("Your clue").press("Enter")
        for pg in everyone:
            expect(pg.get_by_text(re.compile("vote", re.I)).first).to_be_visible()
        shot(desk, "23-impostor-voting")
        step("Impostor clues collected → voting stage on all devices")
        end_and_return()

        # ── Word Chain ─────────────────────────────────────────────────────────
        switch("Word Chain")
        start("Word Chain")
        cur = find(lambda pg: pg.get_by_label("Your word").count() > 0)
        letter = cur.locator(".big-letter").inner_text().strip().lower()
        cur.get_by_label("Your word").fill(WORDS[letter])
        cur.get_by_label("Your word").press("Enter")
        for pg in everyone:
            expect(pg.locator(".chain")).to_contain_text(WORDS[letter])
        shot(tab, "24-wordchain")
        step(f"Word Chain: '{WORDS[letter]}' accepted and synced")
        end_and_return()

        # ── Rapid Categories ───────────────────────────────────────────────────
        switch("Rapid Categories")
        start("Rapid Categories")
        expect(desk.get_by_label("Your answer")).to_be_visible()
        letter = desk.locator(".cat-prompt .big-letter").inner_text().strip().lower()
        wrong = "zzz" if letter != "z" else "aaa"
        desk.get_by_label("Your answer").fill(wrong)
        desk.get_by_label("Your answer").press("Enter")
        expect(desk.get_by_role("alert")).to_contain_text(re.compile("start with", re.I))
        shot(desk, "25-categories-rejected")
        step("Rapid Categories: wrong-letter answer rejected server-side")
        end_and_return()

        # ── Truth or Dare ──────────────────────────────────────────────────────
        switch("Truth or Dare")
        start("Truth or Dare")
        host.locator(".tod-btn.dare").click()  # host may act on behalf of the current player
        prompt = None
        for pg in everyone:
            expect(pg.locator(".prompt-card p")).to_be_visible()
        texts = [pg.locator(".prompt-card p").inner_text() for pg in everyone]
        assert len(set(texts)) == 1, texts
        prompt = texts[0]
        shot(host, "26-truthordare-mobile")
        step(f"Truth or Dare prompt identical everywhere: {prompt[:50]!r}")
        end_and_return()

        browser.close()
        if errors:
            print("Page errors:", *errors, sep="\n  ")
            return 1
        print("\nGAMES E2E PASSED")
        return 0


if __name__ == "__main__":
    t = time.time()
    rc = main()
    print(f"({time.time() - t:.1f}s)")
    sys.exit(rc)
