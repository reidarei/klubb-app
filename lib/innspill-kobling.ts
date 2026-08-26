// Koblingen mellom et ønske-issue på GitHub og medlemmet som sendte det inn (#632).
//
// Primærkilden er tabellen `innspill_kobling` — den overlever at issue-teksten
// redigeres. HTML-markøren `<!-- profil_id:... -->` i body er FALLBACK for
// issues opprettet før koblingstabellen, ikke sannhet.
//
// Samlepunkt med vilje (samme tanke som `bildeSrc()` og `sendVarsel()`):
// markør-regexen lå i tre kopier i to varianter, og den strengeste av dem
// avgjorde om feilalarmen fyrte — et issue med reformatert markør traff på
// /innspill, men så «tapt» ut i webhooken.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { logg } from '@/lib/logg'
import { INNSPILL_KOBLING_INNFOERT } from '@/lib/konstanter'

// `\s*` rundt innholdet er med vilje: markøren kan ha blitt reformatert
// (`<!--profil_id:…-->`) av en redigering eller et verktøy, og en strengere
// variant ville tolket det som «koblingen er borte».
const MARKOER_RE = /<!--\s*profil_id:([a-f0-9-]+)\s*-->/

// Overskriften innsendings-ruten legger øverst i issue-body. Brukes KUN som
// nødsignal for issues eldre enn koblingstabellen — se `erTaptAppInnspill()`.
const APP_HEADER_RE = /^##\s*Ønske fra /m

export type IssueLite = {
  number: number
  body: string | null
  /** ISO-tid fra GitHub. Mangler den, behandles issuet som gammelt (se under). */
  created_at?: string | null
}

export type Innsender = {
  profilId: string | null
  /** DB-oppslaget svarte «ingen rad», men body-markøren reddet koblingen. */
  kunFraBody: boolean
  /** Spørringen feilet: «vi vet ikke», ikke «det finnes ingen kobling». */
  oppslagFeilet: boolean
}

export function parseProfilIdFraBody(body: string | null | undefined): string | null {
  if (!body) return null
  return body.match(MARKOER_RE)?.[1] ?? null
}

// Slår opp innsenderen for ett issue: durabel rad først, body-markør som
// fallback. Kallstedet MÅ skille `oppslagFeilet` fra «fant ingenting» — det er
// forskjellen på «prøv igjen» og «koblingen er borte».
export async function finnInnsender(
  admin: SupabaseClient<Database>,
  issue: IssueLite,
): Promise<Innsender> {
  const fraBody = parseProfilIdFraBody(issue.body)

  const { data, error } = await admin
    .from('innspill_kobling')
    .select('profil_id')
    .eq('issue_nummer', issue.number)
    .maybeSingle()

  if (error) {
    await logg.feil('github.webhook.kobling.oppslag.feilet', error, { ctx: { issue_nummer: issue.number } })
    // kunFraBody settes bevisst false: markøren ble brukt, men grunnen er en
    // feilet spørring — ikke en manglende rad. `oppslagFeilet` bærer det.
    return { profilId: fraBody, kunFraBody: false, oppslagFeilet: true }
  }

  if (data) return { profilId: data.profil_id, kunFraBody: false, oppslagFeilet: false }
  return { profilId: fraBody, kunFraBody: fraBody !== null, oppslagFeilet: false }
}

// Er et issue UTEN kobling (verken rad eller markør) et tapt app-innspill som
// fortjener alarm — eller bare et issue noen skrev direkte i GitHub?
//
// Diskriminatoren er issuets alder, ikke teksten: etter at koblingstabellen ble
// tatt i bruk skriver innsendings-ruten alltid en rad, så «ingen rad» på et
// nyere issue kan ikke være et app-innspill (og feiler inserten, er det
// allerede logget som `bli-utvikler.kobling.feilet`).
//
// Overskriften «## Ønske fra …» er en tekstkonvensjon, ikke et maskinelt
// signal — den skrives også for hånd fra CLI-en (#595, #447). Derfor gjelder
// den kun for issues eldre enn tabellen; det er der #625-klassen bor.
export function erTaptAppInnspill(issue: IssueLite): boolean {
  const opprettet = issue.created_at ? Date.parse(issue.created_at) : NaN
  // Ukjent/ugyldig created_at → behandle som gammelt issue. Varsomste retning:
  // heller en alarm for mye enn et medlem som aldri får svar.
  if (!Number.isNaN(opprettet) && opprettet >= INNSPILL_KOBLING_INNFOERT.getTime()) return false
  return APP_HEADER_RE.test(issue.body ?? '')
}
