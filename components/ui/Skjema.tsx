'use client'

// Felles byggeklosser for skjemaer — se «Policy: Skjemaer» i CLAUDE.md.
//
// Mønsteret er radene fra Innstillinger på iPhone, i samme bokser som
// kontrollpanelet: etikett til venstre, verdi til høyre, én rad per felt.
// Lange tekster får en egen rad med etiketten over. Datoer og valglister vises
// som en verdi du trykker på — det native feltet ligger usynlig oppå, så det
// aldri kan få sin egen bredde (Safari gir datofelt en bredde som overstyrer
// width: 100 %, og det var det som fikk feltene til å stikke ut).

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { nb } from 'date-fns/locale'
import Icon from '@/components/ui/Icon'

// ── Gruppe ───────────────────────────────────────────────────────────────────

/** Overskrift + avrundet boks med rader. Hjelpetekst og feil står under boksen. */
export function SkjemaGruppe({
  tittel,
  hjelp,
  feil,
  children,
}: {
  tittel?: string
  hjelp?: ReactNode
  feil?: string | null
  children: ReactNode
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      {tittel && (
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            fontWeight: 600,
            margin: '0 0 8px 4px',
          }}
        >
          {tittel}
        </h2>
      )}
      <div
        className="panel-liste"
        style={{
          borderRadius: 14,
          border: '0.5px solid var(--border)',
          background: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
      {hjelp && <p style={{ ...UNDERTEKST, color: 'var(--text-tertiary)' }}>{hjelp}</p>}
      {feil && (
        <p role="alert" style={{ ...UNDERTEKST, color: 'var(--danger)' }}>
          {feil}
        </p>
      )}
    </section>
  )
}

const UNDERTEKST = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  lineHeight: 1.45,
  margin: '8px 4px 0',
} as const

// ── Rad ──────────────────────────────────────────────────────────────────────

/**
 * Én rad: etikett til venstre, innhold til høyre. Raden er et <label>, så et
 * trykk hvor som helst på raden treffer feltet. Markeres med en aksentstrek
 * til venstre mens du skriver i den (klassen skjema-rad i globals.css).
 */
export function SkjemaRad({
  etikett,
  children,
}: {
  etikett: string
  children: ReactNode
}) {
  return (
    <label
      className="skjema-rad"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 48,
        padding: '0 14px',
        position: 'relative',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          maxWidth: '45%',
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          color: 'var(--text-primary)',
          lineHeight: 1.25,
        }}
      >
        {etikett}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, position: 'relative', alignSelf: 'stretch' }}>
        {children}
      </span>
    </label>
  )
}

const VERDI_STIL = {
  flex: 1,
  minWidth: 0,
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  textAlign: 'right',
  fontFamily: 'var(--font-body)',
  fontSize: 16, // 16 px: under det zoomer iOS inn ved fokus
  color: 'var(--text-primary)',
} as const

/** Tekst- og tallfelt i en SkjemaRad. Høyrejustert, uten egen ramme. */
export const RadInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function RadInput({ style, className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`skjemafelt ${className ?? ''}`}
        style={{ ...VERDI_STIL, ...style }}
        {...props}
      />
    )
  },
)

// ── Dato, tid og valg ────────────────────────────────────────────────────────

const VISNING: Record<'date' | 'datetime-local' | 'time', string> = {
  date: 'd. MMM yyyy',
  'datetime-local': "EEE d. MMM 'kl.' HH:mm",
  time: 'HH:mm',
}

/** Verdien som vises for et dato-/tidsfelt. Strengen er lokal tid uten sone. */
export function visDatoVerdi(type: keyof typeof VISNING, verdi: string): string {
  if (!verdi) return ''
  const dato = type === 'time' ? parseISO(`2000-01-01T${verdi}`) : parseISO(verdi)
  return isValid(dato) ? format(dato, VISNING[type], { locale: nb }) : verdi
}

const OVERLEGG = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  margin: 0,
  // Det native feltet åpner datohjulet / valglisten ved trykk. Usynlig, men
  // fortsatt det brukeren treffer — skjermlesere leser det som vanlig felt.
  appearance: 'none',
  WebkitAppearance: 'none',
} as const

function Verdi({ tekst, plassholder }: { tekst: string; plassholder: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        color: tekst ? 'var(--accent)' : 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {tekst || plassholder}
    </span>
  )
}

/** Dato, dato+tid eller tid. Viser verdien i aksentfarge; trykk åpner datohjulet. */
export function DatoFelt({
  type = 'date',
  value,
  onChange,
  plassholder = 'Velg',
  ...props
}: {
  type?: 'date' | 'datetime-local' | 'time'
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  plassholder?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'>) {
  return (
    <>
      <Verdi tekst={visDatoVerdi(type, value)} plassholder={plassholder} />
      <input type={type} value={value} onChange={onChange} style={OVERLEGG} {...props} />
    </>
  )
}

/** Valgliste. Viser valgt etikett i aksentfarge med pil; trykk åpner listen. */
export function ValgFelt({
  value,
  valg,
  onChange,
  plassholder = 'Velg',
  ...props
}: {
  value: string
  valg: { verdi: string; etikett: string }[]
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
  plassholder?: string
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const valgt = valg.find(v => v.verdi === value)
  return (
    <>
      <Verdi tekst={valgt?.etikett ?? ''} plassholder={plassholder} />
      <Icon name="chevronDown" size={14} color="var(--text-tertiary)" />
      <select value={value} onChange={onChange} style={OVERLEGG} {...props}>
        {!valgt && <option value="">{plassholder}</option>}
        {valg.map(v => (
          <option key={v.verdi} value={v.verdi}>
            {v.etikett}
          </option>
        ))}
      </select>
    </>
  )
}

// ── Lang tekst ───────────────────────────────────────────────────────────────

/**
 * Rad for lang tekst: etiketten (valgfri) over, tekstområdet under i full
 * bredde. Vokser med teksten — starter på `minRader` linjer, ingen rullefelt
 * inni feltet.
 */
export function TekstRad({
  etikett,
  minRader = 3,
  value,
  ...props
}: {
  etikett?: string
  minRader?: number
  value: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Høyden følger innholdet. Nullstilles først, ellers krymper feltet aldri
  // når tekst slettes.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <label className="skjema-rad" style={{ display: 'block', padding: '10px 14px 12px', position: 'relative' }}>
      {etikett && (
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-tertiary)',
            marginBottom: 4,
          }}
        >
          {etikett}
        </span>
      )}
      <textarea
        ref={ref}
        className="skjemafelt"
        rows={minRader}
        value={value}
        style={{
          display: 'block',
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          resize: 'none',
          overflow: 'hidden',
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          lineHeight: 1.5,
          color: 'var(--text-primary)',
        }}
        {...props}
      />
    </label>
  )
}

// ── Lagre ────────────────────────────────────────────────────────────────────

/**
 * Lagre-knapp i full bredde nederst i et skjema som ligger på en side med
 * annet innhold. Hele-side-skjemaer (nytt arrangement o.l.) bruker SkjemaBar
 * øverst i stedet.
 */
export function LagreKnapp({
  onClick,
  endret,
  lagrer,
  lagret,
  tekst = 'Lagre',
}: {
  onClick: () => void
  endret: boolean
  lagrer: boolean
  lagret?: boolean
  tekst?: string
}) {
  const aktiv = endret && !lagrer
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!aktiv}
      style={{
        width: '100%',
        minHeight: 48,
        borderRadius: 14,
        border: 'none',
        background: aktiv ? 'var(--accent)' : 'var(--bg-elevated-2)',
        color: aktiv ? 'var(--accent-foreground)' : 'var(--text-tertiary)',
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      {lagrer ? 'Lagrer …' : lagret && !endret ? 'Lagret' : tekst}
    </button>
  )
}
