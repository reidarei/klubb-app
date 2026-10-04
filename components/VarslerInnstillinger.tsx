'use client'

import { useEffect, useState, useTransition } from 'react'
import { SkjemaGruppe, SkjemaRad, ValgFelt } from '@/components/ui/Skjema'
import { ProfilRad } from '@/components/profil/ProfilRad'
import { ToggleRad } from '@/components/ui/ToggleSwitch'
import { meldKlientfeil } from '@/lib/klient-logg'

type PushStatus = 'laster' | 'aktiv' | 'inaktiv' | 'avslatt' | 'ikke-stottet'

type VarselNivaa = 'viktige' | 'alle'

export default function VarslerInnstillinger({
  pushAktiv: initialPushAktiv,
  epostAktiv: initialEpostAktiv,
  varselNivaa: initialVarselNivaa,
}: {
  pushAktiv: boolean
  epostAktiv: boolean
  varselNivaa: VarselNivaa
}) {
  const [pushStatus, setPushStatus] = useState<PushStatus>('laster')
  const [epostAktiv, setEpostAktiv] = useState(initialEpostAktiv)
  const [pushAktiv, setPushAktiv] = useState(initialPushAktiv)
  const [varselNivaa, setVarselNivaa] = useState<VarselNivaa>(initialVarselNivaa)
  const [lagringsfeil, setLagringsfeil] = useState(false)
  const [nivaaPending, startNivaaTransition] = useTransition()
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

  // En feilet lagring var tidligere helt taus: knappen falt tilbake til gammel
  // verdi uten melding og uten beacon, så vi hadde ingen måte å oppdage at
  // medlemmets valg aldri ble lagret (#614-review). Nå gir den både en synlig
  // linje til brukeren og en rad i feil_logg via klient-beaconen.
  async function oppdaterPreferanse(
    felt: 'push_aktiv' | 'epost_aktiv' | 'varsel_nivaa',
    verdi: boolean | VarselNivaa,
  ) {
    setLagringsfeil(false)
    try {
      const res = await fetch('/api/varsel-preferanser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [felt]: verdi }),
      })
      if (!res.ok) {
        // Ruta svarer generisk ({ error: 'Kunne ikke lagre' }) — detaljene
        // ligger i server-loggen. Statuskoden er det som skiller hypotesene.
        setLagringsfeil(true)
        meldKlientfeil('klient.varsel_preferanser.feilet', new Error(`${felt}: HTTP ${res.status}`))
        return false
      }
      return true
    } catch (err) {
      // Nettverksfeil — fetch avviser først her, ikke via res.ok.
      setLagringsfeil(true)
      meldKlientfeil('klient.varsel_preferanser.feilet', err)
      return false
    }
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
      // Bare speil av-tilstanden hvis DB faktisk fikk den. sendVarsel() leser
      // push_aktiv fra DB, ikke om abonnementet finnes — så en feilet lagring
      // med grønn bryter ville lovet noe serveren ikke gjør (#614/Copilot).
      // Abonnementet er allerede avmeldt her; det er harmløst å la stå, siden
      // push_aktiv = true uten abonnement bare gir null subscriptions å sende
      // til. Neste vellykkede toggle rydder opp.
      if (await oppdaterPreferanse('push_aktiv', false)) {
        setPushAktiv(false)
        setPushStatus('inaktiv')
      }
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
      // Samme her: abonnementet er registrert, men uten push_aktiv i DB sender
      // sendVarsel() ingenting. Feiler lagringen, står bryteren av og
      // feilmeldingen vises — brukeren kan prøve igjen uten å måtte gi
      // varselstillatelse på nytt (abonnementet ligger der allerede).
      if (await oppdaterPreferanse('push_aktiv', true)) {
        setPushAktiv(true)
        setPushStatus('aktiv')
      }
    }
  }

  function toggleEpost() {
    const nyVerdi = !epostAktiv
    startTransition(async () => {
      const ok = await oppdaterPreferanse('epost_aktiv', nyVerdi)
      if (ok) setEpostAktiv(nyVerdi)
    })
  }

  // #614: nivået gjelder på tvers av push og epost (ikke en tredje kanal), så
  // det lagres via samme generiske PUT — og siden #614-review samme helper, så
  // feilhåndteringen ikke finnes i to utgaver som kan drifte fra hverandre.
  function velgNivaa(nyttNivaa: VarselNivaa) {
    if (nyttNivaa === varselNivaa) return
    startNivaaTransition(async () => {
      if (await oppdaterPreferanse('varsel_nivaa', nyttNivaa)) setVarselNivaa(nyttNivaa)
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
  }> = []
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
  rader.push({
    label: 'E-post',
    sub: epostAktiv ? 'Du får varsler på e-post' : 'E-postvarsler er av',
    on: epostAktiv,
    onChange: toggleEpost,
    disabled: isPending,
  })

  return (
    // Én boks: kanalene (hvor) og nivået (hvilke) er to akser (#614), men hører
    // hjemme rett ved siden av hverandre. Hjelpeteksten om «Viktig» og feilen
    // ved lagring står under boksen (SkjemaGruppe). En feilet lagring skal si fra
    // i stedet for å la kontrollen sprette stille tilbake (#614-review).
    <SkjemaGruppe
      tittel="Varsler til deg"
      hjelp={
        <>
          «Alt» varsler deg om alt, chat inkludert. «Viktig» dropper chat-meldingene — resten
          (arrangementer, kåringer, pass, meldinger) kommer uansett.
        </>
      }
      feil={lagringsfeil ? 'Fikk ikke lagra valget. Prøv igjen.' : null}
    >
      {rader.map(r => (
        <ProfilRad key={r.label} etikett={r.label} undertekst={r.sub}>
          <ToggleRad
            on={r.on}
            onChange={r.onChange ?? (() => {})}
            disabled={r.disabled}
            ariaLabel={r.on ? `Slå av ${r.label}` : `Slå på ${r.label}`}
          />
        </ProfilRad>
      ))}
      {/* Ikke «Chatvarsler» (#614-review): innstillingen styrer nivået på ALLE
          varsler — chat er bare det eneste lavsignal-tilfellet i dag. */}
      <SkjemaRad etikett="Varselnivå">
        <ValgFelt
          value={varselNivaa}
          valg={[
            { verdi: 'viktige', etikett: 'Viktig' },
            { verdi: 'alle', etikett: 'Alt' },
          ]}
          onChange={e => velgNivaa(e.target.value === 'viktige' ? 'viktige' : 'alle')}
          disabled={nivaaPending}
          aria-label="Varselnivå"
        />
      </SkjemaRad>
    </SkjemaGruppe>
  )
}
