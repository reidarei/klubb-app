// Unntaksliste for forventTreffbar() (#700 PR 2). Et unntak uten en
// ALTERNATIV VEI er ikke et unntak — det er et hull. Se CLAUDE.md §
// Policy: Trykkflater.

export type TreffmaalUnntak = {
  /** Sti (uten søkestreng) unntaket gjelder. */
  rute: string | RegExp
  /** CSS-selektor som matcher det unntatte elementet (el.matches(selektor)). */
  selektor: string
  /** Hvorfor elementet bevisst er under MIN_TREFFMAAL_PX. */
  grunn: string
  /** Issue-nummeret unntaket er diskutert/akseptert i. */
  issue: number
  /** Hvordan en bruker som ikke kan treffe elementet likevel kommer dit. */
  alternativVei: string
}

export const TREFFMAAL_UNNTAK: TreffmaalUnntak[] = [
  {
    rute: '/chat',
    selektor: '[data-testid="chat-reaksjonschip"]',
    grunn:
      'Reaksjons-chippen under en boble (~16 px) er en kompakt oppsummering, ikke ' +
      'hovedinngangen til å reagere — å heve den til 44 px ville latt chips fra flere ' +
      'emoji vokse inn i hverandre og i selve boblen.',
    issue: 700,
    alternativVei:
      'Long-press på selve meldingen åpner reaksjons-pickeren, der hver emoji har et ' +
      '44×44 treffområde (se PICKER_PILLE i ChatMeldingRad.tsx).',
  },
  {
    rute: /^\/kart/,
    selektor: '.kart-markering-etikett',
    grunn:
      'Kartbobla er en snakkeboks med pilspiss forankret til et konkret koordinat — å ' +
      'utvide treffområdet usynlig ville flyttet det bort fra stedet den peker på, eller ' +
      'overlappet naboboblene på et tett kartutsnitt. Bevisst design, ikke en målefeil.',
    issue: 700,
    alternativVei:
      'Markeringer-lista i kartpanelet (panel-handtak) viser samme markeringer som rader ' +
      'med et fullbredde, 44 px høyt treffområde hver.',
  },
  {
    rute: /^\/arrangementer\/[^/]+$/,
    selektor: '[data-testid="paameldt-avatar"]',
    grunn:
      'Påmeldt-avatarene (50 px) ligger bevisst overlappende i en stabel (-12 px) — å spre dem ' +
      'ville gjort raden dobbelt så bred og dyttet «+ N til»/«Vis liste» ned. Hver avatar er ' +
      'altså 50×50, men den overlappende naboen dekker et av målepunktene.',
    issue: 700,
    alternativVei:
      '«Vis liste» ved siden av stabelen åpner en modal med ALLE svar som fullbredde rader, ' +
      'hver lenket til medlemsprofilen med et 44 px høyt treffområde.',
  },
]

// Kjente dekningshull i vakten selv (#700 PR 2) — rapportert, ikke rødt.
// Disse er IKKE unntak (ingen selektor å unnta), men ting en fremtidig
// agent bør vite før hen tolker en «0 brudd»-rapport som fullstendig bevis.
export const KJENTE_MANGLER: string[] = [
  'Rollegap: e2e-brukeren er admin, ikke generalsekretær — /innstillinger/pass-godkjenninger ' +
    'og /kaaringspoll/[id]/tiebreak måles ikke av vakten.',
  'Useedede tilstander måles ikke: melding_bilder (SlettBildeKnapp), chat_reaksjoner, ' +
    'kart_markering/posisjon_* i bredde-sveipen, album_bilde_chat (BildeKommentarSheet).',
  'Ingen spec åpner ReaksjonPicker på agenda eller BildeKommentarSheet — dybde-dekningen ' +
    'der er null til en spec gjør det.',
  'album-chatten-lightbox.spec.ts sin lightbox-test skipper uten minst to bilder i ' +
    'klubb-chatten på test-instansen.',
  '/kaaringspoll/[id]/tiebreak er ikke i RUTER (se begrunnelse i e2e/helpers/ruter.ts).',
]
