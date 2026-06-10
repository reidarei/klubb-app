'use client'

import { useState, useEffect } from 'react'

type Status = 'laster' | 'vis' | 'skjul'

/**
 * Banner øverst på agenda som prompter brukeren til å aktivere push
 * på *denne enheten*. Per-enhet-sjekk: spør service worker etter
 * subscription og viser banneret kun hvis denne nettleseren/enheten
 * ikke har registrert seg — uavhengig av om andre enheter har det.
 */
export default function PushPaaminnelse() {
  const [status, setStatus] = useState<Status>('laster')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('skjul')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('skjul')
      return
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setStatus(sub ? 'skjul' : 'vis')
    })
  }, [])

  async function aktiverPush() {
    try {
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setStatus('skjul'); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      // Setter push_aktiv=true i preferansene så sendVarsel() sender push
      await fetch('/api/varsel-preferanser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ push_aktiv: true }),
      })
      setStatus('skjul')
    } catch {
      setStatus('skjul')
    }
  }

  if (status !== 'vis') return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        marginBottom: 24,
        background: 'var(--bg-elevated)',
        border: '0.5px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        backdropFilter: 'var(--blur-card)',
        WebkitBackdropFilter: 'var(--blur-card)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--accent)',
            letterSpacing: '1.8px',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Push
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
          }}
        >
          Aktiver push på denne enheten
        </div>
      </div>
      <button
        onClick={aktiverPush}
        style={{
          padding: '8px 14px',
          background: 'var(--accent)',
          color: '#0a0a0a',
          border: 'none',
          borderRadius: 999,
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Aktiver
      </button>
    </div>
  )
}
