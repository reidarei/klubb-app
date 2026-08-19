import { createServerClient } from '@/lib/supabase/server'
import { kanAdministrere, loeserTiebreak, godkjennerPassTilgang } from '@/lib/roller'

/**
 * Kastes når det ikke finnes en gyldig sesjon. Egen klasse med `code` fordi en
 * naken `new Error('Ikke innlogget')` var usynlig for begge sidene av
 * feilhåndteringen: `normaliserFeil()` i lib/logg.ts plukker kun opp `code` og
 * `message`, så `feil_logg`-raden ble skrevet med `kontekst: {}` — umulig å se
 * hva som faktisk feilet — og `klassifiserTilgangsfeil()` hadde ingenting å
 * kjenne den igjen på, så en død sesjon (rutine i en iOS-PWA, jf. #498) havnet
 * som `error` med Sentry-event og en plass i morgenalarmen.
 *
 * Meldingsteksten er UENDRET og fortsatt en kontrakt — route handlers
 * streng-matcher 'Ikke innlogget' for å velge 401 vs 403. Klassen legger kun
 * `code` oppå; `instanceof Error` og `.message` er som før.
 */
export class IkkeInnloggetFeil extends Error {
  readonly code = 'AUTH_INGEN_SESJON'
  constructor() {
    super('Ikke innlogget')
    this.name = 'IkkeInnloggetFeil'
  }
}

// Sentral autorisasjons-helper for server actions og route handlers.
// Bruk denne i stedet for å duplisere "hent user → hent profil → sjekk
// rolle"-flyten i hver action. Kaster ved manglende auth eller rolle.
//
// Returnerer den samme supabase-klienten som ble brukt til auth-sjekken,
// slik at videre spørringer går mot brukerens RLS-kontekst og ikke krever
// en ny createServerClient()-runde.
//
// NB: Feilmeldingen 'Ikke innlogget' er en kontrakt — route handlers
// (f.eks. /api/admin/opprett-medlem) streng-matcher den for å velge
// 401 vs 403. Endres teksten, må de oppdateres samtidig.
export async function ensureAdmin() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new IkkeInnloggetFeil()

  const { data: profil, error: profilFeil } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()

  // Fail closed: er vi i tvil om hvem brukeren er eller hva han har lov
  // til, slipper vi ham ikke inn. En feilet spørring skal ALDRI tolkes
  // som «ingen rolle» og falle gjennom til kanAdministrere(undefined).
  if (profilFeil) throw new Error(`Kunne ikke hente profil: ${profilFeil.message}`)
  if (!kanAdministrere(profil?.rolle)) throw new Error('Ikke admin')

  return { supabase, user, profil }
}

// Variant for handlinger som kun generalsekretær (eller andre roller med
// `loeserTiebreak`-rettighet) skal kunne gjøre — i praksis: avgjøre
// kåringspoller som endte uavgjort. Admin har ikke denne tilgangen,
// selv om de ellers har full CRUD i appen.
export async function ensureLoeserTiebreak() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new IkkeInnloggetFeil()

  const { data: profil, error: profilFeil } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()

  // Fail closed — se begrunnelse i ensureAdmin() over.
  if (profilFeil) throw new Error(`Kunne ikke hente profil: ${profilFeil.message}`)
  if (!loeserTiebreak(profil?.rolle)) throw new Error('Kun generalsekretær kan løse tiebreak')

  return { supabase, user, profil }
}

// Variant for pass-tilgang: kun generalsekretær kan godkjenne eller avslå
// forespørsler om dagstilgang til et medlems passinformasjon. Bevisst
// smalere enn ensureAdmin(): /om-appen lover medlemmene at det er
// generalsekretæren som avgjør, og passnummer er det mest sensitive vi
// lagrer. Frem til #582 lå autorisasjonen kun i RLS med er_admin(), slik at
// enhver admin kunne godkjenne stikk i strid med løftet i appen.
export async function ensureGodkjennerPassTilgang() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new IkkeInnloggetFeil()

  const { data: profil, error: profilFeil } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()

  // Fail closed — se begrunnelse i ensureAdmin() over.
  if (profilFeil) throw new Error(`Kunne ikke hente profil: ${profilFeil.message}`)
  if (!godkjennerPassTilgang(profil?.rolle))
    throw new Error('Kun generalsekretær kan avgjøre pass-tilgang')

  return { supabase, user, profil }
}

// Variant som kun krever innlogging — brukes der enhver bruker er OK,
// men handlingen krever at vi vet hvem brukeren er.
export async function ensureInnlogget() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new IkkeInnloggetFeil()
  return { supabase, user }
}
