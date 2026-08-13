#!/usr/bin/env python3
"""A stand-in for Supabase's REST API, for testing highscores and the guestbook
without touching the real database.

It mirrors the rules in supabase/schema.sql closely enough to exercise the
browser side: run tokens, score plausibility, name rules, the honeypot and the
duplicate check. Data lives in memory and vanishes when you stop it.

    python3 tools/mock_backend.py      # serves on http://localhost:8001

Point the site at it by setting `backend` in content/site.json to
{"url": "http://localhost:8001", "anonKey": "mock"} and rebuilding. Put the
empty values back before committing.
"""

import json
import re
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

GAMES = {
    "one-piece-quiz": {"max_score": 6000, "max_rate": 400, "min_seconds": 12},
    "naruto-quiz": {"max_score": 6000, "max_rate": 400, "min_seconds": 12},
    "bleach-quiz": {"max_score": 6000, "max_rate": 400, "min_seconds": 12},
    "dragon-ball-quiz": {"max_score": 6000, "max_rate": 400, "min_seconds": 12},
    "duel": {"max_score": 150000, "max_rate": 900, "min_seconds": 3},
    "ink-bomb": {"max_score": 400000, "max_rate": 2000, "min_seconds": 3},
    "shuriken": {"max_score": 200000, "max_rate": 900, "min_seconds": 3},
    "panel-dash": {"max_score": 200000, "max_rate": 900, "min_seconds": 3},
    "paj-says-survive": {"max_score": 250000, "max_rate": 900, "min_seconds": 3},
}

RUNS = {}
SCORES = []
GUESTBOOK = []
NAME_RE = re.compile(r"^[A-Za-z0-9 _.-]{3,12}$")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "apikey, authorization, content-type, accept, prefer")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def fail(self, message):
        self.reply(400, {"message": message})

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        if url.path == "/rest/v1/scores":
            game = query.get("game", ["eq."])[0].split("eq.")[-1]
            rows = [s for s in SCORES if s["game"] == game]
            rows.sort(key=lambda r: (-r["score"], r["created_at"]))
            limit = int(query.get("limit", ["10"])[0])
            return self.reply(200, [{"name": r["name"], "score": r["score"],
                                     "created_at": r["created_at"]} for r in rows[:limit]])
        if url.path == "/rest/v1/guestbook":
            rows = [g for g in GUESTBOOK if not g["hidden"]]
            rows.sort(key=lambda r: r["created_at"], reverse=True)
            return self.reply(200, rows[:50])
        self.reply(404, {"message": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        path = urlparse(self.path).path

        if path == "/rest/v1/rpc/start_run":
            game = body.get("p_game")
            if game not in GAMES:
                return self.fail("Unknown game.")
            token = str(uuid.uuid4())
            RUNS[token] = {"game": game, "started": time.time(), "used": None}
            return self.reply(200, token)

        if path == "/rest/v1/rpc/submit_score":
            token = body.get("p_token")
            name = (body.get("p_name") or "").strip()
            score = body.get("p_score")
            if not NAME_RE.match(name):
                return self.fail("Names are 3 to 12 characters: letters, numbers, space, - _ .")
            run = RUNS.get(token)
            if not run:
                return self.fail("This run cannot be scored. Play a fresh round.")
            if run["used"]:
                return self.fail("That run has already been posted.")
            game = GAMES[run["game"]]
            seconds = time.time() - run["started"]
            if seconds < game["min_seconds"]:
                return self.fail("That was too fast to be a real run.")
            if score < 0 or score > game["max_score"]:
                return self.fail("That score is not possible in this game.")
            if score > game["max_rate"] * seconds:
                return self.fail("That score is not possible in the time the run took.")
            run["used"] = time.time()
            SCORES.append({"game": run["game"], "name": name, "score": score,
                           "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
            return self.reply(200, len(SCORES))

        if path == "/rest/v1/rpc/sign_guestbook":
            if (body.get("p_website") or "").strip():
                return self.reply(200, 0)
            name = (body.get("p_name") or "").strip()
            message = (body.get("p_message") or "").strip()
            if not (2 <= len(name) <= 24):
                return self.fail("Name is 2 to 24 characters.")
            if not (2 <= len(message) <= 500):
                return self.fail("Message is 2 to 500 characters.")
            if any(g["message"] == message for g in GUESTBOOK):
                return self.fail("That message is already on the wall.")
            if len(GUESTBOOK) >= 3:
                return self.fail("You have signed a few times already. Come back later.")
            GUESTBOOK.append({"id": len(GUESTBOOK) + 1, "name": name, "message": message,
                              "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"), "hidden": False})
            return self.reply(200, len(GUESTBOOK))

        self.reply(404, {"message": "not found"})


if __name__ == "__main__":
    print("mock supabase on http://localhost:8001")
    HTTPServer(("", 8001), Handler).serve_forever()
