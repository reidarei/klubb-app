/**
 * Varselkontrakten for kartmarkeringer (#747, generalisert til et register i
 * #759, gjort registerdrevet i #767).
 *
 * e2e-testen «databasen godtar hvert symbol i registeret» beviser at
 * MARKERING_SYMBOLER og check-constrainten er i samsvar. Den sier ingenting om
 * hva som SKJER når et symbol settes — og det er den halvdelen som kan ryke
 * stille når noen senere fikler med registeret: et `varsel`-felt satt til null
 * (eller lagt PÅ et symbol som ikke skal pinge noen) gir ingen feil noe sted,
 * bare tolv telefoner som er tause eller tolv som ikke skulle plinget.
 *
 * Derfor pinnes begge retninger her, gjennom den ekte actionen:
 *  1. Hvert symbol i SYMBOLER_VARSLER varsler alle andre aktive, med SIN EGEN
 *     tittel og type — lest fra registeret, ikke literaler (#767). En literal-
 *     test ville vært grønn uansett hva registeret faktisk inneholder.
 *  2. Tittel og type er unike på tvers av SYMBOLER_VARSLER — to symboler som
 *     deler tittel eller type ville gjort et varsel umulig å skille fra et
 *     annet i innboksen, og en dedup-nøkkel som utilsiktet kolliderer.
 *  3. Symbolene i SYMBOLER_STILLE varsler INGEN — ingen sending, ikke engang
 *     et mottakeroppslag.
 *  4. Varselet er en bieffekt: markeringen står selv om sendingen ryker.
 *
 * Fila er MÅ MATCHE og speiles til klubb-app, mens registeret den leser er
 * klubbens eget. Kontrakten den måles mot er derfor bare denne: registeret
 * har minst ETT symbol, og INGEN kategori er påkrevd — null varslende
 * symboler er en gyldig klubbkonfigurasjon for en klubb som ikke vil ha
 * pling (#767-review). Prøvene under avleder hva de kjører mot og hopper
 * over seg selv når kategorien de trenger er tom; et krav om at en valgfri
 * kategori finnes ville vært en skjult kontrakt.
 *
 * Enhetstest og ikke e2e med vilje: kontrakten er argumentene til sendVarsel(),
 * ikke noe som er synlig i en nettleser, og e2e-budsjettet er knapt.
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
// Ikke et pågående arrangement: da faller `utloper` til timesvinduet, og
// testene slipper å rigge en tur for å komme fram til varsel-delen.
vi.mock('@/lib/posisjon', () => ({ finnPaagaaendeArrangement: finnPaagaaende }))

const { settMarkering } = await import('@/lib/actions/kart-markering')

/** Chainen profiles-oppslaget går gjennom — vi leser filtrene av den. */
let profilChain: Record<string, unknown>

function rigg({ profiler = ANDRE.map(id => ({ id })), profilFeil = null as unknown }) {
  profilChain = lagChain(profiler, profilFeil)
  mockFrom.mockImplementation((tabell: string) => {
    if (tabell === 'profiles') return profilChain
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
  // mockReset og ikke bare clear: en test som rigger mockRejectedValue ville
  // ellers latt avvisningen lekke videre til neste test (clearAllMocks rører
  // ikke implementasjonen).
  sendVarsel.mockReset().mockResolvedValue(undefined)
  loggFeil.mockReset().mockResolvedValue(undefined)
  finnPaagaaende.mockReset().mockResolvedValue(null)
  rigg({})
})

// Den ene kontrakten som gjelder ethvert register: minst ett symbol. Uten et
// eneste symbol finnes det ingen STANDARD_SYMBOL å falle tilbake til, og
// symbolvelgeren står tom. Fordelingen mellom stille og varslende er derimot
// klubbens eget valg, og pinnes ikke her.
describe('symbolregisteret', () => {
  it('har minst ett symbol', () => {
    expect(MARKERING_SYMBOLER.length).toBeGreaterThan(0)
  })
})

// skipIf framfor en tom it.each(): en tom it.each() er en usynlig, grønn
// no-op, mens en skip står i rapporten med navn og grunn. Betingelsen står
// på describe-nivå og ikke per test fordi Vitest feiler en suite som ender
// opp uten en eneste registrert test («No test found in suite»).
const HAR_VARSLENDE = SYMBOLER_VARSLER.length > 0
const HAR_STILLE = SYMBOLER_STILLE.length > 0

/**
 * Kontraktstester: typenøklene er PERSISTENTE, ikke presentasjon (#767-review).
 *
 * Matriseprøvene under leser registeret, og det er riktig for ATFERDEN — men
 * de kan aldri fange at selve nøkkelen endres, fordi produksjonskode og
 * forventning da leser samme verdi og begge flytter seg i takt. Nøkkelen
 * lever imidlertid utenfor koden: den står i varsel_innstillinger.noekkel
 * (bryteren admin har slått av) og i varsel_logg.type (historikken). Endres
 * typen utilsiktet uten at id-en endres i samme håndgrep, blir en
 * eksisterende AV-bryter foreldreløs, og den «nye» typen faller tilbake til
 * aktiv — varsler går ut til alle igjen, uten at noe feiler.
 *
 * Symbolregisteret er klubbens eget (lib/klubb-symboler.ts, DIVERGERER,
 * #767) — denne fila er MÅ MATCHE og kan derfor ikke pinne klubbens
 * egne id-er/typer som literaler, slik den gjorde før filsplitten. I
 * stedet pinnes STRUKTUREN, gyldig for ethvert register:
 * typen er alltid id-en pluss suffikset '_alert'. Endres typen uavhengig av
 * id-en — eller omvendt — feiler testen, uansett hvilken klubbs register
 * den kjører mot.
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

      // Mottakerutvalget: alle aktive UNNTATT den som markerte. Begge filtrene
      // asserteres, ikke bare resultatet — mocken returnerer uansett listen den
      // er rigget med, så uten dette ville en glemt .neq() vært usynlig her.
      expect(kall('eq')).toHaveBeenCalledWith('aktiv', true)
      expect(kall('neq')).toHaveBeenCalledWith('id', MEG)
      expect(v.mottakere).toEqual(ANDRE)

      // Lest fra registeret, ikke literaler: en test som hardkoder samme
      // strenger som koden ville vært grønn uansett hva registeret sier.
      expect(v.tittel).toBe(varsel.tittel)
      expect(v.type).toBe(varsel.type)
      expect(v.knappTekst).toBe('Vis på kartet')
      // Teksten er trimmet — det er den samme strengen som lagres.
      expect(v.melding).toBe(`Noe ved ${id}`)

      // Hver sighting er sin egen begivenhet: uten dette ville kveldens andre
      // varsel av samme symbol blitt dedupet bort som «allerede varslet».
      expect(v.tillatDuplikat).toBe(true)

      // INGEN pushTag: en tag ville kollapset kveldens andre varsel inn i det
      // første på låseskjermen (sw.js, renotify: false) — nøyaktig motsatt av
      // det tillatDuplikat over er til for.
      expect(v.pushTag).toBeUndefined()

      // Lenken bærer koordinatet, ikke rad-id-en (#719). Origin utelates med
      // vilje: BASE_URL avhenger av miljøet testen kjører i.
      expect(v.url).toContain('/kart?lat=59.91390&lng=10.75220')
    },
  )

  it('tittel og type er unike på tvers av SYMBOLER_VARSLER', () => {
    const titler = SYMBOLER_VARSLER.map(s => s.varsel.tittel)
    const typer = SYMBOLER_VARSLER.map(s => s.varsel.type)
    // To symboler som deler tittel ville gjort et varsel umulig å skille fra
    // et annet i push/epost-innboksen. To som deler type ville kollidert i
    // varsel_logg.type og i admin-kontrollpanelets bryter (samme rad for to
    // symboler).
    expect(new Set(titler).size).toBe(titler.length)
    expect(new Set(typer).size).toBe(typer.length)
  })

  it('en varsel-feil velter ikke markeringen, men logges', async () => {
    const [{ id, varsel }] = SYMBOLER_VARSLER.map(s => ({ id: s.id, varsel: s.varsel }))
    sendVarsel.mockRejectedValue(new Error('push nede'))
    const res = await settMarkering(59.9139, 10.7522, 'Noe å se', id)
    // Markeringen ER lagret på dette punktet — en grønn kvittering er sann.
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

// Egen suite, ikke en prøve inne i varsel-suiten over: de to kategoriene er
// uavhengige, og en klubb uten varslende symboler skal ikke miste
// stille-dekningen sin på kjøpet.
describe.skipIf(!HAR_STILLE)('settMarkering — stille symboler (#759/#767)', () => {
  it.each(SYMBOLER_STILLE.map(s => s.id))('%s varsler ingen', async id => {
    const res = await settMarkering(59.9139, 10.7522, 'Her er det', id)
    expect(res).toEqual({ ok: true })
    expect(sendVarsel).not.toHaveBeenCalled()
    // Heller ikke et mottakeroppslag: «møt meg her»-symbolene skal ikke røre
    // profiles i det hele tatt.
    expect(mockFrom).not.toHaveBeenCalledWith('profiles')
  })
})
