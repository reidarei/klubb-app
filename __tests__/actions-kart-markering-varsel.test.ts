/**
 * Varselkontrakten for kartmarkeringer (#747, generalisert til et register i #759).
 *
 * e2e-testen «databasen godtar hvert symbol i registeret» beviser at
 * MARKERING_SYMBOLER og check-constrainten er i samsvar. Den sier ingenting om
 * hva som SKJER når et symbol settes — og det er den halvdelen som kan ryke
 * stille når noen senere fikler med registeret: et `varsel`-felt satt til null
 * (eller lagt PÅ et symbol som ikke skal pinge noen) gir ingen feil noe sted,
 * bare tolv telefoner som er tause eller tolv som ikke skulle plinget.
 *
 * Derfor pinnes begge retninger her, gjennom den ekte actionen:
 *  1. babe og milf varsler alle andre aktive, med hver sin tittel og type.
 *  2. Øl og Mat varsler INGEN — ingen sending, ikke engang et mottakeroppslag.
 *  3. Varselet er en bieffekt: markeringen står selv om sendingen ryker.
 *
 * Enhetstest og ikke e2e med vilje: kontrakten er argumentene til sendVarsel(),
 * ikke noe som er synlig i en nettleser, og e2e-budsjettet er knapt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

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

describe('settMarkering — varsel per symbol (#759)', () => {
  it('babe varsler alle andre aktive, med egen tittel og type', async () => {
    const res = await settMarkering(59.9139, 10.7522, '  Babe på hjørnet  ', 'babe')
    expect(res).toEqual({ ok: true })

    expect(sendVarsel).toHaveBeenCalledTimes(1)
    const v = sisteVarsel()

    // Mottakerutvalget: alle aktive UNNTATT den som markerte. Begge filtrene
    // asserteres, ikke bare resultatet — mocken returnerer uansett listen den
    // er rigget med, så uten dette ville en glemt .neq() vært usynlig her.
    expect(kall('eq')).toHaveBeenCalledWith('aktiv', true)
    expect(kall('neq')).toHaveBeenCalledWith('id', MEG)
    expect(v.mottakere).toEqual(ANDRE)

    // Literaler, ikke oppslag i MARKERING_SYMBOLER: en test som leser samme
    // register som koden ville vært grønn uansett hva som sto der.
    expect(v.tittel).toBe('BABE ALERT!')
    expect(v.type).toBe('babe_alert')
    expect(v.knappTekst).toBe('Vis på kartet')
    // Teksten er trimmet — det er den samme strengen som lagres.
    expect(v.melding).toBe('Babe på hjørnet')

    // Hver sighting er sin egen begivenhet: uten dette ville kveldens andre
    // babe blitt dedupet bort som «allerede varslet».
    expect(v.tillatDuplikat).toBe(true)

    // INGEN pushTag: en tag ville kollapset kveldens andre varsel inn i det
    // første på låseskjermen (sw.js, renotify: false) — nøyaktig motsatt av
    // det tillatDuplikat over er til for.
    expect(v.pushTag).toBeUndefined()

    // Lenken bærer koordinatet, ikke rad-id-en (#719). Origin utelates med
    // vilje: BASE_URL avhenger av miljøet testen kjører i.
    expect(v.url).toContain('/kart?lat=59.91390&lng=10.75220')
    expect(v.url).toContain('tekst=Babe')
  })

  it('milf varsler med SIN egen tittel og type, ikke babes', async () => {
    await settMarkering(59.9139, 10.7522, 'Milf i baren', 'milf')
    expect(sendVarsel).toHaveBeenCalledTimes(1)
    expect(sisteVarsel().tittel).toBe('MILF ALERT!')
    expect(sisteVarsel().type).toBe('milf_alert')
  })

  it.each(['ol', 'mat'])('%s varsler ingen', async symbol => {
    const res = await settMarkering(59.9139, 10.7522, 'Her er det', symbol)
    expect(res).toEqual({ ok: true })
    expect(sendVarsel).not.toHaveBeenCalled()
    // Heller ikke et mottakeroppslag: «møt meg her»-symbolene skal ikke røre
    // profiles i det hele tatt.
    expect(mockFrom).not.toHaveBeenCalledWith('profiles')
  })

  it('en varsel-feil velter ikke markeringen, men logges', async () => {
    sendVarsel.mockRejectedValue(new Error('push nede'))
    const res = await settMarkering(59.9139, 10.7522, 'Babe på hjørnet', 'babe')
    // Markeringen ER lagret på dette punktet — en grønn kvittering er sann.
    expect(res).toEqual({ ok: true })
    expect(loggFeil).toHaveBeenCalledWith('kart.babe.varsel.feilet', expect.any(Error))
  })

  it('et feilet mottakeroppslag logges og stopper sendingen, ikke markeringen', async () => {
    rigg({ profilFeil: { message: 'basen er nede' } })
    const res = await settMarkering(59.9139, 10.7522, 'Babe på hjørnet', 'babe')
    expect(res).toEqual({ ok: true })
    expect(sendVarsel).not.toHaveBeenCalled()
    expect(loggFeil).toHaveBeenCalledWith('kart.babe.mottakere.feilet', { message: 'basen er nede' })
  })
})
