# AI Act — hva du som driver en instans må vite

**Regelverk:** Forordning (EU) 2024/1689 (KI-forordningen / AI Act), som endret ved forenklingspakken «Digital Omnibus», forordning (EU) 2026/1744.

Appen inneholder **to** KI-funksjoner, og begge er **av som standard**. Dette dokumentet forklarer hva de gjør, hva som utløses hvis du skrur dem på, og hva du må passe på hvis du bygger flere.

Dokumentet er en teknisk-praktisk gjennomgang, ikke juridisk rådgivning.

---

## 1. De to KI-funksjonene

### 1a. Datoforslag fra innlegger-tekst

`lib/actions/dato-forslag.ts` sender et innleggsutkast til Anthropic (Claude) for å tolke en eventuell fremtidig dato, slik at innlegget kan festes øverst på agendaen til datoen har passert.

Styres av `ANTHROPIC_API_KEY`.

### 1b. Bursdagsbildegenerering

`lib/bursdagsbilde-generering.ts` og `app/api/cron/bursdagsbilde/route.ts` genererer et fotorealistisk bursdagsbilde ved å sende medlemmets ansiktsbilde og navn til Google Vertex AI.

Styres av `GOOGLE_VERTEX_SA_JSON_B64` (og `GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION`).

### Når er funksjonene av?

- **Nøklene er tomme eller ikke satt** — begge funksjonene er no-op. Tredjeparter kalles aldri, ingen data forlater instansen din, og både AI-avsnittet på `/om-appen` og mikrotexter i grensesnittet skjules automatisk. Dette er standardoppsettet.
- **Nøklene er satt** — medlemmenes data sendes til henholdsvis Anthropic og Google (eller Google-proxy, avhengig av ditt Google-oppsett). Les videre før du gjør det.

Boolene `AI_PAA` og `BURSDAGSBILDE_PAA` i `lib/config.ts` er avledet av nøklene, ikke egne brytere. Det er med vilje: separate brytere kunne kommet i utakt med virkeligheten.

Alt annet automatisk i appen — agenda-sortering, feil-alarm, geokoding, kåringer — er regelbasert og er ikke KI-systemer i forordningens forstand, jf. fortalepunkt 12.

---

## 2. Hvilken rolle får du?

Setter du opp en instans og gir den til medlemmene dine, er du **leverandør** av KI-systemet (art. 3(3)) og samtidig **ibruktaker** (art. 3(4)). Anthropic er leverandør av modellen.

Art. 2(10) unntar ibruktaker-plikter for fysiske personer i rent personlig, ikke-yrkesmessig virksomhet — en lukket vennegjeng uten kommersielt formål treffer det. Unntaket dekker likevel ikke leverandør-plikter, så du kan ikke lene deg helt på det. Driver du klubben som en forening med et snev av yrkesmessig aktivitet, blir bildet mindre klart.

Art. 2(12) unntar fri programvare og åpen kildekode — men **ikke** når art. 5 eller art. 50 er utløst. Transparens-plikten følger altså med selv om koden er åpen.

---

## 3. Risikonivå

**Forbudt praksis (art. 5):** ingen. Appen driver ikke sosial scoring, biometri, emosjonsgjenkjenning eller manipulasjon. Kåringene er menneskestemte — ingen KI rangerer medlemmer.

**Høyrisiko (art. 6, vedlegg I og III):** nei. Å lese en dato ut av en tekst er en «snever prosedyremessig oppgave» og faller uansett ut på filteret i art. 6(3).

**KI-modeller for allmenne formål (kap. V):** ikke din plikt — den ligger hos modell-leverandøren.

**Transparens (art. 50):** gjeldende fra 2. august 2026, og ikke utsatt av Digital Omnibus. Dette er den eneste bestemmelsen som er i nærheten av å bite, og appen er allerede satt opp for å oppfylle den. Se § G2 og § G3 under for hvordan.

---

## 4. Før du skrur på nøklene

Denne seksjonen gjelder begge KI-funksjonene.

1. **Sjekk hva leverandørene gjør med dataen.** Databehandleravtale, overføringsgrunnlag ut av EØS, og hvor lenge de lagrer det du sender. Dette er GDPR, ikke AI Act, men det er punktet med størst faktisk konsekvens for medlemmene dine.
   - **Antropic:** Innleggstekst sendes til Claude. Sjekk databehandlingsavtale på console.anthropic.com.
   - **Google Vertex AI:** Ansiktsbilde og navn sendes til bildemodellen. Sjekk avtaler for Google Cloud-prosjektet ditt.
2. **Fortell medlemmene.** `/om-appen`-teksten gjør det automatisk når nøklene er satt — les den og sjekk at den stemmer for ditt oppsett.
3. **Vurder om du trenger funksjonene.** De sparer noen få tastetrykk/klikk. Det er helt legitim avveining å la dem stå av.

---

## 5. Referanser fra koden

Kodekommentarer i appen peker hit med anker-navnene under. De stammer fra gap-analysen i kilde-prosjektet, og forklarer hvorfor koden ser ut som den gjør.

### § G2 — mikroteksten ved datofeltet

Teksten under datofeltet i «nytt innlegg» sier eksplisitt at datoen foreslås av KI ut fra teksten, og at brukeren fritt kan endre den. Tidligere sto det bare «fylles ut fra teksten», som hverken sa at noe leser teksten maskinelt eller at valget kan overstyres.

Dette er en konservativ lesning av **art. 50(1)** — plikten til å informere om at man samhandler med en maskin. Plikten er neppe strengt utløst for ren bakgrunnsbehandling, men kostnaden er én linje tekst.

Teksten er betinget av `AI_PAA` (`app/(app)/meldinger/ny/page.tsx` sender den inn som prop, fordi nøkkelen er server-only). Er funksjonen av, lover mikroteksten ingen automatikk, og skjemaet hopper over server-kallet helt.

**Endrer du denne teksten, endrer du etterlevelsen.** Er du usikker, la den stå.

### § G3 — AI-avsnittet på /om-appen

Personvern-seksjonen på `/om-appen` beskriver hva som sendes, til hvem og til hvilket land. Avsnittet er betinget av `AI_PAA`.

Betingelsen er poenget: en instans uten `ANTHROPIC_API_KEY` sender ingen tekst ut, og skal da ikke fortelle medlemmene sine at den gjør det. **Art. 50(5)** krever at informasjonen er korrekt — feil i den retningen er verre enn ingen tekst, fordi den gir medlemmene et galt bilde av hvor dataene deres havner.

### § G4 — env-variablene

`ANTHROPIC_API_KEY` og `ANTHROPIC_MODEL` er dokumentert i **både** `.env.example` og `scripts/sjekk-miljo.mjs`. Begge steder, ellers er funksjonen usynlig for den som setter opp instansen.

### § G5 — policy for nye KI-funksjoner

Se § 6 under, og «Policy: AI-funksjoner» i `CLAUDE.md`.

---

## 6. Bygger du flere KI-funksjoner?

Vurderingen over gjelder **kun** så lenge KI-flatene er dato-uttrekk og bursdagsbildegenerering. Konklusjonen «minimal risiko» er ikke en egenskap ved appen, men ved de to funksjonene som finnes i dag.

- En samtaleflate (chatbot, «spør appen») utløser **art. 50(1)** på ekte — plikt til å informere om at man snakker med en maskin.
- Genererer du tekst, bilde, lyd eller video som publiseres i appen, utløser det **art. 50(2)** — plikt til maskinlesbar merking av output.
- Automatisk moderering, rangering eller vurdering *av medlemmer* er en annen sak enn å lese en dato, og må vurderes særskilt før du bygger den.
- Alle KI-kall skal gå gjennom `kallClaude()` i `lib/anthropic.ts` — der ligger timeout, feilnormalisering og garantien om at meldingsinnhold aldri logges.
- Nye env-variabler skal inn i både `.env.example` og `scripts/sjekk-miljo.mjs`.
- Oppdater dette dokumentet. Det er en levende fil, ikke et engangsstempel.

Bytter du modell eller leverandør via `ANTHROPIC_MODEL`, kan databehandlingen flytte til en annen jurisdiksjon — da er teksten på `/om-appen` blitt feil uten at noen kodeendring fanget det.

---

## 7. Geografisk anvendelse

Forordningen gjelder i EU. Den er EØS-relevant og ventes innlemmet i EØS-avtalen, men innlemmelsen var ikke fullført høsten 2026 — i EFTA-statene kommer den altså noe senere enn i EU. Art. 2(1)(c) trekker dessuten inn aktører i tredjeland når outputen brukes i Unionen.

Kostnaden ved å følge reglene her er nær null, siden appen allerede er satt opp for det. Det er ingen grunn til å vente på at fristen skal gjelde deg.
