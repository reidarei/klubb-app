'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Ordsky from '@/components/Ordsky'
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

export default function OppdaterPassordSide() {
  const [epost, setEpost] = useState('')
  const [kode, setKode] = useState('')
  const [passord, setPassord] = useState('')
  const [bekreft, setBekreft] = useState('')
  const [feil, setFeil] = useState('')
  const [laster, setLaster] = useState(false)
  const [ferdig, setFerdig] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const e = params.get('epost')
    if (e) setEpost(e)
  }, [])

  async function lagre(e: React.FormEvent) {
    e.preventDefault()
    setFeil('')

    if (!kode.trim()) { setFeil('Skriv inn koden fra e-posten.'); return }
    if (passord.length < 6) { setFeil('Passordet må være minst 6 tegn.'); return }
    if (passord !== bekreft) { setFeil('Passordene er ikke like.'); return }

    setLaster(true)

    const { error: verifyFeil } = await supabase.auth.verifyOtp({
      email: epost.trim(),
      token: kode.trim(),
      type: 'recovery',
    })
    if (verifyFeil) {
      setFeil('Ugyldig eller utløpt kode. Prøv å be om en ny.')
      setLaster(false)
      return
    }

    const { error: oppdaterFeil } = await supabase.auth.updateUser({ password: passord })
    if (oppdaterFeil) {
      setFeil(oppdaterFeil.message)
      setLaster(false)
      return
    }

    setFerdig(true)
    setTimeout(() => {
      router.push('/')
      router.refresh()
    }, 1500)
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="relative w-full px-2 pt-4 pb-2">
        <Ordsky className="w-full" style={{ maxHeight: '160px' }} />
        <div className="text-center mt-14">
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            {KLUBB_KORTNAVN}
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {KLUBB_NAVN}
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-6 pt-8">
        <div className="w-full max-w-sm">
          {ferdig ? (
            <div className="text-center">
              <p className="text-lg font-semibold mb-2">Passord oppdatert</p>
              <p style={{ color: 'var(--text-secondary)' }}>Sender deg videre…</p>
            </div>
          ) : (
            <form onSubmit={lagre} className="space-y-4">
              <h2 className="text-lg font-semibold mb-1">Sett nytt passord</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Skriv inn koden du fikk på e-post, og velg et nytt passord.
              </p>
              <div>
                <label htmlFor="epost" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>E-post</label>
                <input id="epost" type="email" value={epost} onChange={(e) => setEpost(e.target.value)} required autoComplete="email" style={inputStil} />
              </div>
              <div>
                <label htmlFor="kode" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Kode fra e-post</label>
                <input id="kode" type="text" inputMode="numeric" autoComplete="one-time-code" value={kode} onChange={(e) => setKode(e.target.value)} required style={inputStil} />
              </div>
              <div>
                <label htmlFor="passord" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nytt passord</label>
                <input id="passord" type="password" value={passord} onChange={(e) => setPassord(e.target.value)} required autoComplete="new-password" style={inputStil} />
              </div>
              <div>
                <label htmlFor="bekreft" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Bekreft passord</label>
                <input id="bekreft" type="password" value={bekreft} onChange={(e) => setBekreft(e.target.value)} required autoComplete="new-password" style={inputStil} />
              </div>
              {feil && <p className="text-sm" style={{ color: 'var(--destructive)' }}>{feil}</p>}
              <Button type="submit" fullWidth disabled={laster}>{laster ? 'Lagrer…' : 'Lagre nytt passord'}</Button>
              <button type="button" onClick={() => router.push('/login')} className="w-full text-sm underline pt-1"
                style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Tilbake til innlogging
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
