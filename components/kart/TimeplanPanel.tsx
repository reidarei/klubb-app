'use client'

import { useState } from 'react'
import { opprettTimeplanPost, slettTimeplanPost } from '@/lib/actions/timeplan'
import { parseTimeplanTekst } from '@/lib/timeplan-parse'
import { CHAT_TASTATUR_LUFT_PX } from '@/lib/konstanter'
import { useTastaturHoyde } from '@/components/chat/hooks/useKeyboardOffset'
import NyTimeplanPost from './NyTimeplanPost'
import TimeplanRad from './TimeplanRad'
import { norskDatoNokkel, formaterDato } from '@/lib/dato'

export type TimeplanArrangement = {
  id: string
  tittel: string
  startTidspunkt: string
  sluttTidspunkt: string | null
  /** sensurerte_felt.destinasjon === true — en blåtur. «Sett punkt» skjules. */
  blaatur: boolean
}

export type TimeplanPost = {
  id: string
  tidspunkt: string
  tekst: string
  lat: number | null
  lng: number | null
  /** Alternativ til/i tillegg til punkt (#732) — foretrekkes ved navigering. */
  adresse: string | null
  opprettet: string
  opprettetAv: string
  opprettetAvNavn: string
  opprettetAvBildeUrl: string | null
  opprettetAvRolle: string | null
  erMin: boolean
}

/**
 * Utkastet for en ny post. Bor i PosisjonsKart sin state (#716, bindende
 * arkitekturbeslutning) — panelet glir helt ut mens man velger punkt på
 * kartet, og skal glide inn igjen etterpå med utkastet intakt. Lever det her
 * i stedet, ville en fremtidig omskriving av panelet (som gjør det
 * betinget montert, slik chat-panelet gjør med selve <Chat>) revet teksten
 * bort under føttene på brukeren midt i en punktvelging.
 */
export type TimeplanUtkast = {
  /** «yyyy-MM-dd». */
  dato: string
  tekst: string
  /** Overstyrer parserens tolkning når han bruker tidschipen. */
  manuellKlokke: string | null
  punkt: { lat: number; lng: number } | null
  /** Alternativ til punkt (#732) — fritekst, geokodet best-effort server-side. */
  adresse: string | null
}

/** Alt som trengs for å sende en linje — og for å sende den på nytt. */
type Sending = {
  id: string
  dato: string
  klokke: string
  tekst: string
  punkt: { lat: number; lng: number } | null
  adresse: string | null
}

/** En sending som ikke kom fram, med feilteksten fra forsøket. */
type FeiletSending = Sending & { melding: string }

type Props = {
  arrangement: TimeplanArrangement
  initialPoster: TimeplanPost[]
  /** kart.timeplan.hent.feilet traff på serveren — egen synlig tilstand, ALDRI tom liste. */
  feilVedHenting: boolean
  erAapent: boolean
  onLukk: () => void
  megId: string
  megNavn: string
  megBildeUrl: string | null
  megRolle: string | null
  erAdmin: boolean
  utkast: TimeplanUtkast
  onEndreUtkast: (patch: Partial<TimeplanUtkast>) => void
  onStartPunktvalg: () => void
  onSenterPaa: (lat: number, lng: number) => void
  /** Din siste delte posisjon (#728) — null hvis du ikke deler. */
  megPunkt: { lat: number; lng: number } | null
}

export default function TimeplanPanel({
  arrangement,
  initialPoster,
  feilVedHenting,
  erAapent,
  onLukk,
  megId,
  megNavn,
  megBildeUrl,
  megRolle,
  erAdmin,
  utkast,
  onEndreUtkast,
  onStartPunktvalg,
  onSenterPaa,
  megPunkt,
}: Props) {
  // Egen state, seedet fra prop-en ved første render — samme mønster som
  // Chat sin initialMeldinger. Nødvendig fordi vi bevisst IKKE kaller
  // revalidatePath('/kart') fra timeplan-actionene (#716): ferskhet kommer
  // av optimistisk lokal state, ikke av en revalidert side. Panelet
  // rendres ubetinget av PosisjonsKart (kun transform-styrt synlighet), så
  // denne staten overlever at panelet glir ut og inn igjen under en
  // punktvelging.
  //
  // Seedingen er bundet til arrangementet: PosisjonsKart nøkler panelet på
  // arrangement.id (#716 review), så peker serveren på en annen tur, monteres
  // panelet på nytt og lista seedes fra det NYE arrangementets poster i
  // stedet for å bli stående med den forriges.
  const [poster, setPoster] = useState<TimeplanPost[]>(initialPoster)
  // Sett, ikke én id: «en timeplan skrives i serie» (#716) betyr at han skal
  // kunne skrive og sende linje 2 FØR linje 1 sin lagring er ferdig — en
  // enkelt sendingId ville blokkert «Legg inn»-knappen mens forrige post
  // fortsatt var underveis. Hver rad dempes uavhengig via egen id i settet.
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  // Sendinger som ikke kom fram — en KØ, ikke det delte utkastet (#716
  // review). Utkastet er ÉN slot: la vi teksten tilbake dit, overskrev to
  // feilede sendinger hverandre, og linja han allerede hadde begynt på ble
  // revet bort av en feil på den forrige. Hver feilet linje står nå for seg
  // selv, med teksten intakt og en «Prøv igjen».
  const [feilede, setFeilede] = useState<FeiletSending[]>([])
  const [feilmelding, setFeilmelding] = useState<string | null>(null)

  // Skrivefeltet ligger i NORMAL FLYT som første element i denne scroll-
  // boksen (se NyTimeplanPost) — ALDRI useKeyboardOffset(). tastaturHoyde
  // vokser paddingen i bunnen slik at lista under fortsatt kan scrolles opp
  // forbi tastaturet. Feltet trenger ingen egen scroll-til-fokus-effekt
  // (Policy: Skrivefelt og iOS-tastatur, chattens mønster): det står
  // allerede øverst, rett under overskriften, og et tastatur som dekker
  // BUNNEN av panelet kan aldri skjule noe som står på TOPPEN av det.
  const tastaturHoyde = useTastaturHoyde()

  function mislyktes(sending: Sending, melding: string) {
    setPoster(p => p.filter(x => x.id !== sending.id))
    setFeilede(f => [...f.filter(x => x.id !== sending.id), { ...sending, melding }])
  }

  // Felles utsendingsvei for første forsøk OG «Prøv igjen». Samme id begge
  // veier: landet forrige forsøk likevel før forbindelsen røk, svarer
  // actionen ok på primærnøkkel-kollisjonen i stedet for å lage en duplikat.
  async function send(sending: Sending) {
    // Provisorisk tidspunkt for OPTIMISTISK sortering — bygget i nettleserens
    // egen sone, ikke Oslo. Kan avvike noen timer på utenlandstur; erstattes
    // med den kanoniske serververdien straks svaret kommer, og påvirker
    // aldri hva som faktisk lagres (datetimeLocalTilIso() kjører kun
    // server-side).
    const optimistisk: TimeplanPost = {
      id: sending.id,
      tidspunkt: new Date(`${sending.dato}T${sending.klokke}:00`).toISOString(),
      tekst: sending.tekst,
      lat: sending.punkt?.lat ?? null,
      lng: sending.punkt?.lng ?? null,
      adresse: sending.adresse,
      opprettet: new Date().toISOString(),
      opprettetAv: megId,
      opprettetAvNavn: megNavn,
      opprettetAvBildeUrl: megBildeUrl,
      opprettetAvRolle: megRolle,
      erMin: true,
    }

    setFeilede(f => f.filter(x => x.id !== sending.id))
    setPoster(p => [...p.filter(x => x.id !== sending.id), optimistisk])
    setSendingIds(s => new Set(s).add(sending.id))

    try {
      const svar = await opprettTimeplanPost({
        id: sending.id,
        arrangementId: arrangement.id,
        dato: sending.dato,
        klokke: sending.klokke,
        tekst: sending.tekst,
        lat: sending.punkt?.lat ?? null,
        lng: sending.punkt?.lng ?? null,
        adresse: sending.adresse,
      })
      if (!svar.ok) {
        mislyktes(sending, svar.melding)
        return
      }
      // Bytt provisorisk tidspunkt med den kanoniske serververdien, og
      // punktet med et ev. GEOKODET punkt (#732) — serveren kan ha funnet
      // koordinater ut fra adressen som klienten ikke kjente ved sendingen.
      // Adressen kommer samme vei: på en blåtur stripper basen den, og da skal
      // den forsvinne fra den optimistiske raden også, ikke bli stående til
      // neste sidelast.
      setPoster(p =>
        p.map(x =>
          x.id === sending.id
            ? { ...x, tidspunkt: svar.tidspunkt, lat: svar.lat, lng: svar.lng, adresse: svar.adresse }
            : x,
        ),
      )
    } catch {
      mislyktes(sending, 'Klarte ikke lagre timeplanposten. Prøv igjen.')
    } finally {
      setSendingIds(s => {
        const neste = new Set(s)
        neste.delete(sending.id)
        return neste
      })
    }
  }

  function leggInn() {
    const parsed = parseTimeplanTekst(utkast.tekst)
    const klokke = utkast.manuellKlokke ?? parsed.klokke
    const tekst = parsed.tekst.trim()
    if (!klokke || !tekst) return // NyTimeplanPost har allerede fanget disse

    setFeilmelding(null)

    // Feltet låses ikke under lagring — en timeplan skrives i serie. Tømmer
    // utkastet med det samme slik at neste linje kan skrives mens forrige
    // fortsatt lagres. En feil legger IKKE teksten tilbake hit; den havner i
    // «feilede»-køen, som ikke kan kollidere med det han skriver nå.
    onEndreUtkast({ tekst: '', manuellKlokke: null, punkt: null, adresse: null })

    void send({
      id: crypto.randomUUID(),
      dato: utkast.dato,
      klokke,
      tekst,
      punkt: utkast.punkt,
      adresse: utkast.adresse,
    })
  }

  async function fjern(id: string) {
    setFeilmelding(null)
    const fjernet = poster.find(p => p.id === id)
    if (!fjernet) return
    setPoster(p => p.filter(x => x.id !== id))
    // Legger tilbake KUN denne posten, funksjonelt (#716 review). Et snapshot
    // av hele lista ville revet bort poster som ble lagt inn mens slettingen
    // var underveis, og gjenopplivet poster som ble slettet parallelt.
    const angre = () => setPoster(p => (p.some(x => x.id === id) ? p : [...p, fjernet]))
    try {
      const svar = await slettTimeplanPost(id)
      if (!svar.ok) {
        angre()
        setFeilmelding(svar.melding)
      }
    } catch {
      angre()
      setFeilmelding('Klarte ikke fjerne posten. Prøv igjen.')
    }
  }

  const naaMs = Date.now()
  const sortert = [...poster].sort((a, b) => {
    const dt = new Date(a.tidspunkt).getTime() - new Date(b.tidspunkt).getTime()
    if (dt !== 0) return dt
    // Stabil sekundærsortering — se migrasjon 147 og #716-planlegging.
    const dOpprettet = new Date(a.opprettet).getTime() - new Date(b.opprettet).getTime()
    if (dOpprettet !== 0) return dOpprettet
    return a.id.localeCompare(b.id)
  })

  return (
    <aside
      data-testid="timeplan-panel"
      aria-hidden={!erAapent}
      className="kart-chat-panel"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 'min(320px, 88%)',
        transform: erAapent ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 220ms ease',
        background: 'var(--kart-flate)',
        backdropFilter: 'var(--blur-card)',
        borderLeft: '0.5px solid var(--kart-kant)',
        overflowY: 'auto',
        // Samme CSS-idiom som chat-panelet (#710/#714), speilvendt til høyre
        // kant — IKKE listepanelets idiom. Chat-panelet er herdet for et
        // skrivefelt, som dette panelet også har.
        overflowX: 'hidden',
        overscrollBehaviorY: 'contain',
        pointerEvents: erAapent ? 'auto' : 'none',
        zIndex: Z_PANEL,
        paddingTop: `calc(10px + env(safe-area-inset-top, 0px))`,
        paddingRight: 10,
        paddingLeft: 10,
        // Luft over tastaturet når det er åpent (samme konstant som
        // chat-panelet, #714) — ellers statisk safe-area-bunn.
        paddingBottom:
          tastaturHoyde > 0
            ? tastaturHoyde + CHAT_TASTATUR_LUFT_PX
            : `calc(10px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            color: 'var(--kart-tekst)',
            letterSpacing: '-0.1px',
            fontWeight: 500,
            overflowWrap: 'anywhere',
          }}
        >
          Timeplan for {arrangement.tittel}
        </div>
        <button
          type="button"
          onClick={onLukk}
          aria-label="Lukk timeplanen"
          data-testid="timeplan-lukk"
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 18,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Skjemaet FØRST i panelets egen scroll-boks, i normal flyt — samme
          innsikt som chat-panelets tastaturhåndtering, overført (#716). Å
          skrive er handlingen man kom for; lista under er oppslagsverket. */}
      <NyTimeplanPost
        arrangement={arrangement}
        utkast={utkast}
        onEndreUtkast={onEndreUtkast}
        onStartPunktvalg={onStartPunktvalg}
        onLeggInn={leggInn}
      />

      {feilmelding && (
        <div
          role="alert"
          data-testid="timeplan-feil"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12.5,
            color: 'var(--danger)',
            marginTop: 8,
          }}
        >
          {feilmelding}
        </div>
      )}

      {/* Linjer som ikke kom fram. Står som egne rader rett under skjemaet —
          teksten er i behold, og «Prøv igjen» sender nøyaktig den samme
          linja på nytt uten at han må skrive den opp igjen. */}
      {feilede.map(f => (
        <div
          key={f.id}
          role="alert"
          data-testid="timeplan-feilet"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            padding: '7px 9px',
            borderRadius: 'var(--radius-small)',
            border: '0.5px solid var(--danger-border)',
            background: 'var(--danger-soft)',
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 12.5,
              color: 'var(--text-secondary)',
              overflowWrap: 'anywhere',
            }}
          >
            «{f.klokke} {f.tekst}» ble ikke lagret. {f.melding}
          </span>
          <button
            type="button"
            onClick={() => void send(f)}
            data-testid="timeplan-prov-igjen"
            style={{
              flexShrink: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 10px',
              borderRadius: 'var(--radius-pill)',
              border: '0.5px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            Prøv igjen
          </button>
          <button
            type="button"
            onClick={() => setFeilede(k => k.filter(x => x.id !== f.id))}
            aria-label={`Forkast «${f.tekst}»`}
            data-testid="timeplan-forkast"
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              padding: '2px 4px',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}

      <div style={{ marginTop: 16 }}>
        {feilVedHenting && (
          // Egen, synlig feiltilstand — ALDRI en tom liste. En tom liste her
          // ville lest som «ingen har lagt inn noe», og det er en løgn på
          // akkurat den flaten der en beslutning tas («møtes vi kl. 17 eller
          // 18?»). Se #716-planlegging, drift-uttalelsen.
          <div
            role="alert"
            data-testid="timeplan-hentefeil"
            style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--danger)' }}
          >
            Klarte ikke hente timeplanen. Prøv å laste siden på nytt.
          </div>
        )}

        {!feilVedHenting && sortert.length === 0 && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
            }}
          >
            Ingenting på programmet enda.
          </div>
        )}

        {/* Ingen avstand uten egen posisjon (#728) — vist ÉN gang, ikke
            gjentatt på hver rad. Kun når det faktisk finnes en post med
            koordinat å vise avstand til. */}
        {!megPunkt && sortert.some(p => p.lat !== null && p.lng !== null) && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12.5,
              color: 'var(--text-tertiary)',
              marginBottom: 8,
            }}
          >
            Del posisjonen din for å se avstand.
          </div>
        )}

        {sortert.map((post, i) => {
          // Dagsskille når datoen endrer seg (#738). Uten det står «20:30
          // middag» uten å si hvilken dag — ubrukelig på en tur over fire
          // dager, som er nettopp når timeplanen trengs. Sammenligner norsk
          // kalenderdag, ikke ms, så skillet treffer midnatt i Oslo og ikke
          // der telefonen tilfeldigvis står (jf. Policy: Tidshåndtering).
          const forrige = i > 0 ? sortert[i - 1] : null
          const nyDag =
            !forrige || norskDatoNokkel(forrige.tidspunkt) !== norskDatoNokkel(post.tidspunkt)
          return (
            <div key={post.id}>
              {nyDag && (
                <div
                  role="separator"
                  data-testid="timeplan-dagsskille"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '1.4px',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    borderBottom: '0.5px solid var(--border)',
                    paddingBottom: 4,
                    margin: i === 0 ? '0 0 8px' : '14px 0 8px',
                  }}
                >
                  {formaterDato(post.tidspunkt, 'EEEE d. MMM')}
                </div>
              )}
              <TimeplanRad
                post={post}
                erPassert={new Date(post.tidspunkt).getTime() < naaMs}
                kanFjerne={post.erMin || erAdmin}
                sender={sendingIds.has(post.id)}
                onSenterPaa={onSenterPaa}
                onFjern={fjern}
                megPunkt={megPunkt}
              />
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// Speiler Z.PANEL i PosisjonsKart.tsx. Ikke importert derfra — Z er ikke
// eksportert, og en type-only sirkel ville uansett vært unødvendig for ett
// tall. Endres Z.PANEL der, må denne følge etter.
const Z_PANEL = 760
