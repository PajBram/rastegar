#!/usr/bin/env python3
"""Refresh the skill tree: content/skilltree/skills.json.

    python3 tools/skilltree.py             fetch, sort into branches, write
    python3 tools/skilltree.py --offline   re-sort the snapshot already on disk

Where the data comes from:

1. skills.sh's front page. It carries the all-time leaderboard (the 600 most
   installed skills) inside the page itself, so one request covers it. Their
   JSON API wants a Vercel login, and robots.txt asks crawlers to stay out of
   /api/, so the front page is the polite way in.
2. GitHub, for each skill's folder and its SKILL.md. The description shown on
   the site is the author's own, word for word, and the folder is what Claude
   is asked to download when a visitor sends it their picks.

GitHub's API allows 60 requests an hour without a token and a refresh needs
about twice that. The script uses $GITHUB_TOKEN if it is set, and otherwise
borrows the GitHub CLI's login (`gh auth token`).

Which branch a skill hangs on is decided by content/skilltree/branches.json:
every branch lists words to look for, and `pin` settles the ones the words get
wrong. Edit that file, run with --offline, and nothing is fetched.

Standard library only, like build.py.
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TREE = ROOT / "content" / "skilltree"
SNAPSHOT = TREE / "skills.json"
BRANCHES = TREE / "branches.json"

LEADERBOARD = "https://www.skills.sh/"
USER_AGENT = "rastegar.se skill tree (+https://rastegar.se/skilltree/)"
FIXTURES = {"test", "tests", "__tests__", "fixtures", "testdata", "node_modules"}


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------

def get(url: str, headers: dict | None = None) -> str | None:
    """GET a URL as text. None on 404; retries anything that smells transient."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code in (403, 429) and "api.github.com" in url:
                sys.exit("GitHub said no (%d). Set GITHUB_TOKEN or log in with `gh auth login`, "
                         "then run this again." % error.code)
            if error.code < 500 or attempt == 3:
                raise
        except urllib.error.URLError:
            if attempt == 3:
                raise
        time.sleep(1.5 * (attempt + 1))
    return None


def github_token() -> str | None:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token
    try:
        out = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip() or None


TOKEN: str | None = None


def github(path: str) -> dict | None:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    text = get("https://api.github.com" + path, headers)
    return json.loads(text) if text else None


def leaderboard() -> list[dict]:
    """The all-time leaderboard, dug out of the front page's streamed payload."""
    page = get(LEADERBOARD) or ""
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', page, re.S)
    payload = "".join(json.loads('"' + chunk + '"') for chunk in chunks)
    at = payload.find('"initialSkills":')
    if at < 0:
        sys.exit("skills.sh has changed its front page: no leaderboard found in it.")
    rows, _ = json.JSONDecoder().raw_decode(payload, payload.index("[", at))
    return rows


def raw(repo: str, ref: str, path: str) -> str:
    return get(f"https://raw.githubusercontent.com/{repo}/{ref}/{path}") or ""


# --------------------------------------------------------------------------
# SKILL.md
# --------------------------------------------------------------------------

def front_matter(text: str) -> tuple[dict, str]:
    """The top-level scalars of a SKILL.md's YAML front matter, and the body.

    Enough YAML for what skill authors actually write: plain, quoted, and
    folded or literal block values. Nested maps are skipped.
    """
    text = text.lstrip("﻿")
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    lines = text[3:end].split("\n")
    body = text[end + 4:].split("\n", 1)[-1]
    meta: dict = {}
    i = 0
    while i < len(lines):
        match = re.match(r"^([A-Za-z_][\w-]*):[ \t]*(.*)$", lines[i])
        i += 1
        if not match:
            continue
        key, rest = match.group(1), match.group(2).strip()
        more = []
        while i < len(lines) and (lines[i][:1] in (" ", "\t") or not lines[i].strip()):
            more.append(lines[i].strip())
            i += 1
        if rest[:1] in ("|", ">"):
            value = " ".join(part for part in more if part)
        elif rest[:1] == '"':
            joined = " ".join([rest] + [part for part in more if part])
            quoted = re.match(r'"((?:[^"\\]|\\.)*)"', joined)
            value = quoted.group(1) if quoted else joined.strip('"')
            value = re.sub(r"\\(.)", lambda m: {"n": " ", "t": " "}.get(m.group(1), m.group(1)), value)
        elif rest[:1] == "'":
            joined = " ".join([rest] + [part for part in more if part])
            value = joined[1:joined.rfind("'")] if joined.count("'") > 1 else joined.strip("'")
            value = value.replace("''", "'")
        else:
            value = " ".join([rest] + [part for part in more if part and not re.match(r"^[\w-]+:", part)])
        meta[key] = re.sub(r"\s+", " ", value).strip()
    return meta, body


def folder(path: str) -> str:
    return path.rsplit("/", 1)[0] if "/" in path else ""


def locate(skill: dict, repo: dict, read) -> str | None:
    """Which SKILL.md in the repository is this skill?

    The folder name nearly always matches the skill's id. When it does not,
    or matches twice, the name in the front matter decides.
    """
    want = skill["skillId"].lower()
    repo_name = skill["source"].split("/")[1].lower()

    def leaf(path: str) -> str:
        return (folder(path).rsplit("/", 1)[-1] or repo_name).lower()

    def named(path: str) -> str:
        return front_matter(read(path))[0].get("name", "").lower()

    by_folder = [p for p in repo["paths"] if leaf(p) == want]
    if len(by_folder) == 1:
        return by_folder[0]
    if by_folder:
        # Some repositories keep a copy per agent (.cursor/skills/x,
        # .claude/skills/x, ...). Prefer a plain skills/ folder, then
        # Claude's own, then anything not hidden, then the shallowest.
        exact = [p for p in by_folder if named(p) == want] or by_folder
        return min(exact, key=lambda p: (
            0 if p.startswith("skills/") else 1 if p.startswith(".claude/skills/") else 2,
            any(part.startswith(".") for part in p.split("/")[:-1]),
            p.count("/"), len(p)))
    loose = want.replace(":", "-").replace(" ", "-")
    for path in repo["paths"]:
        if named(path) in (want, loose) or leaf(path) == loose:
            return path
    return None


# --------------------------------------------------------------------------
# Fetch everything
# --------------------------------------------------------------------------

def fetch(settings: dict) -> dict:
    global TOKEN
    TOKEN = github_token()
    if not TOKEN:
        print("no GitHub token: fine for a few repositories, likely to hit the hourly limit")

    board = leaderboard()
    print(f"leaderboard: {len(board)} skills")

    # GitHub repositories only: a skill served from a company's own domain
    # cannot be fetched the same way, and those are all in Chinese anyway.
    # The same skill copied into several accounts keeps only its most
    # installed copy.
    exclude = set(settings.get("exclude", []))
    seen: dict[str, dict] = {}
    for row in board:
        owner = row["source"].split("/")[0]
        if row["source"].count("/") != 1 or "." in owner:
            continue
        if f"{row['source']}/{row['skillId']}" in exclude or row["source"] in exclude:
            continue
        name = row["name"].lower()
        if name not in seen or row["installs"] > seen[name]["installs"]:
            seen[name] = row
    candidates = sorted(seen.values(), key=lambda r: -r["installs"])
    print(f"{len(candidates)} candidates from {len({r['source'] for r in candidates})} repositories")

    def scan(name: str) -> tuple[str, dict | None]:
        info = github(f"/repos/{name}")
        if not info:
            return name, None
        ref = info["default_branch"]
        tree = github(f"/repos/{name}/git/trees/{ref}?recursive=1") or {"tree": []}
        # Test fixtures carry SKILL.md files too, and a skill that has since
        # been deleted from the repository can match one by name.
        paths = [t["path"] for t in tree["tree"]
                 if t["type"] == "blob" and (t["path"] == "SKILL.md" or t["path"].endswith("/SKILL.md"))
                 and not FIXTURES.intersection(t["path"].lower().split("/")[:-1])]
        spdx = (info.get("license") or {}).get("spdx_id")
        return name, {"ref": ref, "paths": paths,
                      "license": spdx if spdx and spdx != "NOASSERTION" else None}

    with ThreadPoolExecutor(8) as pool:
        repos = dict(pool.map(scan, sorted({row["source"] for row in candidates})))

    cache: dict[tuple, str] = {}

    def reader(name: str):
        def read(path: str) -> str:
            key = (name, path)
            if key not in cache:
                cache[key] = raw(name, repos[name]["ref"], path)
            return cache[key]
        return read

    def resolve(row: dict) -> dict | None:
        repo = repos.get(row["source"])
        if not repo:
            print(f"  gone: {row['source']}")
            return None
        read = reader(row["source"])
        path = locate(row, repo, read)
        if not path:
            print(f"  no SKILL.md found: {row['source']} {row['skillId']}")
            return None
        meta, body = front_matter(read(path))
        description = meta.get("description", "")
        if len(description) > 1024:
            description = description[:1021].rsplit(" ", 1)[0] + "…"
        return {
            "id": f"{row['source']}/{row['skillId']}",
            "name": row["name"],
            "repo": row["source"],
            "ref": repo["ref"],
            "path": folder(path),
            "installs": row["installs"],
            "official": bool(row.get("isOfficial")),
            "license": repo["license"],
            "description": description,
            "_body": body,
        }

    with ThreadPoolExecutor(8) as pool:
        found = [s for s in pool.map(resolve, candidates) if s]

    # The page is in English, so a skill described in another script is left
    # out; so is one that does not describe itself at all. Then no single
    # repository gets to fill the tree on its own.
    cap = settings.get("perRepo", 15)
    skills, per_repo = [], Counter()
    for skill in found:
        text = skill["description"]
        foreign = sum(1 for ch in text if ord(ch) > 0x2E7F)
        if not text or foreign > len(text) * 0.2:
            continue
        if per_repo[skill["repo"]] < cap:
            per_repo[skill["repo"]] += 1
            skills.append(skill)
    skills = skills[: settings.get("limit", 400)]
    print(f"kept {len(skills)} skills from {len(per_repo)} repositories")

    # The authors' own pointers: a SKILL.md that names another skill in the
    # tree. A plain word like `triage` only counts written as code or as a
    # slash command; a hyphenated name is distinctive enough on its own.
    names = {s["name"]: s["id"] for s in skills}
    for skill in skills:
        pointers = []
        for name, other in names.items():
            if other == skill["id"]:
                continue
            bare = re.escape(name)
            if "-" in name or ":" in name:
                pattern = r"(?<![\w/.-])" + bare + r"(?![\w-])"
            else:
                pattern = r"`/?" + bare + r"`|(?<![\w/])/" + bare + r"(?![\w-])"
            if re.search(pattern, skill["_body"]):
                pointers.append(other)
        skill["mentions"] = sorted(pointers)
    for skill in skills:
        del skill["_body"]

    return {"snapshot": date.today().isoformat(), "source": LEADERBOARD, "skills": skills}


# --------------------------------------------------------------------------
# Branches and threads
# --------------------------------------------------------------------------

def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9][a-z0-9+#.]*[a-z0-9+#]|[a-z0-9]", text.lower())


def classify(snapshot: dict, settings: dict) -> None:
    """Hang every skill on one branch, and note up to two it also reaches.

    Each branch's keywords score against the skill's name (three times over),
    its repository's name, and its description. A phrase with a space in it is
    matched as a phrase. `pin` in branches.json overrides the lot.
    """
    branches = settings["branches"]
    pins = settings.get("pin", {})
    fallback = settings.get("fallback", branches[-1]["id"])
    for skill in snapshot["skills"]:
        name_text = " " + " ".join(words(skill["name"].replace("-", " "))) + " "
        repo_text = " " + " ".join(words(skill["repo"].replace("-", " ").replace("/", " "))) + " "
        desc_text = " " + " ".join(words(skill["description"])) + " "
        scores = {}
        for branch in branches:
            score = 0.0
            for keyword in branch["keywords"]:
                needle = " " + " ".join(words(keyword)) + " "
                score += 3 * name_text.count(needle) + 1.5 * repo_text.count(needle)
                score += min(desc_text.count(needle), 3)
            scores[branch["id"]] = score
        ranked = sorted(branches, key=lambda b: -scores[b["id"]])
        best = ranked[0]["id"] if scores[ranked[0]["id"]] > 0 else fallback
        pinned = pins.get(skill["id"]) or pins.get(skill["repo"])
        skill["branch"] = pinned or best
        top = max(scores.values()) or 1
        skill["also"] = [b["id"] for b in ranked[:3]
                         if b["id"] != skill["branch"] and scores[b["id"]] >= max(2, top * 0.6)][:2]

    known = {s["id"] for s in snapshot["skills"]} | {s["repo"] for s in snapshot["skills"]}
    for key in pins:
        if key not in known:
            print(f"  pin matches nothing in the tree: {key}")


STOP = set("""
a an the and or but if then else when while of for to in on at by with from into
onto over under as is are was were be been being it its this that these those
you your yours we our they their them he she his her i me my use used uses using
can could should would will may might must do does did done not no yes any all
each every some more most other such only own same so than too very just also
via per about across after before between during through up down out off again
further once here there where why how what which who whom whose skill skills
agent agents ai claude code coding user users asks ask asked task tasks work
working help helps helping make makes making get gets create creates creating
build builds building write writes writing including include includes etc e.g
i.e like new need needs want wants trigger triggers triggered mention mentions
mentioned whenever guide guidance best practices practice pattern patterns tool
tools based support supports provides provide set up setup instead without one
two first even well way ways project projects file files run runs running
""".split())


def relate(snapshot: dict, settings: dict) -> None:
    """Threads between skills whose descriptions talk about the same things.

    TF-IDF over the name and description, cosine similarity, and each skill's
    three nearest neighbours if they are near enough to mean something.
    """
    skills = snapshot["skills"]
    docs = []
    for skill in skills:
        name_words = words(skill["name"].replace("-", " ").replace(":", " "))
        tokens = [w for w in name_words * 2 + words(skill["description"])
                  if w not in STOP and len(w) > 2 and not w.isdigit()]
        docs.append(Counter(tokens))
    df = Counter(w for doc in docs for w in doc)
    n = len(docs)
    vectors = []
    for doc in docs:
        vec = {w: (1 + math.log(c)) * math.log(n / df[w]) for w, c in doc.items() if df[w] > 1}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1
        vectors.append({w: v / norm for w, v in vec.items()})
    floor = settings.get("similarity", 0.22)
    for i, skill in enumerate(skills):
        scored = []
        for j, other in enumerate(vectors):
            if i == j:
                continue
            small, large = (vectors[i], other) if len(vectors[i]) < len(other) else (other, vectors[i])
            sim = sum(v * large.get(w, 0) for w, v in small.items())
            if sim >= floor:
                scored.append((sim, skills[j]["id"]))
        scored.sort(reverse=True)
        skill["similar"] = [sid for _, sid in scored[:3]]


def main() -> None:
    settings = json.loads(BRANCHES.read_text(encoding="utf-8"))
    if "--offline" in sys.argv:
        snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    else:
        snapshot = fetch(settings)
    classify(snapshot, settings)
    relate(snapshot, settings)

    order = [s.get("id") for s in snapshot["skills"]]
    keep = ("id", "name", "repo", "ref", "path", "installs", "official", "license",
            "description", "branch", "also", "mentions", "similar")
    snapshot["skills"] = [{k: s.get(k) for k in keep}
                          for s in sorted(snapshot["skills"], key=lambda s: (-s["installs"], order.index(s["id"])))]
    TREE.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(json.dumps(snapshot, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    counts = Counter(s["branch"] for s in snapshot["skills"])
    for branch in settings["branches"]:
        print(f"  {branch['label']:<24} {counts.get(branch['id'], 0)}")
    print(f"wrote {SNAPSHOT.relative_to(ROOT)} ({len(snapshot['skills'])} skills)")


if __name__ == "__main__":
    main()
