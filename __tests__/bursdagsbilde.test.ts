import { describe, it, expect } from 'vitest'
import {
  nesteFeiringsdato,
  byggBursdagsprompt,
  statusForFeilklasse,
  tellerSomFeil,
} from '@/lib/bursdagsbilde'
import type { VertexFeilKlasse } from '@/lib/vertex'

describe('nesteFeiringsdato', () => {
  it('en bursdag senere i året gir årets dato', () => {
    expect(nesteFeiringsdato('1980-09-10', '2026-09-04')).toBe('2026-09-10')
  })

  it('bursdagsdagen selv teller som neste', () => {
    expect(nesteFeiringsdato('1980-09-10', '2026-09-10')).toBe('2026-09-10')
  })

  it('en passert bursdag ruller til neste år', () => {
    expect(nesteFeiringsdato('1980-03-02', '2026-09-04')).toBe('2027-03-02')
  })

  // Kjernen i BLOCKER-funnet: uten skuddårsregelen ble strengen «2027-02-29»
  // bygget — en dato som ikke finnes, som Postgres avviser på en `date`-
  // parameter, og som uansett aldri hadde truffet raden cron skriver 1. mars.
  it('29. februar feires 1. mars i et ikke-skuddår', () => {
    expect(nesteFeiringsdato('1984-02-29', '2027-01-10')).toBe('2027-03-01')
  })

  it('29. februar beholdes i et skuddår', () => {
    expect(nesteFeiringsdato('1984-02-29', '2028-01-10')).toBe('2028-02-29')
  })

  it('29. februar ruller til neste år etter at 1. mars er passert', () => {
    expect(nesteFeiringsdato('1984-02-29', '2027-06-01')).toBe('2028-02-29')
  })

  // Invariant cron hviler på: for en mann finnBursdagsbarn() returnerer på
  // dato D, MÅ neste feiringsdato være nøyaktig D — ellers ville cron skrevet
  // raden sin på en annen nøkkel enn den agendakortet og admin leser.
  it('gir passdatoen tilbake for en 29. februar-mann på 1. mars', () => {
    expect(nesteFeiringsdato('1984-02-29', '2027-03-01')).toBe('2027-03-01')
  })
})

describe('byggBursdagsprompt', () => {
  it('inneholder navn og alder', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola Testesen', alder: 45, stikkord: [] })
    expect(prompt).toContain('Ola Testesen')
    expect(prompt).toContain('45')
  })

  it('tom stikkordliste gir ingen stikkord-setning og ingen fallback-tekst', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 30, stikkord: [] })
    expect(prompt.toLowerCase()).not.toContain('personal traits')
    expect(prompt.toLowerCase()).not.toContain('weave in')
  })

  it('stikkord vevs inn i prompten når de finnes', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 30, stikkord: ['fisking', 'gitar'] })
    expect(prompt).toContain('fisking')
    expect(prompt).toContain('gitar')
  })

  it('linjeskift i navn/stikkord fjernes', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola\nTestesen', alder: 30, stikkord: ['fis\nking'] })
    expect(prompt).not.toContain('\n')
  })
})

describe('statusForFeilklasse', () => {
  it('blokkert er den eneste terminale klassen (avvist)', () => {
    expect(statusForFeilklasse('blokkert')).toBe('avvist')
  })

  // 'ugyldig' er bevisst reclaimable inntil integrasjonen er verifisert mot
  // ekte API én gang — er request-formen vår feil, ville en terminal
  // 'avvist'-rad per mann bare kunne repareres via admins tving-knapp.
  it('auth, kvote, transient og ugyldig er reclaimable (feilet)', () => {
    const reclaimable: VertexFeilKlasse[] = ['auth', 'kvote', 'transient', 'ugyldig']
    for (const klasse of reclaimable) {
      expect(statusForFeilklasse(klasse)).toBe('feilet')
    }
  })
})

describe('tellerSomFeil', () => {
  it('blokkert teller ikke som feil', () => {
    expect(tellerSomFeil('blokkert')).toBe(false)
  })

  it('alle andre klasser teller som feil', () => {
    const andre: VertexFeilKlasse[] = ['auth', 'kvote', 'ugyldig', 'transient']
    for (const klasse of andre) {
      expect(tellerSomFeil(klasse)).toBe(true)
    }
  })
})
