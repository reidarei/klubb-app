import { describe, it, expect } from 'vitest'
import { parseTimeplanTekst } from '@/lib/timeplan-parse'

// Testtabellen fra arkitekturstyrets runde 2 (issue #716) — dette ER
// akseptansekriteriet for parseren, ikke bare en smoke test. Se filhode-
// kommentaren i lib/timeplan-parse.ts for de tre reglene som bærer designet.
describe('parseTimeplanTekst', () => {
  it.each([
    ['17:00 Middag på Lorry', '17:00', 'Middag på Lorry'],
    ['1700 middag', '17:00', 'middag'],
    ['17 middag', '17:00', 'middag'],
    ['17.30 avgang', '17:30', 'avgang'],
    ['0900 avreise', '09:00', 'avreise'],
    ['klokka 12 lunsj', '12:00', 'lunsj'],
    ['kl. 9 frokost', '09:00', 'frokost'],
    // Klokka må avsluttes av mellomrom eller strengslutt — «7:5» matcher
    // ikke «HH:mm», og hele matchen skal ryke i stedet for å gi 07:00 pluss
    // «:5 middag» som resttekst.
    ['7:5 middag', null, '7:5 middag'],
    // Valideringsfeil (hh > 23) gir HELE originalstrengen tilbake — vi
    // klamper aldri 25:00 til 23:00.
    ['25:00 fest', null, '25:00 fest'],
    // Valideringsfeil (mm > 59).
    ['17:60 noe', null, '17:60 noe'],
    // «Klokkeslett bakerst» støttes bevisst ikke.
    ['middag 17:00', null, 'middag 17:00'],
    ['middag', null, 'middag'],
    // Ingen mellomrom mellom klokke og tekst — lookahead-vakten avviser hele
    // matchen i stedet for å gjette hvor klokka slutter.
    ['1730middag', null, '1730middag'],
  ])('«%s» → klokke %s, tekst %j', (input, klokke, tekst) => {
    expect(parseTimeplanTekst(input)).toEqual({ klokke, tekst })
  })

  it('gir tom tekst for en linje som bare er et klokkeslett', () => {
    // Parseren avviser ikke selv — det er opp til skjemaet/actionen å nekte
    // en tom beskrivelse. «17:00» tolkes fint til klokke 17:00, tekst ''.
    expect(parseTimeplanTekst('17:00')).toEqual({ klokke: '17:00', tekst: '' })
  })

  it('strippes klokka fra teksten når den blir tolket', () => {
    // Uten denne regelen ville raden lest «17:00 17:00 Middag».
    const r = parseTimeplanTekst('17:00 17:00 Middag')
    expect(r.klokke).toBe('17:00')
    expect(r.tekst).toBe('17:00 Middag')
  })

  it('bevisst akseptert tvetydighet: «1 øl» tolkes som klokka 01:00', () => {
    // Ingen heuristikk mot dette — live-ekkoet i skjemaet viser tolkningen
    // før han sender. Regelen skal være forutsigbar, ikke smart.
    expect(parseTimeplanTekst('1 øl')).toEqual({ klokke: '01:00', tekst: 'øl' })
  })

  it('tom streng gir ingen klokke', () => {
    expect(parseTimeplanTekst('')).toEqual({ klokke: null, tekst: '' })
  })

  it('trimmer omkringliggende mellomrom før tolkning', () => {
    expect(parseTimeplanTekst('   17:00   Middag  ')).toEqual({
      klokke: '17:00',
      tekst: 'Middag',
    })
  })
})
