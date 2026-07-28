// Daglig feil-alarm og retention. Kalt fra .github/workflows/sjekk-klientfeil.yml
// kl. 05:00 UTC. Sender varsel til admins hvis feil_logg-volumet overskrider
// KLIENT_FEIL_ALARM_TERSKEL, og sletter rader eldre enn LOGG_FEIL_RETENSJONSDAGER.
// Se #366.
//
// #496: feil_logg mottar nå ALLE error/fatal-nivå-feil fra logg.feil()
// (server-siden), ikke bare klient-feil fra /api/logg-feil. Tellingen
// filtrerer derfor bort «warn»-rader eksplisitt — de er ikke del av
// alarm-signalet, og cronen har historisk telt uten nivå-filter.
//
// #498-review: og bort ALARM_IGNORERTE_EVENTS, som er kjent transiente og
// ville gjort morgenvarselet til støy på terskel 0. Selve filtrene bor i
// lib/feil-alarm.ts (route-filer kan ikke eksportere hjelpere, og filtrene
// måtte kunne testes).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendVarsel } from '@/lib/varsler'
import {
  KLIENT_FEIL_ALARM_TERSKEL,
  LOGG_FEIL_RETENSJONSDAGER,
} from '@/lib/konstanter'
import {
  tellAlarmverdigeFeil,
  hentToppEventRader,
  lagToppEventTekst,
} from '@/lib/feil-alarm'
import { logg } from '@/lib/logg'

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ feil: 'Uautorisert' }, { status: 401 })
  }

  const admin = createAdminClient()
  const graense24t = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // ── Tell feil siste 24 timer ──────────────────────────────────────────────

  // Filtrene (nivaa != warn, ignorerte events) bor i lib/feil-alarm.ts slik at
  // de kan pinnes i test og ikke drifter fra topp-3-spørringen under.
  const { count, error: tellFeil } = await tellAlarmverdigeFeil(admin, graense24t)

  if (tellFeil) {
    return NextResponse.json({ feil: tellFeil.message }, { status: 500 })
  }

  const antall = count ?? 0

  // ── Send varsel hvis over terskel ────────────────────────────────────────

  if (antall > KLIENT_FEIL_ALARM_TERSKEL) {
    // Mottakerne styres per medlem via profiles.faar_issue_varsler —
    // admin setter flagget i RedigerMedlemSkjema (se migrasjon 104).
    const { data: admins, error: adminsFeil } = await admin
      .from('profiles')
      .select('id')
      .eq('faar_issue_varsler', true)
      .eq('aktiv', true)

    // Logges (ikke kastes) — retention-slettingen under skal kjøre uansett,
    // samme resonnement som varsel-catch'en et par linjer ned. En feilet
    // mottaker-spørring betyr i praksis «morgenalarmen uteble stille» hvis
    // vi ikke logger den.
    if (adminsFeil) {
      await logg.feil('cron.klientfeil.mottakere.feilet', adminsFeil)
    } else if (admins && admins.length > 0) {
      // Egen spørring for topp-3-aggregeringen — bare hentet når alarmen
      // faktisk fyrer, og bare til dette formålet (tellingen over er uendret
      // rask head:true-spørring).
      const { data: eventRader } = await hentToppEventRader(admin, graense24t)

      // Varselet er en bieffekt — retention-slettingen under skal kjøre uansett.
      // Uten catch her ville en varsel-feil gitt 500 og hoppet over oppryddingen,
      // altså: dagen alarmen faktisk går er dagen retention ryker. (#503-review)
      await sendVarsel({
        mottakere: admins.map(p => p.id),
        tittel: 'Feil siste døgn',
        melding: `${antall} feil registrert i feil_logg siste 24 timer.${lagToppEventTekst(eventRader ?? [])}`,
        type: 'klient_alarm',
        // NB: tillatDuplikat: false er en no-op her — sendVarsel deduperer kun
        // når arrangementId eller pollId er satt, og klient_alarm har ingen av
        // delene. To cron-kjøringer på rad gir altså to alarmer. (#503-review)
        tillatDuplikat: false,
      }).catch((err: unknown) => logg.feil('cron.klientfeil.varsel.feilet', err))
    }
  }

  // ── Retention: slett rader eldre enn LOGG_FEIL_RETENSJONSDAGER ───────────

  const grense = new Date(
    Date.now() - LOGG_FEIL_RETENSJONSDAGER * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { count: slettet } = await admin
    .from('feil_logg')
    .delete({ count: 'exact' })
    .lt('opprettet', grense)

  return NextResponse.json({
    ok: true,
    antallFeil: antall,
    varsletAdmins: antall > KLIENT_FEIL_ALARM_TERSKEL,
    slettetGamle: slettet ?? 0,
  })
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
