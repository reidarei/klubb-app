'use client'

// PaameldteListe — viser avatar-rad over påmeldte (status=ja) og en «Vis liste»-knapp
// som åpner modal med ALLE aktive medlemmer gruppert etter RSVP-status (#285).
// Avatar-raden er uendret — den viser kun ja-folk via jaListe-prop.
// Modal-innholdet drives av alleSvar-prop som inkluderer ikke-svart.
// «Purre disse»-pill i «Ikke svart»-gruppe-headeren for admin/oppretter (#287).

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Avatar from '@/components/ui/Avatar'
import RsvpGlyph from '@/components/arrangement/RsvpGlyph'
import { purreUtenSvar } from '@/lib/actions/arrangementer'
import { PURRING_MAKS_LENGDE } from '@/lib/konstanter'

export type RsvpStatus = 'ja' | 'kanskje' | 'nei' | 'ikke_svart'

export type PaameldtPerson = {
  profil_id: string
  navn: string
  bilde_url: string | null
  rolle: string | null
  status: RsvpStatus
}

type Props = {
  // jaListe: kun ja-folk — driver avatar-raden og «+ N til»-pillen (uendret)
  jaListe: PaameldtPerson[]
  // alleSvar: alle aktive medlemmer med status — driver modalen (#285)
  alleSvar: PaameldtPerson[]
  // Arrangement-info og tilgangssjekk for «Purre disse»-knappen (#287)
  arrangementId: string
  arrangementTittel: string
  // kanPurre: true for admin og oppretter — vises ikke for vanlige medlemmer
  kanPurre: boolean
}

// Maks antall avatarer som vises i raden. Resten oppsummeres som «+ N til».
// Holdes lokal — tett knyttet til layout-valg i denne komponenten.
const MAKS_I_RAD = 6

// Rekkefølge og visningsnavn for statusgruppene i modalen.
// Rekkefølgen her avgjør render-rekkefølgen (ja øverst, ikke_svart nederst).
const GRUPPE_META: Record<RsvpStatus, { label: string; farge: string }> = {
  ja: { label: 'Ja', farge: 'var(--success)' },
  kanskje: { label: 'Kanskje', farge: 'var(--warning)' },
  nei: { label: 'Nei', farge: 'var(--danger)' },
  ikke_svart: { label: 'Ikke svart', farge: 'var(--text-tertiary)' },
}
const GRUPPE_REKKEFØLGE: RsvpStatus[] = ['ja', 'kanskje', 'nei', 'ikke_svart']

// Glyph som korresponderer til hver RSVP-status — vist i raden ved siden av navn.
const STATUS_GLYPH: Record<RsvpStatus, React.ComponentProps<typeof RsvpGlyph>['name']> = {
  ja: 'check',
  kanskje: 'question',
  nei: 'x',
  ikke_svart: 'dash',
}

export default function PaameldteListe({ jaListe, alleSvar, arrangementId, arrangementTittel, kanPurre }: Props) {
  const [modalAapen, setModalAapen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Purre-modal state — søsken til hovedmodalen slik at de aldri er åpne
  // samtidig. Lukk hoved → åpne purre ved klikk på «Purre disse». (#287)
  const [purreModalAapen, setPurreModalAapen] = useState(false)
  const [purreMelding, setPurreMelding] = useState('')
  const [purrePending, startPurreTransition] = useTransition()
  const [purreSendt, setPurreSendt] = useState(false)
  const [purreFeil, setPurreFeil] = useState('')
  // Synkron guard mot dobbelklikk — settes før useTransition rekker å markere pending.
  const purreSendingRef = useRef(false)
  // Focus-retur: snapshot av trigger-knappen ved åpning av purre-modal.
  const purreTriggerRef = useRef<HTMLElement | null>(null)

  // Intl.Collator er raskere enn localeCompare i loop og gir konsistent sortering
  // på tvers av kall. Sekundær-sort på profil_id sikrer stabil rekkefølge ved like navn.
  const collator = useMemo(() => new Intl.Collator('nb'), [])

  // jaListeSortert: avatarrad + «+ N til»-pill (kun ja, alfabetisk)
  const jaListeSortert = useMemo(() => {
    return [...jaListe].sort((a, b) => {
      const cmp = collator.compare(a.navn, b.navn)
      return cmp !== 0 ? cmp : a.profil_id.localeCompare(b.profil_id)
    })
  }, [jaListe, collator])

  // grupper: alleSvar gruppert per status, alfabetisk innen hver gruppe
  const grupper = useMemo(() => {
    const sorted = [...alleSvar].sort((a, b) => {
      const cmp = collator.compare(a.navn, b.navn)
      return cmp !== 0 ? cmp : a.profil_id.localeCompare(b.profil_id)
    })
    const map = new Map<RsvpStatus, PaameldtPerson[]>()
    for (const s of GRUPPE_REKKEFØLGE) map.set(s, [])
    for (const p of sorted) map.get(p.status)?.push(p)
    return map
  }, [alleSvar, collator])

  // Escape-tast lukker modalen. body-overflow hindrer scroll bak modalen,
  // særlig viktig på iOS hvor scroll-chain lett lekker gjennom overlay.
  // Fokus flyttes inn i dialogen ved åpning og tilbake til triggeren ved lukking,
  // i tråd med WAI-ARIA modal-mønster.
  useEffect(() => {
    if (!modalAapen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalAapen(false)
    }
    document.addEventListener('keydown', onKey)
    const forrigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    triggerRef.current = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = forrigeOverflow
      triggerRef.current?.focus?.()
    }
  }, [modalAapen])

  // Samme fokus/scroll-lock-mønster for purre-modalen. (#287)
  // Effekten avhenger KUN av purreModalAapen — ikke purrePending. Hvis vi
  // hadde lagt pending i dep-listen ville cleanup kjørt midt under sending
  // (når useTransition flipper pending), restore body-overflow og forsøkt
  // focus-retur mens modalen fortsatt er åpen. Escape-gating gjøres derfor
  // via purreSendingRef (synkron flagg), samme mønster som VarsleNuKnapp
  // etter #282-fiksen.
  useEffect(() => {
    if (!purreModalAapen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !purreSendingRef.current) setPurreModalAapen(false)
    }
    document.addEventListener('keydown', onKey)
    const forrigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const triggerNode = purreTriggerRef.current
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = forrigeOverflow
      // Focus-retur: trigger-knappen for purre-modalen er pillen INNE i
      // hoved-modalen, som lukkes samtidig som purre-modalen åpnes. Når purre
      // lukkes er den DOM-noden derfor borte. Fall tilbake til hoved-modalens
      // trigger (avatar-raden/«Vis liste»), og til body som siste utvei. (#287)
      if (triggerNode && document.body.contains(triggerNode)) {
        triggerNode.focus?.()
      } else if (triggerRef.current && document.body.contains(triggerRef.current)) {
        triggerRef.current.focus?.()
      } else {
        document.body.focus?.()
      }
    }
  }, [purreModalAapen])

  function aapnePurreModal() {
    // Lukk hoved-modalen først, åpne purre-modalen direkte. (#287)
    purreTriggerRef.current = document.activeElement as HTMLElement | null
    setModalAapen(false)
    setPurreFeil('')
    setPurreMelding('')
    // Reset «Purret»-tilstanden så admin kan purre igjen senere i økten —
    // folk svarer over tid, og det er legitimt å purre flere ganger. (#287)
    setPurreSendt(false)
    setPurreModalAapen(true)
  }

  function lukkPurreModal() {
    if (purrePending) return
    setPurreModalAapen(false)
  }

  function handlePurreSend() {
    if (purreSendingRef.current) return
    purreSendingRef.current = true
    startPurreTransition(async () => {
      try {
        await purreUtenSvar(arrangementId, purreMelding.trim() || undefined)
        setPurreSendt(true)
        setPurreModalAapen(false)
      } catch (err) {
        setPurreFeil(err instanceof Error ? err.message : 'Kunne ikke sende purring')
      } finally {
        purreSendingRef.current = false
      }
    })
  }

  // Vises kun hvis det finnes aktive medlemmer (alleSvar.length > 0).
  // Tidligere ble seksjonen skjult hvis ingen hadde sagt ja — men det ga en
  // «tom» opplevelse for bruker. Nå vises alltid modalen med «Ikke svart»-gjengen. (#285)
  if (alleSvar.length === 0) return null

  const synligeAvatarer = jaListeSortert.slice(0, MAKS_I_RAD)
  const antallSkjult = jaListeSortert.length - MAKS_I_RAD
  const harOverflow = antallSkjult > 0

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 32,
        }}
      >
        {/* Avatar-rad: per-avatar Link til medlemsprofil. Kun ja-folk. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {synligeAvatarer.map((p, i) => (
            <Link
              key={p.profil_id}
              href={`/klubbinfo/medlemmer/${p.profil_id}`}
              aria-label={p.navn}
              style={{
                display: 'block',
                textDecoration: 'none',
                marginLeft: i === 0 ? 0 : -12,
                zIndex: MAKS_I_RAD - i,
                border: '3px solid var(--bg)',
                borderRadius: '50%',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <Avatar name={p.navn} size={44} src={p.bilde_url} rolle={p.rolle} />
            </Link>
          ))}
        </div>

        {/* «+ N til»-pill kun ved overflow i ja-listen. */}
        {harOverflow && (
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            + {antallSkjult} til
          </span>
        )}

        {/* «Vis liste»-knapp åpner modal med alle svar — alltid synlig (#280, #285). */}
        <button
          type="button"
          onClick={() => setModalAapen(true)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            background: 'transparent',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            padding: '8px 14px',
            cursor: 'pointer',
            minHeight: 36,
            marginLeft: 4,
          }}
        >
          Vis liste
        </button>
      </div>

      {/* Modal: alle aktive medlemmer gruppert etter RSVP-status (#285). */}
      {modalAapen && (
        // Backdrop — klikk utenfor kortet lukker modalen
        <div
          onClick={() => setModalAapen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 20px',
          }}
        >
          {/* Stopp propagasjon så klikk på selve kortet ikke lukker. tabIndex=-1
              gjør at .focus() kan flyttes hit programmatisk uten å gjøre kortet tab-bart. */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Svar fra medlemmer"
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 360,
              maxHeight: '80vh',
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              outline: 'none',
            }}
          >
            {/* Modal-header med eksplisitt Lukk-knapp.
                Escape og klikk-utenfor lukker også, men en synlig knapp er nødvendig
                for tastaturbrukere og touch-brukere som ikke kjenner gesten. */}
            <div
              style={{
                padding: '18px 20px 14px',
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-0.2px',
                color: 'var(--text-primary)',
                borderBottom: '0.5px solid var(--border-subtle)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ flex: 1 }}>Svar ({alleSvar.length})</span>
              <button
                type="button"
                onClick={() => setModalAapen(false)}
                aria-label="Lukk"
                style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                  padding: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Scrollbar liste — gruppert etter status.
                Kun ikke-tomme grupper rendres. Gruppe-headeren er sticky
                innen scroll-containeren så den henger igjen ved scroll. */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {GRUPPE_REKKEFØLGE.map(status => {
                const personer = grupper.get(status) ?? []
                if (personer.length === 0) return null
                const meta = GRUPPE_META[status]
                const glyphNavn = STATUS_GLYPH[status]
                return (
                  <div key={status}>
                    {/* Sticky gruppe-header — henger igjen ved scroll innen containeren.
                        backgroundColor må være fullt opak slik at 40px avatarer og
                        24px glyph-slot ikke peeker gjennom (iOS Safari særlig). Økt
                        bunn-padding gir luft mellom tekst og første avatar under scroll.
                        boxShadow erstatter borderBottom for å unngå 0.5px-hopp ved
                        sub-pixel rendering. */}
                    <div
                      style={{
                        position: 'sticky',
                        top: 0,
                        backgroundColor: 'var(--bg-elevated)',
                        padding: '10px 20px 8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '1.4px',
                        color: meta.farge,
                        boxShadow: '0 1px 0 var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ flex: 1 }}>{meta.label} ({personer.length})</span>
                      {/* «Purre disse»-pill: kun synlig for admin/oppretter når gruppen ikke er tom.
                          personer.length>0 er strengt tatt overflødig (tomme grupper filtreres bort
                          over), men eksplisitt sjekk leser tydeligere enn implisitt avhengighet. (#287)
                          Manuell purring ignorerer cron-bryteren purring_aktiv — admin vet hva han gjør. */}
                      {status === 'ikke_svart' && kanPurre && personer.length > 0 && (
                        // Pillen disables KUN under aktiv sending (purrePending).
                        // Etter sending viser vi «Purret» som tekst-state i en kort
                        // periode, men pillen er klikkbar igjen — admin kan åpne
                        // modalen og purre på nytt (aapnePurreModal nullstiller
                        // purreSendt). Tidligere ble pillen permanent disabled
                        // etter første sending, så admin var låst ute fra å sende
                        // ny purring uten å laste siden på nytt.
                        <button
                          type="button"
                          onClick={aapnePurreModal}
                          disabled={purrePending}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: '1.2px',
                            textTransform: 'uppercase',
                            color: purreSendt ? 'var(--success)' : 'var(--accent)',
                            background: 'var(--accent-soft)',
                            border: '0.5px solid var(--accent)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            cursor: purrePending ? 'default' : 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          {purreSendt ? 'Purret' : 'Purre disse'}
                        </button>
                      )}
                    </div>
                    {/* Rader i gruppen */}
                    {personer.map((p, i) => (
                      <Link
                        key={p.profil_id}
                        href={`/klubbinfo/medlemmer/${p.profil_id}`}
                        onClick={() => setModalAapen(false)}
                        // aria-label kombinerer navn + status så skjermlesere får
                        // formidlet RSVP-svaret — ellers leses bare navnet.
                        aria-label={`${p.navn}, ${meta.label}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 20px',
                          textDecoration: 'none',
                          borderTop: i > 0 ? '0.5px solid var(--border-subtle)' : 'none',
                        }}
                      >
                        <Avatar name={p.navn} size={40} src={p.bilde_url} rolle={p.rolle} />
                        <span
                          style={{
                            flex: 1,
                            fontFamily: 'var(--font-body)',
                            fontSize: 15,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {p.navn}
                        </span>
                        {/* Naken glyph i fast 24x24 layout-slot mellom navn og chevron
                            (#285). Ingen bakgrunn/border — bare glyph i meta.farge. */}
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            color: meta.farge,
                          }}
                        >
                          <RsvpGlyph name={glyphNavn} color={meta.farge} size={14} />
                        </span>
                        {/* Chevron som visuell affordance for at raden er klikkbar */}
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                          style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
                        >
                          <path
                            d="M6 4l4 4-4 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </Link>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Purre-modal — søsken til hoved-modalen, aldri åpne samtidig. (#287)
          Samme overlay- og dialog-mønster som VarsleNuKnapp og PurreKnapp. */}
      {purreModalAapen && (
        <div
          onClick={lukkPurreModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 20px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Purre de som ikke har svart på ${arrangementTittel}`}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 360,
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-0.2px',
                color: 'var(--text-primary)',
              }}
            >
              Purre disse
            </div>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--text-tertiary)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Skriv en valgfri hilsen til de som ikke har svart på {arrangementTittel}, eller bare send.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea
                value={purreMelding}
                onChange={e => setPurreMelding(e.target.value)}
                maxLength={PURRING_MAKS_LENGDE}
                placeholder="Valgfritt: en hilsen til gutta…"
                rows={3}
                autoFocus
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-base)',
                  border: '0.5px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  resize: 'none',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  lineHeight: 1.5,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  alignSelf: 'flex-end',
                }}
              >
                {purreMelding.length}/{PURRING_MAKS_LENGDE}
              </span>
            </div>

            {purreFeil && (
              <p
                role="alert"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: 'var(--danger)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {purreFeil}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={lukkPurreModal}
                disabled={purrePending}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'transparent',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handlePurreSend}
                disabled={purrePending}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#0a0a0a',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  cursor: purrePending ? 'default' : 'pointer',
                  opacity: purrePending ? 0.7 : 1,
                }}
              >
                {purrePending ? 'Sender…' : 'Send purring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
