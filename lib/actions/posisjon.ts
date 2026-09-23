'use server'

import { revalidatePath } from 'next/cache'
import { ensureInnlogget } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { POSISJON_DELING_TIMER, POSISJON_MIN_FLYTT_M } from '@/lib/konstanter'
import { finnPaagaaendeArrangement } from '@/lib/posisjon'
import { avstandM } from '@/lib/geo-avstand'
import { sendVarsel } from '@/lib/varsler'
import { logg } from '@/lib/logg'

// Resultattype i stedet for throw: knappen står i en klientkomponent som må
// kunne vise «du må tillate posisjon» og «det gikk ikke» forskjellig, og en
// generisk Error gir den ingenting å skille på.
export type PosisjonResultat = { ok: true; delerTil: string } | { ok: false; melding: string }

// Validerer det nettleseren sendte oss FØR det når basen. Sjekkene speiler
// check-constraints i migrasjon 144 — de finnes begge steder med vilje: her for
// å gi mannen en forståelig melding, der for at ingen annen vei inn kan omgå dem.
function gyldigKoordinat(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

// avstandM() flyttet til lib/geo-avstand.ts (#728-uttrekk) — brukes til å
// avgjøre om en ny innmelding er en FLYTTING eller bare GPS-støy på samme
// sted, se kommentaren i delPosisjon(). Flyttet fordi avstand til en
// markering/timeplan-post nå også skal vises i klientkomponenter, som ikke
// kan importere en 'use server'-fil.

/**
 * Lagrer min posisjon og (for)nyer delingsvinduet med POSISJON_DELING_TIMER.
 *
 * Hvert kall flytter `deler_til` framover. Det er bevisst: knappen betyr «del i
 * 8 timer fra nå», ikke «del til et fast klokkeslett». Uten fornyingen ville en
 * mann som oppdaterer posisjonen sin like før vinduet løper ut, falle av kartet
 * midt i kvelden uten å skjønne hvorfor.
 *
 * Pågår et arrangement, knyttes punktet til det og blir en del av kveldens spor
 * (#695). Ellers lagres det som et løst punkt — kartet viser da bare det siste.
 */
export async function delPosisjon(
  lat: number,
  lng: number,
  noeyaktighetM: number | null,
): Promise<PosisjonResultat> {
  const { supabase, user } = await ensureInnlogget()

  if (!gyldigKoordinat(lat, lng)) {
    return { ok: false, melding: 'Fikk ikke en gyldig posisjon fra telefonen. Prøv igjen.' }
  }

  // Math.round fordi kolonnen er integer: enheten oppgir nøyaktighet som
  // desimaltall, og et ikke-avrundet tall ville blitt avvist av Postgres.
  const noeyaktighet =
    noeyaktighetM != null && Number.isFinite(noeyaktighetM)
      ? Math.max(0, Math.min(100_000, Math.round(noeyaktighetM)))
      : null

  // Pågår en tur, varer delingen UT TUREN — ikke i åtte timer av gangen.
  // Tilbakemeldingen var at man må dele lokasjonen hele tiden (#729):
  // åtte timer betyr at man må trykke på nytt midt på dagen, og gjør man ikke
  // det, forsvinner man fra kartet mens de andre fortsatt leter etter én.
  // Math.max slik at en tur som snart er over aldri gir KORTERE deling enn de
  // åtte timene man ville fått uten tur.
  const paagaaende = await finnPaagaaendeArrangement(supabase)
  const standardSlutt = Date.now() + POSISJON_DELING_TIMER * 60 * 60 * 1000
  const turSlutt = paagaaende?.sluttTidspunkt
    ? new Date(paagaaende.sluttTidspunkt).getTime()
    : 0
  const delerTil = new Date(Math.max(standardSlutt, turSlutt)).toISOString()

  const { error: delingFeil } = await supabase.from('posisjon_deling').upsert(
    { profil_id: user.id, deler_til: delerTil, oppdatert: naa() },
    { onConflict: 'profil_id' },
  )

  if (delingFeil) {
    await logg.feil('posisjon.deling.feilet', delingFeil).catch(() => {})
    return { ok: false, melding: 'Klarte ikke lagre posisjonen. Prøv igjen.' }
  }

  // Står mannen stille, skal ikke sporet fylles med prikker oppå hverandre.
  // Vi oppdaterer da TIDEN på det siste punktet i stedet for å legge til et
  // nytt — kartet viser fortsatt «sist sett nå», men ruta får ikke en klase
  // med overlappende prikker på samme fortau. Terskelen er bevisst større enn
  // typisk GPS-drift i by (±10–30 m): uten den ville en mann som sitter stille
  // i tre timer tegnet et spor som så ut som vandring.
  const { data: sisteRad, error: sisteFeil } = await supabase
    .from('posisjon_punkt')
    .select('id, lat, lng')
    .eq('profil_id', user.id)
    .order('registrert', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fail-open: klarer vi ikke lese forrige punkt, legger vi heller inn et nytt
  // enn å nekte mannen å dele. Verste utfall er en ekstra prikk.
  if (sisteFeil) logg.warn('posisjon.siste_punkt.feilet', { code: sisteFeil.code })

  const staarStille =
    sisteRad != null && avstandM(sisteRad.lat, sisteRad.lng, lat, lng) < POSISJON_MIN_FLYTT_M

  if (staarStille) {
    // Punktet finnes allerede — flytt tidsstempelet slik at han ikke ser ut som
    // «sist sett for en time siden» mens han står der og oppdaterer.
    // `registrert` er ikke en historisk sannhet vi forfalsker: raden ER det
    // samme stedet, og tiden sier når vi sist bekreftet at han var der.
    const { error } = await supabase
      .from('posisjon_punkt')
      .update({ registrert: naa(), noeyaktighet_m: noeyaktighet })
      .eq('id', sisteRad.id)
      .eq('profil_id', user.id)
    if (error) {
      await logg.feil('posisjon.punkt.oppdatering.feilet', error).catch(() => {})
      return { ok: false, melding: 'Klarte ikke lagre posisjonen. Prøv igjen.' }
    }
  } else {
    const { error } = await supabase.from('posisjon_punkt').insert({
      profil_id: user.id,
      lat,
      lng,
      noeyaktighet_m: noeyaktighet,
      registrert: naa(),
      arrangement_id: paagaaende?.id ?? null,
    })
    if (error) {
      await logg.feil('posisjon.punkt.feilet', error).catch(() => {})
      return { ok: false, melding: 'Klarte ikke lagre posisjonen. Prøv igjen.' }
    }
  }

  revalidatePath('/kart')
  return { ok: true, delerTil }
}

/**
 * Slutter å dele — sletter delingen OG hele sporet mitt.
 *
 * At punktene går med er ikke en bieffekt, det er løftet: «slutt å dele» betyr
 * at det ikke ligger igjen en rute over hvor du var i kveld. RLS ville skjult
 * dem uansett når delingen forsvant, men skjult er ikke det samme som borte.
 */
export async function stoppDeling(): Promise<PosisjonResultat> {
  const { supabase, user } = await ensureInnlogget()

  // Punktene først: ryker det andre kallet, står vi igjen med en aktiv deling
  // uten spor (ufarlig). Motsatt rekkefølge ville etterlatt et spor uten
  // deling — usynlig for andre, men fortsatt lagret, og det er nettopp det
  // løftet sier at ikke skjer.
  const { error: punktFeil } = await supabase
    .from('posisjon_punkt')
    .delete()
    .eq('profil_id', user.id)

  if (punktFeil) {
    await logg.feil('posisjon.punkt.slett.feilet', punktFeil).catch(() => {})
    return { ok: false, melding: 'Klarte ikke slutte å dele. Prøv igjen.' }
  }

  const { error } = await supabase.from('posisjon_deling').delete().eq('profil_id', user.id)

  if (error) {
    await logg.feil('posisjon.stopp.feilet', error).catch(() => {})
    return { ok: false, melding: 'Klarte ikke slutte å dele. Prøv igjen.' }
  }

  revalidatePath('/kart')
  // delerTil er tom streng her fordi delingen er borte — kallstedet leser kun
  // `ok` på denne veien, men typen deles med delPosisjon for å holde ett
  // resultat-format i hele modulen.
  return { ok: true, delerTil: '' }
}

/**
 * «Pling» — spør en kamerat hvor han er (#695).
 *
 * Erstatningen for bakgrunnssporing: appen kan ikke hente posisjonen hans selv,
 * men den kan be HAM om å gjøre det. Trykker han på varselet, åpnes kartet, og
 * har han allerede aktiv deling oppdateres posisjonen uten at han gjør mer.
 *
 * Varselet ER handlingen her, så en feil skal boble helt til brukeren (jf.
 * Policy: Varsler) — trykker du «Pling» og det ikke gikk, skal du få vite det,
 * ikke se en grønn kvittering på noe som aldri ble sendt.
 */
export async function plingEtterPosisjon(mottakerId: string): Promise<void> {
  const { supabase, user } = await ensureInnlogget()

  if (mottakerId === user.id) throw new Error('Du kan ikke plinge deg selv')

  const { data: avsender, error: avsenderFeil } = await supabase
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', user.id)
    .maybeSingle()

  // Fail-open på navnet: et pling uten avsendernavn er fortsatt et nyttig
  // pling. Men vi logger, for «Noen lurer på hvor du er» er en dårligere tekst
  // enn den skal være — samme feilklasse som meldinger.ts hadde (#503).
  if (avsenderFeil) logg.warn('posisjon.pling.avsender.feilet', { code: avsenderFeil.code })

  const navn = avsender?.visningsnavn || avsender?.navn || 'Noen'

  await sendVarsel({
    mottakere: [mottakerId],
    tittel: 'Hvor er du?',
    melding: `${navn} lurer på hvor du er. Åpne kartet, så ser han det.`,
    url: '/kart',
    knappTekst: 'Åpne kartet',
    type: 'posisjon_pling',
    // Et pling er en bevisst, gjentakbar handling — spør man igjen en time
    // senere er det et nytt spørsmål, ikke et duplikat. Eksplisitt true fordi
    // false uten dedup-nøkkel er en stille no-op (jf. #518).
    tillatDuplikat: true,
    // Gjentatte pling fra samme mann kollapser til én rad på låseskjermen i
    // stedet for å stable seg opp. Avsender i taggen: to forskjellige som spør
    // er to forskjellige spørsmål og skal begge synes.
    pushTag: `posisjon-pling:${user.id}`,
  })

  revalidatePath('/kart')
}
