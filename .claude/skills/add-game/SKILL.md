---
name: add-game
description: Lägg till ett spel på rastegar.se — ett nytt quiz (Bleach, Dragon Ball, valfritt ämne) eller ett nytt canvas-arcadespel. Läs denna innan du skapar spelkort, frågebank eller spelkod, så att highscore, anime-sidan och databasen hänger ihop.
---

# Lägg till ett spel

Två sorters spel finns: **quiz** (en motor, många frågebanker) och **arcade** (canvas ovanpå `arcade.js`). Ett quiz kräver **ingen** kodändring.

## Gemensamt: spelkortet

En fil i `content/games/<slug>.json`. Sluggen är adressen (`/games/<slug>/`) och nyckeln mot highscore-tabellen — ändra den aldrig i efterhand.

```json
{
  "slug": "bleach-quiz",
  "title": "Bleach Quiz",
  "kind": "QUIZ",
  "order": 3,
  "tilt": "c",
  "glyph": "&#9876;",
  "tagline": "En rad som lockar någon att klicka.",
  "spoiler": "Valfri spoilervarning.",
  "script": "/static/js/quiz.js",
  "data": { "bank": "/static/quizzes/bleach.json" },
  "controls": ["Tap or click an answer.", "Keys `1`-`4` pick an answer."],
  "about": "Ett par stycken markdown."
}
```

`order` styr ordningen i hyllan, `tilt` (`a`/`b`/`c`) lutar panelen, `glyph` är en HTML-entitet som ritas i kortets ruta. Använd inte emoji — de bryter stilen.

## Quiz

Frågebanken ligger i `content/quizzes/<namn>.json` med tre nivåer:

```json
{
  "title": "Bleach",
  "difficulties": {
    "easy": { "label": "Easy", "blurb": "Vad nivån täcker.", "spoiler": "Vad som spoilas.",
              "questions": [
                { "q": "Frågan?", "a": ["Rätt", "Fel", "Fel", "Fel"], "correct": 0,
                  "note": "Kort fakta som visas efter svaret." }
              ] },
    "medium": { "...": "..." },
    "hard": { "...": "..." }
  }
}
```

- **Minst 15 frågor per nivå.** Motorn drar 15 slumpmässiga, så 18+ ger variation mellan omgångar.
- Svarsalternativen blandas om automatiskt — `correct` pekar på index i `a` som den står skriven.
- Fyra alternativ per fråga. Fel alternativ ska vara rimliga, inte skämt.
- **Kontrollera fakta.** Nivåerna ska också vara ärliga: `easy` får inte kräva kunskap från slutet av serien.
- Skriv spoilervarningar per nivå.

Länka in quizzet från anime-sidan genom att sätta `"quiz": "<slug>"` på rätt serie i `content/anime/watchlist.json`.

## Arcade

Använd `"kind": "ARCADE"` och ersätt `script` med:

```json
"scripts": ["/static/js/arcade.js", "/static/games/<slug>.js"]
```

Spelkoden går i `static/games/<slug>.js`. `arcade.js` sköter canvas i rätt upplösning, HUD, start- och slutruta, tangentbord, touch, spelloop och highscore-inlämning:

```js
window.Arcade.mount({
  slug: '<slug>', title: 'NAMN', width: 620, height: 460, lives: 3,
  intro: 'Vad man gör.', hint: 'Kontrollerna.', overTitle: 'Rubrik vid game over',
  init: function (game) {},                 // nollställ allt eget tillstånd
  update: function (dt, game) {},           // dt i sekunder, max 0.05
  draw: function (ctx, game) {},            // rita hela bilden varje frame
  hud: function (game) { return ''; },      // text längst till höger i HUD
  keyPress: function (key, game) {},        // en gång per nedtryckning
  tap: function (point, game) {}            // point.x / point.y i canvaskoordinater
});
```

`game` har `score`, `lives`, `time`, `keys`, `pointer` och `over()`. Anropa `game.over()` när omgången är slut.

Krav på ett arcadespel här:

- **Tangentbord och touch.** Testa båda, och testa i 375 px bredd.
- En omgång under två minuter, gärna under en.
- Svartvitt med röd accent. Rita med canvas — inga bilder, ingen upphovsrättsskyddad grafik.
- Svårighetsgraden ska stiga med tiden, annars är det ingen anledning att spela om.

Under utveckling kan `window.__arcade.step(0.016, 300)` driva simuleringen framåt utan att vänta i realtid.

## Databasen — glöm inte denna

Utan en rad i `games` går det inte att spara highscore. Kör i Supabase SQL Editor:

```sql
insert into games (slug, title, max_score, max_rate, min_seconds)
values ('<slug>', '<Titel>', 200000, 900, 5)
on conflict (slug) do nothing;
```

`max_score` är ett tak för vad som över huvud taget accepteras, `max_rate` är poäng per sekund och `min_seconds` hur kort en omgång rimligen kan vara. Sätt dem strax över vad en riktigt bra spelare klarar — de är fuskskyddet.

## Klart när

`python3 build.py --serve`, spela igenom spelet i mobilbredd med både tangentbord och touch, kontrollera att kortet syns i hyllan och att highscore-listan laddar. Commit:a på engelska och pusha.
