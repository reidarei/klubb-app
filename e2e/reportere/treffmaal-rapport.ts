import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter'
import fs from 'node:fs'
import { TREFFMAAL_UNNTAK, KJENTE_MANGLER } from '../helpers/treffmaal-unntak'

/**
 * Samler og rapporterer resultatene fra forventTreffbar()-kallene i hele
 * kjøringen (#700 PR 2) — bredde (sider-laster.spec.ts) og dybde (spec-er som
 * åpner et panel/sheet/lightbox og måler der). Rapporten er INFORMASJON, ikke
 * en egen assertion: det er forventTreffbar() sine egne expect()-kall som gjør
 * testene røde, denne skriver bare en lesbar oppsummering til
 * $GITHUB_STEP_SUMMARY (eller konsollen lokalt).
 */

export type Maaling = {
  kontekst: string
  sti: string
  kandidater: number
  kandidaterIGulvOmraade: number
  maalt: number
  unntatt: number
  skjult: number
  inlineLenker: number
  ikkeMaalt: number
  brudd: Array<{ beskrivelse: string; bredde: number; hoyde: number; bomPunkter: number }>
}

/**
 * Akkumulerer treffmaal-attachments per test.id. Playwright kaller
 * onTestEnd() én gang PER FORSØK (retry), ikke én gang per test — «siste
 * forsøk vinner» betyr derfor en overskriving, ikke en sammenslåing, av det
 * som ligger på samme test.id.
 *
 * Egen, instans-lokal klasse (ikke modul-global state) slik at vitest kan
 * teste akkumuleringen uten å late som den er et helt Playwright-kjøring.
 */
export class TreffmaalSamler {
  private perTest = new Map<string, Maaling[]>()

  leggTil(testId: string, maalinger: Maaling[]) {
    if (maalinger.length === 0) return
    this.perTest.set(testId, maalinger)
  }

  alle(): Maaling[] {
    return [...this.perTest.values()].flat()
  }
}

export default class TreffmaalRapport implements Reporter {
  private samler = new TreffmaalSamler()

  onTestEnd(test: TestCase, result: TestResult) {
    const attachments = result.attachments.filter(a => a.name === 'treffmaal')
    if (attachments.length === 0) return

    const maalinger: Maaling[] = []
    for (const a of attachments) {
      const raatekst = a.body
        ? a.body.toString('utf8')
        : a.path
          ? fs.readFileSync(a.path, 'utf8')
          : null
      if (!raatekst) continue
      try {
        maalinger.push(JSON.parse(raatekst) as Maaling)
      } catch {
        // Malformet attachment — ikke la rapporteringen ta ned kjøringen.
      }
    }
    this.samler.leggTil(test.id, maalinger)
  }

  onEnd(_fullResult: FullResult) {
    const markdown = byggTreffmaalRapport(this.samler.alle())
    const summaryFil = process.env.GITHUB_STEP_SUMMARY
    if (summaryFil) {
      fs.appendFileSync(summaryFil, markdown + '\n')
    } else {
      console.log(markdown)
    }
  }
}

function matcherUnntakRute(rute: string | RegExp, sti: string): boolean {
  return typeof rute === 'string' ? rute === sti : rute.test(sti)
}

/**
 * Ren logikk, eksportert for vitest (__tests__/treffmaal-unntak.test.ts).
 * Bygger markdown-rapporten fra den (allerede dedupede) lista av målinger.
 *
 * «Unntak i bruk» avgjøres heuristisk: et unntak regnes i bruk hvis MINST ÉN
 * måling på en matchende rute rapporterte unntatt > 0. Med dagens to unntak
 * (ett per rute-mønster) er det ingen fare for forveksling — flere unntak på
 * samme rute-mønster ville krevd en presis kobling i selve målingen i stedet.
 */
export function byggTreffmaalRapport(maalinger: Maaling[]): string {
  const ruter = new Set(maalinger.map(m => m.sti))
  const antallMaalinger = maalinger.length
  const dybdeKontekster = Math.max(0, antallMaalinger - ruter.size)
  const totalMaalt = maalinger.reduce((sum, m) => sum + m.maalt, 0)

  const linjer: string[] = []
  linjer.push(
    `## Trykkflater (#700): ${totalMaalt} elementer målt — ${ruter.size} ruter i default-tilstand, i tillegg ${dybdeKontekster} dybde-kontekster (åpnet panel/lightbox/picker)`,
  )
  linjer.push('')

  if (maalinger.length === 0) {
    linjer.push('_Ingen målinger samlet inn — forventTreffbar() ble ikke kalt i denne kjøringen._')
  } else {
    linjer.push('| Kontekst | Kandidater | Målt | Unntatt | Skjult | Inline-lenker | Ikke målt | Brudd |')
    linjer.push('|---|---|---|---|---|---|---|---|')
    for (const m of maalinger) {
      linjer.push(
        `| ${m.kontekst} | ${m.kandidater} | ${m.maalt} | ${m.unntatt} | ${m.skjult} | ${m.inlineLenker} | ${m.ikkeMaalt} | ${m.brudd.length} |`,
      )
    }
  }
  linjer.push('')

  const alleBrudd = maalinger.flatMap(m => m.brudd.map(b => ({ ...b, kontekst: m.kontekst })))
  linjer.push('### Brudd')
  if (alleBrudd.length === 0) {
    linjer.push('Ingen.')
  } else {
    for (const b of alleBrudd) {
      linjer.push(`- **${b.kontekst}** — ${b.beskrivelse}: ${b.bredde}×${b.hoyde} px, ${b.bomPunkter} bom-punkt(er)`)
    }
  }
  linjer.push('')

  const brukteUnntak = TREFFMAAL_UNNTAK.filter(u =>
    maalinger.some(m => matcherUnntakRute(u.rute, m.sti) && m.unntatt > 0),
  )
  const ubrukteUnntak = TREFFMAAL_UNNTAK.filter(u => !brukteUnntak.includes(u))

  linjer.push('### Unntak i bruk')
  if (brukteUnntak.length === 0) {
    linjer.push('Ingen.')
  } else {
    for (const u of brukteUnntak) {
      linjer.push(`- \`${u.selektor}\` (#${u.issue}) — ${u.grunn} Alternativ vei: ${u.alternativVei}`)
    }
  }
  linjer.push('')

  // Informativt, ikke rødt (regissørens avgjørelse): et unntak som aldri
  // treffer kan bety at vakten ikke dekker ruten i denne kjøringen, ikke at
  // unntaket er dødt kode.
  linjer.push('### Ubrukte unntak (informativt)')
  if (ubrukteUnntak.length === 0) {
    linjer.push('Ingen.')
  } else {
    for (const u of ubrukteUnntak) {
      linjer.push(`- \`${u.selektor}\` (#${u.issue})`)
    }
  }
  linjer.push('')

  linjer.push('### Kjente mangler')
  for (const mangel of KJENTE_MANGLER) {
    linjer.push(`- ${mangel}`)
  }

  return linjer.join('\n')
}
