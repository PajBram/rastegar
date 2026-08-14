# rastegar.se

Pajs personliga lekstuga på nätet: webbläsarspel, en devlogg om iOS-appen TAG, och en anime-hylla.

**Ägare:** Paj (pajam98@hotmail.com). **Inte utvecklare** — förklara tekniska val i klarspråk på svenska och säg tydligt till när Paj behöver göra något själv (skapa konto, klistra in en nyckel, peka om DNS).

**Språk:** svenska mot Paj och i den här filen. **Engelska** i allt innehåll på sajten, i kod, kommentarer och commit-meddelanden.

> **Undantag: Dashh: Voidfall.** Spelets eget gränssnitt är på svenska och ska förbli det — Paj har valt så. Undantaget gäller bara insidan av `static/games/dashh.html`; spelkortet, sidtexten och all annan sajttext är på engelska som vanligt. Översätt alltså inte spelet, och behandla inte det svenska gränssnittet som en bugg.

---

## Bärande principer

1. **Noll beroenden.** Sajten byggs av `build.py` med enbart Pythons standardbibliotek. Det finns inget `npm install`, inget att uppdatera, inget som ruttnar. Lägg inte till ett byggverktyg utan att först fråga Paj.
2. **Innehåll är filer.** Devlogg, recensioner, spelkort och frågebanker är markdown och JSON i `content/`, versionerade i git. Det finns inget admin-gränssnitt och ska inte finnas något.
3. **Reglerna lever i databasen.** Highscore och gästbok valideras av Postgres-funktioner med Row Level Security, aldrig av JavaScript i webbläsaren. Klienten kan inte skriva en enda rad direkt.
4. **Mobilen först.** De flesta som får länken öppnar den i telefonen. Testa alltid i 375 px bredd innan något kallas klart.
5. **Ingen upphovsrättsskyddad grafik.** All bild byggs med CSS, SVG och canvas. Inspireras av manga-formspråket, kopiera aldrig material.

---

## Teknik

| Del | Val |
|---|---|
| Generator | `build.py`, Python 3, endast stdlib |
| Sajt | Handskriven HTML, CSS och JavaScript (ES5-stil, inga byggsteg) |
| Hosting | GitHub Pages, publikt repo `PajBram/rastegar` (mappen på datorn heter `~/rastegar.se`) |
| Deploy | GitHub Actions kör `python3 build.py` och publicerar `dist/` vid varje push till `main` |
| Domän | rastegar.se hos Loopia, fyra A-poster mot GitHub Pages |
| Backend | Supabase (Postgres). Se `supabase/schema.sql` |
| Typsnitt | Noto Serif Display och Great Vibes (båda SIL OFL), självhostade i `static/fonts/` |

### Kommandon

```bash
python3 build.py           # bygg till dist/
python3 build.py --serve   # bygg och förhandsgranska på http://localhost:8000
```

`dist/` är byggresultat och ligger i `.gitignore`. Committa aldrig den.

---

## Struktur

```
build.py               Generatorn: frontmatter, markdown-subset, mallar, kopiering
content/               ALLT innehåll. Se CONTENT.md
  site.json            Namn, navigation, länkar, statusblock, Supabase-nycklar
  pages/               home.md, about.md, anime.md
  devlog/              Ett inlägg per fil: YYYY-MM-DD-NN-slug.md
  games/               Ett spelkort per fil (JSON)
  quizzes/             Frågebanker (JSON), kopieras till /static/quizzes/
  anime/watchlist.json Serier, betyg, omdömen
templates/             base.html + en mall per sidtyp. {{token}} ersätts av build.py
static/                Kopieras rakt av till dist/static/
  css/style.css        Hela designsystemet, ett enda ark
  js/                  main.js (meny), quiz.js (quizmotor), arcade.js (spelskal),
                       scores.js (highscore), guestbook.js, mascot.js (kullgubbarna)
  games/               Ett canvas-spel per fil, byggt ovanpå arcade.js
  img/                 scene-*.svg (sidscener), games/<slug>.svg (spelomslag)
  fonts/               Självhostade typsnitt
tools/mock_backend.py  Härmar Supabase lokalt för test av highscore och gästbok
public/                Filer som kopieras till roten: CNAME, robots.txt, .nojekyll
supabase/schema.sql    Tabeller, RLS-policyer och RPC-funktioner
```

---

## Design

Redaktionell och illustrerad, inte manga. Sajten byggdes först i manga-stil med tjocka
ramar och hårda skuggor — det blev för högljutt och revs 13 aug 2026. Nuvarande
uttryck: bilder som går ut i kanterna, en serif som bär tonen, och gott om vitt.

| Token | Värde | Användning |
|---|---|---|
| `--ink` | `#16120f` | Text, tunna linjer |
| `--ink-soft` | `#6d635b` | Bitext, etiketter |
| `--hair` | `rgba(22,18,15,.14)` | Hårfina linjer — sajtens enda "ram" |
| `--paper` / `--sand` | `#ffffff` / `#f7f2ec` | Bakgrund, lugna block |
| `--tan` | `#c9a582` | Accent: linjer, stjärnor, understrykningar |
| `--red` | `#ff2d55` | Endast det som ska klickas, och fel |
| `--serif` | Noto Serif Display | Alla rubriker och ordbilden |
| `--sans` | systemets | Brödtext och spärrade versaler |

Principer:

- **Inga ramar och inga skuggor.** En hårfin linje eller ingenting alls.
- **Överrubriker** är små versaler med `.22em` teckenmellanrum (`.kicker`).
- **Scener ritas i SVG** och ligger i `static/img/`. `scene-dawn.svg` är heron,
  `scene-dusk.svg` bandet mitt på startsidan.
- **Spelomslag** ligger i `static/img/games/<slug>.svg` och plockas upp på filnamn
  av `build.py`. Saknas filen faller kortet tillbaka på `glyph` mot en färgyta.
- **Loggan** är skrivstil (`Great Vibes`) över en hårlinje med domänen under i
  spärrade versaler. Rör den inte utan att fråga.
- **Inget mörkt läge.** Det togs bort i omgörningen; sajten är ljus, punkt.
- **Maskoten** (`static/js/mascot.js`) är en liten bläckfigur som går längs
  fönstrets underkant och spelar kull med en besökare i rött pannband. Den
  finns inte alls vid `prefers-reduced-motion`, aldrig på spelsidorna, tonas
  bort medan man scrollar, och byter till kritstreck över den mörka foten.
  `__mascot.step()` och `__mascot.chase()` driver den utan att vänta på riktig
  tid.

Fällor jag redan gått i:

- **Ordningen i `style.css` avgör.** En modifierare (`.panel--game`) och sin
  bas (`.panel`) väger lika tungt, så den som står SIST vinner. Basen måste
  därför stå ÖVANFÖR alla sina `--`-varianter. Samma sak med kortkommandon:
  `padding: 4rem 0` i `.section` nollställde sidmarginalen som `.wrap` satte,
  eftersom kortkommandot skriver alla fyra sidorna. Detta har bitit tre gånger
  på en dag — spelkortens ramar, brödtextens sidmarginal och en rubrikstorlek
  som aldrig gällde. **Kontrollera alltid i webbläsaren vad som faktiskt
  vann**, inte vad filen säger.
- Fält inuti `.stage__overlay` **måste** sätta sin egen textfärg. Ärver de overlayens
  vita blir texten osynlig mot ett vitt fält.
- `arcade.js` blockerar mellanslag och piltangenter under spel. Blockeringen måste
  hoppas över när tangenttrycket är riktat mot ett textfält, annars går namnrutan
  inte att skriva i.
- **Rubriknivåer är en disposition, inte storlekar.** Det som hänger direkt
  under sidans `h1` ska vara `h2` — även rubriker som spelen ritar själva i
  sina overlays. Vill du ändra storleken, ändra CSS:en, inte taggen.

---

## Konventioner

- **Ingen logik i mallar.** `templates/*.html` innehåller bara `{{token}}`. All logik bor i `build.py`.
- **Ingen HTML från besökare.** Text från Supabase sätts alltid med `textContent`, aldrig `innerHTML`.
- **Spel byggs på `arcade.js`.** Ett nytt canvas-spel implementerar `init`, `update`, `draw` och lämnar canvas, HUD, overlays, input och highscore till skalet.
- **Quiz rör inte kod.** En ny quiz är en frågebank i `content/quizzes/` plus ett spelkort i `content/games/`. `quiz.js` ändras inte.
- **`build.py` körs på Python 3.9** (systemets Python på Pajs Mac). Använd inget nyare än det.
- **Commit:a i logiska steg** och skriv commit-meddelanden på engelska.

---

## Att lägga till innehåll

Se **[CONTENT.md](CONTENT.md)**. Den beskriver exakt var devlogg-inlägg, anime-recensioner, spel och quizfrågor läggs och i vilket format. Läs den innan du lägger till något.

---

## Status och vad Paj gör själv

- **GitHub:** repot är publikt eftersom GitHub Pages kräver det på gratisplanen.
- **Supabase:** ett eget gratisprojekt, skilt från TAG:s. Nycklarna i `content/site.json` under `backend` är projektets URL och **anon-nyckeln** — den är publik och avsedd att ligga i webbläsaren. Service-nyckeln får aldrig hamna i repot.
- **Moderering av gästboken:** Paj öppnar tabellen `guestbook` i Supabase Table Editor och antingen kryssar i `hidden` eller raderar raden.
