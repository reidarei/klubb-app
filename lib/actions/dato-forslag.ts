'use server'

import { ensureInnlogget } from '@/lib/auth'
import { kallClaude } from '@/lib/anthropic'
import { iDagOslo, erGyldigKalenderdato } from '@/lib/dato'
import { logg } from '@/lib/logg'
import { DATO_FORSLAG_MIN_TEGN, INNLEGG_MAKS_LENGDE } from '@/lib/konstanter'

// Diskriminert resultat (#462): klienten må kunne skille «modellen fant ingen
// dato» (vis «Fant ingen dato i teksten») fra tekniske feil (vis «Prøv igjen»).
// Før kollapset alt til null og brukeren så bare at ingenting skjedde.
export type DatoForslagResultat =
  | { dato: string }
  | { dato: null; grunn: 'ingen_dato' | 'feil' }

const INGEN_DATO: DatoForslagResultat = { dato: null, grunn: 'ingen_dato' }
const FEIL: DatoForslagResultat = { dato: null, grunn: 'feil' }

/**
 * Trekk ut én relevant fremtidig dato fra et innlegg-utkast.
 * Kaller Anthropic med prefill-teknikk (assistant-rollen starter med '{')
 * for å tvinge JSON-output uten markdown-wrapping.
 * Returnerer grunn 'ingen_dato' når teksten ikke gir noen brukbar fremtidig
 * dato, og 'feil' ved manglende konfig, API-feil, timeout og parse-feil.
 */
export async function foreslaaAktuellDato(
  tekst: string,
): Promise<DatoForslagResultat> {
  await ensureInnlogget()

  const t = tekst.trim()
  // Korte tekster har ikke nok kontekst til meningsfull dato-tolkning.
  if (t.length < DATO_FORSLAG_MIN_TEGN) return INGEN_DATO

  // Kapp til INNLEGG_MAKS_LENGDE slik at vi ikke sender mer enn det som
  // uansett er gyldig innlegg-innhold til Anthropic.
  const kappet = t.slice(0, INNLEGG_MAKS_LENGDE)

  const iDag = iDagOslo()

  // Klubb-nøytral system-prompt — ingen klubbnavn, ingen identitet.
  const system = `Du er en assistent som trekker ut én relevant fremtidig dato fra et innlegg skrevet i en vennegjeng-app. Dagens dato i Norge er ${iDag}. Svar KUN med JSON på formen {"dato":"YYYY-MM-DD"} eller {"dato":null}. Regler: (1) Returner kun en dato som er på eller etter dagens dato — ignorer datoer i fortiden. (2) Returner en dato KUN når innlegget faktisk kunngjør eller handler om noe som skjer på den datoen, ikke når en dato bare er nevnt i forbifarten. (3) Løs relative uttrykk mot dagens dato over: «i dag» = dagens dato, «i morgen» = dagen etter dagens dato, og tilsvarende for «på fredag», «6. juli», «neste uke». Et innlegg som «bli med å spise middag i dag» skal gi dagens dato. (4) Ved tvetydig årstall, velg den neste fremtidige forekomsten. (5) Finner du ingen slik dato, svar {"dato":null}.`

  // Prefill-teknikk: assistant-rollen starter med '{' for å tvinge modellen
  // til å returnere ren JSON uten markdown-wrapper (```json ... ```).
  // Vi rekonstruerer den komplette JSON-en ved å sette '{' foran responsen.
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: kappet },
    { role: 'assistant', content: '{' },
  ]

  try {
    const text = await kallClaude({ system, messages, maxTokens: 24 })
    // null = tom API-nøkkel (feature av) eller tom respons — teknisk utfall,
    // ikke «ingen dato i teksten».
    if (!text) return FEIL

    // Rekonstruer komplett JSON med det ledende '{' vi satte i prefill.
    // Prefill echoes normalt ikke tilbake, men enkelte modeller/gjennomkjøringer
    // kan likevel inkludere det ledende '{' i svaret. Da ville '{' + text gitt
    // '{{...}}' som feiler parsing og forkaster et ellers gyldig svar — så vi
    // prepender kun '{' når teksten ikke allerede starter med den.
    const trimmet = text.trimStart()
    const json = trimmet.startsWith('{') ? trimmet : '{' + trimmet
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      // Modellen leverte ikke gyldig JSON — teknisk utfall, retry kan hjelpe.
      return FEIL
    }

    // Forvent { dato: string | null } — alt annet er uventet og forkastes.
    // typeof-sjekken under dekker manglende `dato` (undefined → forkastet), så
    // vi trenger ingen egen `in`-sjekk (som dessuten treffer prototype-kjeden).
    if (!parsed || typeof parsed !== 'object') return FEIL

    const { dato } = parsed as { dato: unknown }
    // Modellen svarte eksplisitt {"dato":null} — teksten har ingen dato.
    if (!dato || typeof dato !== 'string') return INGEN_DATO

    // Valideringskjede — alle tre må passere. Avvisning her betyr at modellen
    // fant en dato vi ikke kan bruke (fortid, ugyldig, for langt frem) — fra
    // brukerens ståsted er det «ingen brukbar dato», ikke en teknisk feil.
    // 1. Gyldig YYYY-MM-DD kalender-dato (fanger format-feil og roll-over).
    if (!erGyldigKalenderdato(dato)) return INGEN_DATO
    // 2. Fremtidsfilter — modellen kan ikke returnere fortids-dato.
    if (dato < iDag) return INGEN_DATO
    // 3. ~2-års sanity-cap — hindrer at modellen fester noe 40 år frem i tid.
    const [aarStr, ...rest] = iDag.split('-')
    const cap = [String(Number(aarStr) + 2), ...rest].join('-')
    if (dato > cap) return INGEN_DATO

    return { dato }
  } catch (err) {
    // Fingerprint-logg uten å inkludere tekst-innhold (PII-free).
    const status = (err as { status?: number })?.status
    if (status === 401) {
      await logg.feil('ai.datoforslag.feilet', err, {
        fingerprint: 'ai.datoforslag.auth',
        ctx: { status },
      })
    } else {
      // 429 rate-limit, AbortError (timeout), nettverksfeil og annet
      // behandles som transiente feil.
      await logg.feil('ai.datoforslag.feilet', err, {
        fingerprint: 'ai.datoforslag.transient',
        ctx: { status },
      })
    }
    return FEIL
  }
}
