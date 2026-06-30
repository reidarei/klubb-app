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

/**
 * Rendrer tekst der URLer er gjort om til klikkbare lenker.
 * stopPropagation hindrer at chat-bobler med touch-handlere "spiser" klikket.
 */
export function Linkified({ text }: { text: string }) {
  const deler = splittPaaUrler(text)

  if (deler.length === 0) return null

  return (
    <>
      {deler.map((del, i) => {
        if (del.type === 'url') {
          return (
            <a
              key={i}
              href={del.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(e) => e.stopPropagation()}
              style={{
                color: 'var(--accent)',
                textDecoration: 'underline',
                // overflowWrap: 'anywhere' brytes pent på vilkårlig sted ved
                // overflow, men foretrekker fortsatt naturlige break-punkter
                // (slashes, bindestreker). break-all var for aggressivt og
                // brøt URLer midt i ord uten grunn. se #350
                overflowWrap: 'anywhere',
              }}
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
