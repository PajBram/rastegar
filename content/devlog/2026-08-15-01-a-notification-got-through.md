---
title: A notification got through
slug: a-notification-got-through
date: 2026-08-15
tags: [TAG, stage 3, push]
summary: I bought the developer account, and within a day the app was signed onto a real phone, push was arriving for real, and version 1.0.0 was sitting in App Store Connect. Also: the most unhelpful error message I have ever been handed.
---

For two months the answer to "what is blocking this" has been the same
sentence: an Apple Developer account I had decided not to buy until the app
deserved it.

It deserved it. So I bought it, and then everything that had been waiting
behind it happened in about a day.

## The app is on a phone

Not a simulator. My actual iPhone, plugged in, developer mode on, running a
build signed with a real certificate.

One flag stands between you and that, and it is not in any tutorial I read:
`-allowProvisioningDeviceRegistration`. Without it Xcode says the device is
not registered in your developer account and refuses. With it, the phone
registers itself on the first build and never mentions it again.

## sent: 0, and no error

Here is the one that cost me the most time, and it is a masterpiece of
unhelpfulness.

The server sends push through Apple's API. When I asked it to send one, it
answered:

    {"sent":0}

No error. No rejection. No complaint about the token, the key, the payload or
the certificate. Zero notifications sent, and everything is fine.

The cause: my server was set to talk to Apple's production push service while
the app was signed for the development one. The two do not share tokens, and a
token from the wrong environment is not *invalid* — it simply matches nothing,
so nothing is sent, so there is nothing to report.

What makes it a trap rather than a mistake is the naming. The entitlement in
the app is called `development`. The value the server needs is called
`sandbox`. They are the same environment with two names, and nothing anywhere
tells you so.

Once that was right, the answer changed to `{"sent":1}` and my phone buzzed on
the desk.

## The silent kind, and why the boring number is the proof

The interesting push is the one you never see. The server wakes the phone
without showing anything, the phone works out where it is and reports back,
and that is what makes the one-kilometre proximity warning possible without
the app running.

Three silent pushes, three fresh positions in the database. Seven to eight
seconds each time.

**The evenness is the whole proof.** One position appearing after a push means
nothing — phones report their position all the time, and I would have been
looking at a coincidence and calling it a feature. Three, at the same delay,
is a mechanism.

## The checkbox that would have cost a week

The project generator defaults new apps to iPhone *and* iPad. Nobody chooses
that; it is just the default, and it had been sitting in my config since the
first day.

Supporting iPad would have meant supporting every screen orientation — the
app is deliberately portrait-locked — plus a second full set of screenshots
and a second surface for a reviewer to find fault with. For a game you play by
running around outdoors with your phone.

One line: iPhone only. iPad owners can still install it, the way they install
every other iPhone app.

While I was in there I found that the version and build numbers had been
ignored entirely for weeks. Every archive I had made was 1.0 (1) because
nothing had ever set them. That is now checked in the archived package itself
rather than in the settings that were supposed to produce it.

## In the queue

Version **1.0.0 (1)** is uploaded to App Store Connect. The app record exists:
the name TAG was available, which I did not expect. The age questionnaire
worked out to 13+ and I put it to 18+ anyway — it is a game about chasing your
friends around a city for a month, and I would rather the gate be too high
than too low. The privacy declaration names all five things the app collects,
every one of them tied to making the game work and none of them to tracking.

Next is an email from Apple saying the build is processed, and then TestFlight
on my own phone.

One thing waits there to bite me and I have written it down so it does not:
**TestFlight counts as production to Apple's push service.** The setting that
just took me hours to get right has to be changed to the other value the day
testing starts, or every notification goes back to being `sent: 0` with no
error.

## Where it stands

Migrations 1 to 27 in production. 66 unit tests, 403 database assertions, four
interface tests playing the real game against the real backend.

Nothing is blocking. For the first time since I started, the next move is
Apple's.
