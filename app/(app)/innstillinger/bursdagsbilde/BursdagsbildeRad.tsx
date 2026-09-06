'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Pill from '@/components/ui/Pill'
import AlbumLightbox from '@/components/album/AlbumLightbox'
import { genererBursdagsbildeNaa } from './actions'
import { slettBursdagsbilde } from '@/lib/actions/bursdagsbilde'
import { formaterDato } from '@/lib/dato'
import { bildeSrc } from '@/lib/bilde-utils'

type Props = {
  profilId: string
  navn: string
  feiringsdato: string
  harProfilbilde: boolean
  status: string | null
  forsok: number
  sisteFeil: string | null
  bildeUrl: string | null
  siste: boolean
}

// Ingen optimistisk fjerning, ingen toast (#641-planen): feiler et kall,
// står bildet urørt og en kort feiltekst vises under raden — samme
// nøkternhet som GodkjenningRad i pass-godkjenninger-flaten.
export default function BursdagsbildeRad({
  profilId,
  navn,
  feiringsdato,
  harProfilbilde,
  status,
  forsok,
  sisteFeil,
  bildeUrl,
  siste,
}: Props) {
  // Én transition PER knapp — ikke én delt. Med en felles pending-flagg viste
  // «Genererer …» på generer-knappen mens man faktisk slettet, og omvendt.
  const [genererer, startGenerering] = useTransition()
  const [fjerner, startFjerning] = useTransition()
  const noePaagaar = genererer || fjerner
  const [feil, setFeil] = useState<string | null>(null)
  const [lightboxApen, setLightboxApen] = useState(false)
  const router = useRouter()

  const miniatyr = bildeSrc(bildeUrl)

  function handleGenerer() {
    setFeil(null)
    startGenerering(async () => {
      try {
        const resultat = await genererBursdagsbildeNaa(profilId, feiringsdato)
        // Samme ordlyd som statuslinjen øverst på siden ("Funksjon: AV") og
        // som innstillinger-oversikten — admin skal ikke lure på om det er
        // to ulike tilstander.
        if (resultat.utfall === 'av') {
          setFeil('Funksjonen er AV på denne instansen — mangler Vertex-credentials. Se statuslinjen øverst.')
          return
        }
        if (resultat.utfall === 'feilet' || resultat.utfall === 'avvist') {
          setFeil(`Genereringen endte i status «${resultat.utfall}» (${resultat.klasse})`)
        }
        router.refresh()
      } catch (e) {
        setFeil(e instanceof Error ? e.message : 'Klarte ikke å generere')
      }
    })
  }

  function handleSlett() {
    if (!confirm(`Fjerne bursdagsbildet til ${navn}? Cron regenererer det ALDRI av seg selv — du må trykke Generer på nytt.`)) return
    setFeil(null)
    startFjerning(async () => {
      try {
        await slettBursdagsbilde(profilId, feiringsdato)
        router.refresh()
      } catch (e) {
        setFeil(e instanceof Error ? e.message : 'Klarte ikke å fjerne')
      }
    })
  }

  return (
    <div
      style={{
        padding: '14px 4px',
        borderBottom: siste ? 'none' : '0.5px solid var(--border-subtle)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      {miniatyr && (
        <button
          type="button"
          onClick={() => setLightboxApen(true)}
          aria-label={`Vis bursdagsbildet til ${navn} i full størrelse`}
          style={{
            position: 'relative',
            width: 48,
            height: 48,
            flexShrink: 0,
            padding: 0,
            border: 'none',
            borderRadius: 8,
            overflow: 'hidden',
            cursor: 'pointer',
            background: 'var(--bg-elevated)',
          }}
        >
          <Image src={miniatyr} alt="" fill sizes="48px" style={{ objectFit: 'cover' }} />
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>
            {navn}
          </strong>
          {/* Tekstlig, ikke bare opacity — #641-planen krever at «Mangler
              profilbilde» er lesbar, ikke bare en visuell dimming som kan
              tolkes som «ikke lastet ennå». */}
          {!harProfilbilde && (
            <Pill variant="neutral" small>
              Mangler profilbilde
            </Pill>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          {formaterDato(feiringsdato, 'd. MMM yyyy')} · {status ?? 'ikke forsøkt'} · forsøk: {forsok}
        </div>

        {sisteFeil && (
          <pre
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--danger)',
              background: 'var(--bg-base)',
              border: '0.5px solid var(--border-subtle)',
              padding: 8,
              borderRadius: 6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: '0 0 8px',
            }}
          >
            {sisteFeil}
          </pre>
        )}

        {feil && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{feil}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleGenerer}
            disabled={noePaagaar || !harProfilbilde}
            style={{
              padding: '8px 14px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 999,
              color: 'var(--accent-foreground)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              cursor: noePaagaar || !harProfilbilde ? 'not-allowed' : 'pointer',
              opacity: !harProfilbilde ? 0.5 : 1,
            }}
          >
            {genererer ? 'Genererer …' : 'Generer'}
          </button>
          {miniatyr && (
            <button
              type="button"
              onClick={handleSlett}
              disabled={noePaagaar}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: '0.5px solid var(--border)',
                borderRadius: 999,
                color: 'var(--danger)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                cursor: noePaagaar ? 'wait' : 'pointer',
              }}
            >
              {fjerner ? 'Fjerner …' : 'Fjern bildet'}
            </button>
          )}
        </div>
      </div>

      {lightboxApen && miniatyr && (
        <AlbumLightbox
          bilder={[{ id: profilId, bilde_url: miniatyr }]}
          startIndex={0}
          onLukk={() => setLightboxApen(false)}
        />
      )}
    </div>
  )
}
