// Ren logikk for MiniKalender (#429) — ingen React, ingen side-effekter.
// Skilt ut slik at logikken kan enhetstestes uten DOM-oppsett.

import { startOfMonth, endOfMonth, eachDayOfInterval, getISODay, format } from 'date-fns'

/**
 * Bygg flat grid for en måned med mandag-først-layout.
 *
 * Returnerer en flat liste der:
 * - De første getISODay(1. dag) - 1 elementene er null (tomme celler
 *   for mandag–dagen-før-1.)
 * - Resten er yyyy-MM-dd-nøkler for hver dag i måneden
 *
 * Eksempel: juli 2026 starter på onsdag (ISO day 3) → 2 null-celler,
 * deretter '2026-07-01' .. '2026-07-31'.
 */
export function byggMaanedsGrid(aar: number, maaned0: number): (string | null)[] {
  const foersteDag = startOfMonth(new Date(aar, maaned0, 1))

  // getISODay: 1 = mandag, 7 = søndag. Ledende null-celler = ISO-dag - 1,
  // fordi mandag (dag 1) trenger 0 tomme celler, søndag (dag 7) trenger 6.
  const forskyvning = getISODay(foersteDag) - 1

  const dager = eachDayOfInterval({ start: foersteDag, end: endOfMonth(foersteDag) })

  return [
    ...Array<null>(forskyvning).fill(null),
    ...dager.map(d => format(d, 'yyyy-MM-dd')),
  ]
}

/**
 * Returnerer true dersom dagNokkel finnes i datoSett.
 * Holder lookup-logikken i logikk-laget — enkelt å teste isolert.
 */
export function harInnhold(dagNokkel: string, datoSett: Set<string>): boolean {
  return datoSett.has(dagNokkel)
}

/**
 * Returnerer true dersom dagens måned-dag matcher en bursdag.
 * Bursdager gjentar seg årlig, så settet holder MM-dd-nøkler (uten år) —
 * da virker oppslaget uansett hvilket år kalenderen er blad til.
 */
export function harBursdag(dagNokkel: string, mmddSett: Set<string>): boolean {
  return mmddSett.has(dagNokkel.slice(5))
}

/**
 * Rollen en kalenderdag har i en flerdagerstur.
 * 'underveis' er dagene mellom avreise og hjemkomst.
 */
export type TurRolle = 'avreise' | 'underveis' | 'hjemkomst'

/** En turs varighet som yyyy-MM-dd-nøkler. slutt: null = ukjent/ingen (eldre rader, #770). */
export type TurPeriode = { start: string; slutt: string | null }

/**
 * Hvordan streken går ut av cellen på én side (#770-review):
 * 'bro' = nabocellen i samme rad er samme tur → strek over GAP-en til den.
 * 'kant' = turen fortsetter, men på neste/forrige rad eller i nabomåneden → strek helt ut til cellekanten.
 * null = turen slutter her på denne siden (avreise/hjemkomst) → ingen strek den veien.
 */
export type StrekUtgang = 'bro' | 'kant' | null

/** Markering for én kalendercelle, eller null hvis dagen ikke er del av noen tur. */
export type TurCelle = { rolle: TurRolle; strekVenstre: StrekUtgang; strekHoeyre: StrekUtgang } | null

// Presedens ved overlapp (samme dag er f.eks. hjemkomst for tur A og avreise
// for tur B): lavest tall vinner. avreise > hjemkomst > underveis.
const ROLLE_PRIORITET: Record<TurRolle, number> = { avreise: 0, hjemkomst: 1, underveis: 2 }

/**
 * Bygger turmarkering for en grid-rad (fra byggMaanedsGrid) ut fra en liste
 * turperioder. Ren strengsammenligning — yyyy-MM-dd sorterer leksikografisk,
 * så ingen dato-aritmetikk trengs (#770).
 *
 * En periode uten reell sluttdato (slutt er null, eller slutt <= start —
 * f.eks. eldre rader uten slutt_tidspunkt) gir kun avreise på startdagen,
 * ingen strek: effektiv slutt faller da tilbake til start.
 */
export function byggTurMarkering(grid: (string | null)[], perioder: TurPeriode[]): TurCelle[] {
  // eier[i] = indeksen i `perioder` som "vant" cellen (presedens ved overlapp).
  // Skilt fra rolle[] fordi to tilstøtende, UAVHENGIGE turer ikke skal smelte
  // sammen bare fordi begge er f.eks. 'underveis' — kontinuitet sjekkes på
  // periode-identitet, ikke bare på rolle.
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

  // Naboen er synlig ved siden av i samme uke-rad (ikke radskifte, ikke
  // padding-celle, ikke utenfor grid-et/måneden).
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

    // Synlig nabo: bro kun hvis den tilhører SAMME periode (eier-indeks) —
    // det hindrer to tilstøtende turer i å smelte sammen. Usynlig nabo: 'kant'
    // så lenge perioden har flere dager den veien, så streken leses som ett strekk.
    const utgang = (retning: -1 | 1): StrekUtgang => {
      if (synligNabo(idx, retning)) return eier[idx + retning] === eier[idx] ? 'bro' : null
      const fortsetter = retning === -1 ? dag > p.start : dag < effektivSlutt
      return fortsetter ? 'kant' : null
    }

    return { rolle: rolle[idx]!, strekVenstre: utgang(-1), strekHoeyre: utgang(1) }
  })
}
