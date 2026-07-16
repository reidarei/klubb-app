'use client'

// Sentral linkify-utility. Rendrer URLer i tekst som klikkbare lenker.
// Brukes i chat-bobler, meldingskort, kommentarer og arrangementsbeskrivelser.
// Markert 'use client' fordi <a onClick> ikke kan serialiseres i Server Components. se #350
//
// Pure-helper `splittPaaUrler` er skilt ut i lib/linkify-core.ts slik at
// tester kan importere den uten å trekke inn JSX-transformasjon.

import React from 'react'
import { splittPaaUrler } from '@/lib/linkify-core'

export { splittPaaUrler } from '@/lib/linkify-core'
export type { LinkDel } from '@/lib/linkify-core'

const lenkeStil: React.CSSProperties = {
  color: 'var(--accent)',
  textDecoration: 'underline',
  // overflowWrap: 'anywhere' brytes pent på vilkårlig sted ved
  // overflow, men foretrekker fortsatt naturlige break-punkter
  // (slashes, bindestreker). break-all var for aggressivt og
  // brøt URLer midt i ord uten grunn. se #350
  overflowWrap: 'anywhere',
}

/**
 * Rendrer tekst der URLer er gjort om til klikkbare lenker.
 * stopPropagation hindrer at chat-bobler med touch-handlere "spiser" klikket.
 *
 * `inneILenke`: sett når teksten rendres inni et kort som selv er en <Link>
 * (MeldingKort, KommentarerPaaKort). Nøstet <a>-i-<a> er ugyldig HTML —
 * parseren auto-lukker den ytre og DOM-en matcher ikke Reacts tre ved
 * hydrering (#418-krasj i prod, se #465). Da rendres URL-en som
 * <span role="link"> med window.open i stedet.
 */
export function Linkified({ text, inneILenke = false }: { text: string; inneILenke?: boolean }) {
  const deler = splittPaaUrler(text)

  if (deler.length === 0) return null

  return (
    <>
      {deler.map((del, i) => {
        if (del.type === 'url') {
          if (inneILenke) {
            const aapne = (e: React.SyntheticEvent) => {
              // preventDefault stopper den ytre kort-Link-ens navigasjon,
              // stopPropagation hindrer at klikket når dens onClick-handlere.
              e.preventDefault()
              e.stopPropagation()
              window.open(del.href, '_blank', 'noopener,noreferrer')
            }
            return (
              <span
                key={i}
                role="link"
                tabIndex={0}
                onClick={aapne}
                onKeyDown={(e) => { if (e.key === 'Enter') aapne(e) }}
                style={{ ...lenkeStil, cursor: 'pointer' }}
              >
                {del.verdi}
              </span>
            )
          }
          return (
            <a
              key={i}
              href={del.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(e) => e.stopPropagation()}
              style={lenkeStil}
            >
              {del.verdi}
            </a>
          )
        }
        return <React.Fragment key={i}>{del.verdi}</React.Fragment>
      })}
    </>
  )
}
