'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendVarsel } from '@/lib/varsler'
import { BASE_URL } from '@/lib/config'
import { naa } from '@/lib/dato'
import { PASS_TILGANG_TIMER } from '@/lib/konstanter'
import { ensureInnlogget } from '@/lib/auth'
import { logg } from '@/lib/logg'

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

  // Varselet er en bieffekt ETTER en allerede committet tilstandsendring
  // (forespørselen er lagret over). Uten catch her ville en varsel-feil
  // kastet en maskert prod-feil videre til brukeren, som ville trodd at selve
  // forespørselen feilet — selv om den faktisk gikk fint. (#503)
  await sendVarsel({
    mottakere,
    tittel: 'Forespørsel om passinfo',
    melding: `${sokerNavn} ber om passinfo for ${eierNavn} til ${turTittel}.`,
    url: `${BASE_URL}/innstillinger/pass-godkjenninger`,
    knappTekst: 'Gjennomgå',
    type: 'pass-forespørsel',
    tillatDuplikat: true,
  }).catch((err: unknown) => logg.feil('pass.varsler.feilet', err))
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

  // Stemple varslet_paa via stemple_pass_varslet()-RPC-en når sendVarsel
  // RETURNERER — ikke bare når et varsel faktisk gikk ut. Det er doktrinen fra
  // #504: «kaster = ukjent utfall, retry er lov. Returnerer = terminalt avgjort,
  // ikke retry.» En retur på `type_deaktivert` eller `ingen_mottakere` er
  // terminal — admin har bevisst skrudd av, og en retry ville aldri gitt noe
  // annet svar. try/catch (ikke .catch()) er nettopp det som skiller de to:
  // kaster sendVarsel, hopper vi over stemplingen og lar retry-stien stå åpen.
  // `false` i retur betyr «noen andre stemplet allerede først» (racy
  // dobbel-varsling) og er suksess, ikke feil — kun DB-feil logges. (#504)
  try {
    await sendVarsel({
      mottakere: [oppdatert.soker_id],
      tittel: 'Pass-tilgang godkjent',
      melding: `Du har nå tilgang til passinfo for ${eierNavn} i 24 timer.`,
      url: `${BASE_URL}/arrangementer/${oppdatert.arrangement_id}`,
      knappTekst: 'Åpne turen',
      type: 'pass-godkjent',
      tillatDuplikat: true,
      dedupNoekkel: `pass-godkjent:${forespørselId}`,
      // Bieffekt etter committet oppdatering — se bePassTilgang over. (#503)
    })
    const { error } = await admin.rpc('stemple_pass_varslet', { p_id: forespørselId })
    if (error) await logg.feil('pass.stempel.feilet', error)
  } catch (err) {
    await logg.feil('pass.varsler.feilet', err)
  }
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

  // Se kommentaren i godkjennPassTilgang over — samme RPC, samme kontrakt.
  // Admin-klienten opprettes her og ikke lenger opp som i godkjenn-varianten
  // rett og slett fordi avslags-meldingen er statisk: vi trenger ikke slå opp
  // eiernavnet først. Eneste bruk er stemple_pass_varslet()-kallet under.
  const admin = createAdminClient()
  try {
    await sendVarsel({
      mottakere: [oppdatert.soker_id],
      tittel: 'Pass-tilgang avslått',
      melding: 'Generalsekretæren har avslått forespørselen.',
      url: `${BASE_URL}/arrangementer/${oppdatert.arrangement_id}`,
      knappTekst: 'Åpne turen',
      type: 'pass-avslatt',
      tillatDuplikat: true,
      dedupNoekkel: `pass-avslatt:${forespørselId}`,
      // Bieffekt etter committet oppdatering — se bePassTilgang over. (#503)
    })
    const { error } = await admin.rpc('stemple_pass_varslet', { p_id: forespørselId })
    if (error) await logg.feil('pass.stempel.feilet', error)
  } catch (err) {
    await logg.feil('pass.varsler.feilet', err)
  }
}
