'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { oppdaterEgenProfil } from '@/lib/actions/profil'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import { createClient } from '@/lib/supabase/client'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import BildeCropper from '@/components/ui/BildeCropper'
import OpplysningRad, { opplysningVerdiStil, OPPLYSNING_INPUT_RESET } from '@/components/profil/OpplysningRad'
import OpplysningTekstfelt from '@/components/profil/OpplysningTekstfelt'
import { STIKKORD_MAKS_LENGDE, MATALLERGIER_MAKS_LENGDE } from '@/lib/konstanter'

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

/**
 * Lokal wrapper rundt OpplysningRad (#685-review): etiketten i en rad er en
 * <div>, ikke en <label>, fordi primitiven også brukes fra /profil der det
 * ikke finnes noen kontroll å knytte den til. I skjemaet ga det kontrollene
 * INGEN tilgjengelig navn — en skjermleser leste «edit, blank» for
 * Visningsnavn, Fødselsdato og Telefon.
 *
 * Mekanismen er `aria-label` på kontrollen, og den brukes konsekvent på
 * hver eneste kontroll i dette skjemaet — ikke htmlFor på noen og aria-label
 * på andre. Wrapperen gir kalleren etikettstrengen tilbake slik at teksten
 * som VISES og navnet som LESES OPP per konstruksjon er samme streng, og
 * ikke kan drifte fra hverandre ved en senere ordlyd-endring.
 */
function RedigerRad({
  label,
  last,
  children,
}: {
  label: string
  last?: boolean
  children: (ariaLabel: string) => React.ReactNode
}) {
  return (
    <OpplysningRad label={label} last={last}>
      {children(label)}
    </OpplysningRad>
  )
}

// Rad brukes fortsatt i «Sikkerhet» — den seksjonen er URØRT av #685.
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
          {/* Navn flyttet hit fra «Personalia» (#685) — identiteten (bilde +
              navn) hører sammen visuelt, i stedet for at navnet sto som
              første rad i skjemaet under. Samme display-stil som den
              statiske diven den erstatter. */}
          <input
            type="text"
            value={navn}
            onChange={e => setNavn(e.target.value)}
            required
            placeholder="Ditt navn"
            aria-label="Navn"
            // opplysning-verdi er ikke bare stil: OPPLYSNING_INPUT_RESET
            // fjerner outline, og :focus-visible-regelen i globals.css er
            // det som gir tastaturbrukeren markeringen tilbake
            // (#685-review). Feltet har verken ramme eller bakgrunn, så uten
            // klassen er det umulig å se hvor fokus står.
            className="opplysning-verdi"
            style={{
              ...OPPLYSNING_INPUT_RESET,
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.3px',
              marginBottom: 2,
            }}
          />
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

      {/* Om deg — én seksjon i STEDET for «Personalia»+«Kontakt» (#685):
          radene her har nøyaktig samme rekkefølge, etiketter og layout
          (OpplysningRad/opplysningVerdiStil) som «Om deg» på /profil, slik
          at å trykke «Rediger» oppleves som at de samme radene blir
          redigerbare — ikke som et annet skjema. Navn er flyttet ut til
          identitetsblokka over (se input der). */}
      <SkjemaSeksjon label="Om deg">
        <RedigerRad label="Visningsnavn">
          {ariaLabel => (
            <input
              type="text"
              value={visningsnavn}
              onChange={e => setVisningsnavn(e.target.value)}
              placeholder={navn}
              aria-label={ariaLabel}
              className="opplysning-verdi"
              style={{ ...OPPLYSNING_INPUT_RESET, ...opplysningVerdiStil() }}
            />
          )}
        </RedigerRad>
        <RedigerRad label="Fødselsdato">
          {ariaLabel => (
            <input
              type="date"
              value={fodselsdato}
              onChange={e => setFodselsdato(e.target.value)}
              aria-label={ariaLabel}
              className="opplysning-verdi"
              // width: 'auto' overstyrer resettens 100 % (#685-review): en
              // <input type="date"> ignorerer text-align — UA-ens shadow-DOM
              // legger delfeltene ut som en intern flex-boks — så en kontroll
              // i full bredde plasserer datoen til venstre uansett. Krympet til
              // sitt eget innhold skyver radens space-between den på plass i
              // høyre kolonne, uten ::-webkit-hacks. Fargeskjemaet (og dermed
              // kalenderikonet) følger nå appens tema via color-scheme på :root
              // i globals.css, ikke en overstyring her.
              style={{ ...OPPLYSNING_INPUT_RESET, ...opplysningVerdiStil(), width: 'auto', marginLeft: 'auto' }}
            />
          )}
        </RedigerRad>
        <RedigerRad label="Telefon">
          {ariaLabel => (
            <input
              type="tel"
              value={telefon}
              onChange={e => setTelefon(e.target.value)}
              placeholder="Ikke satt"
              aria-label={ariaLabel}
              className="opplysning-verdi"
              style={{ ...OPPLYSNING_INPUT_RESET, ...opplysningVerdiStil() }}
            />
          )}
        </RedigerRad>
        {/* Eneste raden som beholder OpplysningRad direkte: e-post er ikke
            redigerbar, så det finnes ingen kontroll å gi et tilgjengelig
            navn — etiketten og verdien leses som vanlig tekst. */}
        <OpplysningRad label="E-post">
          <div className="opplysning-verdi" style={opplysningVerdiStil({ mono: true, dempet: true })}>{epost}</div>
        </OpplysningRad>
        {/* Fritekstfeltene bruker OpplysningTekstfelt, ikke <input>: 200 tegn
            må kunne wrappe over flere linjer akkurat som verdien gjør på
            /profil (#685-review, BLOCKER). */}
        <RedigerRad label="Matallergier">
          {ariaLabel => (
            <OpplysningTekstfelt
              verdi={matallergier}
              onEndre={setMatallergier}
              maksLengde={MATALLERGIER_MAKS_LENGDE}
              placeholder="Ikke satt"
              ariaLabel={ariaLabel}
            />
          )}
        </RedigerRad>
        {/* Ingen hjelpetekst i denne raden (#685) — fritekst med maxLength
            har ingen regel å forklare, i motsetning til komma-formatet den
            tidligere listen krevde. */}
        <RedigerRad label="Stikkord om deg" last>
          {ariaLabel => (
            <OpplysningTekstfelt
              verdi={stikkord}
              onEndre={setStikkord}
              maksLengde={STIKKORD_MAKS_LENGDE}
              placeholder="Ikke satt"
              ariaLabel={ariaLabel}
            />
          )}
        </RedigerRad>
      </SkjemaSeksjon>

      {/* Synlighets-merknaden er den ENESTE opplysningen medlemmet får om at
          et art. 9-helsefelt (matallergier, jf. migrasjon 141 § PERSONVERN)
          deles med hele klubben, og skal derfor ikke kunne feilleses. Den sto
          tidligere høyrestilt i verdikolonnen 3 px under allergiverdien, der
          den leste som en fortsettelse av selve verdien (#685-review). Som
          venstrestilt fotnote under seksjonen er den utvetydig en merknad —
          og den dekker begge fritekstfeltene, ikke bare det ene.
          marginTop: -20 spiser opp SkjemaSeksjons egen bunnmarg på 28 px, så
          avstanden opp til siste rad blir 8 px. */}
      <div
        style={{
          marginTop: -20,
          marginBottom: 28,
          padding: '0 4px',
          textAlign: 'left',
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          lineHeight: 1.4,
          color: 'var(--text-tertiary)',
        }}
      >
        Matallergier og stikkord er synlige for alle i klubben.
      </div>

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
                // Samme mekanisme som radene over (#685-review): etiketten er
                // en <div>, ikke en <label>, så navnet må komme herfra.
                aria-label="Nytt passord"
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
                aria-label="Bekreft"
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
