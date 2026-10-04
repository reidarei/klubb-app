// Delt mellom sider-laster.spec.ts (bredde-sveip) og treffmaal.ts-vakten
// (#700 PR 2). Flyttet hit ordrett fra sider-laster.spec.ts slik at begge
// kan importere samme liste uten å duplisere den — en ny rute skal dukke opp
// i begge vaktene samtidig, ikke bare i den som nevnes først.

// Seedede ID-er fra supabase/seed.sql. Endres en av dem der, må den endres
// her i samme commit — de er deterministiske nettopp for å kunne lenkes til.
export const ARRANGEMENT = '00000000-0000-4000-9000-000000000001'
export const MELDING = '00000000-0000-4000-9300-000000000000'
export const POLL = '00000000-0000-4000-9400-000000000000'
export const MEDLEM = '00000000-0000-4000-8000-000000000002' // Petter Prøve
export const ALBUM = '00000000-0000-4000-9800-000000000020'
export const SAMTALE = '00000000-0000-4000-9800-000000000010'
export const VARSEL = '00000000-0000-4000-9800-000000000030'

export type Rute = {
  sti: string
  // Forventet overskrift, der teksten er statisk og verifisert. Utelates for
  // sider med dynamisk overskrift (medlemsnavn, arrangementstittel) — der
  // holder den generiske «en ikke-tom overskrift finnes»-sjekken.
  overskrift?: string | RegExp
  // Fail-closed gulv (#700) for antall trykkflater i <main> som treffmaal.ts
  // faktisk MÅLTE (pluss synlige unntak; aldri skjulte, inline eller ikke-
  // målte kandidater, jf. review av PR 2). Default 1 — en rute med ingen trykkbare
  // elementer er mistenkelig, men vi skal ikke gjette et høyere tall enn
  // kalibreringen faktisk har bekreftet. Satt eksplisitt til
  // max(1, floor(målt / 2)) på ruter der en kjøring har vist ≥ 4 kandidater.
  // Settes eksplisitt til 0 kun på rene lese-sider UTEN en eneste interaktiv
  // kandidat i <main> — ingen i dag (/klubbinfo/statistikk og
  // /innstillinger/bruk har fått tilbake-pil). Et gulv på 1 der ville aldri
  // kunne bli grønt, uansett hvor lenge man venter.
  minTreffmaal?: number
  // CSS-selektor å vente på (page.waitForSelector) FØR treffmaal-sjekken
  // kjøres — kun for ruter der <main> sin generiske innholds-sjekk
  // (MIN_TEGN_I_MAIN) kan bli tilfreds av en LOADING-fallback, ikke den
  // ekte siden (#700 PR 2). /kart sin loading.tsx («Laster kartet …», 16
  // tegn) + DeployInfo (alltid i <main>, se app/(app)/layout.tsx) passerer
  // til sammen 40-tegns-terskelen uten en eneste reell kandidat — gulvet
  // målte da alltid 0, ikke fordi kartet mangler trykkflater (det har
  // «Del posisjonen min»/«Oppdater»-pillene, uavhengig av at selve Leaflet-
  // kartet lastes async, se PosisjonsKart.tsx), men fordi vakten målte
  // SKJELETTET. Vent på en kandidat som KUN finnes i den ekte siden.
  ventPaaSelektor?: string
}

// Listesider og skjemaer — alle uten ruteparameter.
export const RUTER: Rute[] = [
  { sti: '/', overskrift: undefined }, // agenda; overskriften er klubbnavnet (env-styrt)
  { sti: '/chat', overskrift: 'Samtalen' },
  { sti: '/samtaler', overskrift: 'Samtaler' },
  { sti: '/album', overskrift: 'Bilder' },
  { sti: '/album/chatten', overskrift: 'Fra chatten' },
  { sti: '/arrangoransvar', overskrift: 'Arrangøransvar' },
  { sti: '/tidligere', overskrift: 'Hele historikken' },
  { sti: '/kaaringer', overskrift: 'Hall of Fame' },
  { sti: '/stedene', overskrift: /Vi har vært verden rundt/ },
  // ingen overskrift: kartet er fullskjerm (#704). ventPaaSelektor: se
  // kommentaren på feltet over — uten den måler treffmaal-vakten
  // loading.tsx sitt skjelett, ikke PosisjonsKart.
  { sti: '/kart', ventPaaSelektor: '[data-testid="del-knapp"], [data-testid="stopp-knapp"]' },
  { sti: '/fond' },
  { sti: '/fond/rediger' },
  { sti: '/klubbinfo' },
  { sti: '/klubbinfo/medlemmer' },
  { sti: '/klubbinfo/medlemmer/ny' },
  // Statistikk fikk tilbake-pil (#700) og har dermed en kandidat — vanlig gulv.
  { sti: '/klubbinfo/statistikk', overskrift: 'Statistikk' },
  // minTreffmaal: 0 under — ren lese-side, verifisert i kildekoden (#700 PR 2):
  // «Aktivitet» sin eneste kandidat ville vært BarGraf sin role="img" (ikke i
  // KANDIDAT_SELEKTOR). Et ekte gulv på 1 ville aldri kunne bli grønt her.
  { sti: '/innspill', overskrift: 'Innspill' },
  { sti: '/innstillinger' },
  { sti: '/innstillinger/bruk', overskrift: 'Aktivitet' },
  { sti: '/innstillinger/vitals', overskrift: 'Ytelsesmålinger' },
  { sti: '/innstillinger/kart', overskrift: 'Kart' },
  { sti: '/innstillinger/varsler', overskrift: 'Varsler' },
  { sti: '/innstillinger/funksjoner', overskrift: 'Funksjoner' },
  { sti: '/innstillinger/faste-arrangementer', overskrift: 'Faste arrangementer' },
  { sti: '/innstillinger/kaaringer', overskrift: 'Kåringer' },
  { sti: '/innstillinger/varselhistorikk', overskrift: 'Varselhistorikk' },
  { sti: '/innstillinger/onsker', overskrift: 'Ønsker fra brukerne' },
  // /innstillinger/pass-godkjenninger står bevisst ikke her: den er
  // generalsekretær-only (#582), og testbrukeren er vanlig admin — ruta
  // redirecter derfor. Dekkes av egen test i innstillinger.spec.ts.
  { sti: '/profil', overskrift: 'Din profil' },
  { sti: '/profil/rediger' },
  { sti: '/om-appen', overskrift: 'Om appen' },
  { sti: '/arrangementer/ny' },
  { sti: '/meldinger/ny' },
  { sti: '/poll/ny' },
  { sti: '/kaaringspoll/ny' },

  // Detaljsider. Hver av dem treffer innholds-grenen fordi seed.sql har en
  // matchende rad — uten den ville notFound() gitt 404 og testen ville
  // bekreftet feil gren (se seed-vakten, prefiks 9800).
  { sti: `/arrangementer/${ARRANGEMENT}` },
  { sti: `/arrangementer/${ARRANGEMENT}/rediger` },
  { sti: `/meldinger/${MELDING}` },
  { sti: `/poll/${POLL}` },
  { sti: `/klubbinfo/medlemmer/${MEDLEM}` },
  { sti: `/klubbinfo/medlemmer/${MEDLEM}/rediger` },
  { sti: '/klubbinfo/vedtekter/regler' },
  { sti: `/album/${ALBUM}` },
  { sti: `/samtaler/${SAMTALE}` },
  { sti: `/varsler/${VARSEL}` },
]

// Ikke med i listen, med begrunnelse:
// - /kaaringspoll/[id]/tiebreak — krever en poll med tiebreak_status =
//   'venter_paa_tiebreak'. De fire seedede kåringspollene (#520) står som
//   'avgjort' med vilje, og å endre en av dem ville brutt
//   kaaring-varsel-retry.spec.ts. Trenger en egen fixture; egen sak.
// - /bli-utvikler og /arrangementer/tidligere — rene omdirigeringer/statiske
//   sider uten databasespørringer, og dermed utenfor det denne speccen skal
//   beskytte.
// - /login — dekket av auth.setup.ts, som feiler høylytt hvis den ryker.
