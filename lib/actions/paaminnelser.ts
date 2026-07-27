import { addDays } from 'date-fns'
import { createHash } from 'crypto'
import { norskDatoNaa, naa } from '@/lib/dato'
import {
  sendPaaminneVarsler,
  sendPurringVarsler,
  sendArrangorPurringVarsler,
} from '@/lib/varsler'
import {
  behandleKaaringspollAvsluttResultat,
  utledKaaringStatus,
  stempleVinnerVarslet,
} from '@/lib/varsler-kaaringspoll'
import { PAAMINNELSE_DAGER, KAARING_VARSEL_RETRY_DAGER } from '@/lib/konstanter'
import { rollerMed } from '@/lib/roller'
import { logg } from '@/lib/logg'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Admin = SupabaseClient<Database>
type Arrangement = { id: string; tittel: string; start_tidspunkt: string }

function dagStreng(dato: Date): string {
  return dato.toISOString().slice(0, 10)
}

// Fail closed (#504): en svelget feil her ga tidligere `[]`, bit-identisk med
// «ingen arrangementer denne dagen» — cronen ville stille hoppet over en hel
// dags påminnelser i stedet for å synliggjøre en DB-feil.
async function hentForDag(admin: Admin, dag: string) {
  const { data, error } = await admin
    .from('arrangementer')
    .select('id, tittel, start_tidspunkt')
    .gte('start_tidspunkt', `${dag}T00:00:00`)
    .lt('start_tidspunkt', `${dag}T23:59:59`)
  if (error) {
    await logg.feil('cron.paaminne.hentForDag.feilet', error, { ctx: { sample: dag } })
    throw new Error(`Kunne ikke hente arrangementer for ${dag}: ${error.message}`)
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
  const idag = norskDatoNaa()
  const idagStr = dagStreng(idag)
  const dag7 = dagStreng(addDays(idag, PAAMINNELSE_DAGER.LANG))
  const dag3 = dagStreng(addDays(idag, PAAMINNELSE_DAGER.PURRING))
  const dag1 = dagStreng(addDays(idag, PAAMINNELSE_DAGER.KORT))

  const [arr_7, arr_1, arr_3, arrangorPurringer] = await Promise.all([
    hentForDag(admin, dag7),
    hentForDag(admin, dag1),
    hentForDag(admin, dag3),
    hentArrangorPurringer(admin, idagStr),
  ])

  const oppgaver: Promise<{ id: string; type: string }>[] = []

  for (const a of arr_7 as Arrangement[]) {
    oppgaver.push(
      sendPaaminneVarsler({ arrangementId: a.id, tittel: a.tittel, startTidspunkt: a.start_tidspunkt, type: 'paaminne_7' })
        .then(() => ({ id: a.id, type: 'paaminne_7' }))
    )
  }
  for (const a of arr_1 as Arrangement[]) {
    oppgaver.push(
      sendPaaminneVarsler({ arrangementId: a.id, tittel: a.tittel, startTidspunkt: a.start_tidspunkt, type: 'paaminne_1' })
        .then(() => ({ id: a.id, type: 'paaminne_1' }))
    )
  }
  for (const a of arr_3 as Arrangement[]) {
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

  // Aggreger feil per fingerprint — én Sentry-event per feil-klasse, ikke per
  // arrangement. Map<fingerprint, {count, sample}> slik at vi rapporterer
  // «paaminne feilet 3 ganger» i stedet for tre identiske Sentry-issues.
  const feilMap = new Map<string, { count: number; sample: unknown }>()
  for (const r of utfall) {
    if (r.status !== 'rejected') continue
    feil++
    const err = r.reason
    const code = (err && typeof err === 'object' && 'code' in err) ? String((err as Record<string, unknown>).code) : undefined
    // Fingerprint: feil-kode hvis kjent (grupperer alle «23505»-feil),
    // ellers en kort hash av meldingsteksten (8 hex-tegn er nok for bucketing).
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

  // Rapporter én logg-event per fingerprint (ikke per arrangement).
  for (const [fingerprint, { count, sample }] of feilMap) {
    await logg.feil('cron.paaminne.feilet', sample, { fingerprint, ctx: { count } })
  }

  // ─── Kåringspoll: lukk de som har passert frist, og retry uvarslede ───────
  // RPC-en avslutt_kaaringspoll er idempotent, så å kjøre den hver dag på
  // samme poll er trygt — den returnerer var_ny=false andre gang.
  //
  // behandleKaaringspoller kan i dag kaste (fail-closed på de to spørringene
  // og relevanteProfiler-oppslaget) — uten denne try/catch-en ville en throw
  // her propagert ut av route handleren i app/api/cron/paaminne/route.ts og
  // vi ville mistet JSON-body-en med tellerne som allerede er samlet opp
  // over (behandlet, feil for påminnelser/purringer). (#504)
  let lukketKaaringer = 0
  let sendteVarsler = 0
  try {
    const resultat = await behandleKaaringspoller(admin)
    lukketKaaringer = resultat.lukketKaaringer
    sendteVarsler = resultat.sendteVarsler
    feil += resultat.kaaringFeil
  } catch (err) {
    feil += 1
    await logg.feil('cron.paaminne.kaaring.feilet', err)
  }

  return { behandlet, feil, lukketKaaringer, sendteVarsler }
}

async function behandleKaaringspoller(admin: Admin) {
  let lukketKaaringer = 0
  let sendteVarsler = 0
  let kaaringFeil = 0

  // Retry-vinduet: hvor langt tilbake vi leter etter avsluttede-men-uvarslede
  // poller. Uten et vindu ville en permanent uvarslebar poll (f.eks. en som
  // alltid får relevanteProfiler-feil) retryes for alltid — vinduet lar den
  // falle ut av køen av seg selv, jf. CLAUDE.md § Policy: Varsler.
  const vinduStart = addDays(norskDatoNaa(), -KAARING_VARSEL_RETRY_DAGER).toISOString()

  // To SEPARATE spørringer i stedet for én `.or()` (#495/#504): testmocken
  // (__tests__/helpers/supabase-mock.ts) lister metodene eksplisitt og har
  // ikke `or`.
  //  - Fersk: pollen har ikke lukket ennå (partial-indexen poll_kaaring_aapne
  //    dekker dette filteret presist).
  //  - Retry: pollen ER lukket, men vinner_varslet_paa mangler fortsatt.
  //    Dette ER #495-fiksen — cronen slutter å bruke var_ny (RPC-ens «lukket
  //    jeg den akkurat nå?») som varslings-gate, og spør i stedet direkte
  //    etter uvarslede avsluttede poller. Ingen ny index her — håndfull rader.
  const [{ data: fersk, error: ferskFeil }, { data: retry, error: retryFeil }] =
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
        .select('id, spoersmaal, tiebreak_status')
        .not('kaaring_mal_id', 'is', null)
        .not('avsluttet_paa', 'is', null)
        .is('vinner_varslet_paa', null)
        .gte('avsluttet_paa', vinduStart),
    ])

  // Fail closed: en feilet spørring skal ikke tolkes som «ingen kåringer å
  // behandle» — det ville stille droppet vinnervarselet for dagens poller.
  if (ferskFeil) {
    await logg.feil('cron.paaminne.kaaring.fersk.feilet', ferskFeil)
    throw new Error(`Kunne ikke hente åpne kåringspoller: ${ferskFeil.message}`)
  }
  if (retryFeil) {
    await logg.feil('cron.paaminne.kaaring.retry.feilet', retryFeil)
    throw new Error(`Kunne ikke hente uvarslede kåringspoller: ${retryFeil.message}`)
  }

  // De to spørringene er gjensidig utelukkende (avsluttet_paa er enten null
  // eller ikke), så en enkel sammenslåing gir ingen duplikater — men den må
  // BEVARE PROVENIENSEN (#504-review). Slås radene sammen flatt, er `var_ny`
  // eneste diskriminator i løkka under, og en fersk poll der RPC-en svarer
  // var_ny=false ville falt til utledKaaringStatus(null) → 'ingen_stemmer'
  // på en poll som fortsatt er åpen: feil varsel OG permanent stempling.
  const koe = [
    ...(fersk ?? []).map(poll => ({ poll, erRetry: false })),
    ...(retry ?? []).map(poll => ({ poll, erRetry: true })),
  ]
  if (koe.length === 0) {
    return { lukketKaaringer, sendteVarsler, kaaringFeil }
  }

  // To ulike mottaker-grupper:
  //  - Tiebreak-varsel: kun de som faktisk skal løse den (generalsekretær).
  //    Det er han som har siste ord ved likt antall stemmer — admin-flokken
  //    skal ikke pinges på et valg de ikke kan ta.
  //  - Ingen-stemmer-varsel: går til alle med admin-rettigheter, fordi
  //    dette er ren info om at en kåring ble avlyst og bør følges opp.
  const tiebreakRoller = rollerMed('loeserTiebreak')
  const adminRoller = rollerMed('kanAdministrere')
  const trengteRoller = Array.from(new Set([...tiebreakRoller, ...adminRoller]))
  const { data: relevanteProfiler, error: profilerFeil } = await admin
    .from('profiles')
    .select('id, rolle')
    .in('rolle', trengteRoller)
    .eq('aktiv', true)
  // Fail closed — DEN UFRAVIKELIGE (#504): sender vi vinnervarselet med tomme
  // tiebreak-/admin-lister (fordi dette oppslaget stille ga []) ville vi
  // likevel gått videre og stemplet vinner_varslet_paa — kvitteringsbokens
  // verste feilmodus, en poll som ser varslet ut, men der ingen faktisk fikk
  // beskjed, og som aldri prøves på nytt fordi markøren nå er satt.
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
      let status: string
      if (erRetry) {
        // Retry-raden er per definisjon allerede lukket (spørringen filtrerer
        // på avsluttet_paa not null), så RPC-en ville bare svart
        // «allerede_avsluttet». Statusen leses fra den durable
        // tiebreak_status-kolonnen — dette ER #495-fiksen: var_ny er ikke
        // lenger varslings-gate, vinner_varslet_paa er det.
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
          // Uten logg her ser menneskene som får rød GitHub Actions bare
          // {"kaaringFeil": 1} og har ingen sti videre. (#504-review)
          kaaringFeil += 1
          await logg.feil(
            'cron.paaminne.kaaring.tom_rpc',
            new Error('avslutt_kaaringspoll returnerte ingen rad'),
            { ctx: { sample: poll.id } },
          )
          continue
        }
        if (!rad.var_ny) {
          // Fersk poll som RPC-en likevel IKKE lukket: enten 'ikke_moden'
          // (klokkeskew mot svarfrist) eller 'allerede_avsluttet' (noen
          // vant kappløpet mellom vårt SELECT og dette kallet). Da er
          // poll.tiebreak_status fra select-tidspunktet stale, og vi kan
          // hverken bruke rad.status eller utlede fra kolonnen. Hopp over
          // UTEN å stemple — retry-spørringen plukker den opp i morgen med
          // konsistent tilstand, og systemet selvheler. Å stemple her ville
          // gjenskapt #495 nøyaktig. (#504-review)
          logg.warn('cron.paaminne.kaaring.fersk_ikke_lukket', { status: String(rad.status) })
          continue
        }
        lukketKaaringer += 1
        status = rad.status as string
      }

      const { sendt } = await behandleKaaringspollAvsluttResultat({
        pollId: poll.id,
        spoersmaal: poll.spoersmaal,
        status,
        tiebreakIder,
        adminIder,
      })
      if (sendt) sendteVarsler += 1
      // Stemple på AT LINJEN OVER RETURNERTE, ikke på sendt=true: doktrinen
      // er «returnerer = terminalt avgjort». {sendt:false} (f.eks. ingen
      // generalsekretær å varsle) er like terminalt som sendt=true — uten
      // stempling der får vi en poison pill som retryes hver morgen i
      // KAARING_VARSEL_RETRY_DAGER dager. (#495/#504)
      await stempleVinnerVarslet(admin, poll.id)
    } catch {
      kaaringFeil += 1
    }
  }

  return { lukketKaaringer, sendteVarsler, kaaringFeil }
}
