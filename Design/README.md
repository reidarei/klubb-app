# Design-pakke: Mortensrud Herreklubb redesign

Dette er et komplett redesign-forslag for Herreklubben-appen, med både **spesifikasjon** (REDESIGN.md) og **interaktiv prototype** (HTML + React).

## Innhold

```
design/
├── README.md                          ← denne fila
├── REDESIGN.md                        ← hoved-spesifikasjon (design tokens, komponenter, side-maler, skjerm-for-skjerm)
├── Herreklubben Redesign.html         ← kjørbar prototype (åpne i nettleser)
├── skjermbilde.html                   ← hjelpe-side: render én skjerm ad gangen (?screen=...)
├── skjermbilder/                      ← PNG-bilder av alle 9 skjermer
│   ├── 01-agenda.png
│   ├── 02-arrangement-detalj.png
│   ├── 03-rediger-arrangement.png
│   ├── 04-klubbinfo.png
│   ├── 05-medlemmer.png
│   ├── 06-kaaringer.png
│   ├── 07-profil.png
│   ├── 08-rediger-profil.png
│   └── 09-innstillinger.png
└── kilder/                            ← React-komponenter som driver prototypen
    ├── ios-frame.jsx                  ← iOS statusbar
    ├── themes.jsx                     ← tema + tekstur + design-tokens (farger, fonter)
    ├── ui.jsx                         ← felles UI-komponenter (Icon, Chip, SkjemaBar, Avatar, BottomNav…)
    ├── screens.jsx                    ← Agenda, Klubbinfo, Kåringer, Profil
    ├── detail-screen.jsx              ← Arrangement-detalj
    ├── edit-screens.jsx               ← Rediger arrangement + Rediger profil
    └── settings-members-screens.jsx   ← Medlemmer + Innstillinger
```

## Hvordan bruke pakka

### For Claude Code / utvikler

1. **Les `REDESIGN.md` først.** Dette er sannhetskilden. Den inneholder:
   - Design-tokens (farger, fonter, spacing) — kap. 1
   - Side-maler (HeroSide / EditorialSide / FeedSide / SkjemaSide) — kap. 0
   - UI-komponenter (hvordan SectionLabel, Chip, TilstandsKort osv. ser ut) — kap. 3–5
   - Skjerm-for-skjerm-spesifikasjon — kap. 7

2. **Se prototypen.** Åpne `Herreklubben Redesign.html` i nettleser for interaktiv visning av alle skjermer. Bruk dropdown-en øverst til å bytte mellom visninger.

3. **Bruk React-kildene som pikseleksakt referanse.** `kilder/*.jsx` inneholder alle nøyaktige verdier — hex-farger, padding, border-radius, font-sizes. Kopier tall direkte derfra når du implementerer i produksjonskoden.

4. **Bruk skjermbildene for visuell sjekk** — hvert PNG viser topdelen av en skjerm. Full høyde finnes ved å åpne `skjermbilde.html?screen=<id>` i nettleser.

### Kort om arkitektur (fra REDESIGN.md §0)

All skjermer bygger på **fire side-maler**. Når du legger til nye skjermer, velg malen som passer:

| Mal | Når bruke | Eksempel |
|---|---|---|
| **A · HeroSide** | Full-bleed bilde-hero øverst | Arrangement-detalj |
| **B · EditorialSide** | Italic display-tittel + hairline-liste | Klubbinfo, Medlemmer |
| **C · FeedSide** | Flat header + seksjonsstablet feed | Agenda, Profil, Kåringer |
| **D · SkjemaSide** | SkjemaBar + SkjemaSeksjon + Field | Rediger-skjermer, Innstillinger |

## Viktigste designgrep (kort oppsummert)

- **Mørkt tema** (`#0c0908`) med messing-accent (`#c9a96e`) og benhvit tekst
- **Typografi:** Instrument Serif til display, Inter til body, JetBrains Mono til små UPPERCASE-etiketter
- **Ingen emoji, ingen farge-kodede ikoner** — bruk SectionLabel + hairline-borders for struktur
- **Tilstands-første navigering** i Agenda: *I kveld / Kommende / Innspill / Tidligere*
- **Editorial feel:** italic hero-titler, serif på alt av betydning, monospace for metadata

## Om filene

- **Prototypen kjører 100 % i nettleser** via Babel + React CDN. Ingen bygg-steg.
- **Data er hardkodet** i komponentene (mock). Ingen API-kall.
- **Layout er kun iPhone (390×auto)**. iPad/desktop er utenfor scope her.
