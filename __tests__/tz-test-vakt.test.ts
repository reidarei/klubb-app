// Pinner tolkEgenkontroll() i scripts/tz-test.mjs (#754) — den rene
// hjelperen som avgjør om en tidssone faktisk slo gjennom til Node, brukt av
// wrapperen FØR den lar vitest kjøre en eneste test i den sonen. Fila
// importerer kun den eksporterte, sideeffektfrie funksjonen — main() er gatet
// bak import.meta.url-sjekken i scriptet, så importen her trigger ingen
// prosess-spawning.
import { describe, it, expect } from 'vitest'
import { tolkEgenkontroll } from '@/scripts/tz-test.mjs'

describe('tolkEgenkontroll (#754)', () => {
  it('TZ strippet av MSYS — feltet mangler i egenkontroll-utdata → avvik', () => {
    // Dette er nøyaktig MSYS-symptomet fra issuet: barnet arvet aldri TZ,
    // så process.env.TZ er undefined og feltet er borte fra JSON-en.
    const raaUtdata = JSON.stringify({ resolved: 'Europe/Oslo' })
    const resultat = tolkEgenkontroll(raaUtdata, 'Pacific/Kiritimati')
    expect(resultat.ok).toBe(false)
    expect(resultat.avvik).toBeTruthy()
  })

  it('ugyldig IANA-sone resolves stille til Etc/Unknown → avvik', () => {
    // "Kiritimati" uten "Pacific/"-prefikset — Node kaster ikke, den
    // resolver bare til Etc/Unknown og klokka blir UTC. Like stille som
    // MSYS-bugen, annen synder.
    // Forventet sone er 'Kiritimati' — det er det wrapperen faktisk ber om
    // når noen skriver sonen feil. Da stemmer tz-sjekken, og avviket MÅ
    // komme fra resolved-sjekken; ellers ville testen passert selv om den
    // sjekken ble fjernet.
    const raaUtdata = JSON.stringify({ tz: 'Kiritimati', resolved: 'Etc/Unknown' })
    const resultat = tolkEgenkontroll(raaUtdata, 'Kiritimati')
    expect(resultat.ok).toBe(false)
    expect(resultat.avvik).toBeTruthy()
  })

  it('sonen slo faktisk gjennom — TZ og resolvet Intl-sone stemmer begge → ok', () => {
    const raaUtdata = JSON.stringify({ tz: 'Pacific/Kiritimati', resolved: 'Pacific/Kiritimati' })
    const resultat = tolkEgenkontroll(raaUtdata, 'Pacific/Kiritimati')
    expect(resultat.ok).toBe(true)
    expect(resultat.avvik).toBeNull()
  })
})
