// Server-only modul — hentet kun i server actions, aldri fra klient-kode.
// Isolerer hentingen slik at kilden (RESTful API) er byttbar uten at resten av appen endres.

import { FOND_OPPGJOR_URL, FOND_OPPGJOR_API_NOKKEL } from './config'

// JSON-kontrakten vi forventer fra kilden. Versjon 1 er den eneste gyldige nå.
export type Oppgjor = {
  versjon: 1
  generert: string        // ISO 8601 tidsstempel, f.eks. "2026-07-14T18:05:00Z"
  snapshot_dato: string   // YYYY-MM-DD — dato beløpene gjelder
  saldo: number           // total kontantbeholdning
  andeler: { visningsnavn: string; belop: number }[]
}

// Regex for YYYY-MM-DD med løs sjekk; reell dato-validering via Date-parsing.
const DATO_REGEX = /^\d{4}-\d{2}-\d{2}$/

// Hjelpefunksjon — maks to desimaler og endelig ikke-negativt tall.
// Samme toleranse som validerBelop i lib/actions/fond.ts (1e-6 for flyttall-støy).
function validerTall(verdi: unknown, feltnavn: string): number {
  if (typeof verdi !== 'number') throw new Error(`${feltnavn} må være et tall`)
  const oere = verdi * 100
  if (!Number.isFinite(verdi) || verdi < 0 || Math.abs(oere - Math.round(oere)) > 1e-6)
    throw new Error(`${feltnavn} må være et ikke-negativt beløp med maks to desimaler`)
  return verdi
}

/**
 * Validerer at et ukjent objekt oppfyller Oppgjor-kontrakten.
 * Ren funksjon uten I/O — trygg å kalle i tester.
 */
export function validerOppgjor(u: unknown): Oppgjor {
  if (typeof u !== 'object' || u === null || Array.isArray(u))
    throw new Error('Oppgjør må være et JSON-objekt')

  const o = u as Record<string, unknown>

  if (o.versjon !== 1)
    throw new Error(`Ukjent oppgjørsversjon: ${o.versjon} (forventet 1)`)

  if (typeof o.generert !== 'string' || !o.generert)
    throw new Error('Feltet «generert» mangler eller er ikke en streng')

  if (typeof o.snapshot_dato !== 'string' || !DATO_REGEX.test(o.snapshot_dato))
    throw new Error('«snapshot_dato» må være på formatet YYYY-MM-DD')

  // Sjekk at datoen faktisk er gyldig (f.eks. 2026-02-30 er ugyldig).
  // new Date() "folger" ugyldige datoer (2026-02-30 → 2026-03-02) i stedet for
  // å returnere Invalid Date, så vi må sammenligne tilbake mot input-strengen.
  const d = new Date(o.snapshot_dato + 'T00:00:00Z')
  const tilbake = d.toISOString().slice(0, 10)
  if (isNaN(d.getTime()) || tilbake !== o.snapshot_dato)
    throw new Error(`«snapshot_dato» er ikke en gyldig dato: ${o.snapshot_dato}`)

  validerTall(o.saldo, 'Saldo')

  if (!Array.isArray(o.andeler) || o.andeler.length === 0)
    throw new Error('«andeler» må være en ikke-tom liste')

  // Sett for å fange duplikate visningsnavn (trimmet). Uten dette kan to like navn
  // gi to insert-rader ved skriving — skrive-loopen leser fra en liste som aldri
  // muteres, så «finnes rad allerede?» er alltid nei for det andre navnet (#453).
  const sette = new Set<string>()

  for (let i = 0; i < o.andeler.length; i++) {
    const a = o.andeler[i]
    if (typeof a !== 'object' || a === null)
      throw new Error(`Andel nr. ${i + 1} er ikke et objekt`)
    const andel = a as Record<string, unknown>
    if (typeof andel.visningsnavn !== 'string' || andel.visningsnavn.trim().length === 0)
      throw new Error(`Andel nr. ${i + 1} mangler «visningsnavn»`)
    const trimmet = andel.visningsnavn.trim()
    if (sette.has(trimmet))
      throw new Error(`Duplikat visningsnavn i oppgjøret: «${trimmet}» — hver andel må ha et unikt navn`)
    sette.add(trimmet)
    validerTall(andel.belop, `Beløp for ${andel.visningsnavn}`)
  }

  return o as unknown as Oppgjor
}

/**
 * Henter oppgjør fra RESTful API og returnerer validert Oppgjor.
 * Kaller kun fra server-side kode (server actions / route handlers).
 */
export async function hentOppgjor(): Promise<Oppgjor> {
  // Strip trailing slash fra base-URL — «https://host//v1/oppgjor» kan 404-e
  // hos API-gateways, og feilen ville først vist seg ved manuelt env-oppsett
  const url = `${FOND_OPPGJOR_URL.replace(/\/+$/, '')}/v1/oppgjor`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${FOND_OPPGJOR_API_NOKKEL}`,
      Accept: 'application/json',
      // Cloudflares bot-beskyttelse foran API-et 403-er tomme/generiske UA-er;
      // Node fetch sender minimal UA — eksplisitt UA er påkrevd (se #457).
      'User-Agent': 'klubb-app-fond/1',
    },
    cache: 'no-store', // alltid ferske data ved admin-kall
  })

  if (res.status === 401)
    throw new Error('Feil API-nøkkel for oppgjørs-kilden')
  if (res.status === 404)
    throw new Error('Fant ikke publisert oppgjør i kilden')
  if (!res.ok)
    throw new Error(`Kunne ikke hente oppgjør (HTTP ${res.status})`)

  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    throw new Error('Innholdet fra kilden er ikke gyldig JSON')
  }

  return validerOppgjor(parsed)
}
