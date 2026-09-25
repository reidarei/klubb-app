'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import Treffflate, { treffflateRundt } from '@/components/ui/Treffflate'
import { oppdaterAlbumTittel } from '@/lib/actions/album'

// Lagre/Avbryt (36 px) vokser 4 px til hver side (#700) — gapet må dekke begges vekst.
const KNAPP_TREFF = treffflateRundt({ hoyde: 36, bredde: 36 })

// Album-tittel med inline-redigering for admin og eier. Klikk på rediger-
// knappen gir et kompakt input + lagre/avbryt-knapper. Lagring kjører via
// server action og refresher siden så også andre steder (lenker, lister) ser
// ny tittel umiddelbart.
export default function AlbumTittel({
  albumId,
  initialTittel,
  kanRedigere,
}: {
  albumId: string
  initialTittel: string
  kanRedigere: boolean
}) {
  const router = useRouter()
  const [redigerer, setRedigerer] = useState(false)
  const [tekst, setTekst] = useState(initialTittel)
  const [pending, start] = useTransition()

  // Synk lokal tekst-state når initialTittel endres (etter router.refresh
  // hvor den nye tittelen kommer inn som ny prop). Uten dette ville neste
  // åpning av redigeringen vise forrige tekst-input.
  useEffect(() => {
    setTekst(initialTittel)
  }, [initialTittel])

  function lagre() {
    const ny = tekst.trim()
    if (!ny || ny === initialTittel) {
      setRedigerer(false)
      setTekst(initialTittel)
      return
    }
    start(async () => {
      try {
        await oppdaterAlbumTittel(albumId, ny)
        setRedigerer(false)
        router.refresh()
      } catch (e) {
        console.error(e)
        alert('Kunne ikke oppdatere tittel')
      }
    })
  }

  if (!redigerer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 500,
            margin: 0,
            color: 'var(--text-primary)',
            letterSpacing: '-0.4px',
          }}
        >
          {initialTittel}
        </h1>
        {kanRedigere && (
          <Treffflate
            synlig={16}
            onClick={() => setRedigerer(true)}
            aria-label="Rediger tittel"
            style={{ color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            <Icon name="cog" size={16} color="currentColor" />
          </Treffflate>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.max(6, KNAPP_TREFF.minsteKolonneGap), marginTop: 6 }}>
      <input
        type="text"
        value={tekst}
        onChange={e => setTekst(e.target.value)}
        autoFocus
        maxLength={200}
        onKeyDown={e => {
          if (e.key === 'Enter') lagre()
          else if (e.key === 'Escape') {
            setRedigerer(false)
            setTekst(initialTittel)
          }
        }}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 500,
          padding: '6px 10px',
          outline: 'none',
          letterSpacing: '-0.4px',
        }}
      />
      <Treffflate
        synlig={36}
        onClick={lagre}
        disabled={pending}
        aria-label="Lagre"
        style={{ cursor: pending ? 'default' : 'pointer' }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: 'var(--accent-foreground)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pending ? 0.6 : 1,
          }}
        >
          <Icon name="checkmark" size={18} color="currentColor" strokeWidth={2.5} />
        </span>
      </Treffflate>
      <Treffflate
        synlig={36}
        onClick={() => {
          setRedigerer(false)
          setTekst(initialTittel)
        }}
        aria-label="Avbryt"
        style={{ cursor: 'pointer' }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '0.5px solid var(--border)',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={16} color="currentColor" />
        </span>
      </Treffflate>
    </div>
  )
}
