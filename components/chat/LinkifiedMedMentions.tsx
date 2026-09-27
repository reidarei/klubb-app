'use client'

import { Fragment } from 'react'
import { splittPaaMentions } from '@/lib/mention'
// Importer fra linkify-core (pure helper) i stedet for linkify.tsx — vi
// trenger bare splitteren, ikke React-komponenten. Holder bundle slank.
import { splittPaaUrler } from '@/lib/linkify-core'
import { kortUrl } from '@/lib/lenke-forhaandsvisning-core'

/**
 * Rendrer melding-innhold med både klikkbare URLer OG mention-styling.
 * Wrapper rundt splittPaaUrler — kjernen i lib/linkify-core.ts holdes enkel,
 * mention-styling er chat-spesifikk og hører hjemme her (jf. avatar-policy:
 * lokal wrapper framfor å utvide felleskomponent med props). se #350
 */
export function LinkifiedMedMentions({
  text,
  mentionNavn,
  skjulFraIndeks,
}: {
  text: string
  mentionNavn: string[]
  /** Del-indeks (fra splittPaaUrler) der teksten kappes — en avsluttende
   *  lenke som vises som forhåndsvisningskort i stedet. */
  skjulFraIndeks?: number
}) {
  let deler = splittPaaUrler(text)
  if (skjulFraIndeks !== undefined) {
    deler = deler.slice(0, skjulFraIndeks)
    const sist = deler[deler.length - 1]
    // «Se her: <lenke>» → «Se her:» — ikke et hengende mellomrom/linjeskift over kortet.
    if (sist?.type === 'tekst') deler[deler.length - 1] = { ...sist, verdi: sist.verdi.trimEnd() }
  }
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
                overflowWrap: 'anywhere',
              }}
            >
              {/* Kort visning («dn.no/marked/finans…») — en full artikkel-URL
                  fylte ellers flere linjer av bobla. href er fortsatt hele. */}
              {kortUrl(del.href)}
            </a>
          )
        }
        // Tekst-del: splitt videre på mentions og styliser dem
        const subDeler = splittPaaMentions(del.verdi, mentionNavn)
        return (
          <Fragment key={i}>
            {subDeler.map((sub, j) =>
              sub.type === 'mention' ? (
                <span key={j} style={{ fontWeight: 600, color: 'var(--accent)' }}>
                  {sub.verdi}
                </span>
              ) : (
                <Fragment key={j}>{sub.verdi}</Fragment>
              ),
            )}
          </Fragment>
        )
      })}
    </>
  )
}
