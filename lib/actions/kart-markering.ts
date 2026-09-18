'use server'

import { revalidatePath } from 'next/cache'
import { ensureInnlogget } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { KART_MARKERING_MAKS_LENGDE, KART_MARKERING_TIMER } from '@/lib/konstanter'
import { finnPaagaaendeArrangement } from '@/lib/posisjon'
import { erGyldigSymbol, STANDARD_SYMBOL } from '@/lib/markering-symboler'
import { logg } from '@/lib/logg'
import { sendVarsel } from '@/lib/varsler'
import { byggStedLenke } from '@/lib/kart-lenke'
import { BASE_URL } from '@/lib/config'

// Samme resultat-form som posisjons-actionene: knappen står i en
// klientkomponent som må kunne skille «teksten var tom» fra «det gikk ikke».
export type MarkeringResultat = { ok: true } | { ok: false; melding: string }

/**
 * Setter en markering på kartet der jeg står nå (#697).
 *
 * Posisjonen kommer fra klientens getCurrentPosition, ikke fra
 * posisjon_punkt: du skal kunne markere et sted uten å samtidig slå på
 * posisjonsdeling. De to tingene er uavhengige — en markering sier «her er
 * noe», ikke «her er jeg, følg med».
 *
 * `utloper` settes til arrangementets slutt hvis noe pågår, ellers
 * KART_MARKERING_TIMER fram i tid. En markering hører til kvelden.
 */
export async function settMarkering(
  lat: number,
  lng: number,
  tekst: string,
  symbol: string,
): Promise<MarkeringResultat> {
  const { supabase, user } = await ensureInnlogget()

  const rentekst = tekst.trim()
  if (!rentekst) return { ok: false, melding: 'Skriv hva markeringen gjelder.' }
  if (rentekst.length > KART_MARKERING_MAKS_LENGDE) {
    return { ok: false, melding: `Maks ${KART_MARKERING_MAKS_LENGDE} tegn.` }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, melding: 'Fikk ikke en gyldig posisjon fra telefonen. Prøv igjen.' }
  }

  // Faller til standardsymbolet ved en ukjent verdi i stedet for å avvise:
  // databasens check-constraint er den virkelige vakten, og en markering med
  // feil ikon er et mildere utfall enn at lagringen feiler for mannen som står
  // ute og prøver å markere et sted.
  const valgtSymbol = erGyldigSymbol(symbol) ? symbol : STANDARD_SYMBOL

  const paagaaende = await finnPaagaaendeArrangement(supabase)

  // Har arrangementet en sluttid, følger markeringen den. Uten sluttid (eller
  // uten arrangement) faller vi til timesvinduet — ellers ville en markering
  // satt på et arrangement som aldri ble avsluttet, blitt stående for godt.
  const utloper =
    paagaaende?.sluttTidspunkt ??
    new Date(Date.now() + KART_MARKERING_TIMER * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('kart_markering').insert({
    opprettet_av: user.id,
    lat,
    lng,
    tekst: rentekst,
    symbol: valgtSymbol,
    opprettet: naa(),
    utloper,
    arrangement_id: paagaaende?.id ?? null,
  })

  if (error) {
    await logg.feil('kart.markering.feilet', error).catch(() => {})
    return { ok: false, melding: 'Klarte ikke lagre markeringen. Prøv igjen.' }
  }

  // MILF alert (#747). Kun for 💋-symbolet — de andre markeringene er
  // «møt meg her»-beskjeder som ikke skal pinge tolv telefoner.
  //
  // .catch() er ufravikelig: markeringen ER lagret på dette punktet, og en
  // varsel-feil skal ikke få brukeren til å tro at markeringen ikke ble satt
  // (CLAUDE.md § Policy: Varsler — regel for nye kallsteder).
  if (valgtSymbol === 'milf') {
    // Alle aktive UNNTATT den som markerte — han vet jo at han gjorde det,
    // og et pling om sin egen markering leses som at noen andre fant noe.
    const { data: mottakere, error: mottakerFeil } = await supabase
      .from('profiles')
      .select('id')
      .eq('aktiv', true)
      .neq('id', user.id)

    if (mottakerFeil) {
      // Fail-open: markeringen står, varselet uteblir. Å kaste her ville
      // gjort en vellykket markering til en feilmelding.
      await logg.feil('kart.milf.mottakere.feilet', mottakerFeil).catch(() => {})
    } else {
      await sendVarsel({
        mottakere: (mottakere ?? []).map(m => m.id),
        tittel: 'MILF ALERT!',
        melding: rentekst,
        url: byggStedLenke(BASE_URL, lat, lng, rentekst),
        knappTekst: 'Vis på kartet',
        type: 'milf_alert',
        // Hver sighting er sin egen begivenhet. Uten dette ville den andre
        // av kvelden blitt dedupet bort som «allerede varslet».
        tillatDuplikat: true,
      }).catch((err: unknown) => logg.feil('kart.milf.varsel.feilet', err))
    }
  }

  revalidatePath('/kart')
  return { ok: true }
}

/**
 * Fjerner en markering.
 *
 * Ingen eier-sjekk her med vilje: RLS avgjør (egen markering eller admin), og
 * det er den sjekken som faktisk er sikkerheten. En duplisert if-setning her
 * ville vært en andre sannhet som kan gli fra policyen.
 */
export async function slettMarkering(id: string): Promise<MarkeringResultat> {
  const { supabase } = await ensureInnlogget()

  const { data, error } = await supabase
    .from('kart_markering')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) {
    await logg.feil('kart.markering.slett.feilet', error).catch(() => {})
    return { ok: false, melding: 'Klarte ikke fjerne markeringen. Prøv igjen.' }
  }

  // 0 rader betyr én av to ting, og PostgREST skiller dem ikke: raden er
  // allerede borte, eller RLS stoppet slettingen. Uten sjekken ville brukeren
  // fått grønn kvittering på noe som ikke skjedde.
  //
  // Teksten dekker begge med vilje. Det vanligste tilfellet er nå det første
  // (dobbelttrykk, eller noen rakk det først), og en melding om manglende
  // rettigheter ville vært direkte misvisende der.
  if (!data || data.length === 0) {
    return { ok: false, melding: 'Markeringen er allerede borte.' }
  }

  revalidatePath('/kart')
  return { ok: true }
}
