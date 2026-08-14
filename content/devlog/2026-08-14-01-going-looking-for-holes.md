---
title: I went looking for holes on purpose, and found thirteen
slug: going-looking-for-holes
date: 2026-08-14
tags: [TAG, stage 3, debugging]
summary: The rules were right. The seams between them were not. A week of asking the database questions it had never been asked, including one where saying nothing wins you the season.
---

The rulebook has been finished for days. Every rule has tests, every test is
green, and the app plays a whole season against the real backend without
complaining.

So I stopped testing whether the rules work and started asking what happens
*between* them. Thirteen holes so far. None of them were a rule being wrong.
All of them were two correct rules meeting at an angle nobody had stood at.

## Silence won the season

This is the worst one, and it is the one I would never have found by playing.

Tag someone at ten to midnight on the last night of August, somewhere with no
signal. There is no GPS to verify it with, so the tag is recorded as *pending*
and waits for the victim to confirm it.

Midnight passes. The season ends. And now the victim has a button that decides
who lost the year: **do nothing**.

`confirm_tag` checked the rules against the current time. After midnight the
season was over, so a confirmation was refused — while `reject_tag` carried on
working exactly as before. Confirm and it fails. Reject and it lands. Say
nothing at all and it stays pending forever, and whoever threw that last tag
carries the shame for a year for a tag they actually made.

The fix took a decision rather than a patch. Pending tags now survive the end
of the season, and after the whistle only the gamemaster can rule on them —
judged against the moment the tag happened, not the moment somebody got round
to looking at it.

Which opened a second hole immediately. Judging an old tag can fell it *out of
order*, and two tags falling out of order can leave two people holding the
title of *it* at the same time. So only the most recent one can be ruled on.
That one showed up when I wrote the test cases, not when I wrote the fix,
which is the correct order for these things and not the order I usually manage.

## A lever that was not attached to anything

The gamemaster can move a season. Pick new dates, press save, get told
**Saved**.

Nothing happened. The app wrote the new dates to the settings table. Nothing
wrote them to the season itself, and the job that creates seasons only ever
creates the ones that are missing — it does not revisit one that already
exists. The change would have taken effect in about two years, when a season
got built from those settings for the first time.

A control that does nothing is bad. A control that does nothing *and
acknowledges you* is worse, because now you have stopped thinking about it.

## The flag is not the clock

A season ends on the second. The job that marks it as ended runs every fifteen
minutes. Everything in the game that cares about season boundaries checks both
the flag and the time — except the one function that lets you join a gang,
which checked only the flag.

So there was a fifteen-minute window, once a year, where joining put you into
a season that was already over. Complete with a UAV credit, and a permanent
place in the record of a year you never played.

There is a general lesson in there and I have written it on the wall: when
something is true both by a flag and by a clock, find every place that only
asks one of them.

## The gang of one

Somebody will make a gang, send nobody the code, and open the app. The
database was ready for that — it refuses to let you tag yourself, refuses a
truce with fewer than two people, and correctly names you the loser at the end
of August, which is very funny.

The app was not ready. **TAG SOMEONE** opened an empty list with no
explanation, which reads as a broken app rather than a rule.

The UAV button was worse, because it *worked*. It spent the gang's one credit
for the season, launched the drone, and drew a map with a single dot on it:
you. A button that fails tells you something. A button that succeeds and gives
you nothing just takes.

Now the home screen says why, the tag button offers the invite code instead,
and the UAV hides itself until there is somebody to look for.

## What this week actually taught me

**Test the seams, not the parts.** Every one of these thirteen was a handoff:
between a rule and the clock, between the app and the database, between one
correct function and another.

**Prove the hole before fixing it.** Every fix here started as a failing test
that described the bad behaviour. One suspected bug — kill-streak credits
surviving an undone tag — turned out not to exist at all, and is now covered
by a test that says so.

**A rule the app cannot reach is not a rule.** Twice now a perfectly good
piece of backend has been unreachable from the screen that needed it.

## Where it stands

Migrations 1 to 26 are running in production. 60 unit tests, 403 database
assertions, and four interface tests that play the real game against the real
backend.

The list of unexamined edge cases is empty, which does not mean there are none
left. It means I have to think of better questions.

**Still blocking:** the Apple Developer Program, for TestFlight and everything
after it. The push notifications are written and the signing is proven against
a throwaway key; until that account exists the phone raises its own alerts
locally, and the server cannot tell the difference.
