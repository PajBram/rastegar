---
title: "Stage 0: rules first, code later"
slug: stage-0-rules-first
date: 2026-08-12
tags: [TAG, stage 0, database]
summary: One commit, no app code. Just the rulebook, the database schema, the privacy rules, and a clickable prototype of seven screens.
---

The first commit in TAG contains no app code at all. It is the rulebook, a database schema, the privacy rules, and a clickable prototype. That was on purpose.

Every time I have tried to build something by starting with the screens, I have ended up with screens that quietly disagree with each other. So this time the first thing written down was the rules, in enough detail that they can be argued with.

## The rulebook is a document, and the document is normative

A tag is valid **only if all of these are true**: you are the one who is *it* right now; your target is in the same group and in the season lineup; it is not yourself; the season is running; the no-tag-backs rule is not violated; no active truce covers both of you; and proximity is verified.

Break any one of them and the app blocks. It does not warn and then allow.

Writing that list out forced four decisions I had been avoiding.

**Proximity never compares raw distance.** Two phones reporting positions each have an accuracy radius, and pretending otherwise is how you get tags from across a football pitch. The actual condition is `distance - (my accuracy + your accuracy) <= 50 m`. Every raw value gets stored on the tag, so a disputed tag can be looked at afterwards instead of relitigated from memory.

**No tag-backs is tied to the period, not the season.** If B tagged A, then A cannot tag B back — for how long? I settled on: for as long as A's turn as *it* lasts, or a configurable hour, depending on the mode the group picks. The moment A tags someone else, A's turn ends and the question stops mattering. That version is easy to explain out loud, which is how I knew it was the right one.

**A truce only protects its participants from each other.** If you and I sign a truce, I cannot tag you and you cannot tag me. Everyone else can still tag both of us. If you want to be safe from the whole group, you list the whole group. Everyone listed has to sign before it starts, or it never takes effect at all.

**One UAV per season, and everybody sees it coming.** A UAV reveals every player's position for ten minutes. Two things make it interesting: everyone can use it, not just the person who is *it* — you can use it to run away — and everyone in the group is told when one is active. It turns a free look into a decision that announces itself. Extra ones are earned by tagging: every third confirmed tag gives you another.

## The season starts itself

The season runs 1–31 August, and it starts on its own. A scheduled job in the database flips it on when the date arrives, year after year, with nobody pressing anything. When it ends, whoever is *it* at that exact moment is recorded as the loser, and all location sharing stops automatically.

That last part matters twice over. It is a privacy guarantee — the app cannot keep watching you in September — and it is a battery guarantee.

## Privacy is a database problem

The schema went in with Row Level Security from the start: rules in the database about which rows each account is allowed to see at all.

The point is that being *it* gives you no read access to anyone's coordinates. Not "the app doesn't show them" — the database refuses to return them. Live positions are deleted after 24 hours. Coordinates attached to a confirmed tag are kept, because those are part of the story. Leave a group and your live data goes immediately.

If I write a buggy screen next year, the worst it can do is show nothing.

## And then, finally, pictures

Last piece of stage 0: a clickable prototype of seven screens, in a single HTML file. The countdown, the tag flow, the truce screen, the timeline, the stats.

It is not code that will ship. It exists so I can look at the game before I build it, and so far it has already saved me from two screens I thought I wanted and did not.

**Next:** stage 1 — turning that prototype into an actual app.
