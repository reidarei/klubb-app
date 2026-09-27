'use client'

import { useEffect, useState } from 'react'
import {
  kortUrl,
  normaliserLenke,
  type Forhaandsvisning,
} from '@/lib/lenke-forhaandsvisning-core'

// Forhåndsvisningskort for en delt lenke i chatten: bilde, tittel, nettsted.
//
// Kortet har FAST høyde fra første render, også mens data lastes og når siden
// ikke har noen forhåndsvisning. Data kommer asynkront etter at chatten har
// scrollet til bunnen; et kort som vokste da, ville dyttet siste melding ned
// under skrivefeltet. Uten data viser kortet den korte URL-en — aldri tomt.

const HOYDE = 72

// Per fane: samme lenke vist flere ganger (eller en rad som remountes) gjør
// ett kall, og et kort som har lastet før vises ferdig fra første frame.
const ferdig = new Map<string, Forhaandsvisning | null>()
const iFlyt = new Map<string, Promise<Forhaandsvisning | null>>()

function hent(href: string): Promise<Forhaandsvisning | null> {
  const paagaar = iFlyt.get(href)
  if (paagaar) return paagaar
  const jobb = fetch(`/api/lenke-forhaandsvisning?url=${encodeURIComponent(href)}`)
    .then(r => (r.ok ? (r.json() as Promise<Forhaandsvisning | null>) : null))
    .catch(() => null)
    .then(data => {
      // Et midlertidig null skal ikke låse kortet resten av økta — kun treff huskes.
      if (data) ferdig.set(href, data)
      return data
    })
    .finally(() => iFlyt.delete(href))
  iFlyt.set(href, jobb)
  return jobb
}

export function LenkeKort({ href }: { href: string }) {
  const nokkel = normaliserLenke(href)
  const [data, setData] = useState<Forhaandsvisning | null>(() => ferdig.get(nokkel) ?? null)
  const [bildeFeilet, setBildeFeilet] = useState(false)

  useEffect(() => {
    if (ferdig.has(nokkel)) return
    let aktiv = true
    hent(nokkel).then(d => { if (aktiv) setData(d) })
    return () => { aktiv = false }
  }, [nokkel])

  const vert = kortUrl(href, 40).split('/')[0]
  const visBilde = !!data?.bilde && !bildeFeilet

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'flex',
        height: HOYDE,
        width: 260,
        maxWidth: '100%',
        marginTop: 6,
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--bg)',
        border: '0.5px solid var(--border-subtle)',
        textDecoration: 'none',
        color: 'inherit',
        whiteSpace: 'normal',
      }}
    >
      {visBilde && (
        // Ekstern forhåndsvisning — ikke en lagret URL, så bildeSrc() gjelder
        // ikke (jf. Policy: Bildevisning). next/image krever kjente domener.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data!.bilde!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBildeFeilet(true)}
          style={{ width: HOYDE, height: HOYDE, objectFit: 'cover', flexShrink: 0 }}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 3,
          padding: '6px 10px',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data?.nettsted || vert}
        </span>
        <span
          style={{
            fontSize: 12.5,
            lineHeight: 1.3,
            fontWeight: 600,
            color: data ? 'var(--text-primary)' : 'var(--accent)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {data?.tittel ?? kortUrl(href, 60)}
        </span>
      </div>
    </a>
  )
}
