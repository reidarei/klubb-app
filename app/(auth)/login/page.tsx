'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import { KLUBB_NAVN, KLUBB_KORTNAVN } from '@/lib/klubb-config'
import { PUSH_KLIKK_LOGIN_VINDU_MS } from '@/lib/konstanter'
import { sendFeilBeacon } from '@/lib/klient-logg'
import { lesPendingNav, slettPendingNav, lokalSti } from '@/lib/pending-nav'

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

  // Push-klikk-mål mens sesjonen var utløpt (#688): et trykk på et varsel som
  // krevde innlogging skal ikke lande på agendaen etterpå. Ref, ikke state —
  // vi trenger ikke re-rendre siden, bare huske målet til loggInn() lykkes.
  //
  // `ts` bæres med (review av PR #690): vinduet ble tidligere kun sjekket der
  // oppføringen ble LEST. Blir en mann stående på login lenger enn
  // PUSH_KLIKK_LOGIN_VINDU_MS, er målet foreldet når han endelig logger inn,
  // og uten tidsstempelet i refen hadde vi ingen måte å oppdage det på.
  const ventendeRef = useRef<{ sti: string; klikkId?: string; ts: number } | null>(null)

  useEffect(() => {
    // ServiceWorkerRegistrering er IKKE montert på /login (den ligger i
    // (app)-layouten), så et push-klikk hit har ingen komponent som lytter på
    // SW-broadcasten. Cache Storage-oppslaget her er derfor eneste vei inn.
    async function lesVentendeMaal() {
      const entry = await lesPendingNav()
      if (!entry) return
      const sti = lokalSti(entry.url)
      const erFerskNok = Date.now() - entry.ts <= PUSH_KLIKK_LOGIN_VINDU_MS
      if (sti === null || !erFerskNok) {
        // Ugyldig/kryss-origin mål, eller for gammelt til å bæres gjennom en
        // innlogging — forkast det i stedet for å la det henge.
        await slettPendingNav()
        return
      }
      // IKKE slett en gyldig oppføring her: den konsumeres av (app)-
      // komponenten ved landing, ikke ved lesing (samme kontrakt som
      // lib/pending-nav.ts ellers — overleveringen skal ikke regnes som
      // konsumert før navigasjonen faktisk lykkes).
      ventendeRef.current = { sti, klikkId: entry.klikk_id, ts: entry.ts }
    }

    function lesVentendeMaalTrygt() {
      lesVentendeMaal().catch(() => {
        // Fail-open: Cache Storage kan mangle (privat modus) — ingen mål å
        // bære videre er ikke verre enn dagens oppførsel (lander på '/').
      })
    }

    lesVentendeMaalTrygt()

    // Står PWA-en allerede på /login når varselet kommer, fokuserer SW-en
    // vinduet uten remount — mount-oppslaget over ville da aldri sett
    // oppføringen. visibilitychange dekker det tilfellet der dokumentet var
    // skjult.
    function handterVisibility() {
      if (document.visibilityState === 'visible') lesVentendeMaalTrygt()
    }
    document.addEventListener('visibilitychange', handterVisibility)

    // ... men er dokumentet ALT synlig når varselet trykkes, fyrer
    // clients.focus() ingen visibilitychange (public/sw.js beskriver samme
    // tilfelle), og da hadde login ingen trigger i det hele tatt — refen
    // forble tom og innloggingen gikk fortsatt til '/' (review av PR #690).
    // SW-broadcasten er den garanterte triggeren, og speiler lytteren i
    // components/ServiceWorkerRegistrering.tsx.
    function handterSwMelding(event: MessageEvent) {
      const data = event.data
      if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
      const url = data.url
      // SW-en skriver cache-entryen FØR den broadcaster, så et nytt oppslag
      // her har full informasjon (ts + klikk_id). Feilet den skrivingen
      // (fail-open i sw.js), er URL-en i meldingen eneste signal — da bruker
      // vi den, med klikk-tidspunktet satt til nå.
      lesVentendeMaal()
        .catch(() => {})
        .then(() => {
          if (ventendeRef.current) return
          const sti = lokalSti(url)
          if (sti !== null) ventendeRef.current = { sti, ts: Date.now() }
        })
        .catch(() => {})
    }
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    sw?.addEventListener('message', handterSwMelding)

    return () => {
      document.removeEventListener('visibilitychange', handterVisibility)
      sw?.removeEventListener('message', handterSwMelding)
    }
  }, [])

  async function loggInn(e: React.FormEvent) {
    e.preventDefault()
    setLaster(true)
    setFeil('')
    const { error } = await supabase.auth.signInWithPassword({ email: epost, password: passord })
    if (error) {
      setFeil('Feil e-post eller passord.')
      setLaster(false)
    } else {
      const maal = ventendeRef.current
      // Valider vinduet på nytt HER, ikke bare der oppføringen ble lest
      // (review av PR #690): tiden mellom lesing og innsendt skjema er
      // brukerens, og den kan være lang. Et foreldet mål forkastes helt —
      // å sende en mann til en tur eller en chat han trykket på for en time
      // siden er verre enn å lande ham på agendaen.
      if (maal && Date.now() - maal.ts > PUSH_KLIKK_LOGIN_VINDU_MS) {
        ventendeRef.current = null
        slettPendingNav().catch(() => {})
        sendFeilBeacon(
          'klient.pushklikk.foreldet',
          `push-klikk-mål var ${Date.now() - maal.ts} ms gammelt ved innlogging (grense ${PUSH_KLIKK_LOGIN_VINDU_MS} ms)`,
          undefined,
          undefined,
          'warn',
        )
        router.push('/')
        router.refresh()
        return
      }
      if (maal) {
        // Varselet ble trykket mens sesjonen var utløpt og brukeren måtte
        // logge inn på nytt — verdt å telle for å vite hvor ofte det skjer
        // (#688). warn, ikke error: dette er en fungerende, om enn omstendelig,
        // vei — ikke en feil.
        sendFeilBeacon(
          'push.klikk.innlogging',
          `push-klikk-mål ${maal.sti} båret gjennom innlogging`,
          undefined,
          { kilde: 'login', klikk_id: maal.klikkId, maal: maal.sti },
          'warn',
        )
        router.push(maal.sti)
      } else {
        router.push('/')
      }
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
              {feil && <p className="text-sm" style={{ color: 'var(--danger)' }}>{feil}</p>}
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
              {feil && <p className="text-sm" style={{ color: 'var(--danger)' }}>{feil}</p>}
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
