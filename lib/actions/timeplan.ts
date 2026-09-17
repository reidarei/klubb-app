'use server'

import { ensureInnlogget } from '@/lib/auth'
import { naa, datetimeLocalTilIso } from '@/lib/dato'
import { TIMEPLAN_TEKST_MAKS_LENGDE } from '@/lib/konstanter'
import { logg } from '@/lib/logg'

// Samme resultat-form som posisjons-/markerings-actionene: knappen står i en
// klientkomponent som må skille «input var ugyldig» fra «det gikk ikke».
export type TimeplanSkrivResultat = { ok: true; tidspunkt: string } | { ok: false; melding: string }
export type TimeplanSlettResultat = { ok: true } | { ok: false; melding: string }

export type NyTimeplanPostInput = {
  // Klientgenerert (crypto.randomUUID()) — gir stabil optimistisk radidentitet
  // uten idempotens-maskineri (partial unique index, CAS). Se #716-planlegging,
  // uenighet D: kostnaden ved en duplikat er ETT trykk til, ikke et tapt varsel.
  // «Prøv igjen» i panelet sender SAMME id om igjen (#716 review), så
  // primærnøkkelen er idempotens-nøkkelen der — se 23505-grenen under.
  id: string
  arrangementId: string
  /** «yyyy-MM-dd» — dagen posten gjelder, valgt via dag-chip i skjemaet. */
  dato: string
  /** «HH:mm», tolket av lib/timeplan-parse.ts på klienten. */
  klokke: string
  tekst: string
  lat: number | null
  lng: number | null
}

/**
 * Legger inn en timeplan-post (#716).
 *
 * Klienten sender { dato, klokke, tekst } RÅTT — aldri en ferdig-regnet UTC-
 * streng (#674: en håndskrevet offset-utregning i nettleseren gjorde alt to
 * timer feil om sommeren, fordi den regnet i MASKINENS sone, ikke Oslo).
 * datetimeLocalTilIso() gjør konverteringen her, server-side.
 */
export async function opprettTimeplanPost(input: NyTimeplanPostInput): Promise<TimeplanSkrivResultat> {
  const { supabase, user } = await ensureInnlogget()

  const tekst = input.tekst.trim()
  if (!tekst) return { ok: false, melding: 'Skriv hva som skjer.' }
  if (tekst.length > TIMEPLAN_TEKST_MAKS_LENGDE) {
    return { ok: false, melding: `Maks ${TIMEPLAN_TEKST_MAKS_LENGDE} tegn.` }
  }
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(input.klokke)) {
    return { ok: false, melding: 'Ugyldig klokkeslett.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dato)) {
    return { ok: false, melding: 'Ugyldig dato.' }
  }

  const tidspunkt = datetimeLocalTilIso(`${input.dato}T${input.klokke}`)

  const harPunkt = input.lat !== null && input.lng !== null
  if (harPunkt) {
    const lat = input.lat as number
    const lng = input.lng as number
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { ok: false, melding: 'Fikk ikke et gyldig punkt. Prøv igjen.' }
    }
  }

  // Actionen mottar arrangement_id FRA KLIENTEN og validerer at raden
  // fortsatt finnes, i stedet for å regne aktuelt arrangement på nytt —
  // endrer eller sletter noen arrangementet mellom sidelast og lagring, skal
  // ikke samme skjema kunne skrive til en annen tur enn brukeren så.
  //
  // Samme oppslag gir oss blåtur-statusen AUTORITATIVT, uten en ekstra
  // rundtur: sensurerte_felt leses her, ikke tatt på tro fra klienten.
  const { data: arrangement, error: arrangementFeil } = await supabase
    .from('arrangementer')
    .select('id, sensurerte_felt')
    .eq('id', input.arrangementId)
    .maybeSingle()

  if (arrangementFeil) {
    await logg.feil('kart.timeplan.opprett.feilet', arrangementFeil).catch(() => {})
    return { ok: false, melding: 'Klarte ikke lagre timeplanposten. Prøv igjen.' }
  }
  if (!arrangement) {
    return { ok: false, melding: 'Arrangementet finnes ikke lenger.' }
  }

  // Blåtur: nålen strippes stille, teksten går fint. Merk hvor vakten BOR
  // (#716 review): den autoritative er triggeren timeplan_post_strip_blaatur
  // i migrasjon 148 — den gjelder også for en klient som går utenom denne
  // actionen og skriver rett på Data API-et. Strippingen her sparer en
  // unødvendig rundtur og holder svaret ærlig; den er ikke sikkerheten, og
  // skal aldri beskrives som det.
  const destSensurert =
    (arrangement.sensurerte_felt as Record<string, boolean> | null)?.destinasjon === true
  const lat = destSensurert ? null : input.lat
  const lng = destSensurert ? null : input.lng

  const { error } = await supabase.from('timeplan_post').insert({
    id: input.id,
    arrangement_id: input.arrangementId,
    opprettet_av: user.id,
    tidspunkt,
    tekst,
    lat,
    lng,
    opprettet: naa(),
  })

  // 23505 = primærnøkkelen finnes allerede. Klienten sender samme id ved
  // «Prøv igjen», så dette betyr at forrige forsøk faktisk landet før
  // forbindelsen røk: raden er der, altså er dette en suksess. Uten denne
  // grenen ville retry-knappen stått og feilet på en post som var lagret.
  if (error && error.code !== '23505') {
    await logg.feil('kart.timeplan.opprett.feilet', error).catch(() => {})
    return { ok: false, melding: 'Klarte ikke lagre timeplanposten. Prøv igjen.' }
  }

  // INGEN revalidatePath('/kart') herfra (#716-planlegging, uenighet C).
  // Ferskhet kommer av optimistisk lokal state — denne responsen gir
  // klienten den kanoniske tidspunkt-verdien til å erstatte sin egen
  // provisoriske sortering med. En revalidering ville uansett bare speilet
  // min egen post tilbake til meg selv.
  return { ok: true, tidspunkt }
}

/**
 * Fjerner en timeplan-post. Ingen eier-sjekk her med vilje — RLS avgjør
 * (egen post eller admin), samme mønster som slettMarkering().
 */
export async function slettTimeplanPost(id: string): Promise<TimeplanSlettResultat> {
  const { supabase } = await ensureInnlogget()

  const { data, error } = await supabase.from('timeplan_post').delete().eq('id', id).select('id')

  if (error) {
    await logg.feil('kart.timeplan.slett.feilet', error).catch(() => {})
    return { ok: false, melding: 'Klarte ikke fjerne posten. Prøv igjen.' }
  }

  // 0 rader betyr «allerede borte» eller «RLS stoppet slettingen» —
  // PostgREST skiller dem ikke. select('id') på policyen «select using
  // (true)» er det som gjør denne kvitteringen mulig (migrasjon 147).
  if (!data || data.length === 0) {
    return { ok: false, melding: 'Posten er allerede borte.' }
  }

  return { ok: true }
}
