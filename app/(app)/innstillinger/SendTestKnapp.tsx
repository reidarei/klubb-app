'use client'

import { useState } from 'react'
import { kjorPaaminnerManuelt } from './actions'

export default function SendTestKnapp() {
  const [status, setStatus] = useState<'idle' | 'sender' | 'ok' | 'feil'>('idle')

  async function sendTest() {
    setStatus('sender')
    const ok = await kjorPaaminnerManuelt()
    setStatus(ok ? 'ok' : 'feil')
    setTimeout(() => setStatus('idle'), 3000)
  }

  return (
    <button onClick={sendTest} disabled={status === 'sender'}
      className="text-xs py-2 px-4 rounded-xl disabled:opacity-50"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
      {status === 'sender' ? 'Sender...' : status === 'ok' ? '✓ Kjørt' : status === 'feil' ? '✗ Feil' : 'Kjør påminnelser manuelt'}
    </button>
  )
}
