// Klubbspesifikk prompt-tekst for bursdagsbildet. Egen modul, og bevisst
// SKILT fra lib/klubb-config.ts: den er klient-trygg og tar kun
// NEXT_PUBLIC_-vars, mens denne teksten kun brukes server-side og ikke har
// noe i klientbundelen å gjøre.
//
// Teksten under er en nøytral standard. Den er ment å byttes ut: hver klubb
// har sin egen humor, og en generisk festscene er et utgangspunkt, ikke et
// mål. Sett env-varen BURSDAGSBILDE_PROMPT_BASIS i stedet for å endre koden
// — da slipper du en deploy hver gang tonen skal justeres.

/**
 * Basis-scenen i bursdagsbildet. To plassholdere er tilgjengelige:
 *
 *   {navn}   — bursdagsbarnets navn (allerede sanitert når det settes inn)
 *   {alder}  — alderen han fyller
 *
 * Ukjente plassholdere står urørt igjen i teksten. Setningene om medgjester
 * og stikkord legges på av byggBursdagsprompt() og hører IKKE hjemme her:
 * de er kontrakter mot koden (rekkefølgen på referansebildene, saniterte
 * stikkord), ikke redaksjon.
 *
 * Teksten bør avsluttes med punktum — de påfølgende setningene limes rett på.
 */
export const BURSDAGSBILDE_PROMPT_BASIS =
  process.env.BURSDAGSBILDE_PROMPT_BASIS ??
  'A warm, photorealistic birthday scene celebrating {navn}, the person shown in ' +
    'the first reference photo, turning {alder} years old today. Preserve the same ' +
    'face and likeness as that photo — {navn} is the unmistakable focal point of ' +
    'the image. A friendly celebration surrounds him: guests raising their glasses, ' +
    'warm golden light, confetti in the air. Cinematic, flattering and ' +
    'good-humoured; celebratory rather than risqué.'
