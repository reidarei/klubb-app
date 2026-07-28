import { test, expect } from '@playwright/test'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'

// Privatmeldinger (mig. 055, #91) — et medlem skal ikke kunne se en samtale
// han ikke er part i. Reidars avklaring: admin kan slette en enkeltmelding
// (moderering, dekket av «Slette egne samtale_chat eller admin»), men kan
// IKKE lese samtalen — det finnes ingen «admin leser alt»-policy her, i
// motsetning til f.eks. varsel_logg.

const ADMIN = TESTBRUKERE.ADMIN
const PETTER = TESTBRUKERE.PETTER
const OLA = TESTBRUKERE.OLA

// Ubrukt prefiks (høyeste i bruk før #533 er 9700, se supabase/seed.sql).
// check (profil_a < profil_b): Petter (…0002) < Ola (…0003) og
// Admin (…0001) < Ola (…0003) sorterer begge riktig i denne rekkefølgen.
const SAMTALE_PETTER_OLA_ID = '00000000-0000-4000-9900-000000000010'
const SAMTALE_ADMIN_OLA_ID = '00000000-0000-4000-9900-000000000011'
const CHAT_PETTER_OLA_ID = '00000000-0000-4000-9900-000000000012'

test.describe('samtale / samtale_chat — kun deltakerne kan lese (#533)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  test.beforeAll(async () => {
    const service = adminKlient('privat-samtale-fixtures')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    const { error: samtaleFeil } = await service.from('samtale').upsert(
      [
        { id: SAMTALE_PETTER_OLA_ID, profil_a: PETTER.id, profil_b: OLA.id },
        // Ekstra samtale (admin↔Ola) — kun til insert-testen: Petter er part
        // i INGEN av de to samtalene her, så et forsøk på å poste i denne må
        // blokkeres uansett hvilken av de to samtalene han prøver mot.
        { id: SAMTALE_ADMIN_OLA_ID, profil_a: ADMIN.id, profil_b: OLA.id },
      ],
      { onConflict: 'id' },
    )
    if (samtaleFeil) throw new Error(`Kunne ikke seede samtale: ${samtaleFeil.message}`)

    const { error: chatFeil } = await service.from('samtale_chat').upsert(
      {
        id: CHAT_PETTER_OLA_ID,
        samtale_id: SAMTALE_PETTER_OLA_ID,
        profil_id: PETTER.id,
        innhold: 'Hei Ola, seedet testmelding for #533.',
      },
      { onConflict: 'id' },
    )
    if (chatFeil) throw new Error(`Kunne ikke seede samtale_chat: ${chatFeil.message}`)
  })

  test.afterAll(async () => {
    const service = adminKlient('privat-samtale-cleanup')
    if (!service) return
    // samtale_chat ryddes automatisk via on delete cascade, men slettes
    // eksplisitt først for tydelighetens skyld. `unique (profil_a, profil_b)`
    // på samtale krever at BEGGE samtalene er borte før en gjenkjøring kan
    // seede dem på nytt.
    await service.from('samtale_chat').delete().eq('id', CHAT_PETTER_OLA_ID)
    await service.from('samtale').delete().in('id', [SAMTALE_PETTER_OLA_ID, SAMTALE_ADMIN_OLA_ID])
  })

  test('Admin (ikke part) ser ikke Petter/Ola-samtalen eller meldingen i den', async () => {
    const admin = await loggInnKlient(ADMIN.epost)

    const { data: samtaleData, error: samtaleFeil } = await admin
      .from('samtale')
      .select('*')
      .eq('id', SAMTALE_PETTER_OLA_ID)
    expect(samtaleFeil).toBeNull()
    expect(samtaleData).toEqual([])

    const { data: chatData, error: chatFeil } = await admin
      .from('samtale_chat')
      .select('*')
      .eq('samtale_id', SAMTALE_PETTER_OLA_ID)
    expect(chatFeil).toBeNull()
    expect(chatData).toEqual([])
  })

  test('Petter (part) leser BÅDE samtalen og meldingen (positiv kontroll)', async () => {
    const petter = await loggInnKlient(PETTER.epost)

    const { data: samtaleData, error: samtaleFeil } = await petter
      .from('samtale')
      .select('*')
      .eq('id', SAMTALE_PETTER_OLA_ID)
    expect(samtaleFeil).toBeNull()
    expect(samtaleData).toHaveLength(1)

    const { data: chatData, error: chatFeil } = await petter
      .from('samtale_chat')
      .select('innhold')
      .eq('samtale_id', SAMTALE_PETTER_OLA_ID)
    expect(chatFeil).toBeNull()
    expect(chatData).toHaveLength(1)
    expect(chatData?.[0].innhold).toBe('Hei Ola, seedet testmelding for #533.')
  })

  test('Petter kan ikke poste i admin↔Ola-samtalen han ikke er part i', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const { error } = await petter.from('samtale_chat').insert({
      samtale_id: SAMTALE_ADMIN_OLA_ID,
      profil_id: PETTER.id,
      innhold: 'Skal blokkeres av RLS with check.',
    })
    // Insert blokkert av RLS with check gir en FEIL (i motsetning til
    // select/update/delete, som gir stille 0 rader) — se e2e/README.md § RLS-
    // tester for hele tabellen over hvilke nektelser som gir feil.
    expect(error?.code).toBe('42501')

    const service = adminKlient('privat-samtale-verify-insert')
    if (!service) throw new Error('adminKlient ga null')
    const { data, error: verifyFeil } = await service
      .from('samtale_chat')
      .select('id')
      .eq('samtale_id', SAMTALE_ADMIN_OLA_ID)
    expect(verifyFeil).toBeNull()
    expect(data, 'ingen rad skulle ha blitt satt inn i admin↔Ola-samtalen').toEqual([])
  })
})
