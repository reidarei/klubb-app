import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  VARSEL_TEKSTER,
  VARSEL_REKKEFOLGE,
  SYMBOL_TEKSTER,
  OEVRIGE_TEKSTER,
  typeTilNoekkel,
  varselPanelNavn,
  varselKortNavn,
  erVarselBryter,
} from '@/lib/varsel-typer'
import { SYMBOLER_VARSLER } from '@/lib/markering-symboler'

// Vakt mot at kontrollpanelet igjen får rader uten norsk navn. Før #546-runden
// manglet de fire kaaringspoll_*-nøklene etiketter og falt tilbake på
// DB-teksten, og varselhistorikken viste rå nøkler som `pass-godkjent`.
// Testen leser migrasjonene i stedet for å treffe databasen, slik at den kan
// kjøre i CI uten Supabase.

const MIGRASJONER = join(process.cwd(), 'supabase', 'migrations')

/** Alle noekkel-verdier som er insertet i varsel_innstillinger av en migrasjon. */
function noeklerFraMigrasjoner(): string[] {
  const funnet = new Set<string>()
  for (const fil of readdirSync(MIGRASJONER).filter(f => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRASJONER, fil), 'utf8')
    // Bare filer som faktisk skriver til tabellen — ellers plukker vi opp
    // noekkel-strenger fra grants/policyer.
    if (!/insert\s+into\s+(public\.)?varsel_innstillinger/i.test(sql)) continue
    // Verdi-listene er på formen ('noekkel', true, …) eller ('noekkel', true, null, …)
    for (const m of sql.matchAll(/\(\s*'([^']+)'\s*,\s*(?:true|false)\b/gi)) {
      funnet.add(m[1])
    }
  }
  return [...funnet]
}

/**
 * Nøkler en SENERE migrasjon fjerner igjen (migrasjon 152 rydder bort
 * symbol-avledede bryterrader, se fila for hvorfor). De skal ikke kreve en
 * panel-etikett: raden finnes ikke i en instans som har kjørt hele
 * migrasjonsløpet. Uten dette krevde testen at hvert symbol migrasjon 151
 * tilfeldigvis seedet FOR SIN EGEN KLUBB, også fantes i den lesende klubbens
 * register (#767-review) — en skjult kontrakt, siden migrasjonene speiles
 * til klubb-app mens registeret er klubbens eget.
 */
function noeklerSlettetAvMigrasjoner(): string[] {
  const funnet = new Set<string>()
  for (const fil of readdirSync(MIGRASJONER).filter(f => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRASJONER, fil), 'utf8')
    // Kun delete-setninger mot tabellen, og kun in-lista i dem.
    for (const m of sql.matchAll(
      /delete\s+from\s+(?:public\.)?varsel_innstillinger[\s\S]*?noekkel\s+in\s*\(([^)]*)\)/gi,
    )) {
      for (const n of m[1].matchAll(/'([^']+)'/g)) funnet.add(n[1])
    }
  }
  return [...funnet]
}

describe('varsel-typer', () => {
  it('har norsk panel-etikett for hver bryter som finnes i databasen', () => {
    const slettet = new Set(noeklerSlettetAvMigrasjoner())
    const utenEtikett = noeklerFraMigrasjoner()
      .filter(n => !slettet.has(n))
      .filter(n => !VARSEL_TEKSTER[n]?.panel)
    expect(utenEtikett).toEqual([])
  })

  // Motsatt retning (#759): en panel-etikett uten seed-rad er en bryter som
  // lyver — admin ser den i kontrollpanelet, men erVarselAktiv() faller
  // uansett til aktiv = true fordi ingen rad finnes å lese fra. Et av
  // symbolregisterets varseltyper slapp gjennom udekket helt til denne
  // vakten kom (#747 ga den aldri en seed-rad); testen fanger neste
  // varseltype som gjør samme feil.
  it('hver panel-etikett har en seed-rad i en migrasjon', () => {
    const noekler = noeklerFraMigrasjoner()
    // Avledet unntaksfilter, ikke en literal-liste (#767): SYMBOLER_VARSLER-
    // typene (fra lib/klubb-symboler.ts) skal fra migrasjon 152 IKKE lenger
    // seedes av en statisk migrasjon — settet er klubb-konfigurerbart, og
    // bryteren kommer i stedet fra en syntetisk rad i innstillinger/page.tsx.
    // En literal-liste her ville aldri fanget neste symbol som gjør det samme.
    const symbolTyper = new Set<string>(SYMBOLER_VARSLER.map(s => s.varsel.type))
    const utenSeed = Object.entries(VARSEL_TEKSTER)
      .filter(([, t]) => t.panel)
      // test_modus er ingen varseltype (se kommentaren i lib/varsel-typer.ts) —
      // den slår av utsending til alle andre enn test-eposten, og raden er
      // satt manuelt i drift, ikke seedet av en migrasjon. Eneste literale unntak.
      .filter(([n]) => n !== 'test_modus')
      .filter(([n]) => !symbolTyper.has(n))
      .filter(([n]) => !noekler.includes(n))
      .map(([n]) => n)
    expect(utenSeed).toEqual([])
  })

  // Positiv motvakt (#767): uten denne kunne et nytt varslende symbol legges
  // til med tomt panel/kort og passere ubemerket — unntaket over ville skjule
  // akkurat det, siden det tar SYMBOLER_VARSLER-typer helt ut av seed-sjekken.
  // skipIf og ikke en toBeGreaterThan(0)-vakt i kroppen: kategorien er
  // valgfri i klubbens register (#767-review), så et krav om at den er
  // ikke-tom ville vært en skjult kontrakt. En skip i rapporten sier like
  // tydelig som en assertion at løkka ikke kjørte.
  it.skipIf(SYMBOLER_VARSLER.length === 0)('hver SYMBOLER_VARSLER-type har panel og kort satt', () => {
    for (const s of SYMBOLER_VARSLER) {
      expect(s.varsel.panel).toBeTruthy()
      expect(s.varsel.kort).toBeTruthy()
      // Og at de faktisk havnet i VARSEL_TEKSTER via spread-mekanismen i
      // lib/varsel-typer.ts, ikke bare på selve symbolet.
      expect(VARSEL_TEKSTER[s.varsel.type]?.panel).toBe(s.varsel.panel)
      expect(VARSEL_TEKSTER[s.varsel.type]?.kort).toBe(s.varsel.kort)
    }
  })

  it('finner faktisk nøklene i migrasjonene (så testen over ikke er tom)', () => {
    // Uten denne ville en regex-endring som slutter å matche gjort testen over
    // grønn på et tomt utvalg — verdiløs vakt som ser ut som dekning.
    const noekler = noeklerFraMigrasjoner()
    expect(noekler.length).toBeGreaterThanOrEqual(20)
    expect(noekler).toContain('kaaringspoll_tiebreak')
    expect(noekler).toContain('klient_alarm')
  })

  it('har kort navn for hver type, også de uten bryter', () => {
    const utenKort = Object.entries(VARSEL_TEKSTER).filter(([, t]) => !t.kort)
    expect(utenKort).toEqual([])
    // bursdagsgratulasjon har ingen bryter, men havner i varselhistorikken.
    // Typen SENDES ikke lenger (#643 — mention-varselet dekker samme behov),
    // men etiketten må overleve: uten den vises gamle rader som rå nøkkel.
    expect(VARSEL_TEKSTER.bursdagsgratulasjon.panel).toBeUndefined()
    expect(varselKortNavn('bursdagsgratulasjon')).toBe('Bursdagsgratulasjon')
  })

  it('skiller brytere fra historikk-only oppføringer', () => {
    // erVarselBryter() er vakten oppdaterVarselInnstilling() skriver bak
    // (#767-review). Begge retninger pinnes: en oppføring som MISTER `panel`
    // ville ellers stille blitt uskrivbar, og en historikk-only type ville
    // stille blitt skrivbar igjen.
    const utenPanel = Object.keys(VARSEL_TEKSTER).filter(n => !VARSEL_TEKSTER[n].panel)
    expect(utenPanel).toEqual(['bursdagsgratulasjon'])
    for (const noekkel of Object.keys(VARSEL_TEKSTER)) {
      expect(erVarselBryter(noekkel)).toBe(noekkel !== 'bursdagsgratulasjon')
    }
    // Ukjent nøkkel og Object.prototype-arv er begge «nei».
    expect(erVarselBryter('finnes_ikke')).toBe(false)
    for (const arvet of ['toString', 'constructor', 'valueOf', '__proto__']) {
      expect(erVarselBryter(arvet)).toBe(false)
    }
  })

  it('mapper varsel_logg-typer til riktig innstillings-nøkkel', () => {
    expect(typeTilNoekkel('paaminne_7')).toBe('paaminnelse_7d')
    expect(typeTilNoekkel('paaminne_1')).toBe('paaminnelse_1d')
    expect(typeTilNoekkel('purring')).toBe('purring_aktiv')
    expect(typeTilNoekkel('mention')).toBe('mention')
  })

  it('gir historikken navn via mappingen, ikke rå nøkler', () => {
    expect(varselKortNavn('paaminne_7')).toBe('Påminnelse 7 dager')
    expect(varselKortNavn('kaaringspoll_ingen_stemmer')).toBe('Kåring uten stemmer')
    expect(varselKortNavn(null)).toBe('—')
    // Ukjent type skal vises som seg selv, ikke som tom rad
    expect(varselKortNavn('noe_helt_nytt')).toBe('noe_helt_nytt')
  })

  it('faller tilbake til DB-beskrivelsen og så nøkkelen i panelet', () => {
    expect(varselPanelNavn('mention')).toBe('@-mention i chat (til den som nevnes)')
    expect(varselPanelNavn('ukjent_noekkel', 'Beskrivelse fra DB')).toBe('Beskrivelse fra DB')
    expect(varselPanelNavn('ukjent_noekkel', null)).toBe('ukjent_noekkel')
  })

  // #767-review: de to nøkkelsettene skal være strukturelt disjunkte, ikke
  // bare tilfeldigvis ulike. Kolliderer de, vinner OEVRIGE_TEKSTER stille
  // (den spreades sist i VARSEL_TEKSTER) og symbolets egen panel/kort-tekst
  // fra lib/markering-symboler.ts blir overstyrt uten at noe feiler.
  // skipIf: SYMBOL_TEKSTER er tom i en klubb uten varslende symboler, og da
  // finnes det ingen kollisjon å teste (#767-review). Kravet om at settet er
  // ikke-tomt hørte til klubbens register, ikke til kontrakten.
  it.skipIf(SYMBOLER_VARSLER.length === 0)('symboltypene og de håndskrevne nøklene overlapper ikke', () => {
    const symbolNoekler = Object.keys(SYMBOL_TEKSTER)
    const haandskrevne = new Set(Object.keys(OEVRIGE_TEKSTER))
    expect(symbolNoekler.filter(n => haandskrevne.has(n))).toEqual([])
    // Og at ingenting forsvant i sammenslåingen — en kollisjon ville gitt
    // færre nøkler i VARSEL_TEKSTER enn summen av de to.
    expect(Object.keys(VARSEL_TEKSTER).length).toBe(symbolNoekler.length + haandskrevne.size)
  })

  // #767-review: migrasjon 152 slettet opprinnelig på mønsteret
  // `noekkel like '%_alert'`, en konvensjon ingenting i databasen håndhever —
  // en håndlaget bryter som tilfeldigvis endte på «_alert» ville røket med.
  // Den sletter nå ved navn, og denne vakten holder navnelisten lik den
  // migrasjon 151 faktisk satte inn.
  it('migrasjon 152 sletter nøyaktig radene migrasjon 151 seedet', () => {
    // Fila finnes under ulikt navn per klubb — klubbens 151 bærer et
    // klubbspesifikt symbolnavn, og en nedstrøms-instans har sin egen (#767).
    // Prefikset er det stabile, ikke resten av filnavnet.
    const fil151 = readdirSync(MIGRASJONER).find(f => f.startsWith('151_') && f.endsWith('.sql'))
    expect(fil151, 'migrasjon 151 skal finnes').toBeTruthy()
    const m151 = readFileSync(join(MIGRASJONER, fil151!), 'utf8')
    const m152 = readFileSync(join(MIGRASJONER, '152_symbol_format_check.sql'), 'utf8')

    const seedet = [...m151.matchAll(/\(\s*'([^']+)'\s*,\s*(?:true|false)\b/gi)].map(m => m[1])
    expect(seedet.length).toBeGreaterThan(0)

    const deleteSetning = m152.slice(m152.indexOf('delete from public.varsel_innstillinger'))
    const listen = deleteSetning.match(/noekkel in \(([^)]*)\)/i)
    expect(listen, 'delete-en skal liste nøklene ved navn, ikke matche et mønster').not.toBeNull()
    const slettet = [...listen![1].matchAll(/'([^']+)'/g)].map(m => m[1])

    expect(new Set(slettet)).toEqual(new Set(seedet))
    // aktiv = true-vilkåret står: en bryter admin har slått AV skal bli stående.
    expect(deleteSetning).toMatch(/aktiv\s*=\s*true/i)
  })

  it('utleder rekkefølgen fra tekst-tabellen, med test_modus sist', () => {
    expect(VARSEL_REKKEFOLGE).toEqual(Object.keys(VARSEL_TEKSTER))
    expect(VARSEL_REKKEFOLGE.at(-1)).toBe('test_modus')
    // Påminnelsene skal stå i synkende dag-rekkefølge, ikke alfabetisk
    expect(VARSEL_REKKEFOLGE.indexOf('paaminnelse_7d')).toBeLessThan(
      VARSEL_REKKEFOLGE.indexOf('paaminnelse_1d'),
    )
  })
})
