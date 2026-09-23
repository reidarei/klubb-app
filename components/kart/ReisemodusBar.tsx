'use client'

import ReisemodusToggle from '@/components/reisemodus/ReisemodusToggle'

type Props = {
  zIndex: number
}

// ── Toppkontroll-sonen på kartflaten (#723-review) ──────────────────────────
// Baren og kartets knapperad deler samme hjørne i reisemodus, og raden må
// skyves ned under baren. Målene HER er eneste kilde: PosisjonsKart legger
// REISEMODUS_BAR_SONE ut som custom property (--kart-topp-sone) på kart-flaten,
// og raden skyver seg ned med den. Tidligere sto tallet 56 som en literal i
// PosisjonsKart og gjentok implisitt «10 + 38 + luft» herfra — en avatar som
// endret størrelse ville brakt overlappen tilbake uten at noe pekte på det.

/** Barens toppmargin — samme verdi som knapperadens egen i normal modus. */
export const KART_TOPP_MARGIN = 10
/**
 * Barens høyde. Var avatarens diameter fram til #744, der det ble bedt om å
 * fjerne profilbildet fra reisemodus — nå er tittelen (display-font, 22px
 * linjehøyde) og bryteren de høyeste elementene.
 */
export const REISEMODUS_BAR_AVATAR = 34
/** Luft mellom baren og det som ligger rett under den. */
const BAR_LUFT = 8
/** Høyden kartets knapperad må skyves ned med for å klarere baren. */
export const REISEMODUS_BAR_SONE = REISEMODUS_BAR_AVATAR + BAR_LUFT

/**
 * Erstatter TopHeader mens reisemodus er PÅ (#723) — TopHeader er ikke
 * montert på /kart i den tilstanden (se app/(app)/layout.tsx), så profil-
 * snarveien, ulest-prikken og reisemodus-toggelen må leve et sted brukeren
 * fortsatt finner dem. Flytende bar øverst til høyre, samme hjørne som
 * TopHeader ville brukt («samme sted i begge moduser», et bevisst valg).
 *
 * `top` bruker `--kart-panel-safe-top` — samme custom property som resten av
 * kart-panelene konsumerer i stedet for å lese iOS' egen topp-innsett-
 * variabel selv (se PosisjonsKart.tsx for hele regnestykket).
 */
export default function ReisemodusBar({ zIndex }: Props) {
  // En strek som fader ut mot enden i stedet for å stoppe brått. Rett strek
  // mot kartfliser ser ut som en feil i kartet; en gradient leser som pynt.
  const strek = (retning: 'venstre' | 'hoeyre') => (
    <span
      aria-hidden="true"
      style={{
        flex: '1 1 0',
        maxWidth: 90,
        height: 1,
        background:
          retning === 'venstre'
            ? 'linear-gradient(to right, transparent, var(--kart-tekst))'
            : 'linear-gradient(to left, transparent, var(--kart-tekst))',
        opacity: 0.55,
      }}
    />
  )

  return (
    <div
      data-testid="reisemodus-bar"
      style={{
        position: 'absolute',
        top: `calc(${KART_TOPP_MARGIN}px + var(--kart-panel-safe-top, 0px))`,
        left: KART_TOPP_MARGIN,
        right: KART_TOPP_MARGIN,
        // position: relative på raden + absolutt bryter til høyre, slik at
        // tittelen kan sentreres i HELE bredden. Med bryteren i samme flex-rad
        // ville tittelen blitt forskjøvet til venstre med bryterens bredde
        // (midtstilt overskrift var et eksplisitt ønske, #744).
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        zIndex,
      }}
    >
      {strek('venstre')}

      {/* Display-fonten er husets «festlige» skrift — samme som seksjons-
          titlene ellers i appen. Tekstskyggen er nødvendig: baren er
          transparent, og tittelen står rett på kartflisene, som veksler
          mellom lyse boligfelt og mørk sjø. */}
      <span
        data-testid="reisemodus-tittel"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          lineHeight: 1,
          color: 'var(--kart-tekst)',
          textShadow: '0 1px 3px var(--kart-flate-sterk), 0 0 10px var(--kart-flate-sterk)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Reisemodus
      </span>

      {strek('hoeyre')}

      {/* Absolutt, ikke i flex-flyten: se kommentaren på raden over. */}
      <span
        style={{
          position: 'absolute',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <ReisemodusToggle paa variant="kart" />
      </span>
    </div>
  )
}
