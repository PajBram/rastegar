---
title: Two phones, one real tag
slug: two-phones-one-tag
date: 2026-08-12
tags: [TAG, stage 1, testing]
summary: A test that creates two accounts, puts them a few metres apart and plays the game against the live backend. It found a bug on its second run.
---

Unit tests tell you the pieces work. They cannot tell you the game works.

So there is now a second test suite that does the embarrassing thing: it launches the app in a simulator, creates two real accounts against the real backend, makes one of them create a gang, joins with the other, moves the phone's location, and tags.

## Why not fake it

Because every interesting bug in this app lives in the seams. The rules are in Postgres, the positions come from CoreLocation, the season starts on a schedule, and the app has to agree with all three. A test with mocked answers agrees with itself and proves nothing.

The suite lives under its own scheme, deliberately, so it cannot run by accident. It touches production data. The accounts it makes are prefixed so they are recognisable, and the plain `TAG` scheme runs only the offline unit tests.

## The bug it found

Second run, the tag was refused with a distance that made no sense — the two phones were metres apart, and the server was calculating hundreds.

The app was uploading position updates and the tag attempt in an order I had assumed was safe. It was not: under a fast test, the tag arrived before the fresh position did, so the server compared against a location from the previous scene. In real life this is a person tagging you a second after walking into range, which is exactly the moment the game is about.

Fixed by making the tag flow wait for its own position to land before asking. Obvious in hindsight, invisible without two phones.

## Then the rest of stage 1

With the loop proven, the remaining screens got real data instead of previews:

- **The timeline** reads `feed_events` and writes in third person, so it sounds like a chronicle rather than a notification list.
- **The statistics** are all derived from `it_periods` and `tags` — total time as *it*, longest single stretch, who has caught whom. Nothing is stored as a number that could drift out of sync.
- **The gamemaster panel** lets one person per gang set the season dates, the tag radius, the no-tag-backs mode, UAV rules and whether the map is on at all.

That closes stage 1. The app is genuinely playable against a live backend: sign up, make a gang, share the code, tag someone, watch the timeline argue about it.

**Next:** the part I was most nervous about — the phone waking itself up in the background and telling you someone is close.
