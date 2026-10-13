// Bygger skrive-payloaden for et oppgjør ut fra diff-DTO-en.
//
// Hvorfor dette er en egen, ren funksjon og ikke inline i HentOppgjor.tsx:
// payloaden rekonstrueres fra OppgjorDiff, ikke fra JSON-en som ble hentet fra
// kilden. Alt som ikke ligger i DTO-en forsvinner derfor STILLE her — appen
// henter et felt, viser det i diffen, og skriver det aldri, uten en eneste
// feilmelding. Da #543 la til detaljfeltene var dette hovedfellen.
//
// Som egen funksjon kan gjennomgangen pinnes i test (fond-oppgjor-dto.test.ts).
// Legger du til et felt i oppgjørs-kontrakten, må det inn på TRE steder:
// validerOppgjor, OppgjorDiff, og her. (Siste eksempler: renter_hittil, kontrollert_dato.)
//
// Ren modul uten I/O og uten config-import — trygg å importere fra klient-kode,
// i motsetning til lib/fond-oppgjor.ts som er server-only.

import type { OppgjorDiff } from '@/lib/actions/fond'

export type OppgjorPayload = {
  versjon: 1
  generert: string
  snapshot_dato: string
  kontrollert_dato?: string
  saldo: number
  andeler: {
    visningsnavn: string
    belop: number
    oppspart_akkumulert?: number
    renteandel_i_fjor?: number
    bevegelser?: { dato: string; belop: number }[]
  }[]
  renter_hittil?: {
    brutto: number
    netto_anslag: number
    skattesats: number
    observert_dato: string
  }
}

export function byggOppgjorPayload(diff: OppgjorDiff): OppgjorPayload {
  return {
    versjon: 1,
    generert: diff.generert,
    snapshot_dato: diff.snapshot_dato,
    ...(diff.kontrollert_dato ? { kontrollert_dato: diff.kontrollert_dato } : {}),
    saldo: diff.saldo.hentet,
    andeler: diff.rader.map(r => ({
      visningsnavn: r.visningsnavn,
      belop: r.hentetVerdi,
      // Spres kun når detaljpakken finnes: en delvis pakke avvises av
      // validerOppgjor server-side, og et eldre API-svar uten detaljer skal
      // passere uendret gjennom (pakke-regelen tillater «ingen av tre»).
      ...(r.detaljer ?? {}),
    })),
    // Utelates når feltet manglet — null er ikke en gyldig verdi i kontrakten.
    ...(diff.renter_hittil ? { renter_hittil: diff.renter_hittil } : {}),
  }
}
