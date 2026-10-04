'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { oppdaterEgenProfil } from '@/lib/actions/profil'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import { createClient } from '@/lib/supabase/client'
import SkjemaBar from '@/components/ui/SkjemaBar'
import { SkjemaGruppe, SkjemaRad, RadInput, DatoFelt, TekstRad } from '@/components/ui/Skjema'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import BildeCropper from '@/components/ui/BildeCropper'
import { STIKKORD_MAKS_LENGDE, MATALLERGIER_MAKS_LENGDE } from '@/lib/konstanter'
import { PilleKnapp } from '@/components/ui/TreffPille'

type Props = {
  navn: string
  visningsnavn: string
  telefon: string
  fodselsdato: string
  epost: string
  bildeUrl: string | null
  rolle?: string | null
  stikkord: string
  matallergier: string | null
}

export default function RedigerProfilForm({
  navn: navnInit,
  visningsnavn: visnInit,
  telefon: tlfInit,
  fodselsdato: fdInit,
  epost,
  bildeUrl: bildeUrlInit,
  rolle,
  stikkord: stikkordInit,
  matallergier: matallergierInit,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const filInputRef = useRef<HTMLInputElement>(null)

  const [navn, setNavn] = useState(navnInit)
  const [visningsnavn, setVisningsnavn] = useState(visnInit)
  const [telefon, setTelefon] = useState(tlfInit)
  const [fodselsdato, setFodselsdato] = useState(fdInit)
  // Fritekst — normaliseres først ved lagring (server-side, se
  // oppdaterEgenProfil). Å normalisere underveis ville hoppet brukeren midt
  // i skriving.
  const [stikkord, setStikkord] = useState(stikkordInit)
  const [matallergier, setMatallergier] = useState(matallergierInit ?? '')

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
        stikkord,
        matallergier,
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
            padding: 0
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
              color: 'var(--accent-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--bg)',
            }}
          >
            <Icon name="plus" size={11} color="var(--accent-foreground)" strokeWidth={2.5} />
          </div>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <PilleKnapp
              type="button"
              onClick={() => filInputRef.current?.click()}
              disabled={isPending}
              pilleStil={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
              }}
              synligHoyde={16}
            >
              {isPending ? 'Lagrer…' : previewUrl ? 'Bytt bilde' : 'Last opp bilde'}
            </PilleKnapp>
            {previewUrl && !isPending && (
              <PilleKnapp
                type="button"
                onClick={handleFjernBilde}
                pilleStil={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 500,
                }}
                synligHoyde={16}
              >
                Fjern
              </PilleKnapp>
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

      {/* Navnet står i sin egen rad rett under bildet — identiteten (bilde +
          navn) hører sammen. aria-label på hver kontroll: DatoFelt-verdien
          ville ellers havnet i det tilgjengelige navnet til raden. */}
      <SkjemaGruppe>
        <SkjemaRad etikett="Navn">
          <RadInput
            type="text"
            value={navn}
            onChange={e => setNavn(e.target.value)}
            required
            placeholder="Ditt navn"
            aria-label="Navn"
          />
        </SkjemaRad>
      </SkjemaGruppe>

      {/* Om deg — samme rader i samme rekkefølge som «Om deg» på /profil (#685),
          så «Rediger» oppleves som at de samme radene blir redigerbare. Navn
          står i boksen over. */}
      <SkjemaGruppe
        tittel="Om deg"
        hjelp="Matallergier og stikkord er synlige for alle i klubben."
      >
        <SkjemaRad etikett="Visningsnavn">
          <RadInput
            type="text"
            value={visningsnavn}
            onChange={e => setVisningsnavn(e.target.value)}
            placeholder={navn}
            aria-label="Visningsnavn"
          />
        </SkjemaRad>
        <SkjemaRad etikett="Fødselsdato">
          <DatoFelt
            value={fodselsdato}
            onChange={e => setFodselsdato(e.target.value)}
            plassholder="Ikke satt"
            aria-label="Fødselsdato"
          />
        </SkjemaRad>
        <SkjemaRad etikett="Telefon">
          <RadInput
            type="tel"
            value={telefon}
            onChange={e => setTelefon(e.target.value)}
            placeholder="Ikke satt"
            aria-label="Telefon"
          />
        </SkjemaRad>
        {/* E-post er ikke redigerbar — ren visning i samme rad-form. */}
        <SkjemaRad etikett="E-post">
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: 'var(--text-tertiary)',
              overflowWrap: 'anywhere',
              textAlign: 'right',
            }}
          >
            {epost}
          </span>
        </SkjemaRad>
        {/* Fritekst: 200 tegn må kunne wrappe over flere linjer (#685-review),
            derfor TekstRad. Enter blokkeres — verdien lagres som én linje. */}
        <TekstRad
          etikett="Matallergier"
          minRader={1}
          value={matallergier}
          onChange={e => setMatallergier(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          maxLength={MATALLERGIER_MAKS_LENGDE}
          placeholder="Ikke satt"
          aria-label="Matallergier"
        />
        <TekstRad
          etikett="Stikkord om deg"
          minRader={1}
          value={stikkord}
          onChange={e => setStikkord(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          maxLength={STIKKORD_MAKS_LENGDE}
          placeholder="Ikke satt"
          aria-label="Stikkord om deg"
        />
      </SkjemaGruppe>

      {/* Sikkerhet */}
      <SkjemaGruppe tittel="Sikkerhet" feil={passordFeil}>
        <button
          type="button"
          onClick={() => setVisPassord(v => !v)}
          aria-expanded={visPassord}
          style={{
            width: '100%',
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            gap: 16,
            background: 'none',
            border: 'none',
            textAlign: 'left',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-primary)' }}>
              Endre passord
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {visPassord ? 'Fyll inn nytt passord nedenfor' : 'Sett nytt passord for innlogging'}
            </div>
          </div>
          <div style={{ transform: visPassord ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
            <Icon name="chevron" size={14} color="var(--text-tertiary)" />
          </div>
        </button>

        {visPassord && (
          <>
            <SkjemaRad etikett="Nytt passord">
              <RadInput
                type="password"
                value={passord}
                onChange={e => setPassord(e.target.value)}
                aria-label="Nytt passord"
                autoComplete="new-password"
              />
            </SkjemaRad>
            <SkjemaRad etikett="Bekreft">
              <RadInput
                type="password"
                value={bekreft}
                onChange={e => setBekreft(e.target.value)}
                aria-label="Bekreft"
                autoComplete="new-password"
              />
            </SkjemaRad>
          </>
        )}
      </SkjemaGruppe>
    </div>
  )
}
