// Server-only modul — hentet kun i server actions, aldri fra klient-kode.
// Isolerer hentingen slik at kilden (RESTful API) er byttbar uten at resten av appen endres.

import { FOND_OPPGJOR_URL, FOND_OPPGJOR_API_NOKKEL } from './config'

// Én bevegelse på en innskyters andel i inneværende år.
// belop er FORTEGNSBÆRENDE: positiv = innskudd, negativ = uttak. Fortegnet
// ligger i beløpet og ikke i en egen type-kolonne, slik at det finnes ett sted
// og derfor ikke kan motsi seg selv. 0 er ugyldig.
export type Bevegelse = { dato: string; belop: number }

// En innskyters andel. De tre detaljfeltene er valgfrie fordi kilden kan være
// et eldre API som ikke sender dem — men de er en PAKKE: enten alle tre eller
// ingen (se validerOppgjor). En delvis pakke gir en oppdeling som ikke
// summerer seg til totalen, og det er verre enn ingen oppdeling.
export type Andel = {
  visningsnavn: string
  belop: number                    // totalandelen — autoritativ, alltid til stede
  oppspart_akkumulert?: number     // inngående saldo minus fjorårets renteandel, akkumulert over alle år
  renteandel_i_fjor?: number       // kun fjorårets renteandel
  bevegelser?: Bevegelse[]
}

// JSON-kontrakten vi forventer fra kilden. Versjon 1 er den eneste gyldige nå.
// Detaljfeltene ble lagt til ADDITIVT innenfor versjon 1 (#543) framfor å bumpe
// til 2, nettopp fordi sjekken under kaster hardt: et versjonsbump ville knekt
// «Hent oppgjør» i prod i samme øyeblikk API-et ble deployet, og holdt det
// knekt til app-endringen var live.
export type Oppgjor = {
  versjon: 1
  generert: string        // ISO 8601 tidsstempel, f.eks. "2026-07-14T18:05:00Z"
  snapshot_dato: string   // YYYY-MM-DD — dato beløpene gjelder
  saldo: number           // total kontantbeholdning
  andeler: Andel[]
}

// Sant når andelen har hele detaljpakken. Brukes etter validering, der pakke-
// regelen alt er håndhevet, så det holder å sjekke ett av de tre feltene —
// men vi sjekker alle tre for at typesnevringen skal gjelde alle tre.
export function harDetaljer(
  a: Andel,
): a is Andel & { oppspart_akkumulert: number; renteandel_i_fjor: number; bevegelser: Bevegelse[] } {
  return (
    a.oppspart_akkumulert !== undefined &&
    a.renteandel_i_fjor !== undefined &&
    a.bevegelser !== undefined
  )
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

// Som validerTall, men for beløp som BÆRER FORTEGN (bevegelser: uttak er
// negative). 0 avvises: en nullbevegelse er alltid en tom regnearkslinje eller
// en feil, og skal stoppes her framfor å skjules i UI-et.
//
// Egen funksjon med vilje — validerTall må ikke løsnes opp, for da mister
// `saldo` og `belop` vernet mot negative tall. En negativ totalandel ville
// betydd at noen har tatt ut mer enn han har spart, og skal feile synlig.
function validerFortegnTall(verdi: unknown, feltnavn: string): number {
  if (typeof verdi !== 'number') throw new Error(`${feltnavn} må være et tall`)
  const oere = verdi * 100
  if (!Number.isFinite(verdi) || Math.abs(oere - Math.round(oere)) > 1e-6)
    throw new Error(`${feltnavn} må være et beløp med maks to desimaler`)
  if (Math.round(oere) === 0) throw new Error(`${feltnavn} kan ikke være 0`)
  return verdi
}

// Penger sammenlignes i hele øre, aldri som flyttall: 0.1 + 0.2 !== 0.3 i
// float, og her er avviket forskjellen mellom «stemmer» og «feiler».
const iOere = (n: number) => Math.round(n * 100)

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

  // Året detaljene skal ligge i. Utledes av snapshot_dato, ALDRI av dagens dato:
  // ellers er 1. januar en dag der kilden og appen er uenige om hva «i fjor» betyr.
  const snapshotAar = Number(o.snapshot_dato.slice(0, 4))

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

    validerDetaljer(andel, trimmet, snapshotAar)
  }

  return o as unknown as Oppgjor
}

/**
 * Validerer detaljpakken (oppspart_akkumulert + renteandel_i_fjor + bevegelser)
 * på én andel. Muterer ikke.
 *
 * Pakke-regelen: enten alle tre feltene eller ingen. Et eldre API-svar mangler
 * alle tre og er fullt gyldig — appen skal fortsatt virke mot det. Men ett eller
 * to av dem er ugyldig, for da kan ikke oppdelingen summere seg til totalen, og
 * en oppdeling som ikke stemmer med tallet over seg leser som en bug uansett hvor
 * riktig koden er.
 */
function validerDetaljer(
  andel: Record<string, unknown>,
  navn: string,
  snapshotAar: number,
): void {
  const tilstede = [
    andel.oppspart_akkumulert !== undefined,
    andel.renteandel_i_fjor !== undefined,
    andel.bevegelser !== undefined,
  ]
  const antall = tilstede.filter(Boolean).length

  if (antall === 0) return // eldre API-svar — helt lovlig
  if (antall < 3)
    throw new Error(
      `Andelen til ${navn} har en delvis detaljpakke — «oppspart_akkumulert», ` +
        `«renteandel_i_fjor» og «bevegelser» må komme sammen eller ikke i det hele tatt`,
    )

  const oppspart = validerTall(andel.oppspart_akkumulert, `Oppspart beløp for ${navn}`)
  const renteandel = validerTall(andel.renteandel_i_fjor, `Renteandel for ${navn}`)

  if (!Array.isArray(andel.bevegelser))
    throw new Error(`«bevegelser» for ${navn} må være en liste`)

  let bevegelseSum = 0
  for (let j = 0; j < andel.bevegelser.length; j++) {
    const b = andel.bevegelser[j]
    if (typeof b !== 'object' || b === null)
      throw new Error(`Bevegelse nr. ${j + 1} for ${navn} er ikke et objekt`)
    const bev = b as Record<string, unknown>

    if (typeof bev.dato !== 'string' || !DATO_REGEX.test(bev.dato))
      throw new Error(`Bevegelse nr. ${j + 1} for ${navn} har ugyldig dato`)
    // Samme «folder ugyldige datoer»-problem som snapshot_dato over: 2026-02-30
    // blir 2026-03-02 i stedet for Invalid Date, så vi sammenligner tilbake.
    const d = new Date(bev.dato + 'T00:00:00Z')
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== bev.dato)
      throw new Error(`Bevegelse nr. ${j + 1} for ${navn} har en ugyldig dato: ${bev.dato}`)
    // Bevegelsene er definert som «inneværende år», og året er snapshotets.
    // En dato utenfor det er enten en feil i kilden eller en misforståelse av
    // kontrakten — begge skal stoppe importen, ikke bli filtrert bort stille.
    if (Number(bev.dato.slice(0, 4)) !== snapshotAar)
      throw new Error(
        `Bevegelse ${bev.dato} for ${navn} ligger utenfor snapshot-året ${snapshotAar}`,
      )

    bevegelseSum += iOere(validerFortegnTall(bev.belop, `Bevegelsesbeløp for ${navn}`))
  }

  // Invarianten. Regnet i øre — se iOere.
  const belop = andel.belop as number
  const beregnet = iOere(oppspart) + iOere(renteandel) + bevegelseSum
  if (beregnet !== iOere(belop))
    throw new Error(
      `Andelen til ${navn} summerer seg ikke: oppspart + renteandel + bevegelser = ` +
        `${(beregnet / 100).toFixed(2)}, men «belop» er ${belop.toFixed(2)}`,
    )
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
