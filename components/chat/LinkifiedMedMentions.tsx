'use client'

import { Fragment } from 'react'
import { mentionSplitRegex } from '@/lib/mention'
// Importer fra linkify-core (pure helper) i stedet for linkify.tsx — vi
// trenger bare splitteren, ikke React-komponenten. Holder bundle slank.
import { splittPaaUrler } from '@/lib/linkify-core'

/**
 * Rendrer melding-innhold med både klikkbare URLer OG mention-styling.
 * Wrapper rundt splittPaaUrler — kjernen i lib/linkify-core.ts holdes enkel,
 * mention-styling er chat-spesifikk og hører hjemme her (jf. avatar-policy:
 * lokal wrapper framfor å utvide felleskomponent med props). se #350
 */
export function LinkifiedMedMentions({ text }: { text: string }) {
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
                overflowWrap: 'anywhere',
              }}
            >
              {del.verdi}
            </a>
          )
        }
        // Tekst-del: splitt videre på mentions og styliser dem
        const subDeler = del.verdi.split(mentionSplitRegex())
        return (
          <Fragment key={i}>
            {subDeler.map((sub, j) =>
              sub.startsWith('@') ? (
                <span key={j} style={{ fontWeight: 600, color: 'var(--accent)' }}>
                  {sub}
                </span>
              ) : (
                <Fragment key={j}>{sub}</Fragment>
              ),
            )}
          </Fragment>
        )
      })}
    </>
  )
}
