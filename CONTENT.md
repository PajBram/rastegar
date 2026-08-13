# Så lägger man till innehåll på rastegar.se

Allt innehåll är filer i `content/`. Det finns inget admin-gränssnitt — Paj ber Claude Code lägga till saker, och den här filen säger exakt var de ska ligga.

Efter varje ändring:

```bash
python3 build.py --serve
```

och granska på `http://localhost:8000`. Ser det bra ut: commit:a och pusha, så publicerar GitHub Actions sajten inom ett par minuter.

**Sajtens innehåll skrivs på engelska.** Den här filen och `CLAUDE.md` är på svenska.

---

## Devlogg-inlägg

En fil per inlägg i `content/devlog/`, döpt `ÅÅÅÅ-MM-DD-NN-slug.md`. `NN` är ett löpnummer som avgör ordningen när flera inlägg har samma datum (högre nummer = nyare).

```markdown
---
title: "Stage 1, shift B: the app talks to the server"
slug: stage-1-server
date: 2026-09-04
tags: [TAG, stage 1, supabase]
summary: En mening som visas i listan. Ingen markdown här.
---

Brödtext. Rubriker med ## och ###, **fetstil**, *kursiv*, `kod`,
[länkar](https://exempel.se), punktlistor och > citat fungerar.
```

- `slug` blir adressen: `/devlog/stage-1-server/`. Ändra aldrig en slug som redan är publicerad — då dör länken.
- `tags` visas som små etiketter. Håll dem korta och återanvänd befintliga.
- Nyaste inlägget visas automatiskt på startsidan.

**Statusblocket** ("where the app is right now") som ligger både på startsidan och devlogg-sidan står i `content/site.json` under `status`. Uppdatera det när etappen ändras — det är det som blir gammalt först.

---

## Anime-recensioner

`content/anime/watchlist.json`. En post per serie i listan `series`:

```json
{
  "title": "Bleach",
  "kicker": "THE COOL ONE",
  "quiz": "bleach-quiz",
  "verdict": "En eller två meningar om serien som helhet.",
  "entries": [
    { "title": "Soul Society", "rating": 5, "status": "watched", "note": "Kort omdöme." }
  ]
}
```

- `rating` är 1–5 och ritas som stjärnor.
- `status` är `watched`, `watching` eller `dropped`.
- `quiz` är sluggen på ett spel i `content/games/`. Finns inget sådant spel visas "Quiz coming soon" i stället. Sätt `null` om serien saknar quiz.

---

## Nytt quiz (t.ex. Bleach eller Dragon Ball)

Två filer, ingen kodändring.

**1. Frågebanken:** `content/quizzes/bleach.json`

```json
{
  "title": "Bleach",
  "difficulties": {
    "easy":   { "label": "Easy",   "blurb": "En rad om nivån.", "spoiler": "Vad som spoilas.", "questions": [] },
    "medium": { "label": "Medium", "blurb": "...", "spoiler": "...", "questions": [] },
    "hard":   { "label": "Hard",   "blurb": "...", "spoiler": "...", "questions": [] }
  }
}
```

Varje fråga:

```json
{ "q": "Frågan?", "a": ["Rätt svar", "Fel", "Fel", "Fel"], "correct": 0, "note": "Kort fakta som visas efteråt." }
```

- **Minst 15 frågor per nivå** — motorn drar 15 slumpmässiga av dem, så fler ger bättre variation. 18 är ett bra mål.
- `correct` är index i `a`. Svarsalternativen blandas om vid varje spelomgång, så ordningen spelar ingen roll.
- Kontrollera fakta. En felaktig fråga är värre än en svår.

**2. Spelkortet:** `content/games/bleach-quiz.json`

```json
{
  "slug": "bleach-quiz",
  "title": "Bleach Quiz",
  "kind": "QUIZ",
  "order": 3,
  "glyph": "&#9876;",
  "tagline": "En rad som lockar.",
  "spoiler": "Spoilervarning som visas på sidan.",
  "script": "/static/js/quiz.js",
  "data": { "bank": "/static/quizzes/bleach.json" },
  "controls": ["Tap or click an answer.", "Keys `1`-`4` pick an answer."],
  "about": "Ett par stycken markdown om spelet."
}
```

**3.** Rita ett omslag: `static/img/games/<slug>.svg`, format 4:3. Det plockas upp automatiskt på filnamn — inget behöver skrivas i spelkortet. Saknas filen används `glyph` mot en färgyta i stället.

**4.** Lägg till spelets `slug` under rätt serie i `watchlist.json` så anime-sidan länkar dit.

**5.** Lägg in i databasen: kör i Supabase SQL Editor
`insert into games (slug, title, max_score, max_rate, min_seconds) values ('bleach-quiz','Bleach Quiz',6000,40,20);`
Utan den raden går det inte att spara highscore för spelet.

---

## Nytt arcade-spel

Ett spelkort som ovan, men med `"kind": "ARCADE"` och

```json
"scripts": ["/static/js/arcade.js", "/static/games/mitt-spel.js"]
```

Själva spelet läggs i `static/games/mitt-spel.js` och byggs ovanpå `arcade.js`, som sköter canvas, HUD, start- och slutrutor, tangentbord, touch och highscore:

```js
window.Arcade.mount({
  slug: 'mitt-spel', title: 'MITT SPEL', width: 620, height: 460, lives: 3,
  intro: 'Vad man gör.', hint: 'Kontrollerna.', overTitle: 'Rubrik vid game over',
  init: function (game) { /* nollställ */ },
  update: function (dt, game) { /* dt är sekunder */ },
  draw: function (ctx, game) { /* rita */ },
  hud: function (game) { return 'text till höger i HUD'; },
  keyPress: function (key, game) {},
  tap: function (point, game) {}
});
```

Kom ihåg:
- **Tangentbord och touch, båda.** Testa i 375 px bredd.
- Anropa `game.over()` när spelaren är slut. Skalet visar poängen och namnrutan.
- Håll en omgång under två minuter.
- Lägg in spelet i `games`-tabellen i Supabase (se ovan) med rimliga tak för poäng.

---

## Sidtexter

- Startsidans introtext: `content/pages/home.md`
- About: `content/pages/about.md`
- Anime-sidans inledning: `content/pages/anime.md`
- Namn, tagline, navigation, länkar och Supabase-nycklar: `content/site.json`

---

## Testa highscore och gästbok lokalt

Utan att röra den riktiga databasen:

```bash
python3 tools/mock_backend.py
```

Den härmar Supabase på `http://localhost:8001` med samma regler som `supabase/schema.sql`. Sätt `backend` i `content/site.json` till `{"url": "http://localhost:8001", "anonKey": "mock"}`, bygg om, testa — och **återställ till tomma värden innan du commit:ar**.

---

## Vad man **inte** ska göra

- Redigera i `dist/` — den skrivs över vid varje bygge.
- Committa `dist/`.
- Klistra in Supabase **service**-nyckeln någonstans i repot. Endast `anonKey` hör hemma i `site.json`; den är avsedd att vara publik och skyddas av Row Level Security.
- Lägga in bilder från anime, manga eller andras sajter. All grafik byggs med CSS, SVG eller canvas.
