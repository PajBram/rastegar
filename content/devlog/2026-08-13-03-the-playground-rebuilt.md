---
title: The playground got rebuilt in a night
slug: playground-rebuilt
date: 2026-08-13
tags: [site, games]
summary: This site went up, got nine games, and then got torn down to the studs and rebuilt in a completely different style. All in about six hours.
---

A short one about the place you are standing in rather than the app.

This site did not exist yesterday. It went live in the evening, on a domain that had been pointing at a parking page since I bought it, and by midnight it had been redesigned from scratch once.

## What it is made of

No framework. No package manager. The whole thing is built by a Python script with nothing but the standard library, which means there is nothing to update and nothing to rot. Content is markdown and JSON files in a folder. It builds in under a second and deploys itself when I push.

That decision was made for a dull reason — there is no Node on this machine — and it turned out to be the best call in the project.

## What went on it

**Four quizzes**: One Piece, Naruto, Bleach and Dragon Ball. One engine, four question banks, three difficulties each. Adding Bleach was two JSON files and no code at all, which is exactly what I wanted when the engine was written.

**Five arcade games**, all playable with a thumb: a survival shooter, a fall through the gutter between panels, a sword duel decided by reading which line the blade is coming from, a chain-reaction game where you get one detonation per round, and a throwing game where the aim swings by itself and you only choose *when*.

**Highscores and a guestbook**, backed by the same kind of setup as TAG: the browser can read the boards and write nothing except through database functions that check first. A score without a token from a real run is refused, and so is a score that could not have been earned in the time the run took.

## And then it got torn down

The first version was manga: thick black frames, hard offset shadows, tilted panels, screentones. Committed to the bit, and too loud to read.

So the second version threw all of it away. Full-bleed illustrated scenes, a serif that carries the tone, and white space doing most of the work. Every illustration — the dawn over water at the top of the home page, the rooftops at dusk, the cover on every game card — is drawn by hand in SVG. Nothing is stock, nothing is traced, and nothing came from anyone else's art.

The wordmark in the corner was picked from twelve options over about ten minutes.

## Why the effort

Because a devlog nobody wants to look at is a diary. The app is the serious project; this is the shelf I put it on, and a shelf should be worth walking past.

**Next on this side:** a scene of its own for the anime shelf, and covers that keep getting better as I get better at drawing them in code.
