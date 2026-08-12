---
name: add-devlog-post
description: Lägg till ett nytt devlogg-inlägg på rastegar.se, eller uppdatera statusblocket om vad TAG-appen är för etapp på. Läs denna innan du skriver ett inlägg, så att filnamn, frontmatter, tonläge och publicering blir rätt.
---

# Lägg till ett devlogg-inlägg

Devloggen handlar om Pajs iOS-app **TAG**. Källkoden finns i `~/TAG` — läs `README.md`, `CLAUDE.md` och den faktiska git-historiken (`git log --stat`) **innan** du skriver. Inlägg som beskriver saker som inte hänt är värdelösa.

## 1. Skapa filen

`content/devlog/ÅÅÅÅ-MM-DD-NN-slug.md`, där `NN` är löpnummer inom samma datum (högre = nyare).

```markdown
---
title: "Rubrik utan versaler överallt"
slug: kort-slug-i-url
date: 2026-09-04
tags: [TAG, stage 1, supabase]
summary: En mening. Visas i listan och som sidbeskrivning. Ingen markdown.
---
```

Sedan brödtexten. Markdown-stödet är ett medvetet litet subset: `##`/`###`, stycken, `**fet**`, `*kursiv*`, `` `kod` ``, `[länk](url)`, punkt- och nummerlistor, `>` citat, `---` avdelare och kodblock med ```.

## 2. Tonläge

Inläggen skrivs **på engelska**, i första person, i Pajs röst:

- Personligt och konkret. Inte marknadsföring, inte "vi är glada att kunna presentera".
- Berätta vad som byggdes, vad som gick fel och **varför ett beslut blev som det blev**. Besluten är det intressanta.
- Tekniska begrepp får förklaras i klartext — läsaren är en kompis, inte en utvecklare.
- Erkänn det som inte är gjort. Det som blockerar är också innehåll.
- Avsluta gärna med **Next:** och vad som står på tur.

Undvik: superlativ, "spännande resa", emojis, punktlistor som ersätter resonemang.

## 3. Uppdatera statusblocket

Om etappen har ändrats: uppdatera `status` i `content/site.json`. Det visas både på startsidan och överst på devlogg-sidan, och är det som blir inaktuellt först. Formatet är markdown i en JSON-sträng (`\n` för radbrytning).

## 4. Bygg, granska, publicera

```bash
python3 build.py --serve
```

Kontrollera i 375 px bredd att inlägget ser rätt ut och att det ligger överst i listan. Commit:a sedan med ett engelskt commit-meddelande och pusha — GitHub Actions publicerar.

## Regler

- Ändra **aldrig** `slug` på ett publicerat inlägg — länken dör.
- Ett inlägg per faktisk händelse. Slå inte ihop två etapper i ett inlägg.
- Kontrollera datum och commit-referenser mot `~/TAG` innan du skriver dem.
