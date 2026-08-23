// Ren beslutningslogikk for fane-sveip. Ingen DOM, ingen React — slik at
// regelen kan pinnes i test. Selve gesten kan ikke testes automatisk:
// Playwright reproduserer ikke iOS' egne kantgester (CLAUDE.md § Policy:
// Visuell verifikasjon), så alt vi kan gjøre er å holde regnestykket ærlig.

/**
 * Gester som starter nærmere skjermkanten enn dette overlates til iOS.
 *
 * Vi kan ikke skru av systemgesten for tilbake/fremover — den kjører før JS
 * ser noe som helst. Reagerte vi på den i tillegg, ville én sveip både gått
 * tilbake OG byttet fane. Sonen er derfor et fredet område, ikke en
 * begrensning vi ønsker oss bort fra: den er også hvordan iOS-apper flest
 * oppfører seg (edge = tilbake, midt på = fane).
 */
export const KANT_SONE_PX = 30

/** Hvor langt fingeren må dra vannrett før det teller som et faneskifte. */
export const SVEIP_TERSKEL_PX = 60

/**
 * Sveipen må være tydelig vannrett. Uten dette kravet ville en skrå
 * scrollebevegelse nedover lista bytte fane under fingeren på brukeren.
 */
export const SVEIP_RETNING_FAKTOR = 1.5

export type SveipRetning = 'forrige' | 'neste' | null

export type SveipInput = {
  /** Vannrett forflytning, positiv mot høyre. */
  dx: number
  /** Loddrett forflytning, positiv nedover. */
  dy: number
  /** Der fingeren traff skjermen. */
  startX: number
  vindusbredde: number
}

/**
 * Hva en fullført gest skal bety.
 *
 * `neste` = fanen til høyre. Fingeren drar da mot venstre (negativ dx), på
 * samme måte som man drar en side til side for å få fram den neste — samme
 * retning som en bildekarusell.
 */
export function sveipRetning({ dx, dy, startX, vindusbredde }: SveipInput): SveipRetning {
  // Kantsonen er fredet i begge ender: venstre kant er tilbake, høyre kant er
  // fremover. Sistnevnte er sjeldnere brukt, men å frede kun venstre side ville
  // gitt en asymmetri ingen bruker klarer å forutse.
  if (startX < KANT_SONE_PX) return null
  if (startX > vindusbredde - KANT_SONE_PX) return null

  if (Math.abs(dx) < SVEIP_TERSKEL_PX) return null
  if (Math.abs(dx) < Math.abs(dy) * SVEIP_RETNING_FAKTOR) return null

  return dx < 0 ? 'neste' : 'forrige'
}

/**
 * Fanen sveipen lander på, eller null når det ikke finnes en nabo den veien.
 *
 * Listene wrapper bevisst IKKE rundt: står du på Agenda og sveiper mot høyre,
 * skal det skje ingenting. Å hoppe til Fond ytterst til høyre ville føltes som
 * en feil, og enden av rekka er den eneste tilbakemeldingen brukeren har på at
 * han faktisk er i enden.
 */
export function nabofaneIndeks(
  indeks: number,
  antall: number,
  retning: Exclude<SveipRetning, null>,
): number | null {
  const maal = retning === 'neste' ? indeks + 1 : indeks - 1
  if (maal < 0 || maal >= antall) return null
  return maal
}
