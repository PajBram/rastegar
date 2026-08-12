---
title: Why I'm building an app for a game of tag
slug: why-im-building-tag
date: 2026-08-12
tags: [TAG, why]
summary: A group chat is a terrible referee. So I am building one that never forgets, never sleeps, and cannot be argued with.
---

There is a film from 2018 called *Tag*, about a group of grown men who have kept the same game of tag running since they were nine years old. One month a year, no rules except the ones they agreed on, and being *it* when the month ends is a whole year of shame.

We tried it. It is exactly as good as it sounds.

It is also, it turns out, very hard to actually play.

## The group chat is the problem

Everything falls apart in the same three places.

**Nobody agrees on what happened.** Someone claims a tag from across a parking lot. Someone else says they were nowhere near. There is no referee, only two people who both remember it their way and a chat full of laughing emojis.

**Nobody remembers the rules they agreed on.** We said no tag-backs. For how long? An hour? Until you tag someone else? We decided it in a voice message in the middle of August and by September nobody could reconstruct it.

**Nothing survives the year.** Who was *it* the longest? Who lost last time? Who has never once been tagged? All of it lives in scroll-back nobody is going to read again.

The game deserves better bookkeeping than a chat thread. That is the whole idea.

## What the app is

**TAG** is an iOS app for playing a month-long game of tag, and it does four things a group chat cannot.

**It verifies tags with GPS.** A tag is only valid if the two phones were actually close. Not "close enough that you can argue about it" — close, with the accuracy of both readings subtracted before the comparison, and every raw number saved so a dispute can be reviewed afterwards.

**It knows the rules.** No tag-backs, truces, who is allowed to tag whom right now. The app does not warn you and then let you do it anyway. If a rule says no, the tag does not happen.

**It counts down.** The first screen is always the countdown. Before the season, to the start. During it, to the end, and it gets visually louder in the final week. Being *it* on the 31st of August at 23:59 is the entire point of the game, so it is the first thing you see.

**It keeps score forever.** Every stretch of being *it* is logged with a start and an end. Total time as *it*, longest single stretch, who lost which year — all of it derived from that one log, exactly, for every year we play.

## The part I care most about

The rules do not live in the app. They live in the database.

That sounds like a boring technical detail and it is the most important decision in the project. If the rules live in the app, then a friend with a modified app can tag from another city. If they live in the server, every tag goes through the same check no matter what is asking. The app is a shell. It cannot cheat, because it is not the one deciding.

The same goes for location. Being *it* does not give you the right to read anyone's coordinates. The server calculates whether someone is nearby and sends you the conclusion — *someone is within a kilometre* — never the position. That is enforced by the database, not by me remembering to be careful in the app code.

## Where this is going

Season one runs August 2027. That is a year from now, and it is deliberate: I would rather build it right than fast, and I want a full month of it working before anyone's dignity is on the line.

I will write up each stage here as I go. What I decided, what I got wrong, and what it looks like on screen.
