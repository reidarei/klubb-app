import type { CSSProperties, ReactNode } from 'react'

/**
 * Delt visuell primitiv for en «opplysnings-rad»: etikett venstre, verdi
 * (eller et redigerbart felt) høyre, samme linje. Brukt av `/profil`
 * (visning, `EgneOpplysninger.tsx`) og `/profil/rediger` (redigering,
 * `RedigerProfilForm.tsx`) — #685 handlet nettopp om at de to så ut som to
 * forskjellige skjemaer fordi hver hadde sin egen `Rad`/`labelStil`.
 *
 * Bevisst IKKE én komponent med en `redigerbar`-prop: en slik prop ville
 * gjort primitiven til en konfigmatrise (§ Policy: Avatar advarer mot
 * nøyaktig dette), og tvunget `/profil` til å bli en klientkomponent for å
 * holde input-state den ikke trenger. I stedet er `OpplysningRad` ren
 * layout — den vet ingenting om tilstand — og kalleren styrer selv om
 * `children` er statisk tekst eller et `<input>`.
 *
 * INGEN `'use client'`: komponenten brukes fra `/profil` (server component)
 * så vel som fra `RedigerProfilForm` (klientkomponent) — begge kan importere
 * en ren, tilstandsløs funksjon. Det er også grunnen til at det redigerbare
 * fritekstfeltet (`OpplysningTekstfelt`) bor i sin egen fil: det trenger
 * hooks, og `'use client'` her ville fått `/profil` sitt server-side kall på
 * `opplysningVerdiStil()` til å kaste.
 *
 * ETIKETTEN ER VISUELL, IKKE PROGRAMMATISK: den rendres som en `<div>`, ikke
 * en `<label htmlFor>`, nettopp fordi `/profil` ikke har noen kontroll å
 * knytte den til. Omslutter du et skjemafelt, MÅ feltet derfor ha sitt eget
 * `aria-label` med samme tekst (#685-review) — ellers står kontrollen uten
 * tilgjengelig navn. `RedigerProfilForm` gjør det via den lokale
 * `RedigerRad`-wrapperen, som sender etikettstrengen videre til kontrollen
 * slik at de to ikke kan drifte fra hverandre.
 */
export default function OpplysningRad({
  label,
  children,
  last,
}: {
  label: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div
      // Stabilt feste for e2e-vakten (#685-review): den finner både verdien
      // og etikett-settet på /profil og /profil/rediger uten å kjenne
      // DOM-formen på hver av dem.
      data-opplysning={label}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      <OpplysningLabel>{label}</OpplysningLabel>
      {children}
    </div>
  )
}

export function OpplysningLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="opplysning-etikett"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '1.6px',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Verdi-stil delt mellom visning og redigering. `dempet` er eksplisitt satt
 * av kalleren (ikke utledet her) fordi betydningen er ulik i de to
 * tilstandene: på visningssiden betyr det «feltet er tomt», i skjemaet
 * betyr det «feltet er ikke redigerbart» (e-post).
 */
export function opplysningVerdiStil({
  mono,
  dempet,
}: { mono?: boolean; dempet?: boolean } = {}): CSSProperties {
  return {
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
    fontSize: 14,
    lineHeight: 1.4,
    color: dempet ? 'var(--text-tertiary)' : 'var(--text-primary)',
    letterSpacing: mono ? '0.2px' : '0.1px',
    textAlign: 'right',
    // Verdien wrapper fritt i stedet for å kappes med ellipsis (#683) —
    // gjelder like mye for et redigerbart felt som for ren visning.
    overflowWrap: 'break-word',
    minWidth: 0,
  }
}

/** Nullstiller input-defaults slik at feltet arver `opplysningVerdiStil()`
 * i stedet for nettleserens standard input-utseende.
 *
 * `outline: 'none'` gjelder bevisst kun musebruk: feltene har verken ramme
 * eller bakgrunn, så `.opplysning-verdi:focus-visible` i `globals.css` gir
 * tastaturbrukeren en synlig markering tilbake (#685-review). Kallsteder som
 * bruker denne resetten skal derfor også sette `className="opplysning-verdi"`. */
export const OPPLYSNING_INPUT_RESET: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
}
