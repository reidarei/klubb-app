'use server'

import { ensureAdmin, ensureLoeserTiebreak } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  sendKaaringspollOpprettetVarsel,
  sendKaaringspollVinnerVarsel,
} from '@/lib/varsler'
import { behandleKaaringspollAvsluttResultat } from '@/lib/varsler-kaaringspoll'
import { kanAdministrere, rollerMed } from '@/lib/roller'

type OpprettInput = {
  kaaringMalId: string
  aar: number
  svarfrist: string // ISO UTC
  arrangementId?: string | null
}

/**
 * Oppretter en kåringspoll for gitt mal + år. Henter `kandidat_kilde` fra
 * malen og bygger valg-listen automatisk:
 *   - 'profil':            alle aktive medlemmer
 *   - 'arrangement_moete': årets møter (type='moete' med start_tidspunkt
 *                          innenfor kalenderåret etter norsk tid)
 *
 * Krever admin/generalsekretær — RLS dobbeltsjekker via 073.
 */
export async function opprettKaaringspoll(input: OpprettInput) {
  const { user } = await ensureAdmin()
  const admin = createAdminClient()

  const frist = new Date(input.svarfrist)
  if (Number.isNaN(frist.getTime()) || frist.getTime() <= Date.now()) {
    throw new Error('Svarfristen må være i fremtiden')
  }
  if (!Number.isInteger(input.aar) || input.aar < 2000 || input.aar > 2100) {
    throw new Error('Ugyldig år')
  }

  const { data: mal, error: malErr } = await admin
    .from('kaaringmaler')
    .select('id, navn, kandidat_kilde')
    .eq('id', input.kaaringMalId)
    .single()
  if (malErr || !mal) throw new Error('Kåringsmal finnes ikke')

  const kilde = (mal as { kandidat_kilde: string }).kandidat_kilde

  // Bygg kandidat-rader.
  type Kandidat = {
    tekst: string
    referanse_profil_id?: string
    referanse_arrangement_id?: string
  }
  const kandidater: Kandidat[] = []

  if (kilde === 'profil') {
    const { data: medlemmer } = await admin
      .from('profiles')
      .select('id, navn')
      .eq('aktiv', true)
      .order('navn')
    for (const m of medlemmer ?? []) {
      if (!m.navn) continue
      kandidater.push({ tekst: m.navn, referanse_profil_id: m.id })
    }
  } else if (kilde === 'arrangement_moete') {
    // Et møte tilhører året hvis start_tidspunkt faller innenfor
    // kalenderåret. Vi bruker UTC-grenser for query — det er noen
    // timers slingring men tilstrekkelig for vårt bruk (et møte
    // 31. desember kl 23:30 norsk tid telles ikke som neste år).
    const fra = `${input.aar}-01-01T00:00:00Z`
    const til = `${input.aar + 1}-01-01T00:00:00Z`
    const { data: arr } = await admin
      .from('arrangementer')
      .select('id, tittel, start_tidspunkt')
      .eq('type', 'moete')
      .gte('start_tidspunkt', fra)
      .lt('start_tidspunkt', til)
      .order('start_tidspunkt')
    for (const a of arr ?? []) {
      kandidater.push({ tekst: a.tittel, referanse_arrangement_id: a.id })
    }
  } else {
    throw new Error(`Ukjent kandidat_kilde: ${kilde}`)
  }

  if (kandidater.length < 2) {
    throw new Error(
      `Trenger minst 2 kandidater (fant ${kandidater.length}). ` +
        `Sjekk at det finnes nok ${kilde === 'profil' ? 'aktive medlemmer' : 'møter'}.`,
    )
  }

  const spoersmaal = `${(mal as { navn: string }).navn} ${input.aar}`

  const { data: poll, error: pollErr } = await admin
    .from('poll')
    .insert({
      spoersmaal,
      svarfrist: frist.toISOString(),
      flervalg: false,
      opprettet_av: user.id,
      kaaring_mal_id: input.kaaringMalId,
      aar: input.aar,
      arrangement_id: input.arrangementId ?? null,
    })
    .select('id')
    .single()
  if (pollErr || !poll) throw new Error(pollErr?.message ?? 'Kunne ikke opprette poll')

  const valgRader = kandidater.map((k, i) => ({
    poll_id: poll.id,
    tekst: k.tekst,
    rekkefoelge: i,
    referanse_profil_id: k.referanse_profil_id ?? null,
    referanse_arrangement_id: k.referanse_arrangement_id ?? null,
  }))

  const { error: valgErr } = await admin.from('poll_valg').insert(valgRader)
  if (valgErr) {
    await admin.from('poll').delete().eq('id', poll.id)
    throw new Error(valgErr.message)
  }

  await sendKaaringspollOpprettetVarsel({
    pollId: poll.id,
    spoersmaal,
    svarfrist: frist.toISOString(),
  }).catch(console.error)

  revalidatePath('/')
  revalidatePath('/kaaringer')
  redirect(`/poll/${poll.id}`)
}

/**
 * Generalsekretær velger vinner ved tiebreak. Validerer at pollen faktisk
 * venter på avgjørelse, henter referansen fra valg-raden, skriver til
 * kaaring_vinnere og sender ett vinner-varsel.
 */
export async function velgTiebreakVinner(pollId: string, valgId: string) {
  const { user, profil } = await ensureLoeserTiebreak()
  const admin = createAdminClient()

  const { data: poll } = await admin
    .from('poll')
    .select('id, spoersmaal, kaaring_mal_id, aar, tiebreak_status')
    .eq('id', pollId)
    .single()
  if (!poll) throw new Error('Pollen finnes ikke')
  if (!poll.kaaring_mal_id) throw new Error('Ikke en kåringspoll')
  if (poll.tiebreak_status !== 'venter_paa_tiebreak') {
    throw new Error('Pollen venter ikke på tiebreak')
  }
  if (poll.aar === null) throw new Error('Kåringspoll mangler årstall')

  const { data: valg } = await admin
    .from('poll_valg')
    .select('id, referanse_profil_id, referanse_arrangement_id')
    .eq('id', valgId)
    .eq('poll_id', pollId)
    .single()
  if (!valg) throw new Error('Ugyldig valg')

  // Sanity: profil eller arrangement, ikke ingen.
  if (!valg.referanse_profil_id && !valg.referanse_arrangement_id) {
    throw new Error('Valget mangler kandidatreferanse')
  }
  // ensureAdmin ga oss profil — bruk den hvis admin-sjekken vil bygges ut.
  void profil

  const { error: vinnerErr } = await admin
    .from('kaaring_vinnere')
    .insert({
      mal_id: poll.kaaring_mal_id,
      aar: poll.aar,
      profil_id: valg.referanse_profil_id,
      arrangement_id: valg.referanse_arrangement_id,
      opprettet_av: user.id,
      poll_id: poll.id,
    })
  // Hvis manuell vinner allerede er satt (race), unique-constraint slår
  // inn. Da hopper vi over insert men markerer fortsatt pollen avgjort.
  if (vinnerErr && !vinnerErr.message.toLowerCase().includes('duplicate')) {
    throw new Error(vinnerErr.message)
  }

  const { error: oppdErr } = await admin
    .from('poll')
    .update({ tiebreak_status: 'avgjort' })
    .eq('id', pollId)
  if (oppdErr) throw new Error(oppdErr.message)

  await sendKaaringspollVinnerVarsel({
    pollId: poll.id,
    spoersmaal: poll.spoersmaal,
  }).catch(console.error)

  revalidatePath(`/poll/${pollId}`)
  revalidatePath('/kaaringer')
  redirect(`/poll/${pollId}`)
}

/**
 * Generalsekretær lukker en kåringspoll umiddelbart — uten å vente på at
 * svarfristen passerer og cron tar den. Speiler cron-flyten i
 * `behandleKaaringspoller`: kaller RPC, sender riktig varsel basert på
 * status, og revaliderer relevante stier. Tilgang gates av
 * `ensureLoeserTiebreak()` + RPC-en sjekker også `er_generalsekretaer()`
 * internt (belte og seler — RLS-bypass via SECURITY DEFINER krever det).
 */
export async function lukkKaaringspollNaa(pollId: string) {
  // Vi trenger brukerens supabase-klient for selve RPC-kallet — RPC-en er
  // SECURITY DEFINER og sjekker `er_generalsekretaer()` internt, som leser
  // `auth.uid()`. Med service_role-klienten er auth.uid() null, og RPC-en
  // ville alltid kaste 'forbudt'. Mottaker-oppslagene under bruker fortsatt
  // admin-klienten fordi de leser på tvers av brukere.
  const { supabase: brukerKlient } = await ensureLoeserTiebreak()
  const admin = createAdminClient()

  const { data: poll, error: pollErr } = await admin
    .from('poll')
    .select('id, spoersmaal, kaaring_mal_id')
    .eq('id', pollId)
    .single()
  if (pollErr || !poll) throw new Error('Pollen finnes ikke')
  if (!poll.kaaring_mal_id) throw new Error('Ikke en kåringspoll')

  // Mottakerlister identisk med cron-flyten — tiebreak går kun til de
  // som faktisk skal løse den (generalsekretær), ingen-stemmer-info går
  // til alle med admin-rettigheter.
  const tiebreakRoller = rollerMed('loeserTiebreak')
  const adminRoller = rollerMed('kanAdministrere')
  const trengteRoller = Array.from(new Set([...tiebreakRoller, ...adminRoller]))
  const { data: relevanteProfiler } = await admin
    .from('profiles')
    .select('id, rolle')
    .in('rolle', trengteRoller)
    .eq('aktiv', true)
  const tiebreakIder = (relevanteProfiler ?? [])
    .filter(p => tiebreakRoller.includes(p.rolle as (typeof tiebreakRoller)[number]))
    .map(p => p.id)
  const adminIder = (relevanteProfiler ?? [])
    .filter(p => adminRoller.includes(p.rolle as (typeof adminRoller)[number]))
    .map(p => p.id)

  const { data: rpcRes, error: rpcErr } = await brukerKlient.rpc(
    'lukk_kaaringspoll_naa',
    { p_poll_id: pollId },
  )
  if (rpcErr) throw new Error(rpcErr.message)
  const rad = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes
  if (!rad) throw new Error('RPC returnerte ingen rad')
  if (!rad.var_ny) {
    // Allerede lukket — idempotent, men gi UI noe å vise via revalidate.
    revalidatePath(`/poll/${pollId}`)
    revalidatePath('/kaaringer')
    revalidatePath('/')
    return
  }

  await behandleKaaringspollAvsluttResultat({
    pollId,
    spoersmaal: poll.spoersmaal,
    status: rad.status as string,
    tiebreakIder,
    adminIder,
  }).catch(console.error)

  revalidatePath(`/poll/${pollId}`)
  revalidatePath('/kaaringer')
  revalidatePath('/')
}

// Eksportert kun for typesjekk i kall-stedet — voider unused-varselet.
export type _RoleSjekk = typeof kanAdministrere
