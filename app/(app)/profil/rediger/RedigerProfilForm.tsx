'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { oppdaterEgenProfil } from '@/lib/actions/profil'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import { createClient } from '@/lib/supabase/client'
import { genererFilnavn } from '@/lib/bilde-utils'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import BildeCropper from '@/components/ui/BildeCropper'

type Props = {
  navn: string
  visningsnavn: string
  telefon: string
  fodselsdato: string
  epost: string
  bildeUrl: string | null
  rolle?: string | null
}

const labelStil: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '1.6px',
  marginBottom: 4,
}

const inputBaseStil: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  color: 'var(--text-primary)',
  lineHeight: 1.5,
}

const accentInputStil: React.CSSProperties = {
  ...inputBaseStil,
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 500,
  letterSpacing: '-0.3px',
  color: 'var(--accent)',
}

function Rad({
  children,
  last,
}: {
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      style={{
        padding: '10px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  )
}

export default function RedigerProfilForm({
  navn: navnInit,
  visningsnavn: visnInit,
  telefon: tlfInit,
  fodselsdato: fdInit,
  epost,
  bildeUrl: bildeUrlInit,
  rolle,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const filInputRef = useRef<HTMLInputElement>(null)

  const [navn, setNavn] = useState(navnInit)
  const [visningsnavn, setVisningsnavn] = useState(visnInit)
  const [telefon, setTelefon] = useState(tlfInit)
  const [fodselsdato, setFodselsdato] = useState(fdInit)

  // bildeUrl = lagret URL i DB. bildeFil = ventende ny upload (komprimert
  // + cropped, ikke lastet opp ennå). bildeFjernet = brukeren har klikket
  // "fjern". Submit avgjør hva som faktisk skjer mot R2 + DB.
  const [bildeUrl] = useState<string | null>(bildeUrlInit)
  const [bildeFil, setBildeFil] = useState<File | null>(null)
  const [bildeFjernet, setBildeFjernet] = useState(false)
  const previewUrl = useMemo(() => {
    if (bildeFil) return URL.createObjectURL(bildeFil)
    if (bildeFjernet) return null
    return bildeUrl
  }, [bildeFil, bildeFjernet, bildeUrl])
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const [bildeFeil, setBildeFeil] = useState('')
  const [cropFil, setCropFil] = useState<File | null>(null)

  const [visPassord, setVisPassord] = useState(false)
  const [passord, setPassord] = useState('')
  const [bekreft, setBekreft] = useState('')
  const [passordFeil, setPassordFeil] = useState('')

  function handleBildeVelg(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0]
    if (!fil) return
    setBildeFeil('')
    setCropFil(fil)
    // Nullstill input så samme fil kan velges igjen senere om nødvendig
    if (filInputRef.current) filInputRef.current.value = ''
  }

  function handleCropFerdig(blob: Blob) {
    setCropFil(null)
    setBildeFeil('')
    const croppet = new File([blob], 'profil.jpg', { type: 'image/jpeg' })
    setBildeFil(croppet)
    setBildeFjernet(false)
  }

  function handleFjernBilde() {
    setBildeFil(null)
    setBildeFjernet(true)
    setBildeFeil('')
  }

  function handleLagre() {
    setPassordFeil('')
    if (visPassord && passord) {
      if (passord.length < 6) {
        setPassordFeil('Passordet må være minst 6 tegn')
        return
      }
      if (passord !== bekreft) {
        setPassordFeil('Passordene er ikke like')
        return
      }
    }

    startTransition(async () => {
      // Last opp ny fil først hvis valgt. bildeFjernet uten ny fil → null.
      let nyBildeUrl: string | null = bildeUrl
      if (bildeFil) {
        const fd = new FormData()
        fd.append('fil', bildeFil)
        fd.append('filnavn', genererFilnavn(bildeFil))
        fd.append('kategori', 'profiler')
        try {
          const res = await lastOppBilde(fd)
          nyBildeUrl = res.url
        } catch (err) {
          setBildeFeil(err instanceof Error ? err.message : 'Opplasting feilet')
          return
        }
      } else if (bildeFjernet) {
        nyBildeUrl = null
      }

      await oppdaterEgenProfil({
        navn,
        visningsnavn: visningsnavn || navn,
        telefon,
        fodselsdato: fodselsdato || undefined,
        bilde_url: nyBildeUrl,
      })

      // Slett gammelt R2-bilde hvis byttet eller fjernet (best effort)
      if (bildeUrl && bildeUrl !== nyBildeUrl) {
        slettBilde(bildeUrl).catch(() => {})
      }

      if (visPassord && passord) {
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password: passord })
        if (error) {
          setPassordFeil(error.message)
          return
        }
      }

      router.push('/profil')
      router.refresh()
    })
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {cropFil && (
        <BildeCropper
          fil={cropFil}
          onFerdig={handleCropFerdig}
          onAvbryt={() => setCropFil(null)}
        />
      )}

      <SkjemaBar
        overtittel="Rediger"
        tittel="Profil"
        onAvbryt={() => router.push('/profil')}
        onLagre={handleLagre}
        laster={isPending}
      />

      {/* Avatar-editor */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 4px 18px',
          borderTop: '0.5px solid var(--border-subtle)',
          borderBottom: '0.5px solid var(--border-subtle)',
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          onClick={() => filInputRef.current?.click()}
          disabled={isPending}
          aria-label={previewUrl ? 'Bytt profilbilde' : 'Last opp profilbilde'}
          style={{
            position: 'relative',
            flexShrink: 0,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          <Avatar name={navn} size={56} src={previewUrl} rolle={rolle} />
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: '#0a0a0a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--bg)',
            }}
          >
            <Icon name="plus" size={11} color="#0a0a0a" strokeWidth={2.5} />
          </div>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.3px',
              marginBottom: 2,
            }}
          >
            {navn || 'Ditt navn'}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => filInputRef.current?.click()}
              disabled={isPending}
              style={{
                background: 'none',
                border: 'none',
                cursor: isPending ? 'wait' : 'pointer',
                padding: 0,
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {isPending ? 'Lagrer…' : previewUrl ? 'Bytt bilde' : 'Last opp bilde'}
            </button>
            {previewUrl && !isPending && (
              <button
                type="button"
                onClick={handleFjernBilde}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Fjern
              </button>
            )}
          </div>
          {bildeFeil && (
            <div
              style={{
                marginTop: 4,
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                color: 'var(--danger)',
              }}
            >
              {bildeFeil}
            </div>
          )}
        </div>
        <input
          ref={filInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleBildeVelg}
        />
      </div>

      {/* Personalia */}
      <SkjemaSeksjon label="Personalia">
        <Rad>
          <div style={labelStil}>Navn</div>
          <input
            type="text"
            value={navn}
            onChange={e => setNavn(e.target.value)}
            style={accentInputStil}
            required
          />
        </Rad>
        <Rad>
          <div style={labelStil}>Visningsnavn</div>
          <input
            type="text"
            value={visningsnavn}
            onChange={e => setVisningsnavn(e.target.value)}
            style={inputBaseStil}
            placeholder={navn}
          />
        </Rad>
        <Rad last>
          <div style={labelStil}>Fødselsdato</div>
          <input
            type="date"
            value={fodselsdato}
            onChange={e => setFodselsdato(e.target.value)}
            style={{ ...inputBaseStil, colorScheme: 'dark' }}
          />
        </Rad>
      </SkjemaSeksjon>

      {/* Kontakt */}
      <SkjemaSeksjon label="Kontakt">
        <Rad>
          <div style={labelStil}>E-post</div>
          <div
            style={{
              ...inputBaseStil,
              color: 'var(--text-secondary)',
            }}
          >
            {epost}
          </div>
        </Rad>
        <Rad last>
          <div style={labelStil}>Telefon</div>
          <input
            type="tel"
            value={telefon}
            onChange={e => setTelefon(e.target.value)}
            style={inputBaseStil}
            placeholder="+47 ..."
          />
        </Rad>
      </SkjemaSeksjon>

      {/* Sikkerhet */}
      <SkjemaSeksjon label="Sikkerhet">
        <button
          type="button"
          onClick={() => setVisPassord(v => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 4px',
            cursor: 'pointer',
            gap: 16,
            background: 'none',
            border: 'none',
            borderBottom: visPassord ? '0.5px solid var(--border-subtle)' : 'none',
            textAlign: 'left',
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
                marginBottom: 2,
              }}
            >
              Endre passord
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1px',
              }}
            >
              {visPassord ? 'Fyll inn nytt passord nedenfor' : 'Sett nytt passord for innlogging'}
            </div>
          </div>
          <div style={{ transform: visPassord ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
            <Icon name="chevron" size={14} color="var(--text-tertiary)" />
          </div>
        </button>

        {visPassord && (
          <div style={{ padding: '14px 4px 4px' }}>
            <Rad>
              <div style={labelStil}>Nytt passord</div>
              <input
                type="password"
                value={passord}
                onChange={e => setPassord(e.target.value)}
                style={inputBaseStil}
                autoComplete="new-password"
              />
            </Rad>
            <Rad last>
              <div style={labelStil}>Bekreft</div>
              <input
                type="password"
                value={bekreft}
                onChange={e => setBekreft(e.target.value)}
                style={inputBaseStil}
                autoComplete="new-password"
              />
            </Rad>
            {passordFeil && (
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--danger)',
                  marginTop: 10,
                  padding: '0 4px',
                }}
              >
                {passordFeil}
              </div>
            )}
          </div>
        )}
      </SkjemaSeksjon>
    </div>
  )
}
