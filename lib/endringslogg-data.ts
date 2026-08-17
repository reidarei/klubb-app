import type { Endring } from '@/lib/endringslogg'

/**
 * Endringslogg som vises på «Om appen»-siden.
 *
 * Legg til nye oppføringer med nyeste først. Terskelen er: «Merker et medlem dette?»
 * Rene refaktorer, test-dekning og sikkerhetstiltak hører ikke hjemme her
 * (de dekkes av de utledede «mindre»-radene).
 *
 * Fylles inn av klubben som eier denne instansen.
 */
export const ENDRINGER: Endring[] = []
