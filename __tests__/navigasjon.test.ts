import { describe, it, expect } from 'vitest'
import { erChatTab, erKartSide, draNedForOppdaterAv } from '@/lib/navigasjon'

describe('navigasjon – erChatTab', () => {
  it('gjenkjenner chat- og samtale-ruter', () => {
    expect(erChatTab('/chat')).toBe(true)
    expect(erChatTab('/chat/123')).toBe(true)
    expect(erChatTab('/samtaler')).toBe(true)
    expect(erChatTab('/samtaler/1')).toBe(true)
  })

  it('avviser ruter som kun deler prefiks (streng segment-grense)', () => {
    expect(erChatTab('/chatterom')).toBe(false)
    expect(erChatTab('/samtalerom')).toBe(false)
  })
})

describe('navigasjon – erKartSide', () => {
  it('gjenkjenner kartsiden', () => {
    expect(erKartSide('/kart')).toBe(true)
    expect(erKartSide('/kart/noe')).toBe(true)
  })

  it('avviser ruter som kun deler prefiks (streng segment-grense)', () => {
    expect(erKartSide('/kartotek')).toBe(false)
    expect(erKartSide('/karting')).toBe(false)
    expect(erKartSide('/')).toBe(false)
  })
})

describe('navigasjon – draNedForOppdaterAv', () => {
  it('deaktiverer dra-ned-for-oppdater på kart- og chat-rutene', () => {
    expect(draNedForOppdaterAv('/kart')).toBe(true)
    expect(draNedForOppdaterAv('/kart/noe')).toBe(true)
    expect(draNedForOppdaterAv('/chat')).toBe(true)
    expect(draNedForOppdaterAv('/chat/123')).toBe(true)
    expect(draNedForOppdaterAv('/samtaler')).toBe(true)
    expect(draNedForOppdaterAv('/samtaler/1')).toBe(true)
  })

  it('lar pull-to-refresh virke som før på resten av appen', () => {
    expect(draNedForOppdaterAv('/')).toBe(false)
    expect(draNedForOppdaterAv('/arrangementer')).toBe(false)
    expect(draNedForOppdaterAv('/arrangementer/123')).toBe(false)
    expect(draNedForOppdaterAv('/klubbinfo')).toBe(false)
    expect(draNedForOppdaterAv('/album')).toBe(false)
    expect(draNedForOppdaterAv('/tidligere')).toBe(false)
    expect(draNedForOppdaterAv('/profil')).toBe(false)
  })
})
