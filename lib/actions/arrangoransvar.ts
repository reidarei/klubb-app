'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendVarsel, formaterHilsenMelding } from '@/lib/varsler'
import { ensureAdmin, ensureInnlogget } from '@/lib/auth'
import { PURRING_MAKS_LENGDE } from '@/lib/konstanter'

// Slå opp purredato fra arrangementmaler og sett riktig år. Mal-raden
// har år=2000 som sentinel (kun mnd+dag teller), så vi bytter ut til aar.
async function hentPurredato(arrangementNavn: string, aar: number): Promise<string | null> {
  const admin = createAdminClient()
  const { data: mal } = await admin
    .from('arrangementmaler')
    .select('purredato')
    .eq('navn', arrangementNavn)
    .maybeSingle()
  if (!mal?.purredato) return null
  return `${aar}-${mal.purredato.slice(5)}`
}

// Idempotent batch-opprettelse av arrangoransvar-rader for ett år.
// Oppretter én null-rad per mal som ikke allerede har en rad i (aar, navn).
// Ansvarlig_id=null betyr "tom slot" — admin tildeler senere via
// leggTilAnsvarlig (som UPDATE-r null-raden i stedet for å lage en ny).
export async function leggTilArrangoransvarForAar(aar: number) {
  const { supabase } = await ensureAdmin()

  const [{ data: maler }, { data: eksisterende }] = await Promise.all([
    supabase.from('arrangementmaler').select('navn, purredato'),
    supabase
      .from('arrangoransvar')
      .select('arrangement_navn')
      .eq('aar', aar),
  ])

  const finnesNavn = new Set((eksisterende ?? []).map(r => r.arrangement_navn))
  const nyeRader = (maler ?? [])
    .filter(m => !finnesNavn.has(m.navn))
    .map(m => ({
      aar,
      arrangement_navn: m.navn,
      ansvarlig_id: null,
      purredato: m.purredato ? `${aar}-${m.purredato.slice(5)}` : null,
      arrangement_id: null,
    }))

  if (nyeRader.length === 0) {
    revalidatePath('/arrangoransvar')
    return { opprettet: 0 }
  }

  const { error } = await supabase.from('arrangoransvar').insert(nyeRader)
  if (error) throw new Error(error.message)

  revalidatePath('/arrangoransvar')
  revalidatePath('/')
  return { opprettet: nyeRader.length }
}

export async function leggTilAnsvarlig(data: {
  aar: number
  arrangement_navn: string
  ansvarlig_id: string
}) {
  const { supabase } = await ensureAdmin()

  // Hvis det finnes en tom slot for (aar, navn) — UPDATE den i stedet for
  // å lage en ny rad. Holder antall rader stabilt og er den naturlige
  // tilstandsovergangen "ledig → tildelt".
  const { data: tomSlot } = await supabase
    .from('arrangoransvar')
    .select('id, arrangement_id')
    .eq('aar', data.aar)
    .eq('arrangement_navn', data.arrangement_navn)
    .is('ansvarlig_id', null)
    .limit(1)
    .maybeSingle()

  if (tomSlot) {
    const { error } = await supabase
      .from('arrangoransvar')
      .update({ ansvarlig_id: data.ansvarlig_id })
      .eq('id', tomSlot.id)
    if (error) throw new Error(error.message)
    revalidatePath('/arrangoransvar')
    revalidatePath('/')
    return
  }

  // Ingen tom slot → ny ansvarlig på toppen av eksisterende. Arv
  // arrangement_id fra søsken-rad slik at den nye ansvarlige også regnes
  // som oppfylt hvis arrangementet allerede er opprettet.
  const purredato = await hentPurredato(data.arrangement_navn, data.aar)
  const { data: sosken } = await supabase
    .from('arrangoransvar')
    .select('arrangement_id')
    .eq('aar', data.aar)
    .eq('arrangement_navn', data.arrangement_navn)
    .not('arrangement_id', 'is', null)
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('arrangoransvar')
    .insert({
      aar: data.aar,
      arrangement_navn: data.arrangement_navn,
      ansvarlig_id: data.ansvarlig_id,
      purredato,
      arrangement_id: sosken?.arrangement_id ?? null,
    })

  if (error) throw new Error(error.message)
  revalidatePath('/arrangoransvar')
  revalidatePath('/')
}

export async function fjernAnsvarlig(ansvarId: string) {
  const { supabase } = await ensureAdmin()

  // Hvis dette er siste rad for (aar, navn) — behold raden som tom slot
  // (UPDATE ansvarlig_id=null) i stedet for å slette. Ellers ville mal-raden
  // forsvinne fra UI-en bare fordi siste ansvarlig ble tatt vekk.
  const { data: rad } = await supabase
    .from('arrangoransvar')
    .select('aar, arrangement_navn')
    .eq('id', ansvarId)
    .maybeSingle()

  if (!rad) return

  const { count } = await supabase
    .from('arrangoransvar')
    .select('id', { count: 'exact', head: true })
    .eq('aar', rad.aar)
    .eq('arrangement_navn', rad.arrangement_navn)

  if ((count ?? 0) <= 1) {
    const { error } = await supabase
      .from('arrangoransvar')
      .update({ ansvarlig_id: null })
      .eq('id', ansvarId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('arrangoransvar')
      .delete()
      .eq('id', ansvarId)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/arrangoransvar')
  revalidatePath('/')
}

// Purre ansvarlig — kalles av et vanlig medlem. Sender varsel via sendVarsel
// (som respekterer push_aktiv/epost_aktiv). hilsen er valgfri fritekst fra
// den som purrer; uten hilsen brukes standardteksten. Se #267.
export async function purreAnsvarlig(ansvarId: string, hilsen?: string) {
  const { user } = await ensureInnlogget()
  const admin = createAdminClient()

  // Meldingsbygging og lengde-validering av hilsen ligger i
  // formaterHilsenMelding lenger nede — vi sender bare rådata inn. (#289)
  const { data: ansvar } = await admin
    .from('arrangoransvar')
    .select('id, aar, arrangement_navn, ansvarlig_id, arrangement_id')
    .eq('id', ansvarId)
    .maybeSingle()

  if (!ansvar) throw new Error('Fant ikke ansvar')
  if (ansvar.arrangement_id) throw new Error('Arrangementet er allerede lagt inn')

  // Hent ALLE søsken-rader med samme (aar, arrangement_navn) som har en
  // ansvarlig_id — purring på arrangement-nivå treffer alle medansvarlige,
  // ikke bare den raden man klikket på. Se #268 og Policy: Arrangøransvar-kobling.
  // arrangement_id is null: purring gir bare mening når arrangementet ikke
  // er opprettet. Eksplisitt filter beskytter også mot race med koble() som
  // kan fylle arrangement_id mellom guard-sjekken over og denne spørringen.
  const { data: soeskenRader, error: soeskenFeil } = await admin
    .from('arrangoransvar')
    .select('ansvarlig_id')
    .eq('aar', ansvar.aar)
    .eq('arrangement_navn', ansvar.arrangement_navn)
    .is('arrangement_id', null)
    .not('ansvarlig_id', 'is', null)

  // Skill DB-feil fra tom mottakerliste — ellers ville en spørringsfeil
  // bli feiltolket som «ingen ansvarlig å purre på» og villede brukeren.
  if (soeskenFeil) throw new Error(`Kunne ikke hente medansvarlige: ${soeskenFeil.message}`)

  // Defensiv dedup: sendVarsel dedup'er også internt, men vi gjør det
  // eksplisitt her slik at koden er selvforklarende på kall-stedet.
  // Typesikkert filter på null framfor `as string` — ansvarlig_id er nullable
  // i skjemaet selv om .not('is', null) i praksis luker dem ut.
  const mottakere = [
    ...new Set(
      (soeskenRader ?? [])
        .map(r => r.ansvarlig_id)
        .filter((id): id is string => !!id)
    ),
  ]
  if (mottakere.length === 0) throw new Error('Ingen ansvarlig å purre på')

  const { data: purrer } = await admin
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', user.id)
    .single()

  const fraNavn = purrer?.visningsnavn || purrer?.navn || 'En gutt'

  const melding = formaterHilsenMelding({
    fraNavn,
    hilsen,
    verb: 'purrer deg på',
    basis: `${ansvar.arrangement_navn} ${ansvar.aar}`,
    fallback: `${fraNavn} purrer deg på ${ansvar.arrangement_navn} ${ansvar.aar}. Få arrangementet inn i kalenderen.`,
    maksLengde: PURRING_MAKS_LENGDE,
  })

  await sendVarsel({
    mottakere,
    tittel: `Purring: ${ansvar.arrangement_navn}`,
    melding,
    url: '/arrangoransvar',
    knappTekst: 'Åpne arrangøransvar',
    type: 'purring_ansvar',
    tillatDuplikat: true,
  })
}
