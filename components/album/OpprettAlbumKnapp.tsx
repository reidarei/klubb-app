'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { opprettAlbum } from '@/lib/actions/album'

// Knapp + dialog for å opprette nytt album uten arrangement-tilknytning.
// Album med arrangement opprettes inline på arrangement-detaljsiden via
// AlbumSeksjon — denne dekker resten (turer som ble glemt opprettet, blandet
// innhold, generelle klubbalbum osv.).
export default function OpprettAlbumKnapp() {
  const router = useRouter()
  const [apen, setApen] = useState(false)
  const [tittel, setTittel] = useState('')
  const [pending, start] = useTransition()

  function lukk() {
    setApen(false)
    setTittel('')
  }

  function lagre() {
    const t = tittel.trim()
    if (!t) return
    start(async () => {
      try {
        const { id } = await opprettAlbum({ tittel: t })
        lukk()
        router.push(`/album/${id}`)
      } catch (e) {
        console.error(e)
        alert('Kunne ikke opprette album')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setApen(true)}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 'var(--radius-card)',
          border: '0.5px dashed var(--border)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Icon name="plus" size={16} color="var(--accent)" />
        Nytt album
      </button>

      {apen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={lukk}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 400,
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 20,
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 500,
                margin: '0 0 14px',
                color: 'var(--text-primary)',
              }}
            >
              Nytt album
            </h2>
            <input
              type="text"
              value={tittel}
              onChange={e => setTittel(e.target.value)}
              autoFocus
              placeholder="Tittel"
              maxLength={200}
              onKeyDown={e => {
                if (e.key === 'Enter') lagre()
                else if (e.key === 'Escape') lukk()
              }}
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '0.5px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                padding: '10px 12px',
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={lukk}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: '0.5px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={lagre}
                disabled={!tittel.trim() || pending}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#0a0a0a',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: !tittel.trim() || pending ? 'default' : 'pointer',
                  opacity: !tittel.trim() || pending ? 0.5 : 1,
                }}
              >
                {pending ? 'Oppretter…' : 'Opprett'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
