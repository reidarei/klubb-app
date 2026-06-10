import { describe, it, expect } from 'vitest'
import {
  ROLLER,
  VALGBARE_ROLLER,
  kanAdministrere,
  harGulGloed,
  faarIssueVarsler,
  loeserTiebreak,
  tittelFor,
  rollerMed,
  rettigheterFor,
  type Rolle,
} from '@/lib/roller'

describe('roller – rettighetsmatrise', () => {
  const alleRoller: Rolle[] = ['medlem', 'admin', 'generalsekretaer']

  it('har en oppføring for hver rolle', () => {
    for (const r of alleRoller) {
      expect(ROLLER[r]).toBeDefined()
      expect(ROLLER[r].tittel).toBeTruthy()
    }
  })

  describe('kanAdministrere', () => {
    it('admin og generalsekretær kan administrere, medlem kan ikke', () => {
      expect(kanAdministrere('admin')).toBe(true)
      expect(kanAdministrere('generalsekretaer')).toBe(true)
      expect(kanAdministrere('medlem')).toBe(false)
    })

    it('ukjente/null-roller faller tilbake til medlem (ingen admin-tilgang)', () => {
      expect(kanAdministrere(null)).toBe(false)
      expect(kanAdministrere(undefined)).toBe(false)
      expect(kanAdministrere('fantasirolle')).toBe(false)
    })
  })

  describe('harGulGloed', () => {
    it('kun generalsekretær har gul glød', () => {
      expect(harGulGloed('generalsekretaer')).toBe(true)
      expect(harGulGloed('admin')).toBe(false)
      expect(harGulGloed('medlem')).toBe(false)
    })
  })

  describe('faarIssueVarsler', () => {
    it('kun admin får issue-varsler (ikke generalsekretær)', () => {
      expect(faarIssueVarsler('admin')).toBe(true)
      expect(faarIssueVarsler('generalsekretaer')).toBe(false)
      expect(faarIssueVarsler('medlem')).toBe(false)
    })
  })

  describe('loeserTiebreak', () => {
    it('kun generalsekretær løser tiebreak', () => {
      expect(loeserTiebreak('generalsekretaer')).toBe(true)
      expect(loeserTiebreak('admin')).toBe(false)
      expect(loeserTiebreak('medlem')).toBe(false)
    })

    it('ukjente/null-roller løser ikke tiebreak', () => {
      expect(loeserTiebreak(null)).toBe(false)
      expect(loeserTiebreak(undefined)).toBe(false)
      expect(loeserTiebreak('tull')).toBe(false)
    })
  })

  describe('tittelFor', () => {
    it('gir norsk tittel for hver rolle', () => {
      expect(tittelFor('medlem')).toBe('Medlem')
      expect(tittelFor('admin')).toBe('Admin')
      expect(tittelFor('generalsekretaer')).toBe('Generalsekretær')
    })

    it('faller tilbake til Medlem-tittel ved ukjent rolle', () => {
      expect(tittelFor(null)).toBe('Medlem')
      expect(tittelFor('tull')).toBe('Medlem')
    })
  })

  describe('rollerMed', () => {
    it('returnerer alle roller med en gitt rettighet', () => {
      expect(rollerMed('kanAdministrere').sort()).toEqual(['admin', 'generalsekretaer'])
      expect(rollerMed('faarIssueVarsler')).toEqual(['admin'])
      expect(rollerMed('harGulGloed')).toEqual(['generalsekretaer'])
      expect(rollerMed('loeserTiebreak')).toEqual(['generalsekretaer'])
    })
  })

  describe('VALGBARE_ROLLER', () => {
    it('inneholder medlem og admin, men ikke generalsekretær', () => {
      expect(VALGBARE_ROLLER).toContain('medlem')
      expect(VALGBARE_ROLLER).toContain('admin')
      expect(VALGBARE_ROLLER).not.toContain('generalsekretaer')
    })
  })

  describe('rettigheterFor', () => {
    it('returnerer hele rettighetsobjektet', () => {
      const r = rettigheterFor('generalsekretaer')
      expect(r).toEqual({
        tittel: 'Generalsekretær',
        kanAdministrere: true,
        faarIssueVarsler: false,
        harGulGloed: true,
        loeserTiebreak: true,
      })
    })
  })
})
