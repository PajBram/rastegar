---
title: "Stage 1, shift B: the rules moved into the database"
slug: rules-in-the-database
date: 2026-08-12
tags: [TAG, stage 1, postgres]
summary: The app stopped deciding whether a tag counts. Postgres decides now, the app just asks — and that closed the only real cheat path in the game.
---

The countdown was running on made-up data. This shift connected it to a real backend, and in doing so moved the entire rulebook out of the app and into the database.

## Why the app is not allowed to decide

When I wrote the rules down in stage 0, I said the app would be a shell. Here is what that actually means in code.

The old flow would have been: the phone works out how far away the other player is, decides the tag is valid, and tells the server to record it. Every part of that is a lie waiting to happen. A modified app can claim any distance it likes.

The new flow: the phone says *I am trying to tag Micke*. The server looks up both players' last known positions, calculates the distance itself, subtracts both accuracy radiuses, compares that against the group's tag radius, checks the season is running, checks nobody involved is protected by a truce, checks the no-tag-backs rule, and then decides.

The app never sends a distance. There is nothing to forge.

## What that took

A set of Postgres functions — `register_tag`, `validate_tag`, `is_truce_blocked`, `is_tagback_blocked`, `current_it_period` — and Row Level Security on every table so that even a valid login only sees what it is entitled to see.

The one I like most is `validate_tag`, because it returns *why* a tag failed rather than just refusing. The app shows the actual reason: out of range by 40 metres, no tag-backs for another 22 minutes, that person signed a truce with you. A rule you cannot see is indistinguishable from a bug.

## A test rig that runs the whole schema

Rules in the database are only safer if they are tested, and testing a database is more annoying than testing an app. So the repo grew a script that spins up a temporary local Postgres, applies every migration in order, runs a pile of assertions against it, and throws the whole thing away.

It is now at **212 assertions**. They cover the boring cases and, more importantly, the nasty ones: a tag one second before the season ends, a truce that starts in thirty seconds, a no-tag-backs window that expires mid-attempt.

Two of those tests have burned me for a reason worth writing down: **tests must never depend on the clock**. Twice I had a green suite in the morning and a red one in the evening, both times because the test data was built from `now()` and drifted into a rule that behaves differently at night. Now the tests anchor their timestamps explicitly.

## Delivering SQL without breaking anything

The Supabase project can only be reached with a key that is not allowed to create tables, which is correct — that key sits in the app. So migrations reach production the boring way: I generate a single file wrapped in a transaction with a verification query at the end, and paste it into the SQL editor myself. If anything fails, the whole thing rolls back.

Rule I set for myself after nearly getting this wrong: never hand over SQL that has not been run against a fresh local database first. Twice.

**Next:** two phones, one real tag, and the bug a test found before I did.
