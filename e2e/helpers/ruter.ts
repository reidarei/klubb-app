// Delt mellom sider-laster.spec.ts og treffmaal-vakten, så en ny rute havner
// i begge vaktene samtidig (#700).

// Seedede ID-er fra supabase/seed.sql — endres de der, må de endres her i samme commit.
export const ARRANGEMENT = '00000000-0000-4000-9000-000000000001'
export const MELDING = '00000000-0000-4000-9300-000000000000'
export const POLL = '00000000-0000-4000-9400-000000000000'
export const MEDLEM = '00000000-0000-4000-8000-000000000002' // Petter Prøve
export const ALBUM = '00000000-0000-4000-9800-000000000020'
export const SAMTALE = '00000000-0000-4000-9800-000000000010'
export const VARSEL = '00000000-0000-4000-9800-000000000030'

export type Rute = {
  sti: string
  // Kun der teksten er statisk; dynamiske overskrifter (navn, tittel) dekkes
  // av den generiske «ikke-tom overskrift»-sjekken.
  overskrift?: string | RegExp
  // Fail-closed gulv for antall MÅLTE trykkflater i <main> (#700). Default 1;
  // ellers max(1, floor(målt / 2)) der en kjøring har vist ≥ 4. 0 kun for
  // rene lese-sider uten en eneste interaktiv kandidat (ingen i dag).
  // Se CLAUDE.md § Policy: Trykkflater.
  minTreffmaal?: number
  // Selektor å vente på før treffmaal-sjekken, for ruter der en loading-
  // fallback + DeployInfo alene passerer MIN_TEGN_I_MAIN, og vakten ellers
  // måler skjelettet (/kart, #700). Må finnes KUN i den ekte siden.
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
  // Ingen overskrift: kartet er fullskjerm (#704).
  { sti: '/kart', ventPaaSelektor: '[data-testid="del-knapp"], [data-testid="stopp-knapp"]' },
  { sti: '/fond' },
  { sti: '/fond/rediger' },
  { sti: '/klubbinfo' },
  { sti: '/klubbinfo/medlemmer' },
  { sti: '/klubbinfo/medlemmer/ny' },
  { sti: '/klubbinfo/statistikk', overskrift: 'Statistikk' },
  { sti: '/innspill', overskrift: 'Innspill' },
  { sti: '/innstillinger' },
  { sti: '/innstillinger/bruk', overskrift: 'Aktivitet' },
  { sti: '/innstillinger/vitals', overskrift: 'Ytelsesmålinger' },
  { sti: '/innstillinger/kart', overskrift: 'Kartalarmer' },
  { sti: '/innstillinger/varsler', overskrift: 'Varsler' },
  { sti: '/innstillinger/funksjoner', overskrift: 'Funksjoner' },
  { sti: '/innstillinger/faste-arrangementer', overskrift: 'Faste arrangementer' },
  { sti: '/innstillinger/kaaringer', overskrift: 'Kåringer' },
  { sti: '/innstillinger/varselhistorikk', overskrift: 'Varselhistorikk' },
  { sti: '/innstillinger/onsker', overskrift: 'Ønsker fra brukerne' },
  { sti: '/innstillinger/om-klubben', overskrift: 'Om klubben' },
  // /innstillinger/pass-godkjenninger mangler bevisst: generalsekretær-only
  // (#582), testbrukeren er admin og blir redirectet. Dekkes i innstillinger.spec.ts.
  { sti: '/profil', overskrift: 'Din profil' },
  { sti: '/profil/rediger' },
  { sti: '/varsler', overskrift: 'Varsler' },
  { sti: '/om-appen', overskrift: 'Om appen' },
  { sti: '/arrangementer/ny' },
  { sti: '/meldinger/ny' },
  { sti: '/poll/ny' },
  { sti: '/kaaringspoll/ny' },

  // Detaljsider: krever matchende seed-rad, ellers tester vi notFound()-grenen
  // (se seed-vakten, prefiks 9800).
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
// - /kaaringspoll/[id]/tiebreak — krever en poll i 'venter_paa_tiebreak'; de
//   seedede (#520) er 'avgjort' med vilje (kaaring-varsel-retry.spec.ts).
//   Trenger egen fixture.
// - /bli-utvikler og /arrangementer/tidligere — omdirigeringer/statiske sider
//   uten databasespørringer.
// - /login — dekket av auth.setup.ts.
