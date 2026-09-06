// Ren, IO-fri domenelogikk for bursdagsbilde-generering (#641). Ingen
// fetch, ingen Supabase, ingen R2 — kun regler som kan enhetstestes uten
// mocking. Delt mellom cron-orkestreringen (lib/bursdagsbilde-generering.ts,
// kalt av begge cron-pass i app/api/cron/bursdagsbilde/route.ts) og
// admin-flaten (app/(app)/innstillinger/bursdagsbilde/actions.ts) — samme
// mønster som lib/bursdag.ts for den delte skuddårsregelen.
//
// MÅ-MATCHE mot klubb-app: ren, klubb-nøytral logikk.

import type { VertexFeilKlasse } from '@/lib/vertex'
import { erSkuddaar } from '@/lib/bursdag'
import { STIKKORD_MAKS_ANTALL, STIKKORD_MAKS_LENGDE } from '@/lib/konstanter'

// Feiringsdatoen i ETT bestemt år, med samme skuddårsregel som
// finnBursdagsbarn() i lib/bursdag.ts: en 29. februar-mann feires 1. mars i
// et ikke-skuddår. Uten den ville vi bygd strengen «YYYY-02-29» for et år
// som ikke har den datoen — en ugyldig `date` som Postgres avviser, og en
// nøkkel som uansett aldri ville truffet raden cron skrev på 1. mars.
function feiringsdatoIAar(mm: string, dd: string, aar: number): string {
  if (mm === '02' && dd === '29' && !erSkuddaar(aar)) return `${aar}-03-01`
  return `${aar}-${mm}-${dd}`
}

/**
 * Mannens neste feiringsdato ("YYYY-MM-DD") fra og med `referansedato`.
 * «I dag» teller som «neste», slik at en generering på selve bursdagsdagen
 * treffer nøyaktig den raden agendakortet leser.
 *
 * ENESTE stedet (profil_id, feiringsdato)-nøkkelens datodel utledes — brukt
 * av begge cron-pass (app/api/cron/bursdagsbilde/route.ts) og av admin-
 * flaten (app/(app)/innstillinger/bursdagsbilde/page.tsx). To utledninger
 * med hver sin skuddårsregel var nøyaktig bugen review-en fant: admin så
 * aldri raden cron hadde skrevet for 29. februar-mannen, og admin-sletting
 * — den eneste menneskelige kontrollen mot et dårlig bilde — var dermed
 * brutt for ham.
 *
 * Merk at et cron-pass alltid får sin egen passdato tilbake: for en mann
 * finnBursdagsbarn() returnerer på dato D, er neste feiring per definisjon D.
 */
export function nesteFeiringsdato(fodselsdato: string, referansedato: string): string {
  const [, mm, dd] = fodselsdato.split('-')
  const aar = Number(referansedato.split('-')[0])
  const iAar = feiringsdatoIAar(mm, dd, aar)
  return iAar >= referansedato ? iAar : feiringsdatoIAar(mm, dd, aar + 1)
}

// Fjerner linjeskift (en prompt er ett sammenhengende avsnitt, ikke flere
// linjer JSON-payloaden kunne tolket rart) og kapper defensivt — navn og
// stikkord kommer fra en profil-rad andre steder i appen allerede har
// validert (stikkord er begrenset av STIKKORD_MAKS_LENGDE/-ANTALL i mig.
// 138/139), men denne modulen skal ikke stole blindt på at den validering
// alltid har kjørt før den når hit.
function saniter(s: string, maksLengde: number): string {
  return s.replace(/[\r\n]+/g, ' ').trim().slice(0, maksLengde)
}

// Bygg prompten sendt til Vertex AI. Engelsk tekst — ikke fordi appens
// tone er engelsk (den er oslo-losen, se CLAUDE.md), men fordi prompten
// aldri vises til noe medlem og bildemodeller er best dokumentert og testet
// på engelske prompts.
//
// Tom stikkordliste ⇒ prompten bygges UTEN stikkord-setningen — ingen
// fallback-tekst, ingen oppdiktede stikkord, ingen egen kodesti for «mann
// uten stikkord». Se #641-planen: dette er bevisst den enkleste formen som
// dekker begge tilfeller.
export function byggBursdagsprompt({
  navn,
  alder,
  stikkord,
}: {
  navn: string
  alder: number
  stikkord: string[]
}): string {
  const navnSanitert = saniter(navn, 100)
  const stikkordSanitert = stikkord
    .map(s => saniter(s, STIKKORD_MAKS_LENGDE))
    .filter(s => s.length > 0)
    .slice(0, STIKKORD_MAKS_ANTALL)

  // Basis-scenen er FELLES for alle og bevisst smigrende — dette er et
  // bursdagskort til gutta, ikke et portrett. Stikkordene (under) gjør det
  // personlig; denne delen gjør det til en spøk alle er med på.
  //
  // «celebratory rather than risqué» står der av praktiske grunner, ikke
  // moralske: modellens person-policy avviser lettere en scene med flere
  // gjenkjennelige mennesker hvis tonen kan leses som seksualisert, og en
  // avvisning er terminal (status 'avvist', se statusForFeilklasse) — da får
  // mannen ingenting på bursdagen sin. Linja koster oss ingen stemning og
  // fjerner den vanligste grunnen til at en slik scene blir nektet.
  let prompt =
    `A warm, photorealistic birthday scene celebrating ${navnSanitert}, the person ` +
    `shown in the reference photo, turning ${alder} years old today. Preserve the ` +
    `same face and likeness as the reference photo — he is the unmistakable focal ` +
    `point of the image. Portray him as the hero of the evening, an Achilles of his ` +
    `time: confident, admired, effortlessly charismatic, adored by everyone around ` +
    `him. A lively party surrounds him — a crowd of guests raising their glasses to ` +
    `him, several beautiful women smiling at him and drawn into his orbit, warm ` +
    `golden light, confetti in the air. Cinematic, flattering and good-humoured; ` +
    `celebratory rather than risqué.`

  if (stikkordSanitert.length > 0) {
    prompt += ` Subtly weave in these personal traits or interests, only if they fit ` +
      `naturally into the scene: ${stikkordSanitert.join(', ')}.`
  }

  return prompt
}

// Terminal (ikke reclaimable av cron) er inntil videre KUN 'blokkert' —
// leverandørens person-/sikkerhetspolicy avviste bildet, og et nytt forsøk
// med samme input og prompt gir samme avvisning.
//
// 'ugyldig' (400/INVALID_ARGUMENT) hører logisk hjemme her også, men er
// bevisst reclaimable INNTIL integrasjonen er verifisert mot ekte API én
// gang («first light», se docs/oppsett.md). Grunnen: er request-formen vår
// feil, svarer Vertex 400 på hvert eneste kall — og med 'ugyldig' som
// terminal ville hver mann funksjonen traff fått en permanent 'avvist'-rad
// som bare admins tving-knapp kunne reparere. Etter first light kan denne
// strammes tilbake til `klasse === 'ugyldig' || klasse === 'blokkert'`.
//
// 'auth', 'kvote' og 'transient' er forhold som kan endre seg til neste
// cron-slot uten at vi gjør noe, og skal alltid kunne forsøkes på nytt.
export function statusForFeilklasse(klasse: VertexFeilKlasse): 'feilet' | 'avvist' {
  return klasse === 'blokkert' ? 'avvist' : 'feilet'
}

// 'blokkert' (leverandørens egen avvisning av personbildet) telles bevisst
// IKKE som en feil i cron-statuskoden — det er en produktbeslutning fra
// Vertex, ikke noe galt i vår app, og skal ikke gi rødt i CI/cron-alarmen.
// Alle andre klasser teller, også 'ugyldig' — en feil request-form er vår
// feil og skal være synlig, selv om den er reclaimable inntil first light.
export function tellerSomFeil(klasse: VertexFeilKlasse): boolean {
  return klasse !== 'blokkert'
}
