'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendVarsel } from '@/lib/varsler'
import { BASE_URL } from '@/lib/config'
import { naa } from '@/lib/dato'
import { PASS_TILGANG_TIMER } from '@/lib/konstanter'
import { ensureInnlogget } from '@/lib/auth'

/**
 * Lagre eller oppdatere passinfo for innlogget bruker. Validerer ikke
 * passnummer-format (norske nummer er numeriske + bokstavkombo, men vi
 * holder det enkelt — bruker velger selv hva som skrives).
 */
export async function lagrePassInfo(input: { nummer: string; utloper: string }) {
  const nummer = input.nummer.trim()
  const utloper = input.utloper // YYYY-MM-DD fra date input
  if (!nummer || !utloper) throw new Error('Både nummer og utløpsdato må fylles ut')

  const { supabase, user } = await ensureInnlogget()

  const { error } = await supabase
    .from('pass_info')
    .upsert({ profil_id: user.id, nummer, utloper, oppdatert: naa() })

  if (error) throw new Error(error.message)
}

/**
 * Send forespørsel om dagstilgang til en deltakers passinfo. Kan kun
 * gjøres av tur-arrangøren (RLS håndhever dette i tillegg).
 * Generalsekretæren får varsel og må godkjenne.
 */
export async function bePassTilgang(input: { eier_id: string; arrangement_id: string }) {
  const { supabase, user } = await ensureInnlogget()

  const { data: ny, error } = await supabase
    .from('pass_tilgang_forespørsel')
    .insert({
      soker_id: user.id,
      eier_id: input.eier_id,
      arrangement_id: input.arrangement_id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  if (!ny) throw new Error('Klarte ikke å opprette forespørsel')

  // Varsle alle med rolle generalsekretaer. Bruker admin-klient for å
  // hente lista — dette er ikke sensitiv data og vi trenger den uansett
  // for å vite hvem mottakerne er.
  const admin = createAdminClient()
  const { data: gensekProfiler } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn')
    .eq('rolle', 'generalsekretaer')
    .eq('aktiv', true)

  const { data: soker } = await admin
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', user.id)
    .single()

  const { data: eier } = await admin
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', input.eier_id)
    .single()

  const { data: arrangement } = await admin
    .from('arrangementer')
    .select('tittel')
    .eq('id', input.arrangement_id)
    .single()

  const sokerNavn = soker?.visningsnavn ?? soker?.navn ?? 'Noen'
  const eierNavn = eier?.visningsnavn ?? eier?.navn ?? 'noen'
  const turTittel = arrangement?.tittel ?? 'en tur'

  const mottakere = (gensekProfiler ?? []).map(p => p.id)
  if (mottakere.length === 0) return // Ingen generalsekretær å varsle (kantcase)

  await sendVarsel({
    mottakere,
    tittel: 'Forespørsel om passinfo',
    melding: `${sokerNavn} ber om passinfo for ${eierNavn} til ${turTittel}.`,
    url: `${BASE_URL}/innstillinger/pass-godkjenninger`,
    knappTekst: 'Gjennomgå',
    type: 'pass-forespørsel',
    tillatDuplikat: true,
  })
}

/**
 * Godkjenn en ventende forespørsel. Setter status, beslutter, og
 * gyldig_til til nå + 24 timer. Sender varsel til søkeren.
 */
export async function godkjennPassTilgang(forespørselId: string) {
  const { supabase, user } = await ensureInnlogget()

  const naDate = new Date()
  const utloper = new Date(naDate.getTime() + PASS_TILGANG_TIMER * 60 * 60 * 1000)

  const { data: oppdatert, error } = await supabase
    .from('pass_tilgang_forespørsel')
    .update({
      status: 'godkjent',
      besluttet_av: user.id,
      besluttet_paa: naDate.toISOString(),
      gyldig_til: utloper.toISOString(),
    })
    .eq('id', forespørselId)
    .eq('status', 'venter')
    .select('soker_id, eier_id, arrangement_id')
    .single()

  if (error) throw new Error(error.message)
  if (!oppdatert) throw new Error('Forespørsel ikke funnet eller allerede behandlet')

  // Varsle søkeren
  const admin = createAdminClient()
  const { data: eier } = await admin
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', oppdatert.eier_id)
    .single()
  const eierNavn = eier?.visningsnavn ?? eier?.navn ?? 'medlemmet'

  await sendVarsel({
    mottakere: [oppdatert.soker_id],
    tittel: 'Pass-tilgang godkjent',
    melding: `Du har nå tilgang til passinfo for ${eierNavn} i 24 timer.`,
    url: `${BASE_URL}/arrangementer/${oppdatert.arrangement_id}`,
    knappTekst: 'Åpne turen',
    type: 'pass-godkjent',
    tillatDuplikat: true,
  })
}

export async function avslaaPassTilgang(forespørselId: string) {
  const { supabase, user } = await ensureInnlogget()

  const { data: oppdatert, error } = await supabase
    .from('pass_tilgang_forespørsel')
    .update({
      status: 'avslatt',
      besluttet_av: user.id,
      besluttet_paa: naa(),
    })
    .eq('id', forespørselId)
    .eq('status', 'venter')
    .select('soker_id, arrangement_id')
    .single()

  if (error) throw new Error(error.message)
  if (!oppdatert) throw new Error('Forespørsel ikke funnet eller allerede behandlet')

  await sendVarsel({
    mottakere: [oppdatert.soker_id],
    tittel: 'Pass-tilgang avslått',
    melding: 'Generalsekretæren har avslått forespørselen.',
    url: `${BASE_URL}/arrangementer/${oppdatert.arrangement_id}`,
    knappTekst: 'Åpne turen',
    type: 'pass-avslatt',
    tillatDuplikat: true,
  })
}
