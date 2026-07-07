'use server'

import { ensureInnlogget } from '@/lib/auth'
import { kallClaude } from '@/lib/anthropic'
import { iDagOslo, erGyldigKalenderdato } from '@/lib/dato'
import { logg } from '@/lib/logg'
import { DATO_FORSLAG_MIN_TEGN, INNLEGG_MAKS_LENGDE } from '@/lib/konstanter'

/**
 * Trekk ut én relevant fremtidig dato fra et innlegg-utkast.
 * Kaller Anthropic med prefill-teknikk (assistant-rollen starter med '{')
 * for å tvinge JSON-output uten markdown-wrapping.
 * Returnerer null ved alle feil, manglende konfig, for kort tekst og
 * ugyldig / fortidsdato i LLM-svaret.
 */
export async function foreslaaAktuellDato(
  tekst: string,
): Promise<{ dato: string } | null> {
  await ensureInnlogget()

  const t = tekst.trim()
  // Korte tekster har ikke nok kontekst til meningsfull dato-tolkning.
  if (t.length < DATO_FORSLAG_MIN_TEGN) return null

  // Kapp til INNLEGG_MAKS_LENGDE slik at vi ikke sender mer enn det som
  // uansett er gyldig innlegg-innhold til Anthropic.
  const kappet = t.slice(0, INNLEGG_MAKS_LENGDE)

  const iDag = iDagOslo()

  // Klubb-nøytral system-prompt — ingen klubbnavn, ingen identitet.
  const system = `Du er en assistent som trekker ut én relevant fremtidig dato fra et innlegg skrevet i en vennegjeng-app. Dagens dato i Norge er ${iDag}. Svar KUN med JSON på formen {"dato":"YYYY-MM-DD"} eller {"dato":null}. Regler: (1) Returner kun en dato som er på eller etter dagens dato — ignorer datoer i fortiden. (2) Returner en dato KUN når innlegget faktisk kunngjør eller handler om noe som skjer på den datoen, ikke når en dato bare er nevnt i forbifarten. (3) Løs relative uttrykk («på fredag», «6. juli», «neste uke») mot dagens dato over. (4) Ved tvetydig årstall, velg den neste fremtidige forekomsten. (5) Finner du ingen slik dato, svar {"dato":null}.`

  // Prefill-teknikk: assistant-rollen starter med '{' for å tvinge modellen
  // til å returnere ren JSON uten markdown-wrapper (```json ... ```).
  // Vi rekonstruerer den komplette JSON-en ved å sette '{' foran responsen.
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: kappet },
    { role: 'assistant', content: '{' },
  ]

  try {
    const text = await kallClaude({ system, messages, maxTokens: 24 })
    if (!text) return null

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
      return null
    }

    // Forvent { dato: string | null } — alt annet er uventet og forkastes.
    // typeof-sjekken under dekker manglende `dato` (undefined → forkastet), så
    // vi trenger ingen egen `in`-sjekk (som dessuten treffer prototype-kjeden).
    if (!parsed || typeof parsed !== 'object') return null

    const { dato } = parsed as { dato: unknown }
    if (!dato || typeof dato !== 'string') return null

    // Valideringskjede — alle tre må passere:
    // 1. Gyldig YYYY-MM-DD kalender-dato (fanger format-feil og roll-over).
    if (!erGyldigKalenderdato(dato)) return null
    // 2. Fremtidsfilter — modellen kan ikke returnere fortids-dato.
    if (dato < iDag) return null
    // 3. ~2-års sanity-cap — hindrer at modellen fester noe 40 år frem i tid.
    const [aarStr, ...rest] = iDag.split('-')
    const cap = [String(Number(aarStr) + 2), ...rest].join('-')
    if (dato > cap) return null

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
    return null
  }
}
