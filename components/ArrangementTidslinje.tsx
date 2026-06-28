'use client'

import Link from 'next/link'
import Image from 'next/image'
import { isBefore } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { formaterDato, norskAar, norskDag, norskDatoNaa } from '@/lib/dato'
import { MapPinIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import SladdetFelt from './SladdetFelt'
import Badge from './ui/Badge'
import type { Json } from '@/lib/supabase/database.types'

type Paamelding = { profil_id: string; status: string; profiles?: { visningsnavn: string | null } | null }

type Arrangement = {
  id: string
  type: string
  tittel: string
  beskrivelse: string | null
  start_tidspunkt: string
  slutt_tidspunkt: string | null
  oppmoetested: string | null
  destinasjon: string | null
  pris_per_person: number | null
  sensurerte_felt: Json
  opprettet_av: string | null
  bilde_url?: string | null
  paameldinger: Paamelding[]
}

type Bursdag = {
  id: string
  profilId: string
  visningsnavn: string
  dato: string   // YYYY-MM-DD for the occurrence year
  alder: number
}

type IkkePlanlagt = {
  id: string
  arrangementNavn: string
  ansvarlige: string[]
  estimertDato: string
}

type TidslinjeItem =
  | { type: 'arrangement'; data: Arrangement }
  | { type: 'bursdag'; data: Bursdag }
  | { type: 'ikke-planlagt'; data: IkkePlanlagt }

function statusBadge(status: string | undefined, fortid?: boolean) {
  if (status === 'ja') return { label: fortid ? 'Du svarte ja' : 'Påmeldt', variant: 'success' as const }
  if (status === 'kanskje') return { label: fortid ? 'Du svarte kanskje' : 'Kanskje', variant: 'accent' as const }
  if (status === 'nei') return { label: fortid ? 'Du svarte nei' : 'Avmeldt', variant: 'destructive' as const }
  return { label: fortid ? 'Du svarte ikke' : 'Ikke svart', variant: 'neutral' as const }
}

function itemDag(item: TidslinjeItem): Date {
  if (item.type === 'arrangement') return norskDag(item.data.start_tidspunkt)
  if (item.type === 'ikke-planlagt') return norskDag(item.data.estimertDato)
  const [yr, mnd, dag] = item.data.dato.split('-').map(Number)
  return new Date(yr, mnd - 1, dag)
}

function erItemPast(item: TidslinjeItem): boolean {
  // Både arrangementer og bursdager: "past" bare hvis dagen er strengt før i dag (norsk tid).
  return isBefore(itemDag(item), norskDatoNaa())
}

function erItemIdag(item: TidslinjeItem): boolean {
  return itemDag(item).getTime() === norskDatoNaa().getTime()
}

function DeltakerLinje({ navnliste, fortid }: { navnliste: string[]; fortid?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [visAntall, setVisAntall] = useState(navnliste.length)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function beregn() {
      const tilgjengelig = el!.clientWidth
      if (tilgjengelig === 0) return

      const m = document.createElement('span')
      const cs = getComputedStyle(el!)
      m.style.cssText = `visibility:hidden;position:absolute;white-space:nowrap;font:${cs.font}`
      document.body.appendChild(m)

      let best = 1
      for (let i = navnliste.length; i >= 1; i--) {
        const tekst = navnliste.slice(0, i).join(', ')
        const rest = navnliste.length - i
        m.textContent = rest > 0
          ? `${tekst} + ${rest} til${fortid ? ' deltok' : ''}`
          : `${tekst}${fortid ? ' deltok' : ''}`
        if (m.offsetWidth <= tilgjengelig) {
          best = i
          break
        }
      }
      document.body.removeChild(m)
      setVisAntall(best)
    }

    beregn()
    const ro = new ResizeObserver(beregn)
    ro.observe(el)
    return () => ro.disconnect()
  }, [navnliste, fortid])

  const visNavn = navnliste.slice(0, visAntall)
  const resten = navnliste.length - visAntall

  return (
    <span ref={ref} style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block' }}>
      {visNavn.join(', ')}
      {resten > 0 && ` + ${resten} til`}
      {fortid && ' deltok'}
    </span>
  )
}

export default function ArrangementTidslinje({
  arrangementer,
  innloggetBrukerId,
  bursdager = [],
  ikkePlanlagt = [],
  lastMerKnapp,
}: {
  arrangementer: Arrangement[]
  innloggetBrukerId: string
  bursdager?: Bursdag[]
  ikkePlanlagt?: IkkePlanlagt[]
  lastMerKnapp?: React.ReactNode
}) {
  const alleItems: TidslinjeItem[] = [
    ...arrangementer.map(a => ({ type: 'arrangement' as const, data: a })),
    ...bursdager.map(b => ({ type: 'bursdag' as const, data: b })),
    ...ikkePlanlagt.map(p => ({ type: 'ikke-planlagt' as const, data: p })),
  ]

  const iAar = String(norskAar())

  const tidligereItems = alleItems
    .filter(item => erItemPast(item))
    .sort((a, b) => itemDag(b).getTime() - itemDag(a).getTime())

  const idagItems = alleItems
    .filter(item => !erItemPast(item) && erItemIdag(item))
    .sort((a, b) => itemDag(a).getTime() - itemDag(b).getTime())

  const kommendeItems = alleItems
    .filter(item => !erItemPast(item) && !erItemIdag(item))
    .sort((a, b) => itemDag(a).getTime() - itemDag(b).getTime())

  function ArrangementKort({ arr, fortid, prioritert, idag }: { arr: Arrangement; fortid?: boolean; prioritert?: boolean; idag?: boolean }) {
    const iso = arr.start_tidspunkt
    const minPaamelding = arr.paameldinger.find(p => p.profil_id === innloggetBrukerId)
    const jaListe = arr.paameldinger.filter(p => p.status === 'ja')
    const antallJa = jaListe.length
    const jaNavnListe = jaListe.map(p => p.profiles?.visningsnavn).filter(Boolean) as string[]
    const erTur = arr.type === 'tur'
    const erSensurert = (felt: string) =>
      (arr.sensurerte_felt as Record<string, boolean> | null)?.[felt] === true
    const status = statusBadge(minPaamelding?.status, fortid)

    return (
      <Link
        href={`/arrangementer/${arr.id}`}
        className="block rounded-2xl overflow-hidden transition-transform duration-100 active:scale-[0.98] relative"
        style={{
          background: 'var(--bg-elevated)',
          border: idag ? '2px solid var(--accent)' : '1px solid var(--border)',
          // Pre-existing bug: ytre halo brukte en hardkodet gullfarve-verdi som hadde driftet
          // fra aksent-tokenet. Konsolidert til --accent-soft begge plasser. Se issue 330.
          boxShadow: idag ? '0 0 0 4px var(--accent-soft), 0 12px 32px var(--accent-soft)' : undefined,
          opacity: fortid ? 0.5 : 1,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        {idag && (
          <span
            className="absolute top-3 right-3 z-10 text-[11px] font-bold uppercase px-2.5 py-1 rounded-full"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
              letterSpacing: '0.6px',
              boxShadow: 'var(--shadow-floating)', // 0.4 → 0.18, marginalt, akseptabelt
            }}
          >
            I dag!
          </span>
        )}
        {/* Hero-bilde */}
        <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
          <Image
            src={arr.bilde_url || '/bakgrunn.jpg'}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 512px) 100vw, 512px"
            priority={prioritert}
          />
        </div>

        {/* Innhold */}
        <div className="p-5">
          {/* Meta: type + dato */}
          <div className="flex items-center gap-2 mb-1.5" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            <Badge variant="accent">{erTur ? 'Tur' : 'Møte'}</Badge>
            <span>
              {formaterDato(iso, 'd. MMM')}
              {formaterDato(iso, 'yyyy') !== iAar && ` ${formaterDato(iso, 'yyyy')}`}
              {' kl. '}
              {formaterDato(iso, 'HH:mm')}
            </span>
          </div>

          {/* Tittel */}
          <h2
            className="font-semibold mb-1"
            style={{ fontSize: '17px', letterSpacing: '-0.2px', color: 'var(--text-primary)' }}
          >
            {arr.tittel}
          </h2>

          {/* Sted */}
          {arr.oppmoetested && (
            <div className="flex items-center gap-1.5" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              <MapPinIcon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              {arr.oppmoetested}
            </div>
          )}

          {/* Destinasjon (kun tur) */}
          {erTur && arr.destinasjon && (
            <div className="flex items-center gap-1.5 mt-0.5" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              <PaperAirplaneIcon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              {erSensurert('destinasjon') ? <SladdetFelt /> : arr.destinasjon}
            </div>
          )}

          {/* Footer */}
          <div
            className="flex items-center justify-between mt-3.5 pt-3"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: 'var(--success)' }}
              />
              {antallJa === 0 ? (
                <span>{fortid ? 'Ingen deltok' : 'Ingen påmeldt ennå'}</span>
              ) : (
                <DeltakerLinje navnliste={jaNavnListe} fortid={fortid} />
              )}
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>
      </Link>
    )
  }

  function bursdagEmojier(navn: string): string {
    const emojier = ['🎂', '🎁', '🎉', '🥳', '🍾', '🎊', '🌟', '🥂', '🍻', '🍸', '💎', '🍺', '👏', '🎈', '🪅', '🎆', '🎇', '🧁', '🎀', '💐', '🪩', '🎶']
    // FNV-1a hash for bedre spredning
    let h = 0x811c9dc5
    for (let i = 0; i < navn.length; i++) { h ^= navn.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    const a = (h >>> 0) % emojier.length
    let b = ((h >>> 8) ^ (h >>> 16)) % (emojier.length - 1)
    if (b >= a) b++
    let c = ((h >>> 4) ^ (h >>> 12)) % (emojier.length - 2)
    if (c >= Math.min(a, b)) c++
    if (c >= Math.max(a, b)) c++
    return emojier[a] + emojier[b] + emojier[c]
  }

  function BursdagNotis({ bursdag, fortid, idag }: { bursdag: Bursdag; fortid?: boolean; idag?: boolean }) {
    const dag = itemDag({ type: 'bursdag', data: bursdag })
    const erPast = isBefore(dag, norskDatoNaa())
    const verb = erPast ? 'fylte' : 'fyller'
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{
          background: 'var(--bg-elevated)',
          border: idag ? '2px solid var(--accent)' : '1px solid var(--border)',
          opacity: fortid ? 0.5 : 1,
        }}
      >
        <span style={{ fontSize: '20px', letterSpacing: '-3px', lineHeight: 1 }}>{bursdagEmojier(bursdag.visningsnavn)}</span>
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            <Link href={`/klubbinfo/medlemmer/${bursdag.profilId}`} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px', textDecorationColor: 'var(--accent)' }}>
              {bursdag.visningsnavn}
            </Link>
            {' '}{verb} {bursdag.alder} år
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {formaterDato(bursdag.dato, 'd. MMMM')}
            {formaterDato(bursdag.dato, 'yyyy') !== iAar && ` ${formaterDato(bursdag.dato, 'yyyy')}`}
          </p>
        </div>
      </div>
    )
  }

  function IkkePlanlagtKort({ data, fortid }: { data: IkkePlanlagt; fortid?: boolean }) {
    return (
      <Link
        href="/arrangoransvar"
        className="block rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg)',
          border: '2px dashed var(--border)',
          opacity: fortid ? 0.4 : 0.7,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div className="px-5 py-6 flex items-center gap-4">
          <span
            className="flex items-center justify-center rounded-full shrink-0"
            style={{
              width: '48px',
              height: '48px',
              background: 'var(--bg-elevated)',
              border: '2px dashed var(--border)',
              color: 'var(--text-tertiary)',
              fontSize: '24px',
              fontWeight: 700,
            }}
          >
            ?
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
              {data.arrangementNavn}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Ikke planlagt ennå
            </p>
            {data.ansvarlige.length > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Ansvarlig{data.ansvarlige.length > 1 ? 'e' : ''}: {data.ansvarlige.join(', ')}
              </p>
            )}
          </div>
        </div>
      </Link>
    )
  }

  function RenderItem({ item, fortid, prioritert, idag }: { item: TidslinjeItem; fortid?: boolean; prioritert?: boolean; idag?: boolean }) {
    if (item.type === 'arrangement') return <ArrangementKort arr={item.data} fortid={fortid} prioritert={prioritert} idag={idag} />
    if (item.type === 'ikke-planlagt') return <IkkePlanlagtKort data={item.data} fortid={fortid} />
    return <BursdagNotis bursdag={item.data} fortid={fortid} idag={idag} />
  }

  return (
    <div>
      {/* I dag */}
      {idagItems.length > 0 && (
        <>
          <p
            className="font-bold uppercase mb-3 flex items-center gap-2"
            style={{ color: 'var(--accent)', letterSpacing: '1px', fontSize: '13px' }}
          >
            <span>🎉</span> I dag <span>🎉</span>
          </p>
          <div className="space-y-4">
            {idagItems.map((item, i) => (
              <RenderItem key={item.data.id} item={item} prioritert={i === 0} idag />
            ))}
          </div>
        </>
      )}

      {/* Separator */}
      {idagItems.length > 0 && kommendeItems.length > 0 && (
        <div className="my-8" style={{ height: '1px', background: 'var(--border-subtle)' }} />
      )}

      {/* Kommende */}
      {kommendeItems.length > 0 && (
        <>
          <p
            className="text-xs font-semibold uppercase mb-3"
            style={{ color: 'var(--text-secondary)', letterSpacing: '0.5px' }}
          >
            Kommende
          </p>
          <div className="space-y-4">
            {kommendeItems.map((item, i) => (
              <RenderItem key={item.data.id} item={item} prioritert={idagItems.length === 0 && i === 0} />
            ))}
          </div>
        </>
      )}

      {/* Last mer-knapp (mellom kommende og tidligere) */}
      {lastMerKnapp && (
        <div className="mt-8">{lastMerKnapp}</div>
      )}

      {/* Send inn forslag */}
      <div className="mt-8 pt-8 text-center" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Savner du noe i appen?
        </p>
        <Link
          href="/bli-utvikler"
          className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Send inn forslag
        </Link>
      </div>

      {/* Separator */}
      {tidligereItems.length > 0 && (idagItems.length > 0 || kommendeItems.length > 0 || lastMerKnapp) && (
        <div className="my-8" style={{ height: '1px', background: 'var(--border-subtle)' }} />
      )}

      {/* Tidligere */}
      {tidligereItems.length > 0 && (
        <>
          <p
            className="text-xs font-semibold uppercase mb-3"
            style={{ color: 'var(--text-secondary)', letterSpacing: '0.5px' }}
          >
            Tidligere
          </p>
          <div className="space-y-4">
            {tidligereItems.map(item => (
              <RenderItem key={item.data.id} item={item} fortid />
            ))}
          </div>
        </>
      )}

      {idagItems.length === 0 && kommendeItems.length === 0 && tidligereItems.length === 0 && (
        <p className="text-sm py-4" style={{ color: 'var(--text-secondary)' }}>
          Ingen arrangementer
        </p>
      )}

    </div>
  )
}
