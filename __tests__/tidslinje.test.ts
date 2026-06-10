import { describe, it, expect, vi } from 'vitest'

// Test bursdagsberegning og tidslinje-sortering uten å importere React-komponenter

describe('tidslinje – bursdagsberegning', () => {
  // Repliker beregnBursdager-logikken fra TidslinjeWrapper
  function beregnBursdager(
    profiler: { id: string; visningsnavn: string | null; fodselsdato: string | null }[],
    frem: number,
    naa: Date = new Date(2026, 5, 10) // 10. juni 2026
  ) {
    const toMndSiden = new Date(naa.getFullYear(), naa.getMonth() - 2, naa.getDate())
    const fremTid = new Date(naa.getFullYear(), naa.getMonth() + frem, naa.getDate())

    return profiler.flatMap(p => {
      if (!p.fodselsdato) return []
      const [fodselsaar, mnd, dag] = p.fodselsdato.split('-').map(Number)
      const items: { id: string; profilId: string; visningsnavn: string; dato: string; alder: number }[] = []
      const aarRange = Math.ceil(frem / 12) + 2
      for (let i = -1; i <= aarRange; i++) {
        const yr = naa.getFullYear() + i
        const bdag = new Date(yr, mnd - 1, dag)
        if (bdag >= toMndSiden && bdag <= fremTid) {
          items.push({
            id: `bursdag-${p.id}-${yr}`,
            profilId: p.id,
            visningsnavn: p.visningsnavn ?? '',
            dato: `${yr}-${String(mnd).padStart(2, '0')}-${String(dag).padStart(2, '0')}`,
            alder: yr - fodselsaar,
          })
        }
      }
      return items
    })
  }

  it('beregner riktig alder', () => {
    const profiler = [
      { id: 'p1', visningsnavn: 'Ola', fodselsdato: '1990-08-15' },
    ]
    const bursdager = beregnBursdager(profiler, 12)
    const bursdag2026 = bursdager.find(b => b.dato === '2026-08-15')
    expect(bursdag2026).toBeDefined()
    expect(bursdag2026!.alder).toBe(36)
  })

  it('inkluderer bursdager innenfor 2 måneder tilbake', () => {
    // naa = 10. juni, toMndSiden = 10. april
    const profiler = [
      { id: 'p1', visningsnavn: 'Kari', fodselsdato: '1985-04-20' },
    ]
    const bursdager = beregnBursdager(profiler, 12)
    const aprilBursdag = bursdager.find(b => b.dato === '2026-04-20')
    expect(aprilBursdag).toBeDefined()
  })

  it('ekskluderer bursdager eldre enn 2 måneder tilbake', () => {
    const profiler = [
      { id: 'p1', visningsnavn: 'Per', fodselsdato: '1985-03-15' },
    ]
    // naa = 10. juni, toMndSiden = 10. april → 15. mars er utenfor
    const bursdager = beregnBursdager(profiler, 12)
    const marsBursdag = bursdager.find(b => b.dato === '2026-03-15')
    expect(marsBursdag).toBeUndefined()
  })

  it('inkluderer bursdager innenfor fremtidsvinduet', () => {
    const profiler = [
      { id: 'p1', visningsnavn: 'Lise', fodselsdato: '1992-03-01' },
    ]
    // 12 mnd fremover fra juni 2026 = juni 2027, mars 2027 er innenfor
    const bursdager = beregnBursdager(profiler, 12)
    const nesteMars = bursdager.find(b => b.dato === '2027-03-01')
    expect(nesteMars).toBeDefined()
    expect(nesteMars!.alder).toBe(35)
  })

  it('returnerer tom liste for profiler uten fødselsdato', () => {
    const profiler = [
      { id: 'p1', visningsnavn: 'Anonym', fodselsdato: null },
    ]
    const bursdager = beregnBursdager(profiler, 12)
    expect(bursdager).toHaveLength(0)
  })

  it('genererer unike ID-er per år', () => {
    const profiler = [
      { id: 'p1', visningsnavn: 'Ola', fodselsdato: '1990-08-15' },
    ]
    const bursdager = beregnBursdager(profiler, 24)
    const ider = bursdager.map(b => b.id)
    const unikeIder = new Set(ider)
    expect(unikeIder.size).toBe(ider.length)
  })

  it('utvider vinduet med Last mer (12 → 24 → 48)', () => {
    const profiler = [
      { id: 'p1', visningsnavn: 'Ola', fodselsdato: '1990-08-15' },
    ]
    const b12 = beregnBursdager(profiler, 12)
    const b24 = beregnBursdager(profiler, 24)
    const b48 = beregnBursdager(profiler, 48)
    expect(b24.length).toBeGreaterThanOrEqual(b12.length)
    expect(b48.length).toBeGreaterThanOrEqual(b24.length)
  })
})

describe('tidslinje – sortering og gruppering', () => {
  // Repliker erItemPast-logikken
  function erPast(startTidspunkt: string, naa: Date = new Date(2026, 5, 10)): boolean {
    const itemDag = new Date(
      parseInt(startTidspunkt.slice(0, 4)),
      parseInt(startTidspunkt.slice(5, 7)) - 1,
      parseInt(startTidspunkt.slice(8, 10))
    )
    return itemDag < naa
  }

  function erIdag(startTidspunkt: string, naa: Date = new Date(2026, 5, 10)): boolean {
    const itemDag = new Date(
      parseInt(startTidspunkt.slice(0, 4)),
      parseInt(startTidspunkt.slice(5, 7)) - 1,
      parseInt(startTidspunkt.slice(8, 10))
    )
    return itemDag.getTime() === naa.getTime()
  }

  it('markerer arrangement i fortid som past', () => {
    expect(erPast('2026-06-09T18:00:00Z')).toBe(true)
  })

  it('markerer arrangement i fremtid som ikke-past', () => {
    expect(erPast('2026-06-11T18:00:00Z')).toBe(false)
  })

  it('markerer arrangement i dag som i-dag', () => {
    expect(erIdag('2026-06-10T18:00:00Z')).toBe(true)
  })

  it('markerer arrangement i dag som IKKE past', () => {
    expect(erPast('2026-06-10T18:00:00Z')).toBe(false)
  })

  it('sorterer arrangementer riktig (kommende først, deretter tidligere)', () => {
    const arrangementer = [
      { id: '1', start: '2026-06-15T18:00:00Z' },
      { id: '2', start: '2026-06-05T18:00:00Z' },
      { id: '3', start: '2026-06-20T18:00:00Z' },
      { id: '4', start: '2026-06-10T18:00:00Z' }, // i dag
    ]

    const naa = new Date(2026, 5, 10)
    const kommende = arrangementer.filter(a => !erPast(a.start, naa)).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    )
    const tidligere = arrangementer.filter(a => erPast(a.start, naa)).sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime() // reversert
    )

    expect(kommende.map(a => a.id)).toEqual(['4', '1', '3'])
    expect(tidligere.map(a => a.id)).toEqual(['2'])
  })
})

describe('tidslinje – FNV-1a emoji-hashing', () => {
  // Repliker FNV-1a hash fra ArrangementTidslinje
  function fnv1a(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = (hash * 16777619) >>> 0
    }
    return hash
  }

  const emojiPool = ['🎂', '🥳', '🎈', '🎉', '🎊', '🍰', '🧁', '🎁', '🥂', '🍾', '🎶', '🪅', '🎵', '🎤', '🕺', '💃', '🍻', '🫶', '🤩', '🌟', '⭐', '✨']

  function bursdagEmoji(navn: string): [string, string, string] {
    const h = fnv1a(navn)
    return [
      emojiPool[h % emojiPool.length],
      emojiPool[(h >>> 8) % emojiPool.length],
      emojiPool[(h >>> 16) % emojiPool.length],
    ]
  }

  it('er deterministisk — samme navn gir alltid samme emoji', () => {
    const a = bursdagEmoji('Ola Nordmann')
    const b = bursdagEmoji('Ola Nordmann')
    expect(a).toEqual(b)
  })

  it('gir ulike emoji for ulike navn', () => {
    const ola = bursdagEmoji('Ola')
    const kari = bursdagEmoji('Kari')
    // Veldig usannsynlig at alle 3 er like
    expect(ola.join('')).not.toBe(kari.join(''))
  })

  it('returnerer alltid 3 emoji', () => {
    const resultat = bursdagEmoji('Test')
    expect(resultat).toHaveLength(3)
    resultat.forEach(e => {
      expect(emojiPool).toContain(e)
    })
  })
})
