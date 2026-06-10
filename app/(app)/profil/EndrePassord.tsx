'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { KeyIcon } from '@heroicons/react/24/outline'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const inputStil: React.CSSProperties = {
  background: 'var(--bg-elevated-2)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: '0.75rem',
  padding: '0.75rem 1rem',
  width: '100%',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
}

export default function EndrePassord() {
  const [aapen, setAapen] = useState(false)
  const [passord, setPassord] = useState('')
  const [bekreft, setBekreft] = useState('')
  const [status, setStatus] = useState<'idle' | 'lagrer' | 'ok' | 'feil'>('idle')
  const [feilmelding, setFeilmelding] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFeilmelding('')

    if (passord.length < 6) { setFeilmelding('Passordet må være minst 6 tegn'); return }
    if (passord !== bekreft) { setFeilmelding('Passordene er ikke like'); return }

    setStatus('lagrer')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: passord })

    if (error) {
      setFeilmelding(error.message)
      setStatus('feil')
    } else {
      setStatus('ok')
      setPassord('')
      setBekreft('')
      setTimeout(() => { setAapen(false); setStatus('idle') }, 2000)
    }
  }

  if (!aapen) {
    return (
      <button
        onClick={() => setAapen(true)}
        className="w-full text-left text-sm px-5 py-3.5 rounded-2xl mt-4 flex items-center gap-2.5"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'inherit', cursor: 'pointer' }}
      >
        <KeyIcon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        Endre passord
      </button>
    )
  }

  return (
    <Card className="mt-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Endre passord</p>
        <input type="password" placeholder="Nytt passord" value={passord} onChange={e => setPassord(e.target.value)} style={inputStil} />
        <input type="password" placeholder="Bekreft nytt passord" value={bekreft} onChange={e => setBekreft(e.target.value)} style={inputStil} />
        {feilmelding && <p className="text-xs" style={{ color: 'var(--destructive)' }}>{feilmelding}</p>}
        {status === 'ok' && <p className="text-xs" style={{ color: 'var(--success)' }}>Passord oppdatert!</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={status === 'lagrer'}>{status === 'lagrer' ? 'Lagrer…' : 'Lagre'}</Button>
          <Button type="button" variant="ghost" onClick={() => { setAapen(false); setPassord(''); setBekreft(''); setFeilmelding(''); setStatus('idle') }}>Avbryt</Button>
        </div>
      </form>
    </Card>
  )
}
