import { describe, it, expect } from 'vitest'
import {
  ALLE_VALG,
  beregnMentionSøk,
  lagMentionForslag,
  velgMentionTekst,
  type ChatProfil,
} from '@/lib/mention'

// Låser adferden til mention-modulen som brukes av Chat.tsx og
// KommentarerPaaKort.tsx. Kantcase-ene her speiler reelle situasjoner i
// input-feltet: brukeren skriver @, ombestemmer seg, skriver flerords-navn,
// nevner @alle osv. — vi vil ikke ha regresjoner som stille bryter et av
// disse mønstrene.

function profil(id: string, navn: string | null): ChatProfil {
  return { id, navn, bilde_url: null, rolle: null }
}

describe('beregnMentionSøk', () => {
  it('returnerer null uten @', () => {
    expect(beregnMentionSøk('hei sveis')).toBeNull()
  })

  it('returnerer tom streng rett etter @', () => {
    expect(beregnMentionSøk('hei @')).toBe('')
  })

  it('returnerer tom streng når @ står på posisjon 0', () => {
    expect(beregnMentionSøk('@')).toBe('')
  })

  it('returnerer søkeord når @ står på posisjon 0 med tekst', () => {
    expect(beregnMentionSøk('@rei')).toBe('rei')
  })

  it('siste @ vinner ved flere', () => {
    expect(beregnMentionSøk('@reidar og @mic')).toBe('mic')
  })

  it('avbryter ved to mellomrom etter @', () => {
    // brukeren har gått videre uten å velge
    expect(beregnMentionSøk('hei @reidar  ')).toBeNull()
  })

  it('avbryter ved linjeskift etter @', () => {
    expect(beregnMentionSøk('hei @reidar\nnoe mer')).toBeNull()
  })

  it('aksepterer ett mellomrom (flerords-navn)', () => {
    expect(beregnMentionSøk('hei @Reidar Eik')).toBe('Reidar Eik')
  })
})

describe('velgMentionTekst', () => {
  it('erstatter siste @… med navn + trailing space', () => {
    expect(velgMentionTekst('hei @rei', 'Reidar')).toBe('hei @Reidar ')
  })

  it('uendret tekst om ingen @', () => {
    expect(velgMentionTekst('hei sveis', 'Reidar')).toBe('hei sveis')
  })

  it('bevarer tekst foran siste @', () => {
    expect(velgMentionTekst('@reidar og @mic', 'Michael')).toBe('@reidar og @Michael ')
  })

  it('håndterer flerords-navn (delvis skrevet)', () => {
    expect(velgMentionTekst('hei @Reidar Eik', 'Reidar Eik Haavik')).toBe('hei @Reidar Eik Haavik ')
  })
})

describe('lagMentionForslag', () => {
  const profiler: ChatProfil[] = [
    profil('1', 'Reidar Eik Haavik'),
    profil('2', 'Michael'),
    profil('3', 'Kari Nordmann'),
  ]

  it('tom liste når mentionSøk === null', () => {
    expect(lagMentionForslag(null, profiler)).toEqual([])
  })

  it('inkluderer ALLE_VALG først ved tomt søk', () => {
    const resultat = lagMentionForslag('', profiler)
    expect(resultat[0]).toBe(ALLE_VALG)
    expect(resultat).toHaveLength(1 + profiler.length)
  })

  it('inkluderer ALLE_VALG ved prefiks av "alle" — store bokstaver', () => {
    const resultat = lagMentionForslag('AL', profiler)
    expect(resultat[0]).toBe(ALLE_VALG)
  })

  it('inkluderer ALLE_VALG ved prefiks av "alle" — små bokstaver', () => {
    const resultat = lagMentionForslag('al', profiler)
    expect(resultat[0]).toBe(ALLE_VALG)
  })

  it('inkluderer ALLE_VALG ved fullt prefiks "alle"', () => {
    const resultat = lagMentionForslag('alle', profiler)
    expect(resultat[0]).toBe(ALLE_VALG)
  })

  it('utelater ALLE_VALG når søket ikke er prefiks av "alle"', () => {
    const resultat = lagMentionForslag('re', profiler)
    expect(resultat).not.toContain(ALLE_VALG)
  })

  it('utelater ALLE_VALG når søket er substring (ikke prefiks) av "alle"', () => {
    // 'lle' finnes inne i 'alle', men er ikke prefiks → skal IKKE matche.
    // Sikrer at logikken er startsWith, ikke includes.
    const resultat = lagMentionForslag('lle', [], undefined)
    expect(resultat).not.toContain(ALLE_VALG)
    expect(resultat).toEqual([])
  })

  it('filtrerer profiler case-insensitive på navn-substring', () => {
    const resultat = lagMentionForslag('REI', profiler)
    expect(resultat.map(p => p.id)).toEqual(['1'])
  })

  it('ekskluderer ekskluderId', () => {
    const resultat = lagMentionForslag('', profiler, '1')
    // ALLE_VALG + 2 gjenværende profiler
    expect(resultat).toHaveLength(3)
    expect(resultat.map(p => p.id)).not.toContain('1')
  })

  it('utelater profiler med navn === null', () => {
    const medNull: ChatProfil[] = [...profiler, profil('4', null)]
    const resultat = lagMentionForslag('', medNull)
    expect(resultat.map(p => p.id)).not.toContain('4')
  })

  it('hard cap er 5 ekte profiler — ALLE_VALG kommer i tillegg (ikke inkludert i cap)', () => {
    // 7 profiler som alle matcher tomt søk. Forventning: cap på 5 ekte profiler
    // pluss ALLE_VALG = 6 elementer totalt. Hvis ALLE_VALG telles inn i
    // cap-en før slicen, ville vi sett 5. Denne testen låser dagens
    // adferd.
    const sju: ChatProfil[] = Array.from({ length: 7 }, (_, i) =>
      profil(String(i + 1), `Profil ${i + 1}`),
    )
    const resultat = lagMentionForslag('', sju)
    expect(resultat).toHaveLength(6)
    expect(resultat[0]).toBe(ALLE_VALG)
  })
})

describe('ALLE_VALG', () => {
  it('id === "__alle__", navn === "alle"', () => {
    expect(ALLE_VALG.id).toBe('__alle__')
    expect(ALLE_VALG.navn).toBe('alle')
  })
})
