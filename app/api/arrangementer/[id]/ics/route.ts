import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { formaterDato, TIDSSONE } from '@/lib/dato'
import { BASE_URL } from '@/lib/config'
import { KLUBB_NAVN, KLUBB_KORTNAVN, KLUBB_DOMENE } from '@/lib/klubb-config'

// Escape for .ics TEXT-verdier: backslash, semikolon, komma og linjeskift
function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

// Formatter til .ics lokal tid i norsk tidssone: YYYYMMDDTHHMMSS
function formatIcsDate(iso: string): string {
  return formaterDato(iso, "yyyyMMdd'T'HHmmss")
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: arr } = await supabase
    .from('arrangementer')
    .select('id, type, tittel, beskrivelse, start_tidspunkt, slutt_tidspunkt, oppmoetested, destinasjon')
    .eq('id', id)
    .single()

  if (!arr) return new NextResponse('Not found', { status: 404 })

  const sluttIso = arr.slutt_tidspunkt
    ?? new Date(new Date(arr.start_tidspunkt).getTime() + 2 * 60 * 60 * 1000).toISOString()

  const beskrivelseDeler: string[] = []
  if (arr.beskrivelse) beskrivelseDeler.push(arr.beskrivelse)
  if (arr.type === 'tur' && arr.destinasjon) beskrivelseDeler.push(`Destinasjon: ${arr.destinasjon}`)
  beskrivelseDeler.push(`${BASE_URL}/arrangementer/${id}`)

  const linjer = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    // KLUBB_NAVN kan inneholde tegn som må escapes for ICS TEXT (komma, semikolon).
    `PRODID:-//${escapeIcs(KLUBB_NAVN)}//NO`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `BEGIN:VTIMEZONE`,
    `TZID:${TIDSSONE}`,
    `END:VTIMEZONE`,
    'BEGIN:VEVENT',
    `UID:${id}@${KLUBB_DOMENE}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;TZID=${TIDSSONE}:${formatIcsDate(arr.start_tidspunkt)}`,
    `DTEND;TZID=${TIDSSONE}:${formatIcsDate(sluttIso)}`,
    `SUMMARY:${escapeIcs(arr.tittel)}`,
    `DESCRIPTION:${escapeIcs(beskrivelseDeler.join('\n'))}`,
    ...(arr.oppmoetested ? [`LOCATION:${escapeIcs(arr.oppmoetested)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  const ics = linjer.join('\r\n')
  // Filnavn fra kortnavnet, forenklet til trygge ASCII-tegn (æ/ø/å og
  // spesialtegn kan skape trøbbel i Content-Disposition på enkelte klienter).
  const navnSlug = KLUBB_KORTNAVN.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kalender'
  const filnavn = `${navnSlug}-${id.slice(0, 8)}.ics`

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filnavn}"`,
    },
  })
}
