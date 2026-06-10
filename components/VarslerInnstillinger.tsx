'use client'

import { useEffect, useState, useTransition } from 'react'
import SectionLabel from '@/components/ui/SectionLabel'
import { ToggleRad } from '@/components/ui/ToggleSwitch'

type PushStatus = 'laster' | 'aktiv' | 'inaktiv' | 'avslatt' | 'ikke-stottet'

export default function VarslerInnstillinger({
  pushAktiv: initialPushAktiv,
  epostAktiv: initialEpostAktiv,
}: {
  pushAktiv: boolean
  epostAktiv: boolean
}) {
  const [pushStatus, setPushStatus] = useState<PushStatus>('laster')
  const [epostAktiv, setEpostAktiv] = useState(initialEpostAktiv)
  const [pushAktiv, setPushAktiv] = useState(initialPushAktiv)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('ikke-stottet')
      return
    }
    if (Notification.permission === 'denied') {
      setPushStatus('avslatt')
      return
    }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setPushStatus(sub && pushAktiv ? 'aktiv' : 'inaktiv')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function oppdaterPreferanse(felt: 'push_aktiv' | 'epost_aktiv', verdi: boolean) {
    const res = await fetch('/api/varsel-preferanser', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [felt]: verdi }),
    })
    return res.ok
  }

  async function togglePush() {
    if (pushStatus === 'aktiv') {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      await oppdaterPreferanse('push_aktiv', false)
      setPushAktiv(false)
      setPushStatus('inaktiv')
    } else {
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setPushStatus('avslatt')
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      await oppdaterPreferanse('push_aktiv', true)
      setPushAktiv(true)
      setPushStatus('aktiv')
    }
  }

  function toggleEpost() {
    const nyVerdi = !epostAktiv
    startTransition(async () => {
      const ok = await oppdaterPreferanse('epost_aktiv', nyVerdi)
      if (ok) setEpostAktiv(nyVerdi)
    })
  }

  const pushStottet = pushStatus !== 'ikke-stottet'
  const pushSubtekst =
    pushStatus === 'laster'
      ? 'Sjekker…'
      : pushStatus === 'avslatt'
      ? 'Blokkert i nettleseren'
      : pushStatus === 'aktiv'
      ? 'Du får push-varsler på denne enheten'
      : 'Push-varsler er av'

  const rader: Array<{
    label: string
    sub: string
    on: boolean
    onChange?: () => void
    disabled?: boolean
  }> = [
    {
      label: 'E-post',
      sub: epostAktiv ? 'Du får varsler på e-post' : 'E-postvarsler er av',
      on: epostAktiv,
      onChange: toggleEpost,
      disabled: isPending,
    },
  ]
  if (pushStottet) {
    rader.push({
      label: 'Push',
      sub: pushSubtekst,
      on: pushStatus === 'aktiv',
      onChange:
        pushStatus === 'avslatt' || pushStatus === 'laster' ? undefined : togglePush,
      disabled: pushStatus === 'avslatt' || pushStatus === 'laster',
    })
  }

  return (
    <section style={{ marginBottom: 20 }}>
      <SectionLabel>Varselinnstillinger</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rader.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 4px',
              borderBottom:
                i < rader.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
              gap: 16,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.2px',
                  lineHeight: 1.2,
                  marginBottom: 2,
                }}
              >
                {r.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.1px',
                }}
              >
                {r.sub}
              </div>
            </div>
            <ToggleRad
              on={r.on}
              onChange={r.onChange ?? (() => {})}
              disabled={r.disabled}
              ariaLabel={r.on ? `Slå av ${r.label}` : `Slå på ${r.label}`}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
