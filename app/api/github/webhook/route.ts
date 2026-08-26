import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { finnInnsender, erTaptAppInnspill } from '@/lib/innspill-kobling'
import { sendVarsel } from '@/lib/varsler'
import { formaterDato } from '@/lib/dato'
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

    let oppsummering = 'Ønsket ditt er håndtert!'
    if (issue.comments > 0 && issue.comments_url) {
      try {
        const token = process.env.GITHUB_TOKEN
        const kommentarerRes = await fetch(
          `${issue.comments_url}?per_page=1&page=${issue.comments}`,
          { headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } : {} }
        )
        if (kommentarerRes.ok) {
          const kommentarer = await kommentarerRes.json()
          if (kommentarer.length > 0) {
            oppsummering = kommentarer[0].body
              .replace(/#{1,6}\s/g, '')
              .replace(/[*_`]/g, '')
              .slice(0, 200)
          }
        }
      } catch {
        // Bruk default oppsummering
      }
    }

    // Legg til info om at endringen er live om ca. 1 minutt
    const liveTid = new Date(Math.ceil((Date.now() + 60_000) / 60_000) * 60_000)
    const liveKl = formaterDato(liveTid.toISOString(), 'HH:mm')
    oppsummering += `\n\nEndringen er live i appen ca. kl. ${liveKl}.`

    await sendVarsel({
      mottakere: [profilId],
      tittel: 'Ønsket ditt er gjennomført',
      melding: oppsummering,
      url: `${BASE_URL}/innspill#issue-${issue.number}`,
      knappTekst: 'Se svaret',
      type: 'ønske_lukket',
      tillatDuplikat: true,
    })

    return NextResponse.json({ ok: true, action: 'closed', varslet: profilId })
  }

  return NextResponse.json({ ok: true, skipped: 'unhandled-action' })
}
