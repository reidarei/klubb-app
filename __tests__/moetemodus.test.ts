import { describe, it, expect } from 'vitest'
import { osloKlokkeslettDagenEtter } from '@/lib/dato'
import { MOETEMODUS_SLUTT_KLOKKE } from '@/lib/konstanter'
import { velgMoete } from '@/lib/moetemodus'
import { velgReiseTur } from '@/lib/reisemodus'
import type { NyligStartetArrangementRad } from '@/lib/posisjon'
import { avgjoerKartmodus, KARTMODUS_AV } from '@/lib/kartmodus-beslutning'
import { REISEMODUS, MOETEMODUS } from '@/lib/app-innstillinger'

// Ingen mocking av lib/dato.ts (jf. CLAUDE.md § dato-tidssone-uavhengig) —
// alle disse funksjonene er rene, og literalene under er regnet ut for hånd
// mot Europe/Oslo, ikke generert av samme kode som testes.

describe('osloKlokkeslettDagenEtter (#780)', () => {
  it('møte kl. 19 norsk tid (sommertid) → kl. 06 dagen etter er 04:00 UTC', () => {
    // 2026-09-26T17:00:00Z er 19:00 CEST (Oslo, +2) samme dag.
    expect(osloKlokkeslettDagenEtter('2026-09-26T17:00:00Z', MOETEMODUS_SLUTT_KLOKKE)).toBe(
      '2026-09-27T04:00:00.000Z',
    )
  })

  it('DST-skiftet natt til 25. oktober 2026: kl. 06 dagen etter lander på 05:00 UTC (vintertid)', () => {
    // 2026-10-24T20:00:00Z er 22:00 CEST (Oslo, +2) 24. oktober. Dagen etter
    // (25. oktober) har DST-overgangen alt skjedd før kl. 06 lokal, så
    // 06:00 Oslo = 05:00 UTC (CET, +1) — ikke 04:00 som dagen før.
    expect(osloKlokkeslettDagenEtter('2026-10-24T20:00:00Z', MOETEMODUS_SLUTT_KLOKKE)).toBe(
      '2026-10-25T05:00:00.000Z',
    )
  })

  it('møte som starter 00:30 norsk tid varer til kl. 06 dagen ETTER startdatoen, ikke samme natt', () => {
    // 2026-09-25T22:30:00Z er 00:30 CEST (Oslo, +2) 26. september — møtets
    // norske KALENDERDAG er altså 26., ikke 25. Dagen etter er 27. september,
    // kl. 06 Oslo = 04:00 UTC.
    const start = '2026-09-25T22:30:00Z'
    expect(osloKlokkeslettDagenEtter(start, MOETEMODUS_SLUTT_KLOKKE)).toBe(
      '2026-09-27T04:00:00.000Z',
    )
  })
})

function rad(overrides: Partial<NyligStartetArrangementRad> & { id: string }): NyligStartetArrangementRad {
  return {
    tittel: 'Uten navn',
    type: 'moete',
    start_tidspunkt: '2026-09-26T17:00:00Z',
    slutt_tidspunkt: null,
    ...overrides,
  }
}

describe('velgMoete (#780)', () => {
  it('møtet fanges når «nå» er FØR kl. 06 dagen etter', () => {
    const startet = rad({ id: 'm1', tittel: 'Styremøte', start_tidspunkt: '2026-09-26T17:00:00Z' })
    // Vinduet slutter 2026-09-27T04:00:00.000Z — vi spør 30 min før.
    const naaIso = '2026-09-27T03:30:00Z'
    expect(velgMoete([startet], naaIso)?.id).toBe('m1')
  })

  it('møtet fanges IKKE når «nå» er ETTER kl. 06 dagen etter', () => {
    const startet = rad({ id: 'm1', start_tidspunkt: '2026-09-26T17:00:00Z' })
    const naaIso = '2026-09-27T04:00:01Z'
    expect(velgMoete([startet], naaIso)).toBeNull()
  })

  it('møtets eget slutt_tidspunkt ignoreres — en tidlig sluttid endrer ikke vinduet', () => {
    const startet = rad({
      id: 'm1',
      start_tidspunkt: '2026-09-26T17:00:00Z',
      // Møtet er «offisielt» over kl. 19:30 — møtemodus skal likevel vare
      // til kl. 06 dagen etter, se #780.
      slutt_tidspunkt: '2026-09-26T17:30:00Z',
    })
    const naaIso = '2026-09-26T22:00:00Z' // lenge etter slutt_tidspunkt, men innenfor vinduet
    expect(velgMoete([startet], naaIso)?.id).toBe('m1')
  })

  it('et møte mer enn 12 timer gammelt UTEN sluttid fanges fortsatt, i motsetning til reisemodus sin ARRANGEMENT_ANTATT_TIMER-grense', () => {
    // Møtet starter 00:30 Oslo-tid (norsk kalenderdag 26. september — se
    // dato-testen over) — vinduet varer da til 06:00 27. september, ~29,5 t.
    const start = '2026-09-25T22:30:00Z'
    const startet = rad({ id: 'm1', start_tidspunkt: start })
    // 13 timer etter start: et arrangement UTEN sluttid ville vært forbi
    // reisemodus/posisjon sin ARRANGEMENT_ANTATT_TIMER-grense (12 t,
    // lib/posisjon.ts) — møtemodus har ingen slik grense og fanger det likevel.
    const trettenTimerEtter = '2026-09-26T11:30:00Z'
    expect(velgMoete([startet], trettenTimerEtter)?.id).toBe('m1')
    // Men etter selve 06:00-dagen-etter-vinduet er møtet forbi.
    expect(velgMoete([startet], '2026-09-27T04:00:01Z')).toBeNull()
  })

  it('returnerer sluttTidspunkt som det beregnede 06:00-instantet, ikke møtets eget slutt_tidspunkt', () => {
    const startet = rad({
      id: 'm1',
      start_tidspunkt: '2026-09-26T17:00:00Z',
      slutt_tidspunkt: '2026-09-26T18:00:00Z',
    })
    expect(velgMoete([startet], '2026-09-26T20:00:00Z')?.sluttTidspunkt).toBe('2026-09-27T04:00:00.000Z')
  })

  it('en tur (feil type) i lista fanges aldri av velgMoete', () => {
    const tur = rad({ id: 't1', type: 'tur', start_tidspunkt: '2026-09-26T17:00:00Z', slutt_tidspunkt: '2026-09-30T00:00:00Z' })
    expect(velgMoete([tur], '2026-09-26T20:00:00Z')).toBeNull()
  })
})

describe('velgReiseTur (#780-review)', () => {
  it('en pågående tur fanges selv når en NYERE møte-rad ligger først i lista', () => {
    const naaIso = '2026-09-26T20:00:00Z'
    const nyereMoete = rad({ id: 'm1', type: 'moete', start_tidspunkt: '2026-09-26T18:00:00Z' })
    const eldreTur = rad({
      id: 't1',
      type: 'tur',
      start_tidspunkt: '2026-09-24T09:00:00Z',
      slutt_tidspunkt: '2026-09-28T16:00:00Z',
    })
    // Rader er sortert nyeste-start-først, som fra spørringen — møtet står FØRST.
    expect(velgReiseTur([nyereMoete, eldreTur], naaIso)?.id).toBe('t1')
  })

  it('en tur uten sluttid fanges ikke (reisemodus krever sluttid, uendret fra #723)', () => {
    const tur = rad({ id: 't1', type: 'tur', start_tidspunkt: '2026-09-26T17:00:00Z', slutt_tidspunkt: null })
    expect(velgReiseTur([tur], '2026-09-26T20:00:00Z')).toBeNull()
  })

  it('en tur som er over (sluttid passert) fanges ikke', () => {
    const tur = rad({ id: 't1', type: 'tur', start_tidspunkt: '2026-09-24T09:00:00Z', slutt_tidspunkt: '2026-09-25T16:00:00Z' })
    expect(velgReiseTur([tur], '2026-09-26T20:00:00Z')).toBeNull()
  })
})

// Resolver-regelen testes mot PRODUKSJONSFUNKSJONEN avgjoerKartmodus() — den
// samme hentKartmodus() delegerer til — ikke en lokal kopi (#780-review).
// Flagg-oppslaget er en fake callback som teller kallene sine.
function flagg(verdier: { reise?: boolean | null; moete?: boolean | null }) {
  const kall: string[] = []
  const hentFlagg = async (noekkel: string) => {
    kall.push(noekkel)
    if (noekkel === REISEMODUS) return verdier.reise ?? null
    if (noekkel === MOETEMODUS) return verdier.moete ?? null
    throw new Error(`ukjent flagg ${noekkel}`)
  }
  return { hentFlagg, kall }
}

describe('avgjoerKartmodus — resolver-regelen (#780)', () => {
  const naaIso = '2026-09-26T20:00:00Z'
  const tur = rad({ id: 't1', type: 'tur', start_tidspunkt: '2026-09-24T09:00:00Z', slutt_tidspunkt: '2026-09-28T16:00:00Z' })
  const moete = rad({ id: 'm1', type: 'moete', start_tidspunkt: '2026-09-26T18:00:00Z' })
  const ingenCookies = { reiseAvFor: undefined, moeteAvFor: undefined }

  it('tur og møte samtidig, begge flagg på → reisemodus vinner', async () => {
    const { hentFlagg } = flagg({ reise: true, moete: true })
    const s = await avgjoerKartmodus({ rader: [moete, tur], naaIso, hentFlagg, ...ingenCookies })
    expect(s).toMatchObject({ tilgjengelig: true, modus: 'reise', paa: true, arrangementId: 't1' })
  })

  it('reisemodus-flagget av, møtemodus-flagget på → møtemodus', async () => {
    const { hentFlagg } = flagg({ reise: false, moete: true })
    const s = await avgjoerKartmodus({ rader: [moete, tur], naaIso, hentFlagg, ...ingenCookies })
    expect(s).toMatchObject({
      tilgjengelig: true,
      modus: 'moete',
      paa: true,
      arrangementId: 'm1',
      sluttTidspunkt: '2026-09-27T04:00:00.000Z',
    })
  })

  it('tur + reiseflagg på + reisemodus personlig avslått for turen → vanlig app, IKKE møtemodus', async () => {
    const { hentFlagg, kall } = flagg({ reise: true, moete: true })
    const s = await avgjoerKartmodus({
      rader: [moete, tur],
      naaIso,
      hentFlagg,
      reiseAvFor: 't1',
      moeteAvFor: undefined,
    })
    expect(s).toMatchObject({ tilgjengelig: true, modus: 'reise', paa: false, arrangementId: 't1' })
    // Møteflagget skal ikke engang slås opp når reisemodus har tatt beslutningen.
    expect(kall).toEqual([REISEMODUS])
  })

  it('reise-cookie for en ANNEN tur slår ikke av denne turen', async () => {
    const { hentFlagg } = flagg({ reise: true })
    const s = await avgjoerKartmodus({ rader: [tur], naaIso, hentFlagg, reiseAvFor: 'gammel-tur', moeteAvFor: undefined })
    expect(s).toMatchObject({ modus: 'reise', paa: true })
  })

  it('møte + møte-cookie for dette møtet → tilgjengelig, men av', async () => {
    const { hentFlagg } = flagg({ moete: true })
    const s = await avgjoerKartmodus({ rader: [moete], naaIso, hentFlagg, reiseAvFor: undefined, moeteAvFor: 'm1' })
    expect(s).toMatchObject({ tilgjengelig: true, modus: 'moete', paa: false, arrangementId: 'm1' })
  })

  it('kun tur, reisemodus-flagget av → ingen modus (møtemodus overtar IKKE en tur)', async () => {
    const { hentFlagg } = flagg({ reise: false, moete: true })
    const s = await avgjoerKartmodus({ rader: [tur], naaIso, hentFlagg, ...ingenCookies })
    expect(s).toEqual(KARTMODUS_AV)
  })

  it('kun møte, møtemodus-flagget mangler (null) → ingen modus', async () => {
    const { hentFlagg } = flagg({ reise: true, moete: null })
    const s = await avgjoerKartmodus({ rader: [moete], naaIso, hentFlagg, ...ingenCookies })
    expect(s).toEqual(KARTMODUS_AV)
  })

  it('ingen kandidat i vinduet → flagg-oppslaget kalles aldri (ingen ekstra DB-runde på vanlige dager)', async () => {
    const { hentFlagg, kall } = flagg({ reise: true, moete: true })
    const s = await avgjoerKartmodus({ rader: [], naaIso, hentFlagg, ...ingenCookies })
    expect(s).toEqual(KARTMODUS_AV)
    expect(kall).toEqual([])
  })
})
