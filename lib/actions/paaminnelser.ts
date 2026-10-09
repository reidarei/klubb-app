import { createHash } from 'crypto'
import { iDagOslo, osloDagPluss, osloDagStartIso, naa } from '@/lib/dato'
import {
  sendPaaminneVarsler,
  sendPurringVarsler,
  sendArrangorPurringVarsler,
} from '@/lib/varsler'
import {
  behandleKaaringspollAvsluttResultat,
  utledKaaringStatus,
  stempleKaaringspollVarslet,
  erKaaringUtfall, type KaaringUtfall,
} from '@/lib/varsler-kaaringspoll'
import { PAAMINNELSE_DAGER, KAARING_VARSEL_RETRY_DAGER } from '@/lib/konstanter'
import { rollerMed } from '@/lib/roller'
import { logg } from '@/lib/logg'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Admin = SupabaseClient<Database>

// Fail closed: tomt resultat er bit-identisk med «ingen arrangementer i dag» (#504).
// paameldinger embeddes for å unngå N+1 og arve samme feilvakt (#591);
// profil_id trengs fordi 7-dagers-teksten er personlig. 3-dagers-purringen
// drar det med ubrukt og gjør sitt eget oppslag.
//
// `dag` er dagoffset; vinduet bygges av osloDagStartIso() (norsk midnatt som
// UTC-instant), aldri en bar tidsstempel-literal uten sone (#675).
// `anker` er norsk «i dag» samplet én gang per kjøring, så de to grensene
// ikke kan havne på hver sin side av midnatt.
async function hentForDag(admin: Admin, dag: number, anker: string) {
  const { data, error } = await admin
    .from('arrangementer')
    .select('id, tittel, start_tidspunkt, oppmoetested, paameldinger (profil_id, status)')
    .gte('start_tidspunkt', osloDagStartIso(dag, anker))
    .lt('start_tidspunkt', osloDagStartIso(dag + 1, anker))
  if (error) {
    await logg.feil('cron.paaminne.hentForDag.feilet', error, { ctx: { sample: dag } })
    throw new Error(`Kunne ikke hente arrangementer for dag-offset ${dag}: ${error.message}`)
  }
  return data ?? []
}

async function hentArrangorPurringer(admin: Admin, dag: string) {
  const { data, error } = await admin
    .from('arrangoransvar')
    .select('id, aar, arrangement_navn, ansvarlig_id')
    .eq('purredato', dag)
    .is('arrangement_id', null)
    .not('ansvarlig_id', 'is', null)
  if (error) {
    await logg.feil('cron.paaminne.hentArrangorPurringer.feilet', error, { ctx: { sample: dag } })
    throw new Error(`Kunne ikke hente arrangøransvar-purringer for ${dag}: ${error.message}`)
  }
  return data ?? []
}

export async function kjorPaaminnelser(admin: Admin) {
  // Ett anker for hele kjøringen — se hentForDag.
  const anker = iDagOslo()

  // `purredato` er en ren date-kolonne, så dagstrengen er riktig nøkkel.
  const idagStr = osloDagPluss(0, anker)

  const [arr_7, arr_1, arr_3, arrangorPurringer] = await Promise.all([
    hentForDag(admin, PAAMINNELSE_DAGER.LANG, anker),
    hentForDag(admin, PAAMINNELSE_DAGER.KORT, anker),
    hentForDag(admin, PAAMINNELSE_DAGER.PURRING, anker),
    hentArrangorPurringer(admin, idagStr),
  ])

  const oppgaver: Promise<{ id: string; type: string }>[] = []

  for (const a of arr_7) {
    oppgaver.push(
      sendPaaminneVarsler({
        arrangementId: a.id,
        tittel: a.tittel,
        startTidspunkt: a.start_tidspunkt,
        type: 'paaminne_7',
        oppmoetested: a.oppmoetested,
        paameldinger: a.paameldinger,
      })
        .then(() => ({ id: a.id, type: 'paaminne_7' }))
    )
  }
  for (const a of arr_1) {
    oppgaver.push(
      sendPaaminneVarsler({
        arrangementId: a.id,
        tittel: a.tittel,
        startTidspunkt: a.start_tidspunkt,
        type: 'paaminne_1',
        oppmoetested: a.oppmoetested,
        paameldinger: a.paameldinger,
      })
        .then(() => ({ id: a.id, type: 'paaminne_1' }))
    )
  }
  for (const a of arr_3) {
    oppgaver.push(
      sendPurringVarsler({ arrangementId: a.id, tittel: a.tittel, startTidspunkt: a.start_tidspunkt })
        .then(() => ({ id: a.id, type: 'purring' }))
    )
  }
  for (const a of arrangorPurringer) {
    oppgaver.push(
      sendArrangorPurringVarsler({ ansvarligId: a.ansvarlig_id!, arrangementNavn: a.arrangement_navn, aar: a.aar })
        .then(() => ({ id: a.id, type: 'arrangor_purring' }))
    )
  }

  const utfall = await Promise.allSettled(oppgaver)
  const behandlet = utfall
    .filter((r): r is PromiseFulfilledResult<{ id: string; type: string }> => r.status === 'fulfilled')
    .map(r => r.value)
  let feil = 0

  // Én Sentry-event per feilklasse, ikke per arrangement.
  const feilMap = new Map<string, { count: number; sample: unknown }>()
  for (const r of utfall) {
    if (r.status !== 'rejected') continue
    feil++
    const err = r.reason
    const code = (err && typeof err === 'object' && 'code' in err) ? String((err as Record<string, unknown>).code) : undefined
    // Feilkode hvis kjent, ellers kort hash av meldingen (8 hex holder for bucketing).
    const fingerprint =
      code ??
      createHash('sha1')
        .update(err instanceof Error ? err.message : String(err))
        .digest('hex')
        .slice(0, 8)
    const bucket = feilMap.get(fingerprint)
    if (bucket) {
      bucket.count++
    } else {
      feilMap.set(fingerprint, { count: 1, sample: err })
    }
  }

  for (const [fingerprint, { count, sample }] of feilMap) {
    await logg.feil('cron.paaminne.feilet', sample, { fingerprint, ctx: { count } })
  }

  // ─── Kåringspoll: lukk de som har passert frist, og retry uvarslede ───────
  // avslutt_kaaringspoll er idempotent (var_ny=false andre gang).
  // try/catch fordi behandleKaaringspoller kaster fail-closed — ellers mister
  // route handleren JSON-svaret med tellerne samlet over (#504).
  let lukketKaaringer = 0
  let sendteVarsler = 0
  try {
    const resultat = await behandleKaaringspoller(admin, anker)
    lukketKaaringer = resultat.lukketKaaringer
    sendteVarsler = resultat.sendteVarsler
    feil += resultat.kaaringFeil
  } catch (err) {
    feil += 1
    await logg.feil('cron.paaminne.kaaring.feilet', err)
  }

  return { behandlet, feil, lukketKaaringer, sendteVarsler }
}

async function behandleKaaringspoller(admin: Admin, anker: string) {
  let lukketKaaringer = 0
  let sendteVarsler = 0
  let kaaringFeil = 0

  // Tidsavgrenset retry, så en permanent uvarslebar poll faller ut av køen
  // av seg selv (jf. CLAUDE.md § Policy: Varsler).
  const vinduStart = osloDagStartIso(-KAARING_VARSEL_RETRY_DAGER, anker)

  // To spørringer, ikke én `.or()` — testmocken (__tests__/helpers/supabase-mock.ts)
  // har ikke `or`.
  //  - Fersk: ikke lukket ennå (partial-indexen poll_kaaring_aapne dekker filteret).
  //  - Retry: lukket, men mangler stempelet for sitt utfall. var_ny er ikke
  //    lenger varslings-gate (#495). Hvilket stempel som mangler avgjøres i JS
  //    under, ikke i SELECT-en (#521).
  const [{ data: fersk, error: ferskFeil }, { data: retryRader, error: retryFeil }] =
    await Promise.all([
      admin
        .from('poll')
        .select('id, spoersmaal, tiebreak_status')
        .not('kaaring_mal_id', 'is', null)
        .is('avsluttet_paa', null)
        .lt('svarfrist', naa())
        .is('vinner_varslet_paa', null),
      admin
        .from('poll')
        .select('id, spoersmaal, tiebreak_status, tiebreak_varslet_paa, vinner_varslet_paa')
        .not('kaaring_mal_id', 'is', null)
        .not('avsluttet_paa', 'is', null)
        .gte('avsluttet_paa', vinduStart),
    ])

  // Fail closed: feil ≠ «ingen kåringer å behandle».
  if (ferskFeil) {
    await logg.feil('cron.paaminne.kaaring.fersk.feilet', ferskFeil)
    throw new Error(`Kunne ikke hente åpne kåringspoller: ${ferskFeil.message}`)
  }
  if (retryFeil) {
    await logg.feil('cron.paaminne.kaaring.retry.feilet', retryFeil)
    throw new Error(`Kunne ikke hente uvarslede kåringspoller: ${retryFeil.message}`)
  }

  // Venter pollen på tiebreak, er det tiebreak-stempelet som teller; ellers
  // vinner-stempelet (#521). `== null` tåler også et utelatt felt (mock).
  const retry = (retryRader ?? []).filter(p =>
    p.tiebreak_status === 'venter_paa_tiebreak'
      ? p.tiebreak_varslet_paa == null
      : p.vinner_varslet_paa == null,
  )

  // Gjensidig utelukkende, men opphavet (erRetry) må bevares: flatt ville en
  // fersk poll med var_ny=false fått 'ingen_stemmer' og blitt stemplet (#504).
  const koe = [
    ...(fersk ?? []).map(poll => ({ poll, erRetry: false })),
    ...retry.map(poll => ({ poll, erRetry: true })),
  ]
  if (koe.length === 0) {
    return { lukketKaaringer, sendteVarsler, kaaringFeil }
  }

  // Tiebreak går kun til den som kan løse den (generalsekretær); ingen-stemmer
  // er oppfølgingsinfo til alle med admin-rettigheter.
  const tiebreakRoller = rollerMed('loeserTiebreak')
  const adminRoller = rollerMed('kanAdministrere')
  const trengteRoller = Array.from(new Set([...tiebreakRoller, ...adminRoller]))
  const { data: relevanteProfiler, error: profilerFeil } = await admin
    .from('profiles')
    .select('id, rolle')
    .in('rolle', trengteRoller)
    .eq('aktiv', true)
  // Fail closed, ufravikelig (#504): tomme lister ville blitt stemplet som
  // varslet uten at noen fikk beskjed — og aldri prøvd igjen.
  if (profilerFeil) {
    await logg.feil('cron.paaminne.kaaring.profiler.feilet', profilerFeil)
    throw new Error(`Kunne ikke hente relevante profiler for kåringsvarsel: ${profilerFeil.message}`)
  }
  const tiebreakIder = (relevanteProfiler ?? [])
    .filter(p => tiebreakRoller.includes(p.rolle as (typeof tiebreakRoller)[number]))
    .map(p => p.id)
  const adminIder = (relevanteProfiler ?? [])
    .filter(p => adminRoller.includes(p.rolle as (typeof adminRoller)[number]))
    .map(p => p.id)

  for (const { poll, erRetry } of koe) {
    try {
      // Statusen bestemmes av HVILKEN spørring raden kom fra, ikke av var_ny.
      let status: KaaringUtfall
      if (erRetry) {
        // Allerede lukket — RPC-en ville bare svart «allerede_avsluttet».
        // Status leses fra den durable kolonnen (#495).
        status = utledKaaringStatus(poll.tiebreak_status)
      } else {
        const { data: rpcRes, error: rpcErr } = await admin.rpc(
          'avslutt_kaaringspoll',
          { p_poll_id: poll.id },
        )
        if (rpcErr) {
          kaaringFeil += 1
          await logg.feil('cron.paaminne.kaaring.rpc.feilet', rpcErr, { ctx: { sample: poll.id } })
          continue
        }
        const rad = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes
        if (!rad) {
          // Logges, ellers er {"kaaringFeil": 1} i Actions et blindspor.
          kaaringFeil += 1
          await logg.feil(
            'cron.paaminne.kaaring.tom_rpc',
            new Error('avslutt_kaaringspoll returnerte ingen rad'),
            { ctx: { sample: poll.id } },
          )
          continue
        }
        if (!rad.var_ny) {
          // 'ikke_moden' (klokkeskew) eller 'allerede_avsluttet' (tapt
          // kappløp): tilstanden er stale. Hopp over UTEN å stemple —
          // retry-spørringen tar den i morgen. Stempling her = #495 igjen.
          logg.warn('cron.paaminne.kaaring.fersk_ikke_lukket', { status: String(rad.status) })
          continue
        }
        if (!erKaaringUtfall(rad.status)) {
          // Ukjent status: et gjett ville stemplet feil kolonne og fjernet
          // pollen permanent fra retry (#521). Prøv igjen i morgen.
          kaaringFeil += 1
          await logg.feil(
            'cron.paaminne.kaaring.ukjent_status',
            new Error(`avslutt_kaaringspoll ga ukjent status: ${String(rad.status)}`),
            { ctx: { sample: poll.id } },
          )
          continue
        }
        lukketKaaringer += 1
        status = rad.status
      }

      const { sendt } = await behandleKaaringspollAvsluttResultat({
        pollId: poll.id,
        spoersmaal: poll.spoersmaal,
        status,
        tiebreakIder,
        adminIder,
      })
      if (sendt) sendteVarsler += 1
      // Stemples fordi linjen over RETURNERTE, ikke fordi sendt=true —
      // returnerer = terminalt avgjort (#495/#504). Kolonnen velges ut fra
      // status, ikke erRetry (#521).
      await stempleKaaringspollVarslet(admin, poll.id, status)
    } catch {
      kaaringFeil += 1
    }
  }

  return { lukketKaaringer, sendteVarsler, kaaringFeil }
}
