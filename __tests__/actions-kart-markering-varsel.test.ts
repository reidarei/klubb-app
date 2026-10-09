/**
 * Varselkontrakten for kartmarkeringer (#747, #759, #767).
 *
 * e2e beviser at registeret og check-constrainten er i samsvar, men ikke hva
 * som SKJER når et symbol settes: et feil `varsel`-felt gir ingen feil, bare
 * tause telefoner eller pling som ikke skulle kommet. Pinnes her gjennom den
 * ekte actionen:
 *  1. Hvert varslende symbol varsler alle andre aktive med SIN tittel og type,
 *     lest fra registeret (en literal-test ville vært grønn uansett).
 *  2. Tittel og type er unike på tvers av varslende symboler.
 *  3. Stille symboler varsler ingen — ikke engang mottakeroppslag.
 *  4. Varselet er en bieffekt: markeringen står selv om sendingen ryker.
 *
 * Fila er MÅ MATCHE (klubb-app), registeret er klubbens eget. Eneste krav er
 * minst ett symbol; ingen kategori er påkrevd, så prøvene hopper over seg selv
 * når kategorien er tom.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'
import { MARKERING_SYMBOLER, SYMBOLER_VARSLER, SYMBOLER_STILLE } from '@/lib/markering-symboler'

const MEG = '00000000-0000-4000-8000-00000000meg1'
const ANDRE = ['profil-2', 'profil-3']

const { mockFrom, mockSupabase, sendVarsel, loggFeil, finnPaagaaende } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  return {
    mockFrom,
    mockSupabase: { from: mockFrom },
    sendVarsel: vi.fn(),
    loggFeil: vi.fn(),
    finnPaagaaende: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: mockSupabase, user: { id: MEG } }),
}))
vi.mock('@/lib/varsler', () => ({ sendVarsel }))
vi.mock('@/lib/logg', () => ({ logg: { feil: loggFeil, warn: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Uten pågående arrangement faller `utloper` til timesvinduet — ingen tur å rigge.
vi.mock('@/lib/posisjon', () => ({ finnPaagaaendeArrangement: finnPaagaaende }))

const { settMarkering } = await import('@/lib/actions/kart-markering')

/** Chainen profiles-oppslaget går gjennom — vi leser filtrene av den. */
let profilChain: Record<string, unknown>

function rigg({
  profiler = ANDRE.map(id => ({ id })),
  profilFeil = null as unknown,
  tilpasninger = [] as unknown[],
}) {
  profilChain = lagChain(profiler, profilFeil)
  mockFrom.mockImplementation((tabell: string) => {
    if (tabell === 'profiles') return profilChain
    if (tabell === 'kart_symbol_tilpasning') return lagChain(tilpasninger)
    return lagChain([])
  })
}

type VarselArg = {
  mottakere?: string[]
  tittel: string
  melding: string
  url?: string
  knappTekst?: string
  type: string
  tillatDuplikat?: boolean
  pushTag?: string
}

function sisteVarsel(): VarselArg {
  return sendVarsel.mock.calls.at(-1)![0] as VarselArg
}

/** vi.fn()-en bak et navn på chainen, så filtrene kan asserteres. */
function kall(navn: string) {
  return profilChain[navn] as ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  // mockReset: clearAllMocks rører ikke implementasjonen, så en mockRejectedValue
  // ville lekket til neste test.
  sendVarsel.mockReset().mockResolvedValue(undefined)
  loggFeil.mockReset().mockResolvedValue(undefined)
  finnPaagaaende.mockReset().mockResolvedValue(null)
  rigg({})
})

// Uten et eneste symbol finnes ingen STANDARD_SYMBOL, og velgeren står tom.
// Fordelingen stille/varslende er klubbens valg og pinnes ikke.
describe('symbolregisteret', () => {
  it('har minst ett symbol', () => {
    expect(MARKERING_SYMBOLER.length).toBeGreaterThan(0)
  })
})

// skipIf framfor tom it.each(): en skip synes i rapporten, en tom it.each() er
// en usynlig grønn no-op. På describe-nivå fordi Vitest feiler en tom suite.
const HAR_VARSLENDE = SYMBOLER_VARSLER.length > 0
const HAR_STILLE = SYMBOLER_STILLE.length > 0

/**
 * Typenøklene er PERSISTENTE databasenøkler (#767): de står i
 * varsel_innstillinger.noekkel og varsel_logg.type. Endres typen uten id-en,
 * blir en AV-bryter foreldreløs og varslene går ut igjen uten at noe feiler.
 * Matriseprøvene kan ikke fange det (kode og forventning flytter seg i takt).
 *
 * Registeret er klubbens eget (DIVERGERER), så strukturen pinnes i stedet for
 * literaler: typen er alltid id-en + '_alert'.
 */
describe.skipIf(!HAR_VARSLENDE)('symbol-varseltypene er persistente databasenøkler', () => {
  it.each(SYMBOLER_VARSLER.map(s => [s.id, s.varsel.type] as const))(
    '%s har en type avledet av id-en (%s)',
    (id, type) => {
      expect(type).toBe(`${id}_alert`)
    },
  )
})

describe.skipIf(!HAR_VARSLENDE)('settMarkering — varsel per symbol (#759/#767)', () => {
  it.each(SYMBOLER_VARSLER.map(s => [s.id, s.varsel] as const))(
    '%s varsler alle andre aktive, med SIN EGEN tittel og type',
    async (id, varsel) => {
      const res = await settMarkering(59.9139, 10.7522, `  Noe ved ${id}  `, id)
      expect(res).toEqual({ ok: true })

      expect(sendVarsel).toHaveBeenCalledTimes(1)
      const v = sisteVarsel()

      // Filtrene asserteres, ikke bare resultatet: mocken returnerer riggen
      // uansett, så en glemt .neq() ville vært usynlig.
      expect(kall('eq')).toHaveBeenCalledWith('aktiv', true)
      expect(kall('neq')).toHaveBeenCalledWith('id', MEG)
      expect(v.mottakere).toEqual(ANDRE)

      expect(v.tittel).toBe(varsel.tittel)
      expect(v.type).toBe(varsel.type)
      expect(v.knappTekst).toBe('Vis på kartet')
      // Trimmet — samme streng som lagres.
      expect(v.melding).toBe(`Noe ved ${id}`)

      // Hver sighting er egen begivenhet; ellers dedupes kveldens andre bort.
      expect(v.tillatDuplikat).toBe(true)

      // Ingen pushTag: den ville kollapset kveldens andre varsel inn i det
      // første på låseskjermen (sw.js, renotify: false).
      expect(v.pushTag).toBeUndefined()

      // Koordinatet, ikke rad-id-en (#719). Origin utelatt: BASE_URL er miljøavhengig.
      expect(v.url).toContain('/kart?lat=59.91390&lng=10.75220')
    },
  )

  it('tittel og type er unike på tvers av SYMBOLER_VARSLER', () => {
    const titler = SYMBOLER_VARSLER.map(s => s.varsel.tittel)
    const typer = SYMBOLER_VARSLER.map(s => s.varsel.type)
    // Delt tittel: umulig å skille i innboksen. Delt type: kolliderer i
    // varsel_logg.type og admin-bryteren.
    expect(new Set(titler).size).toBe(titler.length)
    expect(new Set(typer).size).toBe(typer.length)
  })

  // Admin har døpt om symbolet (/innstillinger/kart): tittelen følger, typen står.
  it('tittelen følger navnet admin har gitt symbolet', async () => {
    const [{ id, varsel }] = SYMBOLER_VARSLER.map(s => ({ id: s.id, varsel: s.varsel }))
    rigg({ tilpasninger: [{ symbol: id, etikett: 'Hjort', emoji: '🦌' }] })
    const res = await settMarkering(59.9139, 10.7522, 'Noe å se', id)
    expect(res).toEqual({ ok: true })
    expect(sisteVarsel().tittel).toBe('HJORT ALERT!')
    expect(sisteVarsel().type).toBe(varsel.type)
  })

  it('en varsel-feil velter ikke markeringen, men logges', async () => {
    const [{ id, varsel }] = SYMBOLER_VARSLER.map(s => ({ id: s.id, varsel: s.varsel }))
    sendVarsel.mockRejectedValue(new Error('push nede'))
    const res = await settMarkering(59.9139, 10.7522, 'Noe å se', id)
    // Markeringen ER lagret — en grønn kvittering er sann.
    expect(res).toEqual({ ok: true })
    expect(loggFeil).toHaveBeenCalledWith(varsel.loggVarsel, expect.any(Error))
  })

  it('et feilet mottakeroppslag logges og stopper sendingen, ikke markeringen', async () => {
    const [{ id, varsel }] = SYMBOLER_VARSLER.map(s => ({ id: s.id, varsel: s.varsel }))
    rigg({ profilFeil: { message: 'basen er nede' } })
    const res = await settMarkering(59.9139, 10.7522, 'Noe å se', id)
    expect(res).toEqual({ ok: true })
    expect(sendVarsel).not.toHaveBeenCalled()
    expect(loggFeil).toHaveBeenCalledWith(varsel.loggMottakere, { message: 'basen er nede' })
  })
})

// Egen suite: en klubb uten varslende symboler skal ikke miste stille-dekningen.
describe.skipIf(!HAR_STILLE)('settMarkering — stille symboler (#759/#767)', () => {
  it.each(SYMBOLER_STILLE.map(s => s.id))('%s varsler ingen', async id => {
    const res = await settMarkering(59.9139, 10.7522, 'Her er det', id)
    expect(res).toEqual({ ok: true })
    expect(sendVarsel).not.toHaveBeenCalled()
    // Heller ikke et mottakeroppslag i profiles.
    expect(mockFrom).not.toHaveBeenCalledWith('profiles')
  })
})
