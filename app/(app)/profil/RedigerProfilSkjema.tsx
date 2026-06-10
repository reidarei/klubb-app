'use client'

import { useState, useTransition } from 'react'
import { oppdaterEgenProfil } from '@/lib/actions/profil'
import { createClient } from '@/lib/supabase/client'
import { formaterDato } from '@/lib/dato'
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
  fontSize: '1rem',
  fontFamily: 'inherit',
}

export default function RedigerProfilSkjema({
  navn, visningsnavn, epost, telefon, rolle, fodselsdato,
}: {
  navn: string; visningsnavn: string; epost: string; telefon: string; rolle: string; fodselsdato: string
}) {
  const [redigerer, setRedigerer] = useState(false)
  const [lagret, setLagret] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Passordbytte-state
  const [visPassord, setVisPassord] = useState(false)
  const [passord, setPassord] = useState('')
  const [bekreft, setBekreft] = useState('')
  const [passordStatus, setPassordStatus] = useState<'idle' | 'lagrer' | 'ok' | 'feil'>('idle')
  const [passordFeil, setPassordFeil] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await oppdaterEgenProfil({
        navn: fd.get('navn') as string,
        visningsnavn: fd.get('visningsnavn') as string,
        telefon: fd.get('telefon') as string,
        fodselsdato: fd.get('fodselsdato') as string,
      })

      // Endre passord hvis fylt inn
      const nyttPassord = fd.get('passord') as string
      if (nyttPassord) {
        setPassordFeil('')
        if (nyttPassord.length < 6) { setPassordFeil('Passordet må være minst 6 tegn'); return }
        if (nyttPassord !== (fd.get('bekreft_passord') as string)) { setPassordFeil('Passordene er ikke like'); return }
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password: nyttPassord })
        if (error) { setPassordFeil(error.message); return }
      }

      setRedigerer(false)
      setVisPassord(false)
      setPassord('')
      setBekreft('')
      setPassordStatus('idle')
      setLagret(true)
      setTimeout(() => setLagret(false), 3000)
    })
  }

  async function handleEndrePassord(e: React.FormEvent) {
    e.preventDefault()
    setPassordFeil('')
    if (passord.length < 6) { setPassordFeil('Passordet må være minst 6 tegn'); return }
    if (passord !== bekreft) { setPassordFeil('Passordene er ikke like'); return }
    setPassordStatus('lagrer')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: passord })
    if (error) {
      setPassordFeil(error.message)
      setPassordStatus('feil')
    } else {
      setPassordStatus('ok')
      setPassord('')
      setBekreft('')
      setTimeout(() => { setVisPassord(false); setPassordStatus('idle') }, 2000)
    }
  }

  return (
    <Card className="mb-4">
      {/* Read-only seksjon — alltid synlig */}
      <div className="space-y-3 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Rolle</p>
          <p className="font-medium capitalize">{rolle}</p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>E-post</p>
          <p className="font-medium">{epost}</p>
        </div>
      </div>

      {!redigerer ? (
        <>
          <div className="space-y-3 mb-4">
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Fullt navn</p>
              <p className="font-medium">{navn}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Visningsnavn</p>
              <p className="font-medium">{visningsnavn}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Telefon</p>
              <p className="font-medium">{telefon || '–'}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>Fødselsdato</p>
              <p className="font-medium">
                {fodselsdato
                  ? formaterDato(fodselsdato, 'd. MMMM yyyy')
                  : '–'}
              </p>
            </div>
          </div>
          <Button variant="secondary" fullWidth onClick={() => setRedigerer(true)}>
            {lagret ? '✓ Lagret' : 'Rediger'}
          </Button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>Fullt navn</label>
            <input name="navn" type="text" required defaultValue={navn} style={inputStil} />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>Visningsnavn</label>
            <input name="visningsnavn" type="text" required defaultValue={visningsnavn} style={inputStil} />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>Telefon</label>
            <input name="telefon" type="tel" defaultValue={telefon} style={inputStil} />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>Fødselsdato</label>
            <input name="fodselsdato" type="date" defaultValue={fodselsdato} style={inputStil} />
          </div>

          {/* Passordbytte — sammenleggbar */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setVisPassord(v => !v)}
              className="w-full text-left px-4 py-3 flex items-center gap-2.5 text-sm"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <KeyIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <span>Endre passord</span>
              <span className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>{visPassord ? '▲' : '▼'}</span>
            </button>
            {visPassord && (
              <div className="px-4 pb-4 pt-3 space-y-3" style={{ background: 'var(--bg-elevated-2)' }}>
                <input
                  name="passord"
                  type="password"
                  placeholder="Nytt passord"
                  value={passord}
                  onChange={e => setPassord(e.target.value)}
                  style={{ ...inputStil, fontSize: '0.875rem' }}
                />
                <input
                  name="bekreft_passord"
                  type="password"
                  placeholder="Bekreft nytt passord"
                  value={bekreft}
                  onChange={e => setBekreft(e.target.value)}
                  style={{ ...inputStil, fontSize: '0.875rem' }}
                />
                {passordFeil && <p className="text-xs" style={{ color: 'var(--destructive)' }}>{passordFeil}</p>}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="secondary" fullWidth onClick={() => { setRedigerer(false); setVisPassord(false); setPassord(''); setBekreft(''); setPassordFeil('') }}>Avbryt</Button>
            <Button type="submit" fullWidth disabled={isPending}>{isPending ? 'Lagrer...' : 'Lagre'}</Button>
          </div>
        </form>
      )}
    </Card>
  )
}
