'use server'

import { ensureInnlogget } from '@/lib/auth'
import { naa, datetimeLocalTilIso } from '@/lib/dato'
import { TIMEPLAN_TEKST_MAKS_LENGDE, TIMEPLAN_ADRESSE_MAKS_LENGDE } from '@/lib/konstanter'
import { geokod } from '@/lib/geokoding'
import { logg } from '@/lib/logg'

// Samme resultat-form som posisjons-/markerings-actionene: knappen står i en
// klientkomponent som må skille «input var ugyldig» fra «det gikk ikke».
// lat/lng er med i suksess-svaret (#732): en adresse kan resultere i et
// GEOKODET punkt som klienten ikke kjenner selv, og den optimistiske raden
// må oppdateres med det for at 📍-knappen skal dukke opp uten en full
// sidelast. adresse er med av samme grunn motsatt vei: basen kan ha STRIPPET
// den (blåtur-triggeren, migrasjon 149), og da skal ikke klienten bli stående
// med et sted den selv ikke lenger har lov til å vise.
export type TimeplanSkrivResultat =
  | { ok: true; tidspunkt: string; lat: number | null; lng: number | null; adresse: string | null }
  | { ok: false; melding: string }
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
  /** Alternativ til punkt (#732) — fritekst-adresse, geokodet best-effort server-side. */
  adresse: string | null
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

  const adresseInput = input.adresse?.trim() || null
  if (adresseInput && adresseInput.length > TIMEPLAN_ADRESSE_MAKS_LENGDE) {
    return { ok: false, melding: `Maks ${TIMEPLAN_ADRESSE_MAKS_LENGDE} tegn i adressen.` }
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

  // Blåtur: nålen OG adressen strippes stille, teksten går fint. Merk hvor
  // vakten BOR (#732, viderefører #716 review): den autoritative er
  // triggeren timeplan_post_strip_blaatur i migrasjon 149 — den gjelder også
  // for en klient som går utenom denne actionen og skriver rett på Data
  // API-et. Strippingen her sparer en unødvendig rundtur og holder svaret
  // ærlig; den er ikke sikkerheten, og skal aldri beskrives som det.
  const destSensurert =
    (arrangement.sensurerte_felt as Record<string, boolean> | null)?.destinasjon === true

  // Geokoding er BEST-EFFORT og kun forsøkt når mannen IKKE allerede har
  // valgt et punkt i kartet (#732 — regissørens avgjørelse 2). Lykkes den,
  // får posten et punkt i tillegg til adressen; bommer den (eller er
  // arrangementet en blåtur, se stripping under), står adressen alene —
  // raden er fortsatt trykkbar til Google Maps via teksten, se
  // lib/kart-navigasjon.ts. Ingen stille tap av det medlemmet skrev.
  let lat = input.lat
  let lng = input.lng
  if (!harPunkt && adresseInput && !destSensurert) {
    const geokodet = await geokod(adresseInput)
    if (geokodet) {
      lat = geokodet.lat
      lng = geokodet.lng
    }
  }

  const adresse = destSensurert ? null : adresseInput
  lat = destSensurert ? null : lat
  lng = destSensurert ? null : lng

  // .select() på inserten koster ingen ekstra rundtur, og gjør at svaret er
  // raden slik den FAKTISK ble lagret — ikke verdiene vi regnet ut på vei inn.
  // Det er triggeren timeplan_post_strip_blaatur (migrasjon 148/149) som har
  // siste ord om sted-kolonnene; strippingen over er en snarvei, ikke fasiten.
  const { data: lagret, error } = await supabase
    .from('timeplan_post')
    .insert({
      id: input.id,
      arrangement_id: input.arrangementId,
      opprettet_av: user.id,
      tidspunkt,
      tekst,
      lat,
      lng,
      adresse,
      opprettet: naa(),
    })
    .select('tidspunkt, lat, lng, adresse')
    .maybeSingle()

  if (error) {
    // 23503 = FK-brudd. Den eneste FK-en som kan ryke her er arrangement_id
    // (opprettet_av er den innloggede brukeren), så dette betyr at turen ble
    // slettet ETTER at vakten over fant den. Vinduet er reelt, ikke teoretisk:
    // den best-effort geokodingen mellom sjekken og inserten kan ta opptil
    // fem sekunder. Utfallet er det samme som !arrangement over — bare
    // oppdaget av basen i stedet for av oss — altså normal samtidighet, ikke
    // en serverfeil, og skal derfor ikke i feil_logg. Samme tekst som vakten
    // over med vilje: to formuleringer for samme tilstand ville bare vært
    // forvirrende for mannen som leser dem.
    if (error.code === '23503') {
      logg.warn('kart.timeplan.opprett.arrangement_borte', { sample: input.arrangementId })
      return { ok: false, melding: 'Arrangementet finnes ikke lenger.' }
    }

    // 23505 = primærnøkkelen finnes allerede. Klienten sender samme id ved
    // «Prøv igjen», så dette betyr at forrige forsøk faktisk landet før
    // forbindelsen røk: raden er der, altså er dette en suksess. Uten denne
    // grenen ville retry-knappen stått og feilet på en post som var lagret.
    if (error.code !== '23505') {
      await logg.feil('kart.timeplan.opprett.feilet', error).catch(() => {})
      return { ok: false, melding: 'Klarte ikke lagre timeplanposten. Prøv igjen.' }
    }

    // Raden fra FØRSTE forsøk er sannheten, ikke denne rundens geokoding:
    // Nominatim kan svare noe annet nå enn den gjorde da raden ble skrevet, og
    // klienten ville da vist — og navigert til — et punkt basen ikke har.
    // «select using (true)» (migrasjon 147) gjør at vi alltid får lese raden.
    const { data: fraFoerste, error: lesFeil } = await supabase
      .from('timeplan_post')
      .select('tidspunkt, lat, lng, adresse')
      .eq('id', input.id)
      .maybeSingle()

    if (lesFeil || !fraFoerste) {
      // Vi VET at raden er lagret — det er nettopp hva 23505 betyr — men vi
      // fikk ikke lest den tilbake. Da svares det uten sted: å vise mindre enn
      // basen har retter seg selv ved neste sidelast, mens et punkt vi ikke har
      // dekning for kan sende mannen til feil adresse.
      await logg
        .feil('kart.timeplan.opprett.retry_les_feilet', lesFeil ?? new Error('fant ikke raden etter 23505'))
        .catch(() => {})
      return { ok: true, tidspunkt, lat: null, lng: null, adresse: null }
    }

    return {
      ok: true,
      tidspunkt: fraFoerste.tidspunkt,
      lat: fraFoerste.lat,
      lng: fraFoerste.lng,
      adresse: fraFoerste.adresse,
    }
  }

  if (!lagret) {
    // Inserten gikk gjennom uten feil, men PostgREST ga ingen rad tilbake.
    // Her er verdiene under VÅRE egne, fra nettopp denne inserten — de er
    // trygge å svare med, i motsetning til 23505-grenen over der raden ble
    // skrevet av et tidligere kall vi ikke kjenner innholdet i.
    logg.warn('kart.timeplan.opprett.uten_kvittering', { sample: input.id })
    return { ok: true, tidspunkt, lat, lng, adresse }
  }

  // INGEN revalidatePath('/kart') herfra (#716-planlegging, uenighet C).
  // Ferskhet kommer av optimistisk lokal state — denne responsen gir
  // klienten den kanoniske tidspunkt-verdien (og et ev. geokodet punkt) til
  // å erstatte sin egen provisoriske sortering med. En revalidering ville
  // uansett bare speilet min egen post tilbake til meg selv.
  return { ok: true, tidspunkt: lagret.tidspunkt, lat: lagret.lat, lng: lagret.lng, adresse: lagret.adresse }
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
