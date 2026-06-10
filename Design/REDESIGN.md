# REDESIGN.md — Herreklubben

> **Dokument for Claude Code.** Forutsetter en Playwright-drevet plan: implementér seksjon for seksjon, verifisér visuelt mot prototyp-filene, rett avvik. Alle tall, farger, shadows er **eksakte** — ikke improvisér.

---

## 0. TL;DR — målbilde

- **Estetikk:** Obsidian (kjølig blåsvart med subtile blå/lilla høylys), redaksjonell tone, mørkt og eksklusivt.
- **Fonter:** Instrument Serif (display), JetBrains Mono (labels/meta), Inter (body).
- **Signatur:** liquid-glass bottom-nav (pill-variant), kremgul accent (`#e8d9b5`), 0.5px hairlines, italic display-titler i enkelte hero-er.
- **Dark mode only.** Ingen `prefers-color-scheme: light`.

---

## 1. Autoritative referanser

Alle prototyp-filer ligger i dette prosjektet. Åpne `Herreklubben Redesign.html` i nettleser for å se målet (sørg for `DOCK_VARIANT = 'pill'`).

| Fil | Inneholder |
|---|---|
| `themes.jsx` | `obsidian_classic` — alle fargetokens |
| `ui.jsx` | `Icon`, `Monogram`, `Card`, `Avatar`, `Placeholder`, `Pill`, `SectionLabel`, `BottomNav` (variant `pill`) |
| `screens.jsx` | `HjemSkjerm`, `HighlightKort`, `ArrangementKort`, `UtkastKort`, `BursdagKort`, `InnspillKnapp`, `KlubbinfoSkjerm`, `KaaringerSkjerm`, `ProfilSkjerm` |
| `detail-screen.jsx` | `RsvpBlokk`, `RsvpGlyph`, `ArrangementDetaljSkjerm` |
| `edit-screens.jsx` | `SkjemaSeksjon`, `Field`, `Segment`, `MiniToggle`, `SkjemaBar`, `RedigerArrangementSkjerm`, `RedigerProfilSkjerm` |
| `settings-members-screens.jsx` | `MedlemmerSkjerm`, `MedlemRad`, `InnstillingerSkjerm`, `ToggleRad`, `SeksjonLabel` |

**Prototypene er kilde til sannhet.** Hvis dette dokumentet motsier prototypen — prototypen vinner. Filene bruker inline `style={{}}`; konverter gjerne til Tailwind eller CSS-moduler, men behold tall/farger/shadows eksakt.

---

## 2. Ikke-forhandlingsbare regler

Brytes disse skal Claude Code stoppe og spørre før det fortsetter.

1. **Typografi:** Instrument Serif for display, JetBrains Mono for labels, Inter for body. Ingen andre fonter.
2. **Hairlines er 0.5px** med `var(--border-subtle)`. Aldri 1px grå skillelinje.
3. **Radius:** minste er 4px (Ny-badge). Default kort er 18px.
4. **Shadows:** kun i bottom-nav og HighlightKort. Dybde ellers kommer fra bakgrunnslag + blur.
5. **Ikoner:** alltid stroke, aldri fill. `strokeWidth: 1.5` default, `1.8` aktiv.
6. **Accent:** kremgul `#e8d9b5` — ikke gull, ikke oransje. Én primær aksjon per skjerm, stat-tall, aktiv nav-state.
7. **Sensurert info:** grå italic "Skjult". Ingen sorte streker.
8. **Datoer:** `MND DD · HH:MM` i mono (store bokstaver, norske månedsforkortelser). Body-datoer: `{dag}. {månednavn} {år}`.
9. **Ingen emoji.** **Ingen romertall.** **Ingen styre-seksjon.** **Ingen "Kun viktige"-toggle.**
10. **Dark mode only.**

---

## 3. Side-standarder (malsystemet)

Appen har **fem** side-maler. Hver skjerm tilhører nøyaktig én. Alle nye skjermer MÅ forankres i én mal før pikseldesign.

### Tildeling (endelig)

| Skjerm | Mal | Begrunnelse |
|---|---|---|
| Agenda | E · AgendaSide | Hjem-skjerm med egne regler |
| Arrangement-detalj | A · HeroSide | Ett objekt, bilde er primærkanal |
| Rediger arrangement | D · SkjemaSide | Ren redigering av ett objekt |
| Profil | C · FeedSide | Strøm av seksjoner |
| Rediger profil | D · SkjemaSide | Ren redigering |
| Kåringer | C · FeedSide | Strøm av kort |
| Klubbinfo | B · EditorialSide | Lande-side med italic display-hero |
| Medlemmer | B · EditorialSide | Lande-side med display-hero + liste |
| Innstillinger | D · SkjemaSide (+B-header) | Skjema med lande-side-header |

### Mal A — `HeroSide` *(Arrangement-detalj)*
- Full-bleed 4:3-hero øverst med glass-knapper (tilbake + Rediger), mono dato-chip nederst-venstre.
- Hero er headeren — ingen ekstra side-header over.
- Max 2 knapper i hero.
- `padding-bottom: 140` (chat-felt + nav).

### Mal B — `EditorialSide` *(Klubbinfo, Medlemmer)*
- Hero-blokk med mono-kapittel (18px hairline-prefiks) + italic display-tittel (40–44px) + nøkkeltall-byline.
- Rader er transparente, kun skilt av 0.5px hairlines. Ingen Card-wrapping rundt listen.
- Maks ÉN display-tittel per side.

### Mal C — `FeedSide` *(Profil, Kåringer)*
- Header-rad: mono 10/2px over-tittel + display 38/500/-0.5px + valgfri Rediger-pill til høyre.
- Seksjoner er SectionLabel + innhold, gap 28 mellom.
- Én "hero-kort" per side tillatt (profil-Card, årsveksler).
- Høyre-handling er en tekst-pill — aldri rund ikon-knapp.

### Mal D — `SkjemaSide` *(Rediger × 2, Innstillinger)*
- Topp: `SkjemaBar` (eller EditorialSide-header for Innstillinger).
- Innhold: `SkjemaSeksjon` med `Field`-rader. Aldri ad-hoc input-stil.
- Maks én primæraksjon (Lagre) i accent per side.
- Faresone/Logg ut alltid nederst, alltid `var(--danger)`.

### Mal E — `AgendaSide` *(Agenda, eneste skjerm)*
Strengere variant av FeedSide. Hjemskjerm, styrende førsteinntrykk.

**Anatomi:**
```
<header flex space-between align-end, marginBottom 26>
  <venstre: mono "SIDEN 2015 · {N} GUTTA" + h1 display 38 "Agenda">
  <høyre: 44×44 rund +-knapp (accent-soft bg, accent ikon 20)>
</header>

<seksjon "I kveld" marginBottom 28>     (kun hvis arrangement i dag)
  <SectionLabel>I kveld · {dato}</SectionLabel>
  <HighlightKort>
</seksjon>

<seksjon "Kommende" marginBottom 20>
  <SectionLabel>Kommende</SectionLabel>
  <UtkastKort>  <BursdagKort>  <ArrangementKort>×n
</seksjon>

<seksjon "Innspill" marginBottom 28>
  <SectionLabel>Savner du noe? Opplever du feil?</SectionLabel>
  <InnspillKnapp>
</seksjon>

<seksjon "Tidligere" marginBottom 28>
  <SectionLabel>Tidligere</SectionLabel>
  <ArrangementKort tidligere>×n
</seksjon>
```

**Regler (strengere enn FeedSide):**
- Nøyaktig fire seksjoner: "I kveld", "Kommende", "Innspill" (SectionLabel "Savner du noe?..." + InnspillKnapp), "Tidligere".
- Rad-objekter er uniforme (samme grid, dato-label, padding) — kun dato-chip og høyre-celle varierer.
- HighlightKort er eneste store Card. Kun når arrangement i dag.
- +-knappen er 44×44 rund. Aldri pill, aldri tekst.
- Ingen hero-bilde i header, ingen italic-tittel, ingen søke-/filter-felt.
- Tom-tilstand "Kommende": subtil mono-linje `var(--text-tertiary)`: `Ingen planlagte sammenkomster.`
- Tidligere-rader bruker `ArrangementKort` med `tidligere`-flagg: `opacity: 0.62`, status-rad viser `✓ {N} deltok` i stedet for påmelding-status.

---

## 4. Design-tokens (`app/globals.css`)

Behold `@import "tailwindcss"`. Verdier under er fra `themes.jsx → obsidian_classic`.

```css
@import "tailwindcss";

:root {
  /* Bakgrunn */
  --bg: #060608;
  --bg-gradient:
    radial-gradient(ellipse 100% 60% at 50% 0%, rgba(100, 130, 200, 0.12) 0%, transparent 55%),
    radial-gradient(ellipse 70% 50% at 0% 100%, rgba(90, 70, 180, 0.14) 0%, transparent 60%),
    linear-gradient(180deg, #0a0a0c 0%, #060608 100%);
  --bg-elevated: rgba(20, 20, 24, 0.72);
  --bg-elevated-2: rgba(30, 30, 36, 0.82);

  /* Kantlinjer */
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.20);
  --border-subtle: rgba(255, 255, 255, 0.04);

  /* Tekst */
  --text-primary: #f5f5f7;
  --text-secondary: #9ea0a8;
  --text-tertiary: #5c5e68;

  /* Aksent */
  --accent: #e8d9b5;
  --accent-soft: rgba(232, 217, 181, 0.10);
  --accent-hot: #f5e8c8;

  /* Semantisk */
  --success: #7cc99a;
  --success-soft: rgba(110, 170, 120, 0.12);
  --success-border: rgba(110, 170, 120, 0.30);
  --danger: #d97a6c;
  --danger-alt: #e87060;
  --danger-soft: rgba(200, 90, 80, 0.12);
  --danger-border: rgba(200, 90, 80, 0.30);

  /* Fonter */
  --font-display: var(--font-instrument), Georgia, serif;
  --font-body: var(--font-inter), -apple-system, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;

  /* Form */
  --radius: 18px;
  --radius-card: 14px;
  --radius-small: 12px;
  --radius-pill: 999px;

  /* Blur */
  --blur-card: blur(24px) saturate(160%);
  --blur-nav: blur(40px) saturate(200%) brightness(1.1);
  --blur-glass: blur(16px);
}

html, body { background: var(--bg); }
body {
  background: var(--bg-gradient);
  background-attachment: fixed;
  color: var(--text-primary);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  min-height: 100dvh;
}
::-webkit-scrollbar { display: none; }
* { scrollbar-width: none; }
```

### Typografi-skala (fast)

| Rolle | Font | Str | Vekt | LS | LH |
|---|---|---|---|---|---|
| Display XL (Klubbinfo-hero, Medlemmer-hero) | display | 44 / 40 | 400 | -1.2 / -1 | 0.95 / 0.98 |
| Display L (Agenda, Hall of Fame, Din profil) | display | 38 | 500 | -0.5 | 1.0 |
| Display M (detalj-tittel) | display | 32 | 500 | -0.5 | 1.05 |
| Display S (Innstillinger) | display | 34 | 400 | -0.8 | 0.98 |
| Card-tittel (Highlight) | display | 22 | 500 | -0.3 | 1.15 |
| Liste-tittel | display | 18–19 | 500 | -0.2 / -0.3 | 1.1–1.2 |
| Field-verdi accent | display | 19 | 500 | -0.3 | — |
| Body | body | 14 | 400 | 0 | 1.5–1.65 |
| Meta-tekst, sub | body | 12 | 400 | 0.1 | — |
| Mono-label | mono | 10 | 500–600 | 1.5–2 upper | — |
| Mono-label tight | mono | 9 / 9.5 | 600 | 1.6–2.5 upper | — |

### Radius-regler

- Kort (Card, Hero): `--radius` (18px)
- Liste-rader med egen bg, RSVP-knapper, dato-chips: `--radius-card` (14px)
- Mindre felt, admin-skille: 12px
- Pills, nav, knapper: `--radius-pill`

---

## 5. `app/layout.tsx` — fonter + chrome

```tsx
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const instrument = Instrument_Serif({
  subsets: ['latin'], weight: '400', variable: '--font-instrument',
});
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={`${inter.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- `app/manifest.ts`: `theme_color: '#060608'`, `background_color: '#060608'`.
- iOS status bar: `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`.

---

## 6. Atomiske komponenter (`components/ui/`)

Én fil per komponent. Leser CSS-variabler direkte — ingen `theme`-prop.

### 6.1 `Icon.tsx`
24×24 viewBox, `strokeLinecap/Join="round"`, default `strokeWidth={1.5}`.

Ikon-sett (mapper 1:1 fra `ui.jsx`): `calendar, info, trophy, user, plus, mapPin, plane, chevron, chevronDown, bell, message, clock, users, doc, building, chart, cog, arrowRight, checkmark, x, send, list, search, cake, cigar, wine, crown`.

### 6.2 `Card.tsx`
- bg: `accent ? var(--accent-soft) : var(--bg-elevated)`
- backdropFilter: `var(--blur-card)`
- border: `1px solid (accent ? var(--border-strong) : var(--border))`
- borderRadius: `var(--radius)`
- overflow: hidden

### 6.3 `Pill.tsx`
| Variant | bg | color | border |
|---|---|---|---|
| `accent` | `var(--accent-soft)` | `var(--accent-hot)` | `var(--border-strong)` |
| `success` | `var(--success-soft)` | `#94c9a2` | `var(--success-border)` |
| `danger` | `var(--danger-soft)` | `#e89b94` | `var(--danger-border)` |
| `neutral` | `var(--border-subtle)` | `var(--text-secondary)` | `var(--border)` |

Padding: small=`2px 7px` (10px), default=`3px 9px` (11px). `textTransform: uppercase`, `letterSpacing: 0.3px`, `fontWeight: 600`, `borderRadius: 999`, `border: 0.5px solid`.

**Særtilfelle — "I kveld"-chip** på HighlightKort: ikke Pill. Solid: `bg: var(--accent-hot)`, `color: #1a1208`, `padding: 4px 10px`, `fontSize: 10`, `fontWeight: 700`, `letter-spacing: 1.2px`.

### 6.4 `SectionLabel.tsx`
`<span>LABEL</span><hairline>` — mono 10/500/1.6–2px upper, `var(--text-tertiary)`, marginBottom 10–14. Divider: `flex: 1, height: 0.5px, background: var(--border-subtle)`. Valgfritt `count`-prop: `<span style={{color: var(--text-secondary)}}>N</span>` mellom label og divider.

### 6.5 `Avatar.tsx`
- Initialer: `name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase()`
- Hash: `hue = (Σ charCode×31 mod 0xffff) % 60 + 40`
- bg: `linear-gradient(135deg, oklch(0.28 0.04 ${hue}), oklch(0.18 0.03 ${hue}))`
- fontSize: `size × 0.36`, vekt 600, `border: 0.5px solid var(--border)`
- Hvis `src` finnes → `<img>` med `object-fit: cover`

### 6.6 `Monogram.tsx`
"MH"-merke. Default size 44. Brukes i Klubbinfo-hero.
- bg: `radial-gradient(circle at 30% 30%, var(--accent-soft), transparent 70%)`
- border: 1px solid `var(--border-strong)`
- farge: `var(--accent)`, display, `fontSize: size × 0.42`, vekt 500, LS -1px

### 6.7 `Placeholder.tsx`
Hero-bilde-stand-in frem til `bilde_url`. Props: `{ label?, aspectRatio = '16/9', type?: 'tur' | 'møte' | 'event' }`.

Scene-gradienter per type:
- `tur`: `oklch(0.22 0.03 230) → oklch(0.14 0.04 260)` (kjølig blå)
- `møte`: `oklch(0.20 0.02 40) → oklch(0.12 0.02 30)` (varm brun)
- `event`: `oklch(0.20 0.03 200) → oklch(0.13 0.03 220)` (nøytral blågrå)

Over: `linear-gradient(180deg, var(--accent-soft) 0%, transparent 60%)`. SVG-pattern: 45°-striper, 8×8, `fill: var(--accent)`, `opacity: 0.08`. Label nederst-venstre: mono 10, `var(--text-tertiary)`, LS 0.5px, upper.

### 6.8 `ToggleSwitch.tsx`
40×22. bg: `on ? var(--accent) : transparent`. Border: `on ? none : 1px solid var(--border)`. Thumb: 18×18 rund, `top: on ? 2 : 1`, `left: on ? 20 : 1`, `bg: on ? #0a0a0a : var(--text-tertiary)`. Transition: `left 0.2s, background 0.2s`.

Varianter: `MiniToggle` (samme geometri, `flex-shrink: 0`), `ToggleRad` (38×22 med 0.5px border).

### 6.9 `HairlineDivider.tsx`
`<span style={{flex:1, height:'0.5px', background:'var(--border-subtle)'}} />`.

---

## 7. Skjerm-spesifikke komponenter

### 7.1 `BottomNav.tsx` (liquid glass pill)
Fra `ui.jsx → BottomNav` variant `'pill'`. Kritisk komponent — kopier eksakt.

**Container:**
- `position: fixed`, `bottom: 14, left: 16, right: 16, z-index: 30`.
- bg: `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%), var(--bg-elevated-2)`
- `backdrop-filter: var(--blur-nav)`
- border: `0.5px solid rgba(255,255,255,0.12)`
- box-shadow (multi-layer, kopier eksakt):
  ```
  0 12px 40px rgba(0,0,0,0.55),
  0 2px 10px rgba(0,0,0,0.3),
  inset 0 1px 0 rgba(255,255,255,0.14),
  inset 0 -1px 0 rgba(255,255,255,0.03),
  inset 0 0 20px rgba(255,255,255,0.02)
  ```

**Top glint:** child div, `position: absolute, top: 0, left: 10%, right: 10%, height: 45%`, gradient `rgba(255,255,255,0.18) → 0`, `borderRadius: 999px 999px 50% 50%`, `filter: blur(2px)`.

**Chromatic sheen:** radial `var(--accent-soft)` fra topp-venstre, `mixBlendMode: screen`, `opacity: 0.4`.

**Tabs (4):** Agenda (calendar), Klubb (building), Kåringer (trophy), Profil (avatar-disk — ikke ikon).

**Separator** før Profil: vertikal 0.5px med gradient `transparent → var(--border-strong) → transparent`.

**Aktiv tab** — "glass-bubble":
- `inset: 2px`, `borderRadius: 999`
- bg: `linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.12) 100%), var(--accent-soft)`
- border: `0.5px solid rgba(255,255,255,0.22)`
- box-shadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.05), inset 0 0 12px rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.2)`
- Ekstra top-glint inne i bubblen (samme pattern som container).

**Ikon strokeWidth:** aktiv `1.8`, inaktiv `1.4`.

**Profil-tab:** 22×22 rund disk med bruker-initial. Border: `var(--border-strong)` normalt, `var(--accent)` aktiv. bg: `linear-gradient(135deg, var(--accent-soft), var(--bg-elevated))`.

**Next.js:** bruk `<Link>` + `usePathname()`. Aktiv: `pathname === '/'` for Agenda; ellers `pathname.startsWith('/klubbinfo' | '/kaaringer' | '/profil')`.

### 7.2 `SkjemaBar.tsx`
```
[Avbryt]        [overtittel mono]        [Lagre pill accent]
                [tittel display 16]
```
- Avbryt: ingen bg, `var(--text-secondary)`, `fontSize: 14`.
- Midtblokk: overtittel mono 9/2px; tittel display 16/500/-0.2px.
- Lagre: `bg: var(--accent)`, `color: #0a0a0a`, `padding: 7px 14px`, radius 999, `fontSize: 13`, vekt 600.
- Outer padding: `2px 0 14px`, `marginBottom: 8`.

### 7.3 `Field.tsx`
Props: `{ label, children, last?, accent?, trailing? }`.
- padding: `10px 4px`
- borderBottom: `last ? 'none' : '0.5px solid var(--border-subtle)'`
- Label: mono 9.5/600/1.6 upper, `var(--text-tertiary)`, marginBottom 4
- Value: `accent ? display 19/500/-0.3 : body 14/400`
- Trailing: høyre i verdi-raden (kalender-ikon, toggle, chevron)

### 7.4 `Segment.tsx`
Tur / Møte / Annet (rediger-skjema).
- Full-bredde flex, 0.5px `borderTop + borderBottom + borderLeft` mellom celler
- Celle: `padding: 10px 0`, `text-align: center`, display 14/500
- Inaktiv: `var(--text-tertiary)`
- Aktiv: `var(--text-primary)` + 24×1.5px accent-underline sentrert (`bottom: -1`)

### 7.5 `RsvpBlokk.tsx` (fra `detail-screen.jsx`)
To tilstander styrt av `(svar, redigerer)`.

**Kollapset (`svar && !redigerer`):**
- `svar='ja'`: bg `var(--accent-soft)`, border `var(--border-strong)`. Status-brikke 34×34 rund, `bg: var(--accent)`, checkmark `#0a0a0a`.
- `svar='kanskje'|'nei'`: bg `var(--bg-elevated)`, border `var(--border)`. Brikke transparent med 1px border, glyph i grå.
- Tekster: `Du er påmeldt` / `Du er kanskje på` / `Du står over`.
- Endre-knapp: transparent, 0.5px border, `var(--text-secondary)`, `padding: 8px 14px`, pill.

**Åpent valg:**
- Header: `KOMMER DU?` mono + hairline + (hvis `svar && redigerer`) "AVBRYT" mono-knapp.
- Grid `1fr 1fr 1fr`, gap 8, tre knapper med ikon-sirkel over label:
  - Ja aktiv: `bg: var(--accent)`, `color: #0a0a0a`, ikon-sirkel `rgba(10,10,12,0.12)`.
  - Kanskje/Nei aktiv: `bg: var(--bg-elevated)`, `border: 0.5px solid var(--border-strong)`.
  - Inaktiv: `bg: transparent`, `border: 1px solid var(--border)`.
- Ikon-sirkel 26×26, glyph 14×14. Label: 12/600/0.1.

**Glyphs (`RsvpGlyph`):**
- check: `M5 12l5 5 9-11`
- question: `M9 9a3 3 0 116 0c0 2-3 2-3 4  M12 18h.01`
- x: `M6 6l12 12 M18 6L6 18`

### 7.6 `ArrangementKort.tsx` (liste-variant)
- Layout: flex, venstre-celle fleksibel innholdskolonne, høyre-celle 108px thumb.
- Venstre padding: `14px 14px 14px 16px`.
- Dato-label (over tittel): mono 10/600/1.6 upper, `color: var(--accent)`. Format `MAI 28 · 19:30` (tidsstempel `var(--text-tertiary)`).
- Tittel: display 18/500/-0.2, nowrap+ellipsis.
- Sted-rad: `<Icon name="mapPin" size={11} color="var(--text-tertiary)" />` + body 12 ellipsed.
- Status-rad: 5×5 prikk (grønn=ja, accent=kanskje, tertiær=ingen) + body 11 `{antallJa} påmeldt · Du er med | Du svarte kanskje | Ikke svart`.
- Thumb: 108px bredde, full høyde, samme scene-gradient som Placeholder + stripe-pattern. `border-left: 0.5px solid var(--border-subtle)`.

**`tidligere`-variant (Agenda Tidligere-seksjon):**
- Hele Card har `opacity: 0.62`.
- Status-raden bytter til: `<Icon name="checkmark" size={11} color="var(--text-tertiary)" strokeWidth={1.8} />` + body 11 `{antallJa} deltok`.

### 7.7 `HighlightKort.tsx`
Stor "i kveld"-card.
- border: `1px solid var(--border-strong)`
- box-shadow: `0 8px 30px var(--accent-soft), 0 0 0 1px var(--border-strong)`
- Placeholder 16/10 øverst
- Absolutt "I KVELD"-chip top-right (solid accent-hot, se 6.3)
- Padding: `18px 18px 20px`
- Meta: Pill `accent` med type + body 12 `var(--text-secondary)` dato
- Tittel: display 22/500/-0.3
- Sted: pin 13 + body 13
- Bunn (separert `1px solid var(--border-subtle)`): 3 overlappende avatarer 24 (`margin-left: -6`, `zIndex: 10-i`) + `{N} påmeldt` + status-Pill høyre

### 7.8 `UtkastKort.tsx`
Samme grid som ArrangementKort, men:
- border: `1px dashed var(--border-strong)`, bg transparent
- tittel i `var(--text-secondary)`
- høyre-celle: stort `?` display 54, `var(--text-tertiary)`, opacity 0.55
- ingen bilde, ingen bg

### 7.9 `BursdagKort.tsx`
Samme grid som ArrangementKort. Venstre: dato-label + `{navn} fyller {alder}` (display 18; "fyller N" i `var(--text-tertiary)`/400). Høyre-celle 64px: sentrert `<Icon name="wine" size={22} strokeWidth={1.25} color="var(--text-tertiary)" />`. Ingen border, ingen bg.

### 7.10 `InnspillKnapp.tsx`
**Meta-feedback-knapp på Agenda.** Ikke et arrangement-forslag — sender tilbakemelding om selve appen (forbedringer, feil).

- **Seksjons-overskrift** (SectionLabel, mono caps, 1.6–2px upper, tertiary, med hairline): `Savner du noe? Opplever du feil?`. Rendres som egen SectionLabel UTENFOR knappen — symmetrisk med "Kommende" og "Tidligere".
- **Knappen selv:** full-bredde pill-knapp, samme form som Logg ut-knappen i Rediger profil.
  - `width: 100%`, `padding: 14px 0`, `text-align: center`.
  - bg: transparent, border: `1px solid var(--border)`, `border-radius: 999`.
  - Tekst: body 14/500, LS 0.2px, `color: var(--accent)` (positivt CTA — derfor accent, ikke danger).
  - Tekst: `Send innspill`.

Plasseres som egen seksjon mellom "Kommende" og "Tidligere" på Agenda (marginBottom 28).

### 7.11 `MedlemRad.tsx`
- Flex gap 14, `padding: 14px 4px`, hairline under (0.5px `var(--border-subtle)`).
- Avatar 40.
- Navn display 17/500/-0.2 + inline status-chip (Ny / Æres):
  - Ny: mono 8, accent, `border: 0.5px solid var(--border-strong)`, radius 4, `padding: 2px 6px`.
  - Æres: `<Icon name="crown" size={11} color="var(--accent)" />`.
- Sub: body 12 `var(--text-tertiary)`: `{rolle} · medlem siden {år}`.
- Høyre: nærvær `{N}%` mono 13, farge:
  - ≥85 → `var(--accent)`
  - 70–84 → `var(--text-secondary)`
  - <70 → `var(--text-tertiary)`
- Mono 8 "NÆRVÆR" under.

### 7.12 `ToggleRad.tsx` (innstillinger)
Title + sub + toggle høyre. Body 13/500 tittel, body 11 sub. Toggle 38×22 (se 6.8), med `border: 0.5px solid var(--border)` når av.

---

## 8. Skjermer (ruter + innhold)

Alle skjermer har `padding: '0 20px 20px'`. Ingen `<main>`-card-wrapper — enkel vertikal stabel.

Hver seksjon under følger mønsteret: **struktur → data-binding → akseptkriterier (Playwright)**.

### 8.1 Agenda — `app/(app)/page.tsx`

**Struktur (mal E):**
1. Header-rad: mono "SIDEN 2015 · {N} GUTTA" + display 38 "Agenda". Høyre: 44×44 rund +-knapp → `/arrangementer/nytt`.
2. Seksjon **"I kveld · {dagens dato}"** *(kun hvis arr i dag)*: `<HighlightKort>`.
3. Seksjon **"Kommende"** (marginBottom 20, gap 12):
   - `<UtkastKort>` for `arrangement_ansvar` uten `arrangement_id`.
   - `<BursdagKort>` for bursdager innen 7 dager.
   - `<ArrangementKort>` for fremtidige arrangementer, sortert stigende.
4. `<InnspillKnapp>` (mellom kommende og tidligere).
5. Seksjon **"Tidligere"** (marginBottom 28, gap 12): `<ArrangementKort tidligere>` for avholdte arrangementer, sortert synkende (nyeste først).

**Data:**
| UI | Supabase |
|---|---|
| "{N} gutta" | `profiles` count where `aktiv=true` |
| I kveld | `arrangementer` where `date(start_tidspunkt) = today` |
| Kommende | `arrangementer` where `start_tidspunkt > now()` order asc |
| Utkast | `arrangement_ansvar` left join `arrangementer`, uten `arrangement_id` |
| Bursdager | `profiles.fodselsdato` filtrert på (måned,dag) i 7-dagers vindu |
| Tidligere | `arrangementer` where `start_tidspunkt < now()` order desc |
| Deltakere på hero | `paameldinger` status='ja' join profiles |
| Status på kort | `paameldinger` for `auth.uid()` |
| Innspill-knapp | `/innspill` — eller `mailto:` / ekstern feedback-link (avtal med Reidar) |

**Playwright-akseptkriterier:**
- Header har `h1` med tekst `Agenda` og `font-family: Instrument Serif` (via computed style).
- +-knappen har `width: 44px` og `border-radius: 50%`.
- Når en test-bruker har 1 arr i dag, 3 fremover, 2 tidligere: siden rendrer nøyaktig 1 HighlightKort, 3 (+utkast/bursdag) Kommende-rader, 1 InnspillKnapp, 2 Tidligere-rader.
- Tidligere-rader har `opacity: 0.62` (computed).
- InnspillKnapp er mellom siste Kommende-rad og SectionLabel "Tidligere" i DOM-rekkefølgen.
- Tom "Kommende": rendrer mono-linje `Ingen planlagte sammenkomster.`

### 8.2 Arrangement-detalj — `app/(app)/arrangementer/[id]/page.tsx`

**Struktur (mal A):**
```
<Hero 4:3 med Placeholder eller bilde_url>
  [← tilbake 36×36 glass-knapp, top-left]
  [Rediger-pill glass, top-right, kun arrangør/admin]
  [mono dato-chip nederst-venstre]
  Gradient-overlay: linear-gradient(180deg, transparent 40%, var(--bg) 100%)
</Hero>

<container padding 0 20px>
  <Tittel-blokk>
    h1 display 32/500/-0.5
    meta body 13 var(--text-tertiary): "{datoLang} · {destinasjon}"
  </Tittel-blokk>

  <RsvpBlokk />

  <Fakta-rad borderTop+borderBottom subtle>
    Oppmøte (mapPin) · Destinasjon (plane) · Pris (wine)

  <SectionLabel>Beskrivelse</SectionLabel>
  <p body 14/1.65 var(--text-secondary)>

  <SectionLabel count={N}>Påmeldt</SectionLabel>
  <avatar-stack 7 synlige + " + {N-7} til">

  <SectionLabel count={N}>Samtale</SectionLabel>
  <meldings-tråd>
  <skriv-melding-pill>
</container>
```

**Hero-detaljer:**
- Tilbakeknapp: 36×36 rund, `bg: rgba(10,10,12,0.6)`, `backdrop-filter: var(--blur-glass)`, `border: 0.5px solid var(--border)`. Chevron rotert 180°.
- Rediger-pill: samme glass, `padding: 8px 14px`, radius 999. Synlig **kun hvis** `opprettet_av === auth.uid() || er_admin()`.
- Dato-chip: mono 10/600/1.8 upper, `color: var(--accent)`, format `{MND} {DAG} · {HH:MM}`.

**Fakta-rad:**
```
[icon 14] LABEL (mono 9.5/600/1.6)     [verdi body 14]
                                        · {sub tertiær}
```
- Oppmøte / mapPin / `oppmoetested`
- Destinasjon / plane / `destinasjon` *(sensureres — se §10)*
- Pris / wine / `{pris} kr · per person` *(sensureres)*

**Samtale:**
- Meldinger: vertikal gap 14, marginBottom 20.
- Andres: `flexDirection: row`, avatar 26 venstre (align-self: end). Navn body 12/500 `var(--text-secondary)` + tid mono 9 tertiær. Boble: `padding: 10px 14px`, `border-radius: 14px 14px 14px 4px`, `bg: var(--bg-elevated)`, `border: 0.5px solid var(--border-subtle)`, body 13/1.5.
- Egne: `flexDirection: row-reverse`, boble-radius `14px 14px 4px 14px`, `bg: var(--accent-soft)`, `border: 0.5px solid var(--border-strong)`.
- Max-width boble-wrapper: 78%.
- Skriv-felt: pill `padding: 8px 8px 8px 16px`, `bg: var(--bg-elevated)`, `border: 0.5px solid var(--border)`, radius 999. Placeholder body 13 tertiær. Send-knapp 32×32 rund `bg: var(--accent)`, `arrowRight`-ikon stroke `#0a0a0a`.

**Data:**
| UI | Supabase |
|---|---|
| Hero-bilde | `arrangementer.bilde_url` (bucket `arrangement_bilder`) |
| Rediger synlig | `opprettet_av === auth.uid()` OR `er_admin()` |
| Sted/destinasjon/pris | `arrangementer.*`, respekter `sensurerte_felt` jsonb |
| Beskrivelse | `arrangementer.beskrivelse` (via `react-markdown`) |
| Påmeldte | `paameldinger` status='ja' join profiles |
| Min RSVP | `paameldinger where profil_id=auth.uid() and arrangement_id=id` |
| Chat | `arrangement_meldinger` (eksisterende `Chat.tsx`) |

**Playwright-akseptkriterier:**
- Hero har aspect-ratio 4/3 (via computed width/height ratio).
- Tilbakeknapp er 36×36 og har `backdrop-filter` satt.
- RsvpBlokk kollapser/utvides korrekt når man klikker seg gjennom svar.
- Sensurert felt vises som italic "Skjult" i `var(--text-tertiary)` for ikke-arrangør.

### 8.3 Rediger arrangement — `app/(app)/arrangementer/[id]/rediger/page.tsx`

**Struktur (mal D):** se `edit-screens.jsx → RedigerArrangementSkjerm`.
1. `<SkjemaBar overtittel="Rediger" tittel={arr.tittel} />`
2. Hero-forhåndsvisning (radius `--radius`, overflow hidden, 16/9) med "Bytt bilde"-knapp bottom-right (glass-pill).
3. `<SkjemaSeksjon label="Type">` → `<Segment value={type} options={[tur, møte, annet]} />`
4. `<SkjemaSeksjon label="Detaljer">`:
   - Field "Tittel" (accent)
   - Field "Start" — trailing kalender-ikon 15
   - Field "Slutt" — trailing kalender-ikon 15
   - Field "Oppmøtested" — trailing mapPin 15
   - Field "Destinasjon" (last) — trailing `<MiniToggle on={sensurerte_felt.destinasjon} />`
5. `<SkjemaSeksjon label="Kostnad">`:
   - Field "Pris per person" (last, accent): tall + mono "kr" + trailing MiniToggle. Layout `display:flex, alignItems:baseline, justifyContent:space-between`.
6. `<SkjemaSeksjon label="Beskrivelse">`:
   - Textarea, `var(--text-secondary)`, `minHeight: 88`.
   - Under hairline: markdown-hint 3 spalter mono 10/1.4 upper: `**bold**` · `*italic*` · `— liste`.
7. `<SkjemaSeksjon label="Faresone">`:
   - "Slett arrangement" i `var(--danger)`, display 16/500/-0.2, chevron høyre, hairline under.

**Data:** kobler til eksisterende `lib/actions/arrangementer.ts` — bytt kun UI.

### 8.4 Profil — `app/(app)/profil/page.tsx`

**Struktur (mal C):**
1. Header: mono "MEDLEM SIDEN {yyyy}" + display 38 "Din profil". Høyre: **Rediger-pill** (`padding: 8px 14px`, `border: 1px solid var(--border)`, bg transparent, body 12/500) → `/profil/rediger`.
2. Hero-Card, padding 24, text-align center:
   - bg: `radial-gradient(ellipse at top, var(--accent-soft), transparent 70%), var(--bg-elevated)`
   - `<Avatar size={78} />`
   - Navn display 22/500/-0.3, marginTop 14
   - Rolle-mono "ADMIN" (hvis admin) i `var(--accent)` 10/2px
   - Stats-rad (flex center gap 28, borderTop subtle, paddingTop 20):
     - Oppmøter (display 24/500 accent) / mono 9 "OPPMØTER"
     - Kåringer / "KÅRINGER"
     - År / "ÅR"
3. `<SectionLabel>Arrangøransvar</SectionLabel>`:
   - Rader uten Card, 0.5px hairline mellom.
   - 8×8 status-prikk: grønn (success) med 3px glow hvis lagt inn, rød (danger) hvis ikke.
   - Mono periode ("2026 · SOMMER") + display 18/500 tittel + body 12 tertiær meta.
   - Høyre: mono 10/1.4 "LAGT INN" (grønn) / "IKKE LAGT INN" (rød).
4. `<SectionLabel>Varsler</SectionLabel>`:
   - Kun **Push** og **E-post**. Ingen "Kun viktige", ingen "Bursdager".
   - Body 16/500 tittel + body 12 sub + `<ToggleSwitch />`.

**Data:**
| UI | Supabase |
|---|---|
| Avatar | `profiles.bilde_url` |
| Navn, rolle | `profiles.navn`, `profiles.rolle` |
| Medlem siden | `profiles.opprettet` → yyyy |
| Oppmøter | `get_statistikk() → deltagelse.find(d=>d.id===uid).totalt` |
| Kåringer | `count(*) kaaring_vinnere where profil_id=uid` |
| År | `new Date().getFullYear() - 2015` |
| Arrangøransvar | `arrangement_ansvar where profil_id=uid` left join `arrangementer` |
| Toggles | `varsel_preferanser.push_aktiv`, `.epost_aktiv` |

### 8.5 Rediger profil — `app/(app)/profil/rediger/page.tsx`

**Struktur (mal D):**
1. `<SkjemaBar overtittel="Rediger" tittel="Profil" />`
2. Avatar-editor-blokk (borderTop+Bottom subtle, `padding: 14px 4px 18px`):
   - Avatar 56 med absolute `+`-badge bottom-right (22×22 rund, `bg: var(--accent)`, border 2px solid `var(--bg)`, plus 11 `#0a0a0a`).
   - Høyre: display 17 navn + "Bytt profilbilde" (body 12/500 `var(--accent)`).
3. `<SkjemaSeksjon label="Personalia">`:
   - Field "Navn" (accent)
   - Field "Visningsnavn"
   - Field "Fødselsdato" (last) trailing kalender
4. `<SkjemaSeksjon label="Kontakt">`:
   - Field "E-post"
   - Field "Telefon" (last)
5. `<SkjemaSeksjon label="Sikkerhet">`:
   - "Endre passord" display 16/500 + "Sist endret for {N} måneder siden" body 12 + chevron.
6. Logg ut-knapp (marginTop 28): fullbredde, `padding: 14px 0`, transparent, `border: 1px solid var(--border)`, radius 999, `color: var(--danger)`, body 14/500.

**Data:**
| Felt | Supabase |
|---|---|
| Navn/visningsnavn/fødselsdato/telefon | `profiles.*` |
| E-post | `profiles.epost` + `auth.updateUser({email})` (krever bekreftelse) |
| Passord | `auth.updateUser({password})` — bottom-sheet eller sub-side |
| Bilde | Storage `profil_bilder/{uid}/profil.jpg` → `profiles.bilde_url` |

### 8.6 Medlemmer — `app/(app)/klubbinfo/medlemmer/page.tsx`

**Struktur (mal B):**
1. Header:
   - Mono breadcrumb "Klubbinfo / Medlemmer" (18px hairline-prefiks, gap 10).
   - Display 40/400/-1 "Herrene".
   - Body 13 tertiær meta: `{N} aktive · {M} æresmedlemmer · {K} sammenkomster`.
   - Søk-rad (marginTop 22, flex gap 8):
     - Søkefelt flex-1 pill: `bg: var(--bg-elevated)`, `border: 0.5px solid var(--border)`, `padding: 10px 14px`. Lupe 13 + placeholder body 13 tertiær "Søk etter medlem…".
     - "A–Å"-pill: mono 10/1.5 upper, samme bg/border, `padding: 0 14px`.
2. Seksjon "Aktive" + "Æresmedlemmer" (`<SectionLabel label count>`).
3. Hver rad: `<MedlemRad>`.
4. Inviter-knapp (marginTop 32, kun admin): fullbredde, `padding: 16px 0`, `bg: var(--accent)`, `color: #0a0a0a`, radius 999, body 14/600.

**Roller:** Stifter (2 eldste), Æresmedlem, Medlem, "Nytt medlem" (første året). **Ingen styre-seksjon.**

**Data:**
| UI | Supabase |
|---|---|
| Liste | `profiles where aktiv=true order by opprettet asc` |
| Æresmedlemmer | `profiles.rolle = 'aeresmedlem'` — legg til i enum (§10.3) |
| Nærvær-% | `paameldinger.status='ja'` / arrangementer etter `profil.opprettet` |
| Inviter synlig | `er_admin()` |

### 8.7 Kåringer / Hall of Fame — `app/(app)/kaaringer/page.tsx`

**Struktur (mal C):**
1. Header: mono "KÅRINGER" + display 38 "Hall of Fame".
2. Årsveksler-Card (padding `12px 16px`, marginBottom 18): chevron-venstre · år display 20/500/2px upper accent · chevron-høyre.
3. Kåringer-liste (vertikal gap 12):
   - Hver kategori i Card padding 18.
   - Flex: 40×40 rund `bg: var(--accent-soft)`, `border: 1px solid var(--border-strong)` — `crown` hvis vinner er profil, `trophy` hvis arrangement, `clock` hvis ikke kåret.
   - Innhold: mono "ÅRETS HERREMANN" (10/1.5) + display 20/500 vinnernavn + display 13 italic `«sitat»` i `var(--text-secondary)`.
   - Ikke kåret: body 13 italic tertiær "Ikke kåret ennå".

**Data:**
| UI | Supabase |
|---|---|
| År-dropdown | `select distinct aar from kaaringer order by aar desc` |
| Kategorier | `kaaringer where aar=:aar` |
| Vinnere | `kaaring_vinnere` join `profiles` eller `arrangementer` |
| Sitat | `kaaring_vinnere.begrunnelse` |

### 8.8 Klubbinfo — `app/(app)/klubbinfo/page.tsx`

**Struktur (mal B):**
1. Hero (padding `12px 4px 32px`, borderBottom subtle, marginBottom 32):
   - Mono "ETABLERT 2015" med 18px hairline-prefiks (gap 10).
   - `<h2>` display 44/400/-1.2 **italic** "Mortensrud" (primary).
   - `<h2>` display 44/400/-1.2 "Herreklubb" (secondary), stables på linje 2.
   - Stats-rad (flex gap 22, marginTop 22): 3 tall — display 18 accent-tall over mono 10/1.5 upper label:
     - 17 / MEDLEMMER
     - 11 / ÅRGANGER
     - 132 / SAMMENKOMSTER
2. Magazine-TOC (rader gap 16, `padding: 18px 4px`, hairline under):
   - Nummer: mono 10/600/1.6 upper, bredde 22.
   - Tittel: display 19/500/-0.3, lineHeight 1.1.
   - Sub: body 12 tertiær.
   - Meta (valgfri høyre): mono 11 secondary.
   - Chevron høyre 14 tertiær.

**Rader (6):**
1. `01 users` "Medlemmer" — sub "17 aktive · 3 æresmedlemmer", meta `{antall}` → `/klubbinfo/medlemmer`
2. `02 list` "Arrangøransvar" — sub "Hvem tar hva i 2026" → `/klubbinfo/ansvar`
3. `03 doc` "Vedtekter" → `/klubbinfo/vedtekter`
4. `04 building` "Historikk" → `/klubbinfo/historikk`
5. `05 chart` "Statistikk" → `/klubbinfo/statistikk`
6. `06 cog` "Innstillinger" → `/innstillinger`

**Data:**
| Stat | Query |
|---|---|
| Medlemmer | `count(*) profiles where aktiv=true` |
| Årganger | `now.year - 2015` |
| Sammenkomster | `get_statistikk() → totalt` |

### 8.9 Innstillinger — `app/(app)/innstillinger/page.tsx`

**Struktur (mal D med B-header):**
1. Header (mal B):
   - Mono breadcrumb "Klubbinfo / Innstillinger" (18px hairline-prefiks).
   - Display 34/400/-0.8 "Innstillinger".
2. Medlem-seksjon (alle):
   - `<SectionLabel>Varsler</SectionLabel>`
   - `<ToggleRad>` "Push-varsler" / "Varsler på enheten" → `varsel_preferanser.push_aktiv`
   - `<ToggleRad>` "E-post" / "Varsler på e-post" → `.epost_aktiv`
3. Admin-skille (kun `er_admin()`):
   - Card radius 12, `padding: 12px 14px`, `bg: var(--accent-soft)`, `border: 0.5px solid var(--border-strong)`.
   - Flex: 26×26 rund `bg: var(--accent)` med skjold-SVG stroke `#0a0a0a` (`M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z`, strokeWidth 2.2).
   - Tekst: mono 9/2px "KUN FOR ADMIN" + display 17/500/-0.2 "Administrasjon".
4. Admin-innhold:
   - `<SectionLabel>Push-varsler</SectionLabel>` → mono 18 accent `{pushEnheter}` + body 13 "enheter registrert" (`push_subscriptions` count).
   - `<SectionLabel>Varsler</SectionLabel>` → 6 ToggleRad (`varsel_innstillinger`):
     - "Varsel ved nytt arrangement"
     - "Påminnelse 7 dager før"
     - "Påminnelse 1 dag før"
     - "Purring til de som ikke har svart (3 dager før)"
     - "Purring til arrangøransvarlige som ikke har opprettet arrangement"
     - "Testmodus — varsler sendes kun til Reidar"
   - `<SectionLabel>Innhold</SectionLabel>` → 4 lenke-rader (body 13/500 tittel + body 11 sub + chevron):
     - "Faste arrangementer" / "Arrangementmaler" → `/innstillinger/arrangementmaler`
     - "Kåringer" / "Kåringmaler" → `/innstillinger/kaaringmaler`
     - "Ønsker fra brukerne" / "Issues fra GitHub" → `/innstillinger/issues`
     - "Varselhistorikk" / "Siste 10 varsler sendt" → `/innstillinger/varsellogg`
5. App-info + Logg ut:
   - Sentrert mono 9/1.8 upper tertiær `Herreklubben · v{x.y.z}` (fra `package.json`).
   - Fullbredde logg-ut: transparent, 1px border, `color: var(--danger-alt)` (`#e87060`), `padding: 12px 0`, body 13/600.

---

## 9. Copy-liste (full)

Alt norsk copy i appen. Ingen emoji, ingen romertall, ingen "Kun viktige".

| Sted | Tekst |
|---|---|
| Agenda over-tittel | `SIDEN 2015 · {N} GUTTA` |
| Agenda hero-seksjon | `I KVELD · {dato}` |
| Agenda liste-seksjon | `KOMMENDE` |
| Agenda tidligere-seksjon | `TIDLIGERE` |
| Agenda tom-tilstand (kommende) | `Ingen planlagte sammenkomster.` |
| Innspill-knapp overtittel | `Savner du noe? Opplever du feil?` |
| Innspill-knapp tekst | `Send innspill` |
| Highlight-chip | `I KVELD` (solid accent-hot, mørk tekst) |
| Kåringer-tittel | `Hall of Fame` |
| Kåringer over-tittel | `KÅRINGER` |
| Kåringer tom | `Ikke kåret ennå` (italic) |
| Profil over-tittel | `MEDLEM SIDEN {yyyy}` |
| Profil-varsler | `Push` / `Varsler på enheten` · `E-post` / `Varsler på e-post` |
| Profil-status lagt inn | `LAGT INN` (grønn) / `IKKE LAGT INN` (rød) |
| Klubbinfo-kapittel | `ETABLERT 2015` |
| Klubbinfo-hero | `Mortensrud` *(italic)* / `Herreklubb` |
| Klubbinfo-stats | `MEDLEMMER` · `ÅRGANGER` · `SAMMENKOMSTER` |
| Medlemmer-tittel | `Herrene` |
| Medlemmer-breadcrumb | `KLUBBINFO / MEDLEMMER` |
| Medlemmer-meta | `{N} aktive · {M} æresmedlemmer · {K} sammenkomster` |
| Medlemmer-roller | `Stifter` · `Æresmedlem` · `Medlem` · `Nytt medlem` |
| Medlemmer-ny-badge | `Ny` |
| Medlemmer-admin-knapp | `Inviter nytt medlem` |
| Innstillinger-breadcrumb | `KLUBBINFO / INNSTILLINGER` |
| Innstillinger admin-skille | `KUN FOR ADMIN` / `Administrasjon` |
| Innstillinger fot | `Herreklubben · v{x.y.z}` |
| Arrangement RSVP header | `KOMMER DU?` |
| RSVP-alternativer | `Jeg kommer` · `Kanskje` · `Kan ikke` |
| RSVP kollapset label | `DITT SVAR` |
| RSVP kollapset tekst | `Du er påmeldt` / `Du er kanskje på` / `Du står over` |
| RSVP endre | `Endre` |
| Arrangement-detalj seksjoner | `BESKRIVELSE` · `PÅMELDT` · `SAMTALE` |
| Arrangement pris-sub | `per person` |
| Melding-placeholder | `Skriv en melding…` |
| Arrangement-rediger seksjoner | `TYPE` · `DETALJER` · `KOSTNAD` · `BESKRIVELSE` · `FARESONE` |
| Arrangement-rediger destr. | `Slett arrangement` |
| Markdown-hint | `**bold**` · `*italic*` · `— liste` |
| Profil-rediger seksjoner | `PERSONALIA` · `KONTAKT` · `SIKKERHET` |
| Profil-rediger passord | `Endre passord` / `Sist endret for {N} måneder siden` |
| Profil-rediger bilde | `Bytt profilbilde` |
| SkjemaBar | `Avbryt` · `{overtittel}` · `{tittel}` · `Lagre` |
| Sensurert felt | `Skjult` (italic tertiær) |
| Logg ut | `Logg ut` |

---

## 10. Migrasjoner og data

### 10.1 (Valgfri) `profiles.medlem_siden`
Hopp over. Bruk `profiles.opprettet`.

### 10.2 Storage-bucket for profilbilder

```sql
-- 037_profil_bilder_bucket.sql
insert into storage.buckets (id, name, public)
values ('profil_bilder', 'profil_bilder', true)
on conflict do nothing;

create policy "Les profilbilder" on storage.objects for select
  using (bucket_id = 'profil_bilder');

create policy "Egen profilbilde skriv" on storage.objects for insert
  with check (bucket_id = 'profil_bilder' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Egen profilbilde oppdater" on storage.objects for update
  using (bucket_id = 'profil_bilder' and auth.uid()::text = (storage.foldername(name))[1]);
```

Filsti: `{uid}/profil.jpg`.

### 10.3 (Valgfri) `profiles.rolle` enum — legg til `aeresmedlem`

```sql
alter type profil_rolle add value if not exists 'aeresmedlem';
```

### 10.4 Ingen andre databaseendringer
Alt annet bygger på eksisterende skjema: `arrangementer.sensurerte_felt` jsonb, `paameldinger.status`, `kaaring_vinnere`, `varsel_preferanser`, `varsel_innstillinger`, `push_subscriptions`, `get_statistikk()`.

### 10.5 Sensurering (regel)
Hvis `sensurerte_felt.{felt} === true` og `auth.uid() !== opprettet_av`, render verdien som italic "Skjult" i `var(--text-tertiary)`. Admin ser **ikke** gjennom sladden — kun arrangør.

---

## 11. Implementasjonsrekkefølge

Hvert trinn er deploy-bart separat. Ingen breaking changes i data-laget.

1. **Tokens + fonter + manifest** (§4, §5)
2. **Atomiske komponenter** (§6): `Icon`, `Card`, `Pill`, `SectionLabel`, `Avatar`, `Monogram`, `Placeholder`, `ToggleSwitch`, `Field`, `Segment`, `SkjemaBar`
3. **BottomNav** (§7.1) — synlig umiddelbart overalt
4. **Agenda** (§8.1) + `ArrangementKort`, `HighlightKort`, `UtkastKort`, `BursdagKort`, `InnspillKnapp`
5. **Arrangement-detalj** (§8.2) + `RsvpBlokk` + chat-integrasjon
6. **Rediger arrangement** (§8.3)
7. **Profil** (§8.4) + **Rediger profil** (§8.5) + storage-bucket (§10.2)
8. **Medlemmer** (§8.6) + `MedlemRad` + enum-migrasjon (§10.3)
9. **Kåringer** (§8.7)
10. **Klubbinfo** (§8.8) — monogram + stats + magazine-TOC
11. **Innstillinger** (§8.9) — medlem + admin med skjold-skille
12. **Polering** — RLS, sensurering, push/epost-varsler, PWA-installasjon, iOS/Android

---

## 12. Verifiserings-sjekkliste per skjerm (for Playwright)

Kjøres ETTER hvert trinn i §11. Test mot prototypens skjerm-for-skjerm render.

**Felles på alle sider:**
- `body` har computed `background-attachment: fixed`.
- `BottomNav` er synlig (position fixed, bottom 14) på hver side bortsett fra rediger-skjermer hvor `SkjemaBar` tar topp-fokus.
- Ingen scrollbar er synlig.
- Aktiv tab i BottomNav matcher ruten.

**Per side (eksempler, ikke-uttømmende):**
- **Agenda:** h1 "Agenda", +-knapp 44×44 rund, InnspillKnapp mellom Kommende og Tidligere, Tidligere-rader har opacity 0.62.
- **Arrangement-detalj:** hero 4:3, Rediger-pill kun synlig for arrangør/admin, sensurert pris viser "Skjult" italic for ikke-arrangør.
- **Rediger arrangement:** SkjemaBar har "Lagre"-pill høyre, "Slett arrangement" i danger-farge nederst.
- **Profil:** Hero-Card har radial-gradient bg, stats-rad har 3 tall, kun Push+E-post i varsler-seksjon.
- **Rediger profil:** Avatar 56 med +-badge, Logg ut-knapp nederst i danger.
- **Medlemmer:** Display 40 "Herrene", meta har 3 tall, ingen styre-seksjon.
- **Kåringer:** Display 38 "Hall of Fame", årsveksler-Card over listen.
- **Klubbinfo:** Italic "Mortensrud" i linje 1, magazine-TOC har nøyaktig 6 rader.
- **Innstillinger:** Breadcrumb "KLUBBINFO / INNSTILLINGER", admin-skille kun for admin, fot-versjon leses fra package.json.

---

## 13. Når Claude Code skal stoppe og spørre

- Hvis en komponent krever et ikon som ikke finnes i §6.1-listen.
- Hvis en ny skjerm ikke passer inn i en av de fem malene i §3.
- Hvis en data-query krever en ny migrasjon utover §10.
- Hvis en visuell regel i §2 må brytes.
- Hvis Innspill-knapp-ruten (`/innspill`) ikke er avklart — spør om den skal gå til GitHub issues, `mailto:`, eller ny side.
