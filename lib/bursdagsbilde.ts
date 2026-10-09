// Ren, IO-fri domenelogikk for bursdagsbilde (#641), testbar uten mocking.
// Delt mellom cron (lib/bursdagsbilde-generering.ts) og admin-flaten.
//
// MÅ-MATCHE mot klubb-app: ren, klubb-nøytral logikk.

import type { VertexFeilKlasse } from '@/lib/vertex'
import { erSkuddaar } from '@/lib/bursdag'
import { MEDGJESTER_MAKS_ANTALL, STIKKORD_MAKS_LENGDE } from '@/lib/konstanter'
import { BURSDAGSBILDE_PROMPT_BASIS } from '@/lib/klubb-prompt'

// Samme skuddårsregel som finnBursdagsbarn(): 29.02 feires 01.03 i
// ikke-skuddår. Ellers en ugyldig date, og en nøkkel som aldri treffer
// raden cron skrev.
function feiringsdatoIAar(mm: string, dd: string, aar: number): string {
  if (mm === '02' && dd === '29' && !erSkuddaar(aar)) return `${aar}-03-01`
  return `${aar}-${mm}-${dd}`
}

/**
 * Neste feiringsdato ("YYYY-MM-DD") fra og med `referansedato` — «i dag»
 * teller, så generering på selve dagen treffer raden agendakortet leser.
 *
 * ENESTE sted datodelen av (profil_id, feiringsdato)-nøkkelen utledes, for
 * både cron og admin-flaten. To utledninger ville gjort at admin ikke fant
 * cron-raden for en 29.02-mann, og dermed ikke kunne slette bildet.
 */
export function nesteFeiringsdato(fodselsdato: string, referansedato: string): string {
  const [, mm, dd] = fodselsdato.split('-')
  const aar = Number(referansedato.split('-')[0])
  const iAar = feiringsdatoIAar(mm, dd, aar)
  return iAar >= referansedato ? iAar : feiringsdatoIAar(mm, dd, aar + 1)
}

// Én linje og defensiv kapping — stoler ikke blindt på validering lenger opp.
// [...streng] teller kodepunkter, ikke UTF-16-enheter, så en emoji ikke
// kappes midt i et surrogatpar — og likt med Postgres' char_length, som
// normaliserFritekst() i lib/fritekst.ts (#685).
function saniter(s: string, maksLengde: number): string {
  const enLinje = s.replace(/[\r\n]+/g, ' ').trim()
  return [...enLinje].slice(0, maksLengde).join('')
}

// Prompten til Vertex AI. Engelsk fordi den aldri vises til medlemmer og
// bildemodeller er best testet på engelsk. Tomme stikkord ⇒ setningen
// utelates, ingen fallback-tekst (#641).
export function byggBursdagsprompt({
  navn,
  alder,
  stikkord,
  medgjester = [],
}: {
  navn: string
  alder: number
  // Fritekst, sanitert som én streng (#685).
  stikkord: string
  /**
   * Navnene til referansebilde 2 og 3. Rekkefølgen MÅ matche `bilder`-lista
   * til genererBildeVertex(), ellers byttes ansiktene. Tom liste er normalt
   * (for få profilbilder, eller feilet oppslag).
   */
  medgjester?: string[]
}): string {
  const navnSanitert = saniter(navn, 100)
  const stikkordSanitert = saniter(stikkord, STIKKORD_MAKS_LENGDE)
  const medgjesterSanitert = medgjester
    .map(m => saniter(m, 100))
    .filter(m => m.length > 0)
    .slice(0, MEDGJESTER_MAKS_ANTALL)

  // Basis-scenen er klubbconfig (lib/klubb-prompt.ts), endrbar via env uten
  // deploy. Flere gjenkjennelige personer avvises lettest av modellens
  // person-policy, og avvisning er terminal; blir det et mønster, er en
  // tone-linje («celebratory rather than risqué») billigste mottrekk.
  //
  // Faste plassholdere med split/join, ikke regex over {…}: teksten er
  // skrevet av en klubbeier og kan ha krøllparenteser som ikke betyr noe.
  let prompt = BURSDAGSBILDE_PROMPT_BASIS.split('{navn}')
    .join(navnSanitert)
    .split('{alder}')
    .join(String(alder))

  // Ulik avstand med vilje: to ansikter like nær ville konkurrert med
  // bursdagsbarnet om å være midtpunktet.
  if (medgjesterSanitert.length > 0) {
    const navnListe =
      medgjesterSanitert.length === 1
        ? medgjesterSanitert[0]
        : `${medgjesterSanitert.slice(0, -1).join(', ')} and ${medgjesterSanitert.at(-1)}`
    prompt +=
      ` His friends from the club are there too: ${navnListe}. The reference photos ` +
      `after the first one show their faces, in that order — place them among the ` +
      `guests, one close to him and the other further back in the crowd, keeping ` +
      `each face recognisable. ${navnSanitert} remains the focal point.`
  }

  if (stikkordSanitert.length > 0) {
    prompt +=
      ` In this setting, make sure ${navnSanitert} is properly depicted with his ` +
      `face and these personal traits or interests: ${stikkordSanitert}.`
  }

  return prompt
}

// Kun 'blokkert' er terminal: samme input gir samme policy-avvisning.
// 'ugyldig' (400) er bevisst reclaimable til integrasjonen er verifisert mot
// ekte API («first light», docs/oppsett.md) — en feil request-form ville
// ellers gitt alle en permanent 'avvist'-rad. Strammes deretter til
// `klasse === 'ugyldig' || klasse === 'blokkert'`.
export function statusForFeilklasse(klasse: VertexFeilKlasse): 'feilet' | 'avvist' {
  return klasse === 'blokkert' ? 'avvist' : 'feilet'
}

// 'blokkert' er Vertex' avgjørelse, ikke vår feil, og skal ikke gi rød cron.
// 'ugyldig' teller — feil request-form er vår feil.
export function tellerSomFeil(klasse: VertexFeilKlasse): boolean {
  return klasse !== 'blokkert'
}
