/**
 * oppdaterVarselInnstilling — skrivingen av én varselbryter (#767-review).
 *
 * Tre ting pinnes, som alle var udekket da runden startet:
 *  1. Autorisasjon går gjennom ensureAdmin() (Policy: Auth), ikke gjennom en
 *     service-role-klient som omgår RLS. Kaster den, skjer det ingen skriving.
 *  2. Upserten bærer KUN noekkel/aktiv/oppdatert. PostgREST setter bare
 *     payloadens egne kolonner i konfliktgrenen, så en bryterendring kan ikke
 *     nulle beskrivelse (test_modus sin test-epost) eller dager_foer (7 og 1
 *     på påminnelsesradene). Payload-assertion er det enhetsnivået rekker —
 *     at databasen faktisk oppfører seg slik er verifisert mot test-instansen.
 *  3. Begge feilbanene kaster i stedet for å melde suksess: en avvist
 *     autorisasjon og en feilet skriving.
 *  4. Vakten slipper kun gjennom faktiske BRYTERE — ikke en historikk-only
 *     oppføring som bursdagsgratulasjon, og ikke Object.prototype.
 *
 * At actionen KASTER (og ikke returnerer et resultat som oppdaterTestEpost)
 * er bevisst og uendret: VarselToggle awaiter kallet i en transition, og en
 * bryter som ikke ble lagret skal vise feilskjerm, ikke en grønn løgn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SYMBOLER_VARSLER } from '@/lib/markering-symboler'

const { mockFrom, mockSupabase, mockUpsert, ensureAdmin, revalidatePath } = vi.hoisted(() => {
  const mockUpsert = vi.fn()
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert }))
  return {
    mockUpsert,
    mockFrom,
    mockSupabase: { from: mockFrom },
    ensureAdmin: vi.fn(),
    revalidatePath: vi.fn(),
  }
})

vi.mock('@/lib/auth', () => ({ ensureAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth-cache', () => ({ getProfil: vi.fn(), getInnloggetBruker: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath }))

// Modulnivå-import, ikke await import() i testkroppen — se begrunnelsen i
// actions-test-epost.test.ts (transform-kostnad under 5s-timeouten).
const { oppdaterVarselInnstilling } = await import('@/app/(app)/innstillinger/actions')

beforeEach(() => {
  vi.clearAllMocks()
  ensureAdmin.mockResolvedValue({ supabase: mockSupabase, user: { id: 'admin-1' }, profil: { rolle: 'admin' } })
  mockUpsert.mockResolvedValue({ error: null })
})

/** Payloaden og opsjonene upserten faktisk ble kalt med. */
function upsertKall() {
  const [rad, opts] = mockUpsert.mock.calls.at(-1)!
  return { rad, opts }
}

describe('oppdaterVarselInnstilling', () => {
  // skipIf: varslende symboler er en VALGFRI kategori i klubbens register
  // (#767-review), og en klubb uten dem har ingen slik type å prøve upserten
  // med. Resten av upsert-kontrakten dekkes av prøvene under, som bruker
  // faste, registeruavhengige nøkler.
  it.skipIf(SYMBOLER_VARSLER.length === 0)('oppretter raden når den mangler — ett upsert-kall, ingen les-før-skriv', async () => {
    // Dette er hele grunnen til upsert: migrasjon 152 slutter å seede rader
    // for symbol-avledede typer, så FØRSTE klikk på bryteren er et insert.
    // En update() ville vært en stille no-op med 0 rader og ingen feil.
    // Nøkkelen er hentet fra registeret, ikke en literal (#767) — en
    // hvilken som helst SYMBOLER_VARSLER-type er nettopp typen migrasjon 152
    // slutter å seede, som er hele poenget testen skal bevise.
    const symbolType = SYMBOLER_VARSLER[0].varsel.type
    await oppdaterVarselInnstilling(symbolType, false)

    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('varsel_innstillinger')
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const { rad, opts } = upsertKall()
    expect(rad).toMatchObject({ noekkel: symbolType, aktiv: false })
    expect(opts).toEqual({ onConflict: 'noekkel' })
    expect(revalidatePath).toHaveBeenCalledWith('/innstillinger')
  })

  it('rører ingen andre kolonner enn aktiv og oppdatert', async () => {
    await oppdaterVarselInnstilling('test_modus', true)
    const { rad } = upsertKall()
    // Eksakt nøkkelsett, ikke bare «har ikke beskrivelse»: en ny kolonne som
    // smugler seg inn i payloaden senere skal også velte denne testen.
    expect(Object.keys(rad).sort()).toEqual(['aktiv', 'noekkel', 'oppdatert'])
    // Navngitt likevel — det er disse to feltene som faktisk har hatt verdier
    // å miste: test_modus sin test-epost og påminnelsenes 7/1.
    expect(rad).not.toHaveProperty('beskrivelse')
    expect(rad).not.toHaveProperty('dager_foer')
  })

  it('setter oppdatert-tidsstempelet', async () => {
    await oppdaterVarselInnstilling('mention', false)
    const { rad } = upsertKall()
    expect(typeof rad.oppdatert).toBe('string')
    expect(Number.isNaN(Date.parse(rad.oppdatert))).toBe(false)
  })

  it('kaster på ukjent nøkkel, uten å røre databasen', async () => {
    await expect(oppdaterVarselInnstilling('finnes_ikke', true)).rejects.toThrow(
      'Ukjent varsel-innstilling: finnes_ikke',
    )
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('avviser en historikk-only type som ikke har noen bryter', async () => {
    // bursdagsgratulasjon står i VARSEL_TEKSTER kun for å gi gamle
    // varsel_logg-rader et navn (#643) og har bevisst ingen `panel`. En vakt
    // som bare spurte «finnes nøkkelen i registeret?» slapp den gjennom, og
    // upserten kunne opprettet en rad som dukket opp i kontrollpanelet som en
    // bryter uten etikett (#767-review). Den skal avvises på linje med en
    // ukjent nøkkel — og uten å røre databasen.
    await expect(oppdaterVarselInnstilling('bursdagsgratulasjon', true)).rejects.toThrow(
      'Ukjent varsel-innstilling: bursdagsgratulasjon',
    )
    expect(mockFrom).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('godtar ikke arvede Object-egenskaper som nøkkel', async () => {
    // `'toString' in VARSEL_TEKSTER` er sant — den gamle in-sjekken slapp
    // gjennom hele Object.prototype og kunne opprettet en rad ved navn
    // «toString» i tabellen.
    for (const arvet of ['toString', 'constructor', 'valueOf', '__proto__']) {
      await expect(oppdaterVarselInnstilling(arvet, true)).rejects.toThrow('Ukjent varsel-innstilling')
    }
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('kaster når autorisasjonen avvises, uten å skrive', async () => {
    ensureAdmin.mockRejectedValue(new Error('Ikke admin'))
    await expect(oppdaterVarselInnstilling('mention', false)).rejects.toThrow('Ikke admin')
    expect(mockFrom).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('kaster når skrivingen feiler, og revaliderer ikke', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'skriving avvist' } })
    await expect(oppdaterVarselInnstilling('mention', false)).rejects.toThrow(
      /Kunne ikke lagre varsel-innstilling «mention».*skriving avvist/,
    )
    // Revalidering etter en feilet skriving ville tegnet siden på nytt med den
    // gamle verdien og fått bryteren til å se ut som den spratt tilbake.
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
