#!/usr/bin/env python3
"""Static site generator for rastegar.se.

Standard library only, on purpose: this machine has Python but no Node, and a
zero-dependency build still works years from now without anyone updating it.

    python3 build.py            build into dist/
    python3 build.py --serve    build, then serve dist/ on http://localhost:8000

Content lives in content/, templates in templates/, assets in static/.
See CONTENT.md for the authoring guide.
"""

from __future__ import annotations

import html
import json
import re
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
PUBLIC = ROOT / "public"
DIST = ROOT / "dist"


# --------------------------------------------------------------------------
# Front matter + markdown
# --------------------------------------------------------------------------

def parse_front_matter(raw: str) -> tuple[dict, str]:
    """Split a `---` fenced front matter block off the top of a markdown file.

    Values are plain strings, except `[a, b]` lists and true/false.
    """
    if not raw.startswith("---"):
        return {}, raw
    end = raw.find("\n---", 3)
    if end == -1:
        return {}, raw
    head = raw[3:end].strip("\n")
    body = raw[end + 4:].lstrip("\n")
    meta: dict = {}
    for line in head.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            meta[key] = [v.strip().strip("\"'") for v in inner.split(",") if v.strip()]
        elif value.lower() in ("true", "false"):
            meta[key] = value.lower() == "true"
        else:
            meta[key] = value.strip("\"'")
    return meta, body


INLINE_CODE = re.compile(r"`([^`]+)`")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"(?<!\*)\*([^*\n]+)\*(?!\*)")
LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")


def inline(text: str) -> str:
    """Escape, then apply inline markdown. Code spans are stashed first so
    their contents survive untouched."""
    spans: list[str] = []

    def stash(match: re.Match) -> str:
        spans.append(html.escape(match.group(1)))
        return f"\x00{len(spans) - 1}\x00"

    text = INLINE_CODE.sub(stash, text)
    text = html.escape(text, quote=False)
    text = LINK.sub(lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>', text)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = ITALIC.sub(r"<em>\1</em>", text)
    text = text.replace(" -- ", " &mdash; ")
    for i, span in enumerate(spans):
        text = text.replace(f"\x00{i}\x00", f"<code>{span}</code>")
    return text


def markdown(src: str) -> str:
    """A deliberately small markdown subset: everything this site actually uses.

    Headings, paragraphs, lists, blockquotes, rules, fenced code, and raw HTML
    blocks (any line starting with `<` at column 0 passes straight through).
    """
    out: list[str] = []
    lines = src.replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped.startswith("```"):
            i += 1
            code: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(html.escape(lines[i]))
                i += 1
            i += 1
            out.append("<pre><code>" + "\n".join(code) + "</code></pre>")
            continue

        if line.startswith("<"):
            block = []
            while i < len(lines) and lines[i].strip():
                block.append(lines[i])
                i += 1
            out.append("\n".join(block))
            continue

        if re.fullmatch(r"-{3,}|\*{3,}", stripped):
            out.append('<hr class="tone-rule">')
            i += 1
            continue

        heading = re.match(r"(#{1,4})\s+(.*)", stripped)
        if heading:
            level = len(heading.group(1))
            out.append(f"<h{level}>{inline(heading.group(2))}</h{level}>")
            i += 1
            continue

        if stripped.startswith("> "):
            quote = []
            while i < len(lines) and lines[i].strip().startswith("> "):
                quote.append(lines[i].strip()[2:])
                i += 1
            out.append(f"<blockquote>{inline(' '.join(quote))}</blockquote>")
            continue

        if re.match(r"[-*]\s+", stripped) or re.match(r"\d+\.\s+", stripped):
            ordered = bool(re.match(r"\d+\.\s+", stripped))
            tag = "ol" if ordered else "ul"
            pattern = r"\d+\.\s+" if ordered else r"[-*]\s+"
            items = []
            while i < len(lines) and re.match(pattern, lines[i].strip()):
                items.append(inline(re.sub(pattern, "", lines[i].strip(), count=1)))
                i += 1
            body = "".join(f"<li>{item}</li>" for item in items)
            out.append(f"<{tag}>{body}</{tag}>")
            continue

        para = []
        while i < len(lines) and lines[i].strip() and not lines[i].startswith("<"):
            para.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(para))}</p>")

    return "\n".join(out)


# --------------------------------------------------------------------------
# Templating
# --------------------------------------------------------------------------

def render(template: str, **values: object) -> str:
    """Replace {{key}} tokens. A missing key becomes an empty string."""
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(values.get(m.group(1), "")), template)


def read_template(name: str) -> str:
    return (TEMPLATES / name).read_text(encoding="utf-8")


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# --------------------------------------------------------------------------
# Content loading
# --------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_devlog() -> list[dict]:
    posts = []
    for path in sorted(CONTENT.glob("devlog/*.md")):
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        slug = meta.get("slug") or path.stem[11:] or path.stem
        posts.append({
            "slug": slug,
            "title": meta.get("title", slug),
            "date": meta.get("date", path.stem[:10]),
            "summary": meta.get("summary", ""),
            "tags": meta.get("tags", []),
            "html": markdown(body),
            "url": f"/devlog/{slug}/",
            "file": path.stem,
        })
    # Newest first. The filename breaks ties, so several posts can share a date
    # as long as they are numbered (2026-08-12-01-..., 2026-08-12-02-...).
    posts.sort(key=lambda p: (p["date"], p["file"]), reverse=True)
    return posts


def load_games() -> list[dict]:
    games = []
    for path in sorted(CONTENT.glob("games/*.json")):
        game = load_json(path)
        game["url"] = f"/games/{game['slug']}/"
        game["about_html"] = markdown(game.get("about", ""))
        games.append(game)
    games.sort(key=lambda g: g.get("order", 99))
    return games


def pretty_date(iso: str) -> str:
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d %b %Y").upper()
    except ValueError:
        return iso


# --------------------------------------------------------------------------
# Fragments
# --------------------------------------------------------------------------

def nav_html(active: str, site: dict) -> str:
    links = []
    for item in site["nav"]:
        css = ' class="active"' if item["id"] == active else ""
        links.append('<a href="{0}"{1}>{2}</a>'.format(item["url"], css, html.escape(item["label"])))
    return "".join(links)


def tag_chips(tags: list[str]) -> str:
    return "".join(f'<span class="chip">{html.escape(t)}</span>' for t in tags)


def devlog_card(post: dict) -> str:
    # No anchor inside the card: the whole card is already wrapped in one, and
    # nested links are invalid HTML that browsers rearrange behind your back.
    return f"""<article class="panel panel--post">
  <div class="post-meta"><time datetime="{post['date']}">{pretty_date(post['date'])}</time>{tag_chips(post['tags'])}</div>
  <h3>{html.escape(post['title'])}</h3>
  <p>{html.escape(post['summary'])}</p>
  <span class="more">Read it <span aria-hidden="true">&rarr;</span></span>
</article>"""


def game_card(game: dict) -> str:
    return f"""<a class="panel panel--game tilt-{game.get('tilt', 'a')}" href="{game['url']}">
  <span class="game-card__art" aria-hidden="true">{game.get('glyph', '&#9733;')}</span>
  <span class="game-card__text">
    <span class="kicker">{html.escape(game.get('kind', 'GAME'))}</span>
    <span class="game-card__title">{html.escape(game['title'])}</span>
    <span class="game-card__tagline">{html.escape(game.get('tagline', ''))}</span>
  </span>
  <span class="speedlines" aria-hidden="true"></span>
</a>"""


def series_block(s: dict, games: list[dict]) -> str:
    quiz = next((g for g in games if g["slug"] == s.get("quiz")), None)
    quiz_link = (f'<a class="btn btn--small" href="{quiz["url"]}">Take the {html.escape(quiz["title"])}</a>'
                 if quiz else '<span class="btn btn--small btn--ghost">Quiz coming soon</span>')
    entries = "".join(
        f"""<li class="entry">
      <div class="entry__head">
        <h4>{html.escape(e['title'])}</h4>
        <span class="stars" title="{e['rating']} out of 5" aria-label="{e['rating']} out of 5">{'&#9733;' * int(e['rating'])}{'&#9734;' * (5 - int(e['rating']))}</span>
      </div>
      <span class="entry__status status--{html.escape(str(e.get('status', 'watched')).replace(' ', '-'))}">{html.escape(str(e.get('status', 'watched'))).upper()}</span>
      <p>{inline(e['note'])}</p>
    </li>""" for e in s["entries"])
    return f"""<section class="panel panel--series tilt-{s.get('tilt', 'a')}">
  <header class="series__head">
    <span class="kicker">{html.escape(s.get('kicker', ''))}</span>
    <h3>{html.escape(s['title'])}</h3>
    <p class="series__verdict">{inline(s['verdict'])}</p>
  </header>
  <ul class="entries">{entries}</ul>
  {quiz_link}
</section>"""


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def build() -> None:
    site = load_json(CONTENT / "site.json")
    posts = load_devlog()
    games = load_games()
    anime = load_json(CONTENT / "anime" / "watchlist.json")

    base = read_template("base.html")
    # Empty dist/ without removing the directory itself — a preview server may
    # be sitting inside it with dist/ as its working directory.
    DIST.mkdir(parents=True, exist_ok=True)
    for item in DIST.iterdir():
        shutil.rmtree(item) if item.is_dir() else item.unlink()

    def page(url: str, *, title: str, description: str, active: str, body: str) -> None:
        out = render(
            base,
            title=title,
            site_name=site["name"],
            description=html.escape(description, quote=True),
            nav=nav_html(active, site),
            body=body,
            year=date.today().year,
            canonical=site["url"].rstrip("/") + url,
        )
        target = DIST / "index.html" if url == "/" else DIST / url.strip("/") / "index.html"
        write(target, out)

    def page_source(name: str) -> tuple[dict, str]:
        return parse_front_matter((CONTENT / "pages" / name).read_text(encoding="utf-8"))

    # Home ------------------------------------------------------------------
    _, home_body = page_source("home.md")
    latest = posts[0] if posts else None
    home = render(
        read_template("home.html"),
        intro=markdown(home_body),
        tagline=html.escape(site["tagline"]),
        latest_post=(f'<a class="cardlink" href="{latest["url"]}">{devlog_card(latest)}</a>' if latest else ""),
        game_cards="".join(game_card(g) for g in games),
        status=markdown(site.get("status", "")),
    )
    page("/", title=f"{site['name']} — {site['tagline']}", description=site["description"],
         active="home", body=home)

    # Games -----------------------------------------------------------------
    page("/games/", title=f"Games — {site['name']}",
         description="Browser games built by hand: anime quizzes and arcade shorts.",
         active="games",
         body=render(read_template("games.html"), game_cards="".join(game_card(g) for g in games)))

    game_tpl = read_template("game.html")
    for game in games:
        body = render(
            game_tpl,
            title=html.escape(game["title"]),
            tagline=html.escape(game.get("tagline", "")),
            kind=html.escape(game.get("kind", "GAME")),
            about=game["about_html"],
            controls="".join(f"<li>{inline(c)}</li>" for c in game.get("controls", [])),
            mount=game.get("mount", ""),
            # A game may list several scripts (a shared engine plus its own file).
            scripts="\n".join('<script src="{0}" defer></script>'.format(src)
                              for src in (game.get("scripts") or [game["script"]])),
            slug=game["slug"],
            data_attrs="".join(f' data-{k}="{html.escape(str(v), quote=True)}"'
                               for k, v in game.get("data", {}).items()),
            spoiler=(f'<p class="spoiler-warning">{html.escape(game["spoiler"])}</p>'
                     if game.get("spoiler") else ""),
        )
        page(game["url"], title=f"{game['title']} — {site['name']}",
             description=game.get("tagline", ""), active="games", body=body)

    # Devlog ----------------------------------------------------------------
    page("/devlog/", title=f"Devlog — {site['name']}",
         description="Progress reports from building TAG, an iOS game of real-life tag.",
         active="devlog",
         body=render(read_template("devlog.html"),
                     status=markdown(site.get("status", "")),
                     posts="".join(f'<a class="cardlink" href="{p["url"]}">{devlog_card(p)}</a>'
                                   for p in posts)))

    post_tpl = read_template("post.html")
    for post in posts:
        page(post["url"], title=f"{post['title']} — {site['name']}",
             description=post["summary"], active="devlog",
             body=render(post_tpl, title=html.escape(post["title"]), date=pretty_date(post["date"]),
                         iso_date=post["date"], tags=tag_chips(post["tags"]), content=post["html"]))

    # Anime -----------------------------------------------------------------
    _, anime_body = page_source("anime.md")
    page("/anime/", title=f"Anime — {site['name']}",
         description="Watchlist and short reviews: One Piece, Naruto, Bleach, Dragon Ball.",
         active="anime",
         body=render(read_template("anime.html"), intro=markdown(anime_body),
                     series="".join(series_block(s, games) for s in anime["series"])))

    # About -----------------------------------------------------------------
    about_meta, about_body = page_source("about.md")
    page("/about/", title=f"About — {site['name']}",
         description=about_meta.get("summary", ""), active="about",
         body=render(read_template("about.html"), content=markdown(about_body),
                     links="".join(f'<a class="btn btn--small" href="{l["url"]}">{html.escape(l["label"])}</a>'
                                   for l in site.get("links", []))))

    # Guestbook -------------------------------------------------------------
    page("/guestbook/", title=f"Guestbook — {site['name']}",
         description="Leave a mark on the wall.", active="guestbook",
         body=read_template("guestbook.html"))

    # Assets ----------------------------------------------------------------
    shutil.copytree(STATIC, DIST / "static")
    if (CONTENT / "quizzes").exists():
        shutil.copytree(CONTENT / "quizzes", DIST / "static" / "quizzes")
    if PUBLIC.exists():
        for item in PUBLIC.iterdir():
            shutil.copy(item, DIST / item.name)
    write(DIST / "static" / "js" / "config.js",
          "window.RASTEGAR = " + json.dumps(site.get("backend", {}), indent=2) + ";\n")
    write(DIST / "404.html", render(base, title=f"404 — {site['name']}", site_name=site["name"],
                                    description="Page not found", nav=nav_html("", site),
                                    body=read_template("404.html"), year=date.today().year,
                                    canonical=site["url"]))
    write(DIST / "sitemap.xml", sitemap(site, posts, games))

    broken = check_links()
    print(f"built {len(posts)} posts, {len(games)} games -> dist/")
    for page, url in broken:
        print(f"  WARNING broken link: {page} -> {url}")


def check_links() -> list:
    """Every internal href and src must point at something in dist/.

    Cheap insurance: a renamed slug or a typo in a template shows up here
    instead of as a 404 for a visitor.
    """
    available = set()
    for path in DIST.rglob("*"):
        if path.is_file():
            url = "/" + str(path.relative_to(DIST))
            available.add(url)
            if path.name == "index.html":
                available.add(url[: -len("index.html")])

    broken = []
    for page in DIST.rglob("*.html"):
        text = page.read_text(encoding="utf-8")
        for url in re.findall(r'(?:href|src)="([^"#?]+)"', text):
            if url.startswith(("http", "mailto:", "data:")) or url in available:
                continue
            broken.append((str(page.relative_to(DIST)), url))
    return broken


def sitemap(site: dict, posts: list[dict], games: list[dict]) -> str:
    urls = ["/", "/games/", "/devlog/", "/anime/", "/about/", "/guestbook/"]
    urls += [g["url"] for g in games] + [p["url"] for p in posts]
    base = site["url"].rstrip("/")
    body = "".join(f"<url><loc>{base}{u}</loc></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>\n'


def serve() -> None:
    import http.server
    import os
    import socketserver

    class Handler(http.server.SimpleHTTPRequestHandler):
        """Local preview. Never caches, so a rebuild always shows up on reload,
        and serves 404.html like GitHub Pages does."""

        def end_headers(self):
            self.send_header("Cache-Control", "no-store, max-age=0")
            super().end_headers()

        def send_error(self, code, message=None, explain=None):
            if code == 404 and (DIST / "404.html").exists():
                self.error_message_format = (DIST / "404.html").read_text(encoding="utf-8")
            super().send_error(code, message, explain)

    os.chdir(DIST)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", 8000), Handler) as httpd:
        print("serving dist/ at http://localhost:8000 — Ctrl+C to stop")
        httpd.serve_forever()


if __name__ == "__main__":
    build()
    if "--serve" in sys.argv:
        serve()
