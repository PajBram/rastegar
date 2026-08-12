---
title: "Stage 1, shift A: the countdown runs"
slug: stage-1-countdown-runs
date: 2026-08-12
tags: [TAG, stage 1, swiftui]
summary: The first version that actually launches. Four countdown states, a design system, and 15 tests on the one piece of logic that has to be right.
---

There is now an app. It launches, it counts down, and it looks like the thing in my head. It talks to no server at all — everything on screen comes from local test data — and that is fine, because this shift was about the shell.

## The first screen is the countdown, always

Before the season: counting down to the start. During: counting down to the end, and the last week is louder. After: counting down to next year.

Four states, and which one you see is always **derived**, never set by hand. The app takes the season, takes the current time, and works out the phase. There is no line anywhere that says "we are now in the final week" — that would be a line that can be wrong.

If you are *it*, the whole screen turns red and pulses. It should feel like something is wrong, because something is.

## Testing time is the part worth testing

Fifteen tests went in with this shift, all on time logic. Not because the countdown is hard, but because every genuinely nasty bug in this app is going to be a date bug.

What they cover: the second the season starts, the second it ends, the boundary at exactly the end timestamp, and — my favourite — that a season which has run past its end date names the right loser *even before* the scheduled job has got around to closing it. There is a window of up to a minute where the database still says the season is active and the truth is that it is over. The app has to agree with reality, not with the row.

I would not have thought about that case if I had not written the rules down first.

## Two decisions I like

**The Xcode project is generated, not committed.** Xcode's project file is a giant machine-written blob that makes every git change unreadable and picks fights with itself. Instead the repo has a short spec — a list of what the project contains — and the project file is generated from it. Now a change to the project is a change I can actually read.

**Debug builds can jump to any state.** Being able to look at "season over, you lost" without waiting until September is worth a lot. A launch argument picks the state, and there is a small phase switcher at the bottom of the screen that only exists in debug builds. It will never ship to anyone.

## What is not there

No network. No login. No map, no tags, no truces. The design system has the palette and the pulse animation and nothing else yet. The Supabase library is not even added, because nothing uses it — adding a dependency before you need it is how projects rot.

## What is blocking me

Xcode is not installed on this machine. Everything above is written, tested and committed against a project spec, but I cannot press build until I have the 15 gigabytes of Apple's finest sitting on the disk.

**Next:** shift B — connect the app to Supabase so the countdown reads a real season, and move the tag validation rules into Postgres functions where they belong.
