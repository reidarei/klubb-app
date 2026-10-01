'use client'

// Fondsrapport (#785) — admin-only publiseringsark, åpnet fra /fond ved
// siden av «Rediger fondet». Ren client-komponent: trigger-knapp + selve
// arket (portal) i én fil, så /fond/page.tsx (server component) bare
// dropper inn <PubliserFondsrapport /> uten egen state-håndtering.
//
// Skrivefelt-policyen (CLAUDE.md § Policy: Skrivefelt og iOS-tastatur): ÉN
// scroll-boks, hilsen-textarea i NORMAL FLYT som siste felt før knappen,
// useTastaturHoyde() + padding-bottom (ALDRI useKeyboardOffset — arket
// selv er `position: fixed; inset: 0` og flytter seg aldri med tastaturet,
// kun innholdet får plass å scrolle i). Scroll ved fokus + mens tastaturet
// vokser, samme mønster som components/kart/TimeplanPanel.tsx og
// components/album/BildeKommentarSheet.tsx.
import { useState, useRef, useEffect, useId, useMemo, useTransition, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/ui/Icon'
import Avatar from '@/components/ui/Avatar'
import FondsrapportBlokk from '@/components/fond/FondsrapportBlokk'
import { Linkified } from '@/lib/linkify'
import { useTastaturHoyde } from '@/components/chat/hooks/useKeyboardOffset'
import {
  hentFondsrapportUtkast,
  publiserFondsrapport,
  type FondsrapportUtkast,
} from '@/lib/actions/fondsrapport'
import { heleKr, lesFondsrapport } from '@/lib/fondsrapport'
import { formaterDato } from '@/lib/dato'

// redirect() i publiserFondsrapport kaster en spesiell NEXT_REDIRECT-feil
// som må bobles videre til Next sin runtime, ikke fanges som en ekte feil —
// samme mønster som NyMeldingSkjema.tsx.
function erNextRedirect(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as Record<string, unknown>).digest === 'string' &&
    ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
  )
}

type Props = {
  /** Innloggede admins navn — vises som forfatter i forhåndsvisningen. */
  navn: string
  bildeUrl: string | null
  rolle: string | null
  /** Trengs av FondsrapportBlokk for å utheve egen linje (samme ref-logikk som i det ekte kortet). */
  brukerId: string
}

export default function PubliserFondsrapport({ navn, bildeUrl, rolle, brukerId }: Props) {
  const [apen, setApen] = useState(false)
  const [utkast, setUtkast] = useState<FondsrapportUtkast | null>(null)
  const [henter, setHenter] = useState(false)
  const [hilsen, setHilsen] = useState('')
  const [feil, setFeil] = useState('')
  const [montert, setMontert] = useState(false)
  const [isPending, startTransition] = useTransition()

  const tittelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tastaturHoyde = useTastaturHoyde()
  const forrigeTastaturHoyde = useRef(0)

  // Mount-flag for portal — createPortal kan ikke kalles på server.
  useEffect(() => {
    setMontert(true)
  }, [])

  function scrollTilBunn() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }

  // Fokus-scroll + kompletterende effekt for tastatur-animasjonen (#714-
  // mønsteret, se Chat.tsx): vv.resize kommer ETTER focus-eventet, så
  // paddingen som gir plass til å scrolle i finnes ikke ennå ved fokus alene.
  // Scroller KUN når høyden vokser — aldri på synkende/uendret, det er
  // nøyaktig den bug-klassen policyen finnes for å unngå.
  useEffect(() => {
    const vokser = tastaturHoyde > forrigeTastaturHoyde.current
    forrigeTastaturHoyde.current = tastaturHoyde
    if (!vokser) return
    if (document.activeElement === textareaRef.current) scrollTilBunn()
  }, [tastaturHoyde])

  // Body-scroll-lås mens arket er åpent — samme mønster som AlbumLightbox.
  useEffect(() => {
    if (!apen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [apen])

  // Dialog-fokus (samme mønster som RentefordelingBoks): inn i arket ved
  // åpning så skjermleser og tastatur følger med, tilbake til knappen ved lukking.
  useEffect(() => {
    if (!apen || !montert) return
    panelRef.current?.focus()
    const trigger = triggerRef.current
    return () => trigger?.focus()
  }, [apen, montert])

  function aapne() {
    setApen(true)
    setHilsen('')
    setFeil('')
    // Nullstilles FØR hentingen, så en feilet henting aldri lar et gammelt
    // utkast holde publiser-knappen aktiv.
    setUtkast(null)
    setHenter(true)
    hentFondsrapportUtkast()
      .then(r => {
        if (r.ok) setUtkast(r.utkast)
        else setFeil(r.feil)
      })
      .catch(() => setFeil('Klarte ikke å hente fondsdata.'))
      .finally(() => setHenter(false))
  }

  function lukk() {
    if (isPending) return
    setApen(false)
  }

  function publiser() {
    if (!klar) return
    setFeil('')
    startTransition(async () => {
      try {
        // Suksess gir redirect (kast), så et returnert svar er alltid en feil.
        const r = await publiserFondsrapport({ hilsen })
        if (r && !r.ok) setFeil(r.feil)
      } catch (err) {
        if (erNextRedirect(err)) throw err
        setFeil('Klarte ikke å publisere. Prøv igjen.')
      }
    })
  }

  const sumAndelerStemmer = utkast ? Math.round(utkast.sumAndeler) === Math.round(utkast.saldo) : true
  const sammenlignesMedTekst = utkast
    ? utkast.sammenlignesMed.kilde === 'rapport'
      ? `Fondsrapport Q${utkast.sammenlignesMed.kvartal} ${utkast.sammenlignesMed.aar}`
      : `Q${utkast.sammenlignesMed.kvartal} ${utkast.sammenlignesMed.aar}, beregnet fra fondsdata`
    : null

  // Grensen for hilsenen er det som er igjen av INNLEGG_MAKS_LENGDE etter
  // rapportblokken — serveren regner den ut og validerer den på nytt.
  const maksHilsen = utkast?.maksHilsen ?? 0
  const klar = !!utkast && hilsen.length <= maksHilsen

  // Forhåndsvisning (#787): samme inngang som kortet på agendaen bruker
  // (lesFondsrapport), kjørt på den ferdige blokken fra serveren — admin skal
  // se nøyaktig samme rapportkort han ville fått i innlegget, ikke en egen
  // gjenimplementering av formateringen i klienten.
  const rapportForhaandsvisning = useMemo(
    () => (utkast ? lesFondsrapport(utkast.blokk)?.rapport ?? null : null),
    [utkast],
  )

  return (
    <>
      <button ref={triggerRef} type="button" onClick={aapne} style={triggerKnapp}>
        Publiser kvartalsrapport
      </button>

      {montert &&
        apen &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--overlay-backdrop)',
            }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={tittelId}
              tabIndex={-1}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                outline: 'none',
                marginTop: 'max(24px, env(safe-area-inset-top))',
                background: 'var(--bg-elevated-solid)',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                boxShadow: 'var(--shadow-modal)',
                overflow: 'hidden',
              }}
            >
              {/* Header — fast, ikke del av scroll-boksen */}
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 18px',
                  borderBottom: '0.5px solid var(--border-subtle)',
                }}
              >
                <span
                  id={tittelId}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    color: 'var(--text-primary)',
                  }}
                >
                  Publiser kvartalsrapport
                </span>
                <button
                  type="button"
                  onClick={lukk}
                  aria-label="Lukk"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 6,
                    display: 'flex',
                  }}
                >
                  <Icon name="x" size={20} color="currentColor" strokeWidth={2} />
                </button>
              </div>

              {/* ÉN scroll-boks: kvartal, sjekkliste, hilsen (i normal
                  flyt) og publiser-knappen bor ALLE her — se filhode. */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  padding: '18px 18px 12px',
                  paddingBottom:
                    12 + (tastaturHoyde > 0 ? tastaturHoyde + 16 : 0) + 'px',
                }}
              >
                {/* Kvartalet velges ikke — det følger av siste oppgjør (se hentGrunnlag) */}
                {utkast && (
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 20,
                      color: 'var(--text-primary)',
                      marginBottom: 16,
                    }}
                  >
                    Fondsrapport Q{utkast.kvartal} {utkast.aar}
                  </div>
                )}

                {/* Sjekkliste */}
                <div style={{ ...mono, marginBottom: 8 }}>Før du publiserer</div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    marginBottom: 8,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-card)',
                    background: 'var(--bg-elevated-2)',
                    border: '0.5px solid var(--border-subtle)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {henter ? (
                    <span>Henter fondsdata…</span>
                  ) : utkast ? (
                    <>
                      <SjekkPunkt>
                        Siste oppgjør:{' '}
                        {formaterDato(utkast.perDato, 'd. MMMM')}
                      </SjekkPunkt>
                      {/* Saldoen oppdateres uavhengig av oppgjørene — datoen lar admin se om den er fersk før publisering. */}
                      <SjekkPunkt>
                        Kontanter på konto: {heleKr(utkast.saldo)}
                        {utkast.kontantOppdatert
                          ? ` (oppdatert ${formaterDato(utkast.kontantOppdatert, 'd. MMM').replace(/\.$/, '')})`
                          : ' (aldri oppdatert)'}
                      </SjekkPunkt>
                      <SjekkPunkt>Sammenlignes med: {sammenlignesMedTekst}</SjekkPunkt>
                    </>
                  ) : (
                    <span>Ingen fondsdata å vise.</span>
                  )}
                </div>

                {utkast && !sumAndelerStemmer && (
                  <Advarsel>
                    Kontantsaldoen ({heleKr(utkast.saldo)}) stemmer ikke med summen av andelene (
                    {heleKr(Math.round(utkast.sumAndeler))}).
                  </Advarsel>
                )}
                {utkast?.finnesAlleredeForKvartal && (
                  <Advarsel>Det finnes allerede en publisert rapport for dette kvartalet.</Advarsel>
                )}

                {/* Hilsen — normal flyt, ingen sticky/fixed */}
                <div style={{ ...mono, marginTop: 16, marginBottom: 8 }}>Hilsen (valgfritt)</div>
                <textarea
                  ref={textareaRef}
                  value={hilsen}
                  onChange={e => setHilsen(e.target.value.slice(0, maksHilsen))}
                  onFocus={scrollTilBunn}
                  disabled={isPending || !utkast}
                  maxLength={maksHilsen}
                  placeholder="Noen ord til gutta før tallene…"
                  style={tekstStil}
                />
                <div style={{ ...mono, textAlign: 'right', marginTop: 6, marginBottom: 18 }}>
                  {maksHilsen - hilsen.length} tegn igjen
                </div>

                {/* Forhåndsvisning (#787): samme ramme og tokens som
                    MeldingKort.tsx bruker for forfatter-rad + tekst + blokk —
                    ikke MeldingKort selv, som er en Link med reaksjoner og
                    hooks arket ikke trenger. Live mens han skriver. */}
                {rapportForhaandsvisning && (
                  <>
                    <div style={{ ...mono, marginBottom: 8 }}>Slik blir det</div>
                    <div
                      style={{
                        marginBottom: 18,
                        borderRadius: 'var(--radius-card)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <Avatar name={navn} size={26} src={bildeUrl} rolle={rolle} />
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {navn}
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 9,
                                color: 'var(--text-tertiary)',
                                letterSpacing: '0.8px',
                                textTransform: 'uppercase',
                              }}
                            >
                              nå
                            </span>
                          </div>
                        </div>
                        {hilsen.trim() && (
                          <div
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 14,
                              color: 'var(--text-primary)',
                              lineHeight: 1.4,
                              whiteSpace: 'pre-wrap',
                              wordWrap: 'break-word',
                            }}
                          >
                            <Linkified text={hilsen.trim()} />
                          </div>
                        )}
                        <FondsrapportBlokk rapport={rapportForhaandsvisning} brukerId={brukerId} />
                      </div>
                    </div>
                  </>
                )}

                {feil && (
                  <div
                    style={{
                      color: 'var(--danger)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      marginBottom: 12,
                    }}
                  >
                    {feil}
                  </div>
                )}

                <button
                  type="button"
                  onClick={publiser}
                  disabled={!klar || henter || isPending}
                  style={{
                    ...primaerKnapp,
                    opacity: !klar || henter || isPending ? 0.5 : 1,
                    cursor: !klar || henter || isPending ? 'default' : 'pointer',
                  }}
                >
                  {isPending ? 'Publiserer…' : 'Publiser og varsle gutta'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

function SjekkPunkt({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
        ·
      </span>
      <span>{children}</span>
    </div>
  )
}

function Advarsel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 'var(--radius-card)',
        background: 'var(--warning-soft)',
        border: '0.5px solid var(--warning-border)',
        color: 'var(--warning)',
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  )
}

const mono: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
}

const triggerKnapp: CSSProperties = {
  display: 'inline-block',
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
}

const tekstStil: CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '0.5px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  lineHeight: 1.5,
  outline: 'none',
  padding: '10px 12px',
  resize: 'none',
  minHeight: 90,
}

const primaerKnapp: CSSProperties = {
  width: '100%',
  padding: '13px 20px',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 999,
  color: 'var(--accent-foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  fontWeight: 600,
}
