import { adminKlient } from './admin-klient'

/**
 * Nullstiller de fire faste kåringspoll-fixturene fra supabase/seed.sql
 * (#520, prefiks 9700) tilbake til sin opprinnelige, relative-til-nå
 * tilstand. e2e/kaaring-varsel-retry.spec.ts kjører den EKTE cronen
 * (/api/cron/paaminne), som muterer disse radene (avsluttet_paa,
 * tiebreak_status, vinner_varslet_paa) — uten en reset ville en gjentatt
 * kjøring av samme spec funnet en annen utgangstilstand enn seed.sql
 * beskriver.
 *
 * Kall via BÅDE test.beforeEach OG test.afterEach (samme mønster som
 * e2e/helpers/rydd-test-poll.ts): beforeEach fanger opp at en tidligere
 * kjøring krasjet før sin egen afterEach rakk å rydde opp.
 *
 * Verdiene er relative til «nå» (samme uttrykk som i seed.sql sin
 * kåringspoll-blokk), ikke gjenbrukte absolutte tidsstempler — en fixture
 * skal alltid være «fersk nok» til at fersk/retry/vindu-grensene faktisk
 * gjelder, uansett hvor lenge det er siden test-instansen sist ble resatt
 * med `supabase db reset`. Endres tallene i seed.sql (dager fra nå,
 * KAARING_VARSEL_RETRY_DAGER-marginer) må de oppdateres her i samme commit,
 * og omvendt.
 */

export const KAARING_SEED_POLL_ID = {
  FERSK: '00000000-0000-4000-9700-000000000001',
  AVSLUTTET_MARKERT: '00000000-0000-4000-9700-000000000002',
  AVSLUTTET_UMARKERT: '00000000-0000-4000-9700-000000000003',
  AVSLUTTET_GAMMEL: '00000000-0000-4000-9700-000000000004',
} as const

export async function nullstillKaaringSeedPoller() {
  const supabase = adminKlient('rydd-kaaring-seed')
  if (!supabase) return

  const naa = Date.now()
  const dager = (n: number) => new Date(naa - n * 24 * 60 * 60 * 1000).toISOString()

  // Alle fire får svarfrist 400 dager tilbake — samme verdi som seed.sql, og
  // av samme grunn: en fersk svarfrist ville dratt «Kåringtest …»-fixturene
  // inn i AGENDA_VINDU_MND-vinduet på forsiden og dermed inn i de offentlige
  // README-skjermbildene. Cron-grenene bryr seg ikke: fersk-spørringen krever
  // bare `svarfrist < nå`, retry-vinduet måles på avsluttet_paa.
  const SVARFRIST_DAGER = 400

  // tiebreak_varslet_paa nullstilles selv om ingen av fixturene starter med
  // status 'venter_paa_tiebreak' i dag: skulle en av dem en gang havne der,
  // ville cronen stemplet DEN kolonnen (#521), og en helper som ikke rører
  // den ville etterlatt fixturen permanent filtrert bort fra retry-køen —
  // og speccen ville blitt grønn uten å teste noe.
  const patcher: Record<string, Record<string, string | null>> = {
    [KAARING_SEED_POLL_ID.FERSK]: {
      svarfrist: dager(SVARFRIST_DAGER),
      avsluttet_paa: null,
      tiebreak_status: null,
      tiebreak_varslet_paa: null,
      vinner_varslet_paa: null,
    },
    [KAARING_SEED_POLL_ID.AVSLUTTET_MARKERT]: {
      svarfrist: dager(SVARFRIST_DAGER),
      avsluttet_paa: dager(3),
      tiebreak_status: 'avgjort',
      tiebreak_varslet_paa: null,
      vinner_varslet_paa: dager(3),
    },
    [KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT]: {
      svarfrist: dager(SVARFRIST_DAGER),
      avsluttet_paa: dager(2),
      tiebreak_status: 'avgjort',
      tiebreak_varslet_paa: null,
      vinner_varslet_paa: null,
    },
    [KAARING_SEED_POLL_ID.AVSLUTTET_GAMMEL]: {
      svarfrist: dager(SVARFRIST_DAGER),
      avsluttet_paa: dager(10),
      tiebreak_status: 'avgjort',
      tiebreak_varslet_paa: null,
      vinner_varslet_paa: null,
    },
  }

  for (const [id, felter] of Object.entries(patcher)) {
    const { error } = await supabase.from('poll').update(felter).eq('id', id)
    if (error) console.error(`[rydd-kaaring-seed] nullstilling feilet for ${id}:`, error)
  }
}
