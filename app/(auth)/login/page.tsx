'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import { KLUBB_NAVN, KLUBB_KORTNAVN } from '@/lib/klubb-config'

const inputStil: React.CSSProperties = {
  background: 'var(--bg-elevated-2)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: '0.75rem',
  padding: '0.75rem 1rem',
  width: '100%',
  fontSize: '1rem',
  fontFamily: 'inherit',
}

export default function LoginSide() {
  const [epost, setEpost] = useState('')
  const [passord, setPassord] = useState('')
  const [feil, setFeil] = useState('')
  const [laster, setLaster] = useState(false)
  const [glemtPassord, setGlemtPassord] = useState(false)
  const [tilbakestiltSendt, setTilbakestiltSendt] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function loggInn(e: React.FormEvent) {
    e.preventDefault()
    setLaster(true)
    setFeil('')
    const { error } = await supabase.auth.signInWithPassword({ email: epost, password: passord })
    if (error) {
      setFeil('Feil e-post eller passord.')
      setLaster(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function sendTilbakestilling(e: React.FormEvent) {
    e.preventDefault()
    setLaster(true)
    setFeil('')
    const { error } = await supabase.auth.resetPasswordForEmail(epost)
    if (error) {
      setFeil('Klarte ikke sende e-post. Prøv igjen.')
    } else {
      setTilbakestiltSendt(true)
    }
    setLaster(false)
  }

  if (tilbakestiltSendt) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold mb-2">Sjekk e-posten</p>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Vi har sendt en kode til {epost}. Skriv den inn på neste side sammen med nytt passord.
          </p>
          <Button
            type="button"
            fullWidth
            onClick={() => router.push(`/oppdater-passord?epost=${encodeURIComponent(epost)}`)}
          >
            Skriv inn kode
          </Button>
          <button
            type="button"
            onClick={() => { setTilbakestiltSendt(false); setGlemtPassord(false); setPassord('') }}
            className="text-sm underline pt-4"
            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Tilbake til innlogging
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Toppbanner med klubblogo */}
      <div className="relative w-full px-2 pt-8 pb-2">
        <div className="flex justify-center">
          <Image
            src="/icon-512.png"
            alt={KLUBB_NAVN}
            width={160}
            height={160}
            priority
            style={{ borderRadius: 24 }}
          />
        </div>
        <div className="text-center mt-6">
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            {KLUBB_KORTNAVN}
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {KLUBB_NAVN}
          </p>
        </div>
      </div>

      {/* Skjema */}
      <div className="flex-1 flex items-start justify-center px-6 pt-8">
        <div className="w-full max-w-sm">
          {glemtPassord ? (
            <form onSubmit={sendTilbakestilling} className="space-y-4">
              <h2 className="text-lg font-semibold mb-4">Glemt passord</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Skriv inn e-posten din, så sender vi deg en kode for å sette nytt passord.
              </p>
              <div>
                <label htmlFor="epost" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>E-post</label>
                <input id="epost" type="email" value={epost} onChange={(e) => setEpost(e.target.value)} required autoComplete="email" style={inputStil} />
              </div>
              {feil && <p className="text-sm" style={{ color: 'var(--destructive)' }}>{feil}</p>}
              <Button type="submit" fullWidth disabled={laster}>{laster ? 'Sender...' : 'Send kode'}</Button>
              <button type="button" onClick={() => setGlemtPassord(false)} className="w-full text-sm underline pt-1"
                style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Tilbake til innlogging
              </button>
            </form>
          ) : (
            <form onSubmit={loggInn} className="space-y-4">
              <div>
                <label htmlFor="epost" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>E-post</label>
                <input id="epost" type="email" value={epost} onChange={(e) => setEpost(e.target.value)} required autoComplete="email" style={inputStil} />
              </div>
              <div>
                <label htmlFor="passord" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Passord</label>
                <input id="passord" type="password" value={passord} onChange={(e) => setPassord(e.target.value)} required autoComplete="current-password" style={inputStil} />
              </div>
              {feil && <p className="text-sm" style={{ color: 'var(--destructive)' }}>{feil}</p>}
              <Button type="submit" fullWidth disabled={laster} className="mt-2">{laster ? 'Logger inn...' : 'Logg inn'}</Button>
              <button type="button" onClick={() => setGlemtPassord(true)} className="w-full text-sm underline pt-1"
                style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Glemt passord?
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
