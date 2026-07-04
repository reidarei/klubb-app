// Sentral rolle- og rettighetsmatrise. Alle andre steder i koden skal gå
// gjennom hjelperne her — aldri sammenligne `rolle === 'admin'` direkte.

import { ROLLE_TITTEL_GENERALSEKRETAER } from './klubb-config'
//
// Modellen:
//   - Tre roller: medlem, admin, generalsekretaer
//   - Alle har medlem-rettigheter (lese klubben, melde seg på, poste i chat)
//   - Admin og generalsekretær har i tillegg admin-rettigheter (opprette
//     medlem, redigere alle arrangementer, styre kåringer, osv.)
//   - Hver rolle kan ha ekstra særegenskaper (tittel, glød, varsel-policy)
//
// DB speiler dette: `er_admin()`-funksjonen returnerer true for både admin
// og generalsekretær, slik at RLS oppfører seg likt. Se migrasjon 041.

export type Rolle = 'medlem' | 'admin' | 'generalsekretaer'

export type Rettigheter = {
  /** Tittel som vises i UI (bokmål, kan ha æøå) */
  tittel: string
  /** Har admin-rettigheter (CRUD på tvers av brukere + klubbinfo) */
  kanAdministrere: boolean
  /** Spesiell gul glød rundt profilbildet */
  harGulGloed: boolean
  /** Løser tiebreak når en kåringspoll ender uavgjort */
  loeserTiebreak: boolean
}

export const ROLLER: Record<Rolle, Rettigheter> = {
  medlem: {
    tittel: 'Medlem',
    kanAdministrere: false,
    harGulGloed: false,
    loeserTiebreak: false,
  },
  admin: {
    tittel: 'Admin',
    kanAdministrere: true,
    harGulGloed: false,
    loeserTiebreak: false,
  },
  generalsekretaer: {
    // Tittel hentes fra klubb-config slik at den kan overstyres via env-var
    // uten kode-endring. Rolle-koden i DB («generalsekretaer») er uendret.
    tittel: ROLLE_TITTEL_GENERALSEKRETAER,
    kanAdministrere: true,
    harGulGloed: true,
    loeserTiebreak: true,
  },
}

// Normaliserer en rolle-streng (fra DB eller ukjent kilde) til en av de
// gyldige rollene, med fallback til 'medlem'.
function normaliser(rolle: string | null | undefined): Rolle {
  if (rolle === 'admin' || rolle === 'generalsekretaer' || rolle === 'medlem') return rolle
  return 'medlem'
}

export function rettigheterFor(rolle: string | null | undefined): Rettigheter {
  return ROLLER[normaliser(rolle)]
}

// Konvenienshjelpere — bruk disse i koden framfor å inspisere rolle-strengen.
export const kanAdministrere = (rolle: string | null | undefined): boolean =>
  rettigheterFor(rolle).kanAdministrere

export const harGulGloed = (rolle: string | null | undefined): boolean =>
  rettigheterFor(rolle).harGulGloed

// NB: hvem som mottar issue-/systemvarsler er IKKE rollestyrt lenger —
// det bor i profiles.faar_issue_varsler (admin-styrt per medlem, se
// migrasjon 104). Mottaker-spørringer filtrerer på kolonnen direkte.

export const loeserTiebreak = (rolle: string | null | undefined): boolean =>
  rettigheterFor(rolle).loeserTiebreak

export const tittelFor = (rolle: string | null | undefined): string =>
  rettigheterFor(rolle).tittel

// Returnerer alle roller hvor en gitt rettighet er sann. Gjør det mulig for
// kallestedene å spørre matrisen direkte i stedet for å hardkode lister av
// rolle-strenger som må vedlikeholdes manuelt (f.eks. i DB-filtre).
export function rollerMed(rettighet: keyof Rettigheter): Rolle[] {
  return (Object.keys(ROLLER) as Rolle[]).filter(r => Boolean(ROLLER[r][rettighet]))
}

// Roller som kan velges fra to-valgs Segment i RedigerMedlemSkjema.
// Generalsekretær utelates her — den settes via egen ToggleSwitch i
// skjemaet som kaller server action settGeneralsekretaer() (RPC), ikke
// via dette rolle-feltet. Det sikrer at RPC-ens atomisitetskrav alltid
// overholdes og at partial unique index (migrasjon 094) aldri omgås.
export const VALGBARE_ROLLER: Rolle[] = ['medlem', 'admin']
