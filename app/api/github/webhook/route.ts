import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { finnInnsender, erTaptAppInnspill } from '@/lib/innspill-kobling'
import { sendVarsel } from '@/lib/varsler'
import { finnEndringForInnspill, byggInnspillSvar } from '@/lib/innspill-svar'
import { ENDRINGER } from '@/lib/endringslogg-data'
import VERSJON from '@/lib/versjon.json'
import { BASE_URL, GITHUB_ONSKE_LABEL } from '@/lib/config'
import { logg } from '@/lib/logg'
import crypto from 'crypto'

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET

function verifiserSignatur(body: string, signatur: string | null): boolean {
  if (!WEBHOOK_SECRET || !signatur) return false
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
  hmac.update(body)
  const forventet = `sha256=${hmac.digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(signatur), Buffer.from(forventet))
}

export async function POST(request: Request) {
  // Fail-closed: hvis hemmeligheten ikke er satt avviser vi requesten.
  // Et tidligere mønster (`if (WEBHOOK_SECRET && !verifiserSignatur(...))`)
  // hoppet over verifisering ved manglende env-var — det er fail-open og
  // ble fanget i sikkerhetsgjennomgangen 2026-06.
  if (!WEBHOOK_SECRET) {
    // Konfigurasjons-feil — warn er tilstrekkelig (ikke en exception)
    logg.warn('github.webhook.ikke-konfigurert')
    return NextResponse.json({ feil: 'Webhook ikke konfigurert' }, { status: 503 })
  }

  const rawBody = await request.text()
  const signatur = request.headers.get('x-hub-signature-256')

  if (!verifiserSignatur(rawBody, signatur)) {
    return NextResponse.json({ feil: 'Ugyldig signatur' }, { status: 401 })
  }

  const event = request.headers.get('x-github-event')
  if (event !== 'issues') {
    return NextResponse.json({ ok: true, skipped: 'not-issues-event' })
  }

  const payload = JSON.parse(rawBody)
  const issue = payload.issue
  if (!issue) return NextResponse.json({ ok: true, skipped: 'no-issue' })

  const harLabel = issue.labels?.some(
    (l: { name: string }) => l.name.toLowerCase() === GITHUB_ONSKE_LABEL,
  )
  if (!harLabel) return NextResponse.json({ ok: true, skipped: `no-${GITHUB_ONSKE_LABEL}-label` })

  const admin = createAdminClient()

  // Nytt ønske — varsle admins + oppretter
  if (payload.action === 'opened') {
    const innhold = issue.body
      ?.replace(/## Ønske fra .+\n\n/i, '')
      ?.replace(/<!--[\s\S]*?-->/g, '')
      ?.trim()
      ?.slice(0, 200) ?? 'Nytt innspill i appen'

    // Mottakerne styres per medlem via profiles.faar_issue_varsler — denne
    // bryteren gjelder kun innspill (ikke feilalarmer, se faar_feilvarsler
    // og migrasjon 123). Admin setter flagget i RedigerMedlemSkjema.
    const { data: admins, error: adminsFeil } = await admin
      .from('profiles')
      .select('id')
      .eq('faar_issue_varsler', true)
      .eq('aktiv', true)

    // 500 (ikke 200 med tomt resultat) — GitHub retryer webhooken ved feil
    // status, og tillatDuplikat: true under gjør en re-levering trygg.
    if (adminsFeil) {
      logg.warn('github.webhook.mottakere.feilet', { code: adminsFeil.code })
      return NextResponse.json({ feil: 'Kunne ikke hente mottakere' }, { status: 500 })
    }

    const adminIder = (admins ?? []).map(a => a.id)
    // Ingen har faar_issue_varsler = true: innspillet når bare innsenderen
    // selv (via oppretterId under). Spørringen lyktes, så feil-grenen over
    // fanger det ikke — uten denne linjen forsvinner det stille.
    if (adminIder.length === 0) logg.warn('github.webhook.mottakere.tomme', {})
    // Ved «opened» er DB-raden ofte ikke skrevet ennå: bli-utvikler-ruten
    // inserter først etter at GitHub har svart på opprettelsen, og webhooken
    // kan komme først. Body-markøren er derfor normalen her — ikke et avvik
    // slik en kun_body-warn i closed-grenen under ville antydet.
    const { profilId: oppretterId } = await finnInnsender(admin, issue)
    const mottakere = oppretterId ? [...adminIder, oppretterId] : adminIder

    await sendVarsel({
      mottakere,
      tittel: 'Nytt innspill fra appen',
      melding: innhold,
      url: `${BASE_URL}/innspill#issue-${issue.number}`,
      knappTekst: 'Se innspillet',
      type: 'ønske_ny',
      tillatDuplikat: true,
    })

    return NextResponse.json({ ok: true, action: 'opened', varslet: mottakere.length })
  }

  // Ønske lukket — varsle innsenderen
  if (payload.action === 'closed') {
    const { profilId, kunFraBody, oppslagFeilet } = await finnInnsender(admin, issue)

    if (!profilId) {
      if (oppslagFeilet) {
        // «Vi vet ikke», ikke «koblingen er tapt»: raden finnes sannsynligvis,
        // det var spørringen som røk. 500 er det ærlige svaret — leveringen
        // markeres rød hos GitHub og kan redeliveres manuelt, som er eneste
        // sjanse til å redde varselet (GitHub retryer ikke selv). Å logge
        // kobling.tapt her ville løyet; kobling.oppslag.feilet er allerede
        // logget og bærer alarmen (#632).
        return NextResponse.json({ feil: 'Kunne ikke slå opp avsender' }, { status: 500 })
      }

      // Skiller «issue skrevet direkte i GitHub, ingen kobling var ventet»
      // fra «koblingen gikk tapt» — se erTaptAppInnspill() for hvorfor
      // diskriminatoren er issuets alder og ikke overskriften i teksten.
      if (!erTaptAppInnspill(issue)) {
        return NextResponse.json({ ok: true, skipped: 'ikke-fra-appen' })
      }

      // Koblingen mangler helt (verken DB-rad eller body-markør) for et
      // issue som tydelig kommer fra appen — et medlem sitter uten varsel om
      // at innspillet hans er levert. 422, ikke 500: en retry ville aldri
      // funnet koblingen, den er borte for godt (#632).
      await logg.feil(
        'github.webhook.kobling.tapt',
        new Error('Ingen innspill_kobling-rad og ingen profil_id-markør i body'),
        { ctx: { issue_nummer: issue.number } },
      )
      return NextResponse.json({ ok: false, feil: 'Kunne ikke finne avsender' }, { status: 422 })
    }

    if (kunFraBody) {
      // DB-koblingen manglet, men body-markøren reddet den — forventet for
      // issues opprettet før koblingstabellen. Verdt å se i loggen uten at
      // det skal telle som en feil.
      logg.warn('github.webhook.kobling.kun_body', { issue_nummer: issue.number })
    }

    // Teksten kommer fra endringslogg-oppføringen merket med dette
    // issue-nummeret (#633) — aldri fra GitHub-kommentaren, som er skrevet
    // til Reidar, ikke til medlemmet. Koblingen (`innspill: [<nr>]` i
    // lib/endringslogg-data.ts) leses fra den DEPLOYEDE bundelen. Derfor
    // ordningskravet: issuet skal lukkes ETTER at deployen er verifisert —
    // lukkes det før, leser webhooken forrige bundle og medlemmet får
    // standardteksten selv om oppføringen står klar i koden. Kravet står i
    // CLAUDE.md § Policy: Varsler, og feil-eventet under er eneste deteksjon.
    const endring = finnEndringForInnspill(ENDRINGER, issue.number)
    // Vi er inne i grenen der issuet HAR en avsender — altså et ekte
    // brukerinnspill, ikke et av våre egne drifts-issues. For dem finnes det
    // ingen mellomtilstand: et innspill blir enten levert og kommentert, eller
    // avslått. Lukkes det som gjennomført uten en merket endringslogg-
    // oppføring, er kontrakten brutt — det er ikke en normaltilstand vi skal
    // dempe med en vag tekst.
    //
    // Derfor logg.feil, ikke warn: dette skal vekke noen. Tre årsaker gir
    // samme utfall — merkelappen ble glemt, issuet ble lukket før deployen var
    // ute, eller det burde vært lukket som «ikke planlagt».
    //
    // 'not_planned' og 'duplicate' er derimot legitime utfall og skal ikke
    // fyre. Positiv liste, ikke unntaksliste: en fjerde state_reason fra
    // GitHub skal ikke gi støy før noen har vurdert den.
    const forventetOppfoering = issue.state_reason === 'completed' || issue.state_reason == null
    if (!endring && forventetOppfoering) {
      await logg.feil(
        'github.webhook.innspill.uten_endringslogg',
        new Error(`Innspill #${issue.number} lukket som gjennomført uten merket endringslogg-oppføring`),
        {
          ctx: {
            issue_nummer: issue.number,
            state_reason: issue.state_reason ?? null,
            // Den deployede versjonen skiller årsakene i ettertid: dukker
            // oppføringen senere opp i en NYERE versjon enn denne, ble issuet
            // lukket før deploy. Dukker den aldri opp, ble merkelappen glemt.
            versjon: VERSJON.versjon,
          },
        },
      )
    }
    const { tittel, melding } = byggInnspillSvar(endring, issue.state_reason)

    await sendVarsel({
      mottakere: [profilId],
      tittel,
      melding,
      url: `${BASE_URL}/innspill#issue-${issue.number}`,
      knappTekst: 'Se svaret',
      type: 'ønske_lukket',
      tillatDuplikat: true,
    })

    return NextResponse.json({
      ok: true,
      action: 'closed',
      varslet: profilId,
      kilde: endring ? 'endringslogg' : 'standardtekst',
    })
  }

  return NextResponse.json({ ok: true, skipped: 'unhandled-action' })
}
