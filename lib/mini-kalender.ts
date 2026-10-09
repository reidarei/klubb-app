// Ren logikk for MiniKalender (#429), skilt ut for enhetstesting uten DOM.

import { startOfMonth, endOfMonth, eachDayOfInterval, getISODay, format } from 'date-fns'

/**
 * Flat grid for en måned, mandag først: ledende null-celler, deretter
 * yyyy-MM-dd per dag. Juli 2026 starter onsdag → 2 null-celler.
 */
export function byggMaanedsGrid(aar: number, maaned0: number): (string | null)[] {
  const foersteDag = startOfMonth(new Date(aar, maaned0, 1))

  // getISODay: 1 = mandag … 7 = søndag, så mandag trenger 0 tomme celler.
  const forskyvning = getISODay(foersteDag) - 1

  const dager = eachDayOfInterval({ start: foersteDag, end: endOfMonth(foersteDag) })

  return [
    ...Array<null>(forskyvning).fill(null),
    ...dager.map(d => format(d, 'yyyy-MM-dd')),
  ]
}

export function harInnhold(dagNokkel: string, datoSett: Set<string>): boolean {
  return datoSett.has(dagNokkel)
}

/**
 * Settet holder MM-dd uten år, siden bursdager gjentar seg — da virker
 * oppslaget uansett hvilket år kalenderen viser.
 */
export function harBursdag(dagNokkel: string, mmddSett: Set<string>): boolean {
  return mmddSett.has(dagNokkel.slice(5))
}

/** Rollen en kalenderdag har i en flerdagerstur. */
export type TurRolle = 'avreise' | 'underveis' | 'hjemkomst'

/** En turs varighet som yyyy-MM-dd-nøkler. slutt: null = ukjent/ingen (eldre rader, #770). */
export type TurPeriode = { start: string; slutt: string | null }

/**
 * Hvordan streken går ut av cellen på én side (#770):
 * 'bro' = nabocellen i samme rad er samme tur → strek over gapet.
 * 'kant' = turen fortsetter på annen rad eller i nabomåneden → strek til cellekanten.
 * null = turen slutter på denne siden → ingen strek.
 */
export type StrekUtgang = 'bro' | 'kant' | null

/** Markering for én kalendercelle, eller null hvis dagen ikke er del av noen tur. */
export type TurCelle = { rolle: TurRolle; strekVenstre: StrekUtgang; strekHoeyre: StrekUtgang } | null

// Presedens ved overlapp (hjemkomst for A = avreise for B): lavest vinner.
const ROLLE_PRIORITET: Record<TurRolle, number> = { avreise: 0, hjemkomst: 1, underveis: 2 }

/**
 * Turmarkering per celle i et grid fra byggMaanedsGrid. Ren strengsammenligning
 * — yyyy-MM-dd sorterer leksikografisk (#770).
 *
 * Uten reell sluttdato (null eller slutt <= start) faller effektiv slutt
 * tilbake til start: kun avreise, ingen strek.
 */
export function byggTurMarkering(grid: (string | null)[], perioder: TurPeriode[]): TurCelle[] {
  // eier[i] = perioden som vant cellen. Kontinuitet sjekkes på periode-
  // identitet, ikke rolle, så to tilstøtende turer ikke smelter sammen.
  const eier: (number | null)[] = grid.map(() => null)
  const rolle: (TurRolle | null)[] = grid.map(() => null)

  grid.forEach((dag, idx) => {
    if (dag === null) return

    let besteRolle: TurRolle | null = null
    let besteJ: number | null = null

    perioder.forEach((p, j) => {
      const effektivSlutt = p.slutt !== null && p.slutt > p.start ? p.slutt : p.start
      if (dag < p.start || dag > effektivSlutt) return

      const kandidat: TurRolle =
        dag === p.start ? 'avreise' : dag === effektivSlutt ? 'hjemkomst' : 'underveis'

      if (besteRolle === null || ROLLE_PRIORITET[kandidat] < ROLLE_PRIORITET[besteRolle]) {
        besteRolle = kandidat
        besteJ = j
      }
    })

    rolle[idx] = besteRolle
    eier[idx] = besteJ
  })

  // Synlig nabo = samme uke-rad og ikke en padding-celle.
  const synligNabo = (idx: number, retning: -1 | 1): boolean => {
    if (retning === -1 && idx % 7 === 0) return false
    if (retning === 1 && idx % 7 === 6) return false
    const n = idx + retning
    return n >= 0 && n < grid.length && grid[n] !== null
  }

  return grid.map((dag, idx) => {
    if (rolle[idx] === null || dag === null) return null

    const p = perioder[eier[idx]!]
    const effektivSlutt = p.slutt !== null && p.slutt > p.start ? p.slutt : p.start

    // Synlig nabo: bro kun ved samme eier. Usynlig nabo: 'kant' så lenge
    // perioden fortsetter den veien, så streken leses som ett strekk.
    const utgang = (retning: -1 | 1): StrekUtgang => {
      if (synligNabo(idx, retning)) return eier[idx + retning] === eier[idx] ? 'bro' : null
      const fortsetter = retning === -1 ? dag > p.start : dag < effektivSlutt
      return fortsetter ? 'kant' : null
    }

    return { rolle: rolle[idx]!, strekVenstre: utgang(-1), strekHoeyre: utgang(1) }
  })
}
