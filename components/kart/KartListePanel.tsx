'use client'

import Avatar from '@/components/ui/Avatar'
import { formaterDato, FORMAT_KLOKKE } from '@/lib/dato'
import { POSISJON_DELING_TIMER, POSISJON_FERSK_MINUTTER } from '@/lib/konstanter'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { symbolEmoji } from '@/lib/markering-symboler'
import { useState } from 'react'
import { avstandM, formaterAvstand } from '@/lib/geo-avstand'
import type { Mann, Markering } from './PosisjonsKart'
import type { PingKandidat } from '@/lib/kart-deltakere'

// Høyre sidepanel med lista over hvem som er på kartet — flyttet ut av
// PosisjonsKart.tsx (#732-uttrekk, ingen atferdsendring). Håndtaket og
// aside-en flyttes sammen: de er samme konsept («lista»), og håndtakets
// posisjon (right: panelAapent ? … : 0) er uløselig knyttet til om aside-en
// er ute eller ikke.

type Props = {
  /** Skjuler kun HÅNDTAKET — aside-en (lista) er alltid montert, kun
   * transform/pointerEvents-styrt, se PosisjonsKart. Uten dette skillet ville
   * chat- eller timeplan-panelet også revet lista ut av DOM-en mens den var
   * lukket, noe e2e (kart-markorer.spec.ts m.fl.) ikke forventer. */
  visHandtak: boolean
  panelAapent: boolean
  onToggle: () => void
  /** Din siste delte posisjon (#728) — null hvis du ikke deler. Ingen
   * avstand til andre menn, kun til markeringer: se lib/geo-avstand.ts. */
  megPunkt: { lat: number; lng: number } | null
  antallPaaKartet: number
  meg: Mann | null
  underArrangement: boolean
  menn: Mann[]
  markeringer: Markering[]
  megId: string
  erAdmin: boolean
  nyligPlinget: Record<string, boolean>
  onSenterPaa: (lat: number, lng: number) => void
  onPling: (profilId: string, navn: string) => void
  onFjernMarkering: (id: string) => void
  handtakZIndex: number
  panelZIndex: number
  /** «Ping en herre» (#725) — kandidater UTENFOR menn-lista over. */
  pingKandidater: PingKandidat[]
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

function erFersk(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < POSISJON_FERSK_MINUTTER * 60 * 1000
}

const HJELPETEKST = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  color: 'var(--text-tertiary)',
  lineHeight: 1.5,
} as const

const SEKSJON = {
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  color: 'var(--kart-tekst)',
  letterSpacing: '-0.1px',
  marginBottom: 8,
  fontWeight: 500,
} as const

const PILLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: '0.1px',
  padding: '8px 14px',
  borderRadius: 'var(--radius-pill)',
  border: '0.5px solid var(--kart-kant)',
  background: 'var(--kart-flate-sterk)',
  backdropFilter: 'var(--blur-card)',
  color: 'var(--kart-tekst)',
  cursor: 'pointer',
  pointerEvents: 'auto',
  whiteSpace: 'nowrap',
  boxShadow: 'var(--shadow-popover)',
} as const

export default function KartListePanel({
  visHandtak,
  panelAapent,
  onToggle,
  megPunkt,
  antallPaaKartet,
  meg,
  underArrangement,
  menn,
  markeringer,
  megId,
  erAdmin,
  nyligPlinget,
  onSenterPaa,
  onPling,
  onFjernMarkering,
  handtakZIndex,
  panelZIndex,
  pingKandidater,
}: Props) {
  // Lukket til man trykker «Ping en herre» — den fulle medlemslista skal
  // ikke ta plass fra dem som faktisk deler (#725).
  const [pingAapent, setPingAapent] = useState(false)
  return (
    <>
      {visHandtak && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={panelAapent}
          aria-label={panelAapent ? 'Lukk lista' : `Vis lista (${antallPaaKartet})`}
          data-testid="panel-handtak"
          style={{
            position: 'absolute',
            right: panelAapent ? 'min(300px, 85%)' : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 30,
            height: 76,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            border: '0.5px solid var(--kart-kant)',
            borderRight: panelAapent ? '0.5px solid var(--kart-kant)' : 'none',
            borderRadius: '14px 0 0 14px',
            background: 'var(--kart-flate-sterk)',
            backdropFilter: 'var(--blur-card)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: 0,
            zIndex: handtakZIndex,
            transition: 'right 220ms ease',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1 }}>
            {panelAapent ? '\u2039' : '\u203a'}
          </span>
          {!panelAapent && antallPaaKartet > 0 && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--kart-sol)',
                lineHeight: 1,
              }}
            >
              {antallPaaKartet}
            </span>
          )}
        </button>
      )}

      <aside
        data-testid="kart-panel"
        aria-hidden={!panelAapent}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 'min(300px, 85%)',
          transform: panelAapent ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease',
          background: 'var(--kart-flate)',
          backdropFilter: 'var(--blur-card)',
          borderLeft: '0.5px solid var(--kart-kant)',
          overflowY: 'auto',
          pointerEvents: panelAapent ? 'auto' : 'none',
          zIndex: panelZIndex,
          // --kart-panel-safe-top, IKKE iOS' egen topp-innsett-variabel
          // direkte — se regnestykket i PosisjonsKart.tsx (kart-flatens
          // stil). Invariant: ingen kart-panel leser den variabelen selv (#723).
          padding: `calc(12px + var(--kart-panel-safe-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {meg ? (
          <div
            style={{
              ...HJELPETEKST,
              padding: '0 2px 10px',
              borderBottom: '0.5px solid var(--border-subtle)',
              marginBottom: 12,
            }}
          >
            Du deler til {formaterDato(meg.delerTil, FORMAT_KLOKKE)}.
            {underArrangement
              ? ' Ruta di slettes når arrangementet er over.'
              : ' Ruta di slettes når du slutter å dele.'}
          </div>
        ) : (
          <div
            style={{
              ...HJELPETEKST,
              padding: '0 2px 10px',
              borderBottom: '0.5px solid var(--border-subtle)',
              marginBottom: 12,
            }}
          >
            Du deler ikke posisjon. Deler du, varer det ut turen — eller{' '}
            {POSISJON_DELING_TIMER} timer utenom turer. Slutter av seg selv.
          </div>
        )}

        {menn.length === 0 && markeringer.length === 0 && (
          <div style={{ ...HJELPETEKST, padding: '8px 4px' }}>
            Ingen deler posisjon akkurat nå.
          </div>
        )}

        {menn.length > 0 && <div style={SEKSJON}>På kartet</div>}
        {menn.map(m => {
          const siste = m.spor[m.spor.length - 1]
          if (!siste) return null
          const erMeg = m.profilId === megId
          return (
            <div
              key={m.profilId}
              data-testid="kart-rad"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 2px',
                borderBottom: '0.5px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => onSenterPaa(siste.lat, siste.lng)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <Avatar name={m.navn} src={m.bildeUrl} rolle={m.rolle} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 15,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.2px',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {m.navn}
                    {erMeg && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: 'var(--accent)',
                          marginLeft: 6,
                          letterSpacing: '1px',
                        }}
                      >
                        DEG
                      </span>
                    )}
                  </div>
                  <div
                    suppressHydrationWarning
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      color: erFersk(siste.registrert) ? 'var(--success)' : 'var(--text-tertiary)',
                      marginTop: 1,
                    }}
                  >
                    {relativTid(siste.registrert)}
                    {m.spor.length > 1 && ` \u00b7 ${m.spor.length} stopp`}
                  </div>
                </div>
              </button>

              {!erMeg &&
                (() => {
                  const nettopp = nyligPlinget[m.profilId] === true
                  return (
                    <button
                      type="button"
                      onClick={() => onPling(m.profilId, m.navn)}
                      disabled={nettopp}
                      data-testid="pling-knapp"
                      data-plinget={nettopp ? 'ja' : 'nei'}
                      aria-label={nettopp ? `${m.navn} er plinget` : `Pling ${m.navn} om hvor han er`}
                      style={{
                        ...PILLE,
                        opacity: nettopp ? 0.55 : 1,
                        cursor: nettopp ? 'default' : 'pointer',
                        color: nettopp ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                      }}
                    >
                      {nettopp ? 'Plinget' : 'Pling'}
                    </button>
                  )
                })()}
            </div>
          )
        })}

        {/* «Ping en herre» (#725) — de som IKKE allerede deler, rett under
            lista over dem som gjør det. Inline seksjon, ikke egen overlay:
            han skal se begge listene i samme rull. Skjules helt uten
            kandidater (ingen aktive medlemmer igjen å spørre). */}
        {pingKandidater.length > 0 && (
          <div style={{ marginTop: menn.length > 0 ? 14 : 0 }}>
            <button
              type="button"
              onClick={() => setPingAapent(a => !a)}
              aria-expanded={pingAapent}
              data-testid="ping-en-herre-knapp"
              style={PILLE}
            >
              {pingAapent ? 'Skjul' : 'Ping en herre'}
            </button>
            {pingAapent &&
              pingKandidater.map(k => (
                <div
                  key={k.profilId}
                  data-testid="ping-kandidat-rad"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 2px',
                    borderBottom: '0.5px solid var(--border-subtle)',
                    marginTop: 8,
                  }}
                >
                  <Avatar name={k.navn} src={k.bildeUrl} rolle={k.rolle} size={32} />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'var(--font-display)',
                      fontSize: 15,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.2px',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {k.navn}
                  </div>
                  {(() => {
                    const nettopp = nyligPlinget[k.profilId] === true
                    return (
                      <button
                        type="button"
                        onClick={() => onPling(k.profilId, k.navn)}
                        disabled={nettopp}
                        data-testid="pling-knapp"
                        data-plinget={nettopp ? 'ja' : 'nei'}
                        aria-label={nettopp ? `${k.navn} er plinget` : `Pling ${k.navn} om hvor han er`}
                        style={{
                          ...PILLE,
                          opacity: nettopp ? 0.55 : 1,
                          cursor: nettopp ? 'default' : 'pointer',
                          color: nettopp ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                        }}
                      >
                        {nettopp ? 'Plinget' : 'Pling'}
                      </button>
                    )
                  })()}
                </div>
              ))}
          </div>
        )}

        {markeringer.length > 0 && <div style={{ ...SEKSJON, marginTop: 18 }}>Markeringer</div>}
        {/* Ingen avstand uten egen posisjon (#728) — vist ÉN gang for hele
            lista, ikke gjentatt på hver rad. Vi ber ALDRI om
            navigator.geolocation uten at han har valgt å dele selv. */}
        {markeringer.length > 0 && !megPunkt && (
          <div style={{ ...HJELPETEKST, marginBottom: 8 }}>Del posisjonen din for å se avstand.</div>
        )}
        {markeringer.map(mk => (
          <div
            key={mk.id}
            data-testid="markering-rad"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 2px',
              borderBottom: '0.5px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => onSenterPaa(mk.lat, mk.lng)}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  overflowWrap: 'anywhere',
                }}
              >
                <span aria-hidden="true" style={{ marginRight: 6 }}>
                  {symbolEmoji(mk.symbol)}
                </span>
                {mk.tekst}
              </div>
              <div suppressHydrationWarning style={{ ...HJELPETEKST, fontSize: 11, marginTop: 1 }}>
                {mk.avNavn} · {relativTid(mk.opprettet)}
                {megPunkt && (
                  <> · {formaterAvstand(avstandM(megPunkt.lat, megPunkt.lng, mk.lat, mk.lng))}</>
                )}
              </div>
            </button>

            {(mk.erMin || erAdmin) && (
              <button
                type="button"
                onClick={() => onFjernMarkering(mk.id)}
                aria-label={`Fjern markeringen \u00ab${mk.tekst}\u00bb`}
                data-testid="markering-fjern"
                style={PILLE}
              >
                Fjern
              </button>
            )}
          </div>
        ))}
      </aside>
    </>
  )
}
