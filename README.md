# rastegar.se

Pajs lekstuga på nätet: webbläsarspel, en devlogg om iOS-appen [TAG](https://github.com/PajBram/TAG), och en anime-hylla. Manga-stil, handbyggd, inga ramverk.

**Live:** https://rastegar.se

## Kör lokalt

Kräver bara Python 3 (följer med macOS).

```bash
python3 build.py --serve
```

Sajten byggs till `dist/` och serveras på http://localhost:8000.

## Publicera

```bash
git push
```

GitHub Actions bygger och publicerar till GitHub Pages. Tar ett par minuter.

## Struktur

```
build.py            Statisk generator, endast Pythons standardbibliotek
content/            Allt innehåll: markdown och JSON
templates/          HTML-mallar med {{token}}
static/             CSS, JavaScript, spel, typsnitt
supabase/schema.sql Highscore och gästbok: tabeller, RLS, RPC-funktioner
dist/               Byggresultat (committas inte)
```

- **[CONTENT.md](CONTENT.md)** — hur man lägger till inlägg, recensioner, quiz och spel.
- **[CLAUDE.md](CLAUDE.md)** — arkitekturbeslut och konventioner.
