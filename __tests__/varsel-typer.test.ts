import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  VARSEL_TEKSTER,
  VARSEL_REKKEFOLGE,
  typeTilNoekkel,
  varselPanelNavn,
  varselKortNavn,
} from '@/lib/varsel-typer'

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

describe('varsel-typer', () => {
  it('har norsk panel-etikett for hver bryter som finnes i databasen', () => {
    const utenEtikett = noeklerFraMigrasjoner().filter(n => !VARSEL_TEKSTER[n]?.panel)
    expect(utenEtikett).toEqual([])
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

  it('utleder rekkefølgen fra tekst-tabellen, med test_modus sist', () => {
    expect(VARSEL_REKKEFOLGE).toEqual(Object.keys(VARSEL_TEKSTER))
    expect(VARSEL_REKKEFOLGE.at(-1)).toBe('test_modus')
    // Påminnelsene skal stå i synkende dag-rekkefølge, ikke alfabetisk
    expect(VARSEL_REKKEFOLGE.indexOf('paaminnelse_7d')).toBeLessThan(
      VARSEL_REKKEFOLGE.indexOf('paaminnelse_1d'),
    )
  })
})
