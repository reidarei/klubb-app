import { test, expect } from '@playwright/test'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'
import { STIKKORD_MAKS_LENGDE } from '../../lib/konstanter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Kolonnevern på profiles (mig. 105/123, fra 163 et verdivern mot medlemskap, #868) og oppdateringsgrensen på
// varsel_logg (mig. 121, IKKE 123 slik issue #533 opprinnelig antok — 123
// gjelder faar_feilvarsler-kolonnen på profiles, ikke varsel_logg).
//
// Kolonnevern håndheves av en TRIGGER, ikke en RLS-policy — den gir derfor
// en ekte feil (P0001) i stedet for stille 0 rader. varsel_logg sin
// update-grense er derimot en kolonne-GRANT (kun `lest` er oppdaterbar for
// authenticated) og gir 42501 hvis man forsøker en annen kolonne.

const PETTER = TESTBRUKERE.PETTER
const OLA = TESTBRUKERE.OLA
const ADMIN = TESTBRUKERE.ADMIN

const VARSEL_PETTER_ID = '00000000-0000-4000-9900-000000000020'
const VARSEL_OLA_ID = '00000000-0000-4000-9900-000000000021'

// Kolonnene testene i denne fila kan komme til å endre hvis en RLS-policy
// eller triggeren faktisk har et hull. Snapshottes før og skrives ubetinget
// tilbake etter — se afterAll-kommentaren. De fem rolle/flagg-kolonnene bor på
// medlemskap (mig. 163); profiles bærer bare et vernet speil av dem.
const PROFIL_KOLONNER = 'visningsnavn, stikkord'
const MEDLEMSKAP_KOLONNER = 'rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv'

test.describe('profiles — kolonnevern (mig. 105/123, #533)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  let petterFoer: Record<string, unknown> | null = null
  let petterMedlemskapFoer: Record<string, unknown> | null = null
  let olaNavnFoer: string | null = null

  test.beforeAll(async () => {
    const service = adminKlient('profiles-snapshot')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    const { data, error } = await service.from('profiles').select(PROFIL_KOLONNER).eq('id', PETTER.id).single()
    if (error) throw new Error(`Kunne ikke snapshotte Petters profil: ${error.message}`)
    petterFoer = data as Record<string, unknown>

    const { data: medlemskap, error: medlemskapFeil } = await service
      .from('medlemskap')
      .select(MEDLEMSKAP_KOLONNER)
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', PETTER.id)
      .single()
    if (medlemskapFeil) throw new Error(`Kunne ikke snapshotte Petters medlemskap: ${medlemskapFeil.message}`)
    petterMedlemskapFoer = medlemskap as Record<string, unknown>

    const { data: ola, error: olaFeil } = await service.from('profiles').select('visningsnavn').eq('id', OLA.id).single()
    if (olaFeil) throw new Error(`Kunne ikke snapshotte Olas visningsnavn: ${olaFeil.message}`)
    olaNavnFoer = ola.visningsnavn
  })

  // Slår kolonnevernet eller rad-RLS ut PÅ ORDENTLIG, er skaden vedvarende:
  // instansen blir stående med Petter som admin eller deaktivert, og andre
  // spec-er faller etterpå på et SYMPTOM som ikke ligner årsaken (mystiske
  // 403-er i UI, feil rollemerke i medlemslista). Skriv derfor snapshotet
  // ubetinget tilbake — også når testene var grønne, der er det en no-op.
  test.afterAll(async () => {
    const service = adminKlient('profiles-restore')
    if (!service || !petterFoer) return
    // Medlemskap først: speilet fører verdiene videre til profiles (vernet
    // gjelder også service_role, så profiles kan ikke gjenopprettes direkte).
    if (petterMedlemskapFoer) {
      const { error: medlemskapFeil } = await service
        .from('medlemskap')
        .update(petterMedlemskapFoer)
        .eq('klubb_id', FOERSTE_KLUBB_ID)
        .eq('profil_id', PETTER.id)
      if (medlemskapFeil) console.warn(`[profiles-restore] kunne ikke gjenopprette Petters medlemskap: ${medlemskapFeil.message}`)
    }
    const { error } = await service.from('profiles').update(petterFoer).eq('id', PETTER.id)
    if (error) console.warn(`[profiles-restore] kunne ikke gjenopprette Petters profil: ${error.message}`)
    if (olaNavnFoer !== null) {
      const { error: olaFeil } = await service
        .from('profiles')
        .update({ visningsnavn: olaNavnFoer })
        .eq('id', OLA.id)
      if (olaFeil) console.warn(`[profiles-restore] kunne ikke gjenopprette Olas visningsnavn: ${olaFeil.message}`)
    }
  })

  // Én test per beskyttet kolonne. Petter setter alltid PÅ SIN EGEN rad —
  // triggeren skiller ikke på hvem som eier raden, kun om verdien endres.
  //
  // Verdien UTLEDES av radens nåværende innhold i stedet for å være hardkodet:
  // triggeren kaster kun ved `is distinct from old`, så en update som tilfeldigvis
  // setter samme verdi som allerede står der er en no-op og gir INGEN P0001 —
  // testen ville blitt rød og sett ut som et hull i kolonnevernet. Det er en
  // reell risiko her: en seed-endring (eller en tidligere spec) som f.eks.
  // setter faar_issue_varsler = true på Petter ville utløst det.
  const beskyttedeKolonner: Array<{ kolonne: string; nyVerdi: (naavaerende: unknown) => unknown }> = [
    { kolonne: 'rolle', nyVerdi: n => (n === 'admin' ? 'generalsekretaer' : 'admin') },
    { kolonne: 'aktiv', nyVerdi: n => !n },
    { kolonne: 'faar_issue_varsler', nyVerdi: n => !n },
    { kolonne: 'faar_feilvarsler', nyVerdi: n => !n },
    // Tidligere uvernet (bare de fire over var i triggeren); lukket av 163 (#868).
    { kolonne: 'bursdagsgratulasjon_aktiv', nyVerdi: n => !n },
  ]

  for (const { kolonne, nyVerdi } of beskyttedeKolonner) {
    test(`Petter kan ikke endre egen ${kolonne}`, async () => {
      const service = adminKlient(`profiles-kolonnevern-${kolonne}`)
      if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
      const { data: forFeil, error: forFeilFeil } = await service.from('profiles').select(kolonne).eq('id', PETTER.id).single()
      expect(forFeilFeil).toBeNull()

      const verdi = nyVerdi((forFeil as Record<string, unknown> | null)?.[kolonne])
      const petter = await loggInnKlient(PETTER.epost)
      const { error } = await petter.from('profiles').update({ [kolonne]: verdi }).eq('id', PETTER.id)

      // Kolonnevernet er en BEFORE UPDATE-trigger (beskytt_profil_kolonner)
      // som `raise exception` uten egen errcode — Postgres default er P0001.
      expect(error?.code, `forventet P0001 (triggerens raise exception), fikk ${JSON.stringify(error)}`).toBe(
        'P0001',
      )
      expect(error?.message).toContain('medlemskap.speil.vern')

      const { data: etterFeil, error: etterFeilFeil } = await service.from('profiles').select(kolonne).eq('id', PETTER.id).single()
      expect(etterFeilFeil).toBeNull()
      // Dynamisk kolonnenavn (variabel over testtilfellene) — supabase-js kan
      // ikke gi et presist felttype-oppslag for det, derfor Record<string,
      // unknown> her i stedet for `as any`.
      const forRad = forFeil as Record<string, unknown> | null
      const etterRad = etterFeil as Record<string, unknown> | null
      expect(etterRad?.[kolonne]).toEqual(forRad?.[kolonne])
    })
  }

  // Vernet gjelder ALLE (#868): grenen «auth.uid() is null or er_admin()» er borte,
  // så heller ikke service_role kan skrive rolle direkte på profiles.
  test('service_role kan heller ikke sette profiles.rolle direkte (verdivernet gjelder alle)', async () => {
    const service = adminKlient('profiles-vern-service')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    const { error } = await service.from('profiles').update({ rolle: 'admin' }).eq('id', PETTER.id)
    expect(error?.code).toBe('P0001')
    expect(error?.message).toContain('medlemskap.speil.vern')
  })

  // Rad-RLS på medlemskap: Petter ser raden (aktiv, standardklubben), men
  // update-policyen krever er_admin(klubb_id) — 0 rader og ingen feil, ikke P0001.
  test('Petter kan ikke endre egen rolle på medlemskap (update-policyen filtrerer raden bort)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const { data, error } = await petter
      .from('medlemskap')
      .update({ rolle: 'admin' })
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', PETTER.id)
      .select('rolle')
    expect(error).toBeNull()
    expect(data).toEqual([])

    const service = adminKlient('medlemskap-kryssjekk')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    const { data: etter, error: etterFeil } = await service
      .from('medlemskap')
      .select('rolle')
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', PETTER.id)
      .single()
    expect(etterFeil).toBeNull()
    expect(etter?.rolle).toBe(petterMedlemskapFoer?.rolle)
  })

  // Kolonne-grant (ikke policy): ingen — heller ikke admin — kan flytte et
  // medlemskap til en annen klubb. 42501, ikke stille 0 rader.
  test('admin kan ikke endre klubb_id på medlemskap (kolonne-grant)', async () => {
    const admin = await loggInnKlient(ADMIN.epost)
    const { error } = await admin
      .from('medlemskap')
      .update({ klubb_id: FOERSTE_KLUBB_ID })
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', PETTER.id)
    expect(error?.code).toBe('42501')
  })

  // Positiv kontroll i SAMME fil som kolonnevern-testene over: uten den
  // kunne alle fire nektelsene over skyldes en manglende UPDATE-grant på
  // profiles (authenticated har faktisk full update-grant, se mig. 107,
  // men det er nettopp poenget — testen skal bevise at DET er
  // update-GRANTen som virker, og at det er TRIGGEREN som stopper de fire
  // kolonnene, ikke en tilfeldig 42501 lenger opp i kjeden).
  test('positiv kontroll: Petter kan oppdatere sitt eget visningsnavn (revertert i samme test)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const midlertidig = `Petter-midlertidig-${Date.now()}`

    const { data, error } = await petter
      .from('profiles')
      .update({ visningsnavn: midlertidig })
      .eq('id', PETTER.id)
      .select('visningsnavn')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].visningsnavn).toBe(midlertidig)

    // Revert i SAMME test — en senere kjøring (eller en annen spec som leser
    // Petters visningsnavn) skal ikke se den midlertidige verdien.
    const { error: revertFeil } = await petter.from('profiles').update({ visningsnavn: 'Petter' }).eq('id', PETTER.id)
    expect(revertFeil).toBeNull()
  })

  test('Petter kan ikke oppdatere Olas visningsnavn (rad-RLS, ikke kolonnevern)', async () => {
    const service = adminKlient('profiles-kryssbruker-verify')
    if (!service) throw new Error('adminKlient ga null')
    const { data: forFeil, error: forFeilFeil } = await service.from('profiles').select('visningsnavn').eq('id', OLA.id).single()
    expect(forFeilFeil).toBeNull()

    const petter = await loggInnKlient(PETTER.epost)
    const { error } = await petter.from('profiles').update({ visningsnavn: 'Kapret' }).eq('id', OLA.id)
    // RLS `using (id = auth.uid() or er_admin())` filtrerer raden bort FØR
    // triggeren i det hele tatt kjører — 0 rader, ingen feil. `data` er alltid
    // null uten `.select()` (uansett om noe ble endret), så det er verifiseringen
    // med service_role under som er beviset — ikke responsen her.
    expect(error).toBeNull()

    const { data: etterFeil, error: etterFeilFeil } = await service.from('profiles').select('visningsnavn').eq('id', OLA.id).single()
    expect(etterFeilFeil).toBeNull()
    expect(etterFeil?.visningsnavn).toEqual(forFeil?.visningsnavn)
  })

  // Stikkord (#639, fritekst siden #685): selvredigerbart felt, IKKE i
  // beskytt_profil_kolonner (se migrasjon 138/142) — rad-RLS fra mig. 009
  // er hele beskyttelsen.
  test('Petter kan sette sine egne stikkord (revertert i samme test)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const ny = 'midlertidig stikkord'

    const { data, error } = await petter
      .from('profiles')
      .update({ stikkord: ny })
      .eq('id', PETTER.id)
      .select('stikkord')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].stikkord).toEqual(ny)

    // Revert i SAMME test — samme mønster som visningsnavn-testen over.
    // null, ikke tom streng: «ikke utfylt» har kun én representasjon i
    // dataene siden #685 (samme constraint-form som matallergier, mig. 141).
    const { error: revertFeil } = await petter.from('profiles').update({ stikkord: null }).eq('id', PETTER.id)
    expect(revertFeil).toBeNull()
  })

  test('Petter kan ikke sette Olas stikkord (rad-RLS)', async () => {
    const service = adminKlient('profiles-stikkord-kryssbruker-verify')
    if (!service) throw new Error('adminKlient ga null')
    const { data: forFeil, error: forFeilFeil } = await service.from('profiles').select('stikkord').eq('id', OLA.id).single()
    expect(forFeilFeil).toBeNull()

    const petter = await loggInnKlient(PETTER.epost)
    const { error } = await petter.from('profiles').update({ stikkord: 'kapret' }).eq('id', OLA.id)
    // Samme mønster som visningsnavn-testen: RLS filtrerer raden bort FØR
    // noe skrives — 0 rader, ingen feil. Verifiseringen med service_role
    // under er beviset.
    expect(error).toBeNull()

    const { data: etterFeil, error: etterFeilFeil } = await service.from('profiles').select('stikkord').eq('id', OLA.id).single()
    expect(etterFeilFeil).toBeNull()
    expect(etterFeil?.stikkord).toEqual(forFeil?.stikkord)
  })

  test('DB-grensen holder: for langt stikkordfelt gir 23514 (check_violation)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const forLangt = 'a'.repeat(STIKKORD_MAKS_LENGDE + 1)

    const { error } = await petter.from('profiles').update({ stikkord: forLangt }).eq('id', PETTER.id)
    // Beviser at grensen er DB-sannhet (profiles_stikkord_gyldig, mig. 142),
    // ikke bare en app-side høflighet i lib/fritekst.ts.
    expect(error?.code).toBe('23514')

    // Ingen revert nødvendig — updaten feilet, raden er uendret.
  })

  test('DB-grensen holder: stikkordfelt med bare whitespace gir 23514', async () => {
    const petter = await loggInnKlient(PETTER.epost)

    // char_length(btrim(' ')) er 0, altså utenfor «between 1 and 200» —
    // constrainten (mig. 142) speiler matallergier (mig. 141) her: den
    // krever bare at TRIMMET lengde er innenfor grensen, IKKE at verdien
    // allerede er trimmet (ulikt den gamle array-varianten, mig. 139, som
    // krevde eksakt trim per element). Ledende/etterfølgende whitespace
    // rundt ekte tekst er derfor lovlig på DB-nivå her — vår egen UI
    // trimmer likevel alltid (normaliserFritekst).
    const { error } = await petter.from('profiles').update({ stikkord: '   ' }).eq('id', PETTER.id)
    expect(error?.code).toBe('23514')
    // Ingen revert nødvendig — updaten feilet, raden er uendret.
  })
})

test.describe('varsel_logg — kun `lest` er oppdaterbar, kun på egne rader (mig. 121, #533)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  test.beforeAll(async () => {
    const service = adminKlient('varsel-logg-fixtures')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    await service.from('varsel_logg').delete().in('id', [VARSEL_PETTER_ID, VARSEL_OLA_ID]).throwOnError()
    const { error } = await service.from('varsel_logg').insert([
      { id: VARSEL_PETTER_ID, profil_id: PETTER.id, tittel: 'Testvarsel Petter', melding: 'Seedet for #533.' },
      { id: VARSEL_OLA_ID, profil_id: OLA.id, tittel: 'Testvarsel Ola', melding: 'Seedet for #533.' },
    ])
    if (error) throw new Error(`Kunne ikke seede varsel_logg: ${error.message}`)
  })

  test.afterAll(async () => {
    const service = adminKlient('varsel-logg-cleanup')
    if (!service) return
    // Logg feilen i stedet for taus fail-open: en cleanup som ikke gikk gjennom
    // betyr at NESTE kjørings beforeAll står med fremmede rader, og da vil vi
    // vite hvorfor uten å gjette. Vi kaster ikke — det ville maskert den ekte
    // testfeilen som gjorde at ryddingen var nødvendig.
    const { error } = await service.from('varsel_logg').delete().in('id', [VARSEL_PETTER_ID, VARSEL_OLA_ID])
    if (error) console.warn(`[varsel-logg-cleanup] kunne ikke slette testvarsler: ${error.message}`)
  })

  test('Petter kan markere sitt EGET varsel som lest', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const { data, error } = await petter.from('varsel_logg').update({ lest: true }).eq('id', VARSEL_PETTER_ID).select('lest')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].lest).toBe(true)
  })

  test('Petter kan IKKE markere Olas varsel som lest', async () => {
    const service = adminKlient('varsel-logg-verify-lest')
    if (!service) throw new Error('adminKlient ga null')
    const { data: forFeil, error: forFeilFeil } = await service.from('varsel_logg').select('lest').eq('id', VARSEL_OLA_ID).single()
    expect(forFeilFeil).toBeNull()

    const petter = await loggInnKlient(PETTER.epost)
    // Ingen `.select()` ⇒ `data` er null uansett utfall; verifiseringen med
    // service_role under er det eneste som skiller «blokkert» fra «endret».
    const { error } = await petter.from('varsel_logg').update({ lest: true }).eq('id', VARSEL_OLA_ID)
    expect(error).toBeNull()

    const { data: etterFeil, error: etterFeilFeil } = await service.from('varsel_logg').select('lest').eq('id', VARSEL_OLA_ID).single()
    expect(etterFeilFeil).toBeNull()
    expect(etterFeil?.lest).toEqual(forFeil?.lest)
  })

  test('Petter kan ikke oppdatere `tittel` på sitt eget varsel — kun `lest` er grantet (mig. 121)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const { error } = await petter.from('varsel_logg').update({ tittel: 'Kapret tittel' }).eq('id', VARSEL_PETTER_ID)
    // Dette er en kolonne-GRANT (revoke update + grant update(lest) i mig.
    // 121), ikke RLS — Postgres svarer 42501 direkte, ikke stille 0 rader.
    expect(error?.code).toBe('42501')

    // Les raden på nytt med service_role, som de øvrige negative skrivetestene
    // i fila: 42501 er sterkt bevis, men verifiseringen koster ingenting og
    // gjør at ALLE nektelses-testene her følger samme mønster.
    const service = adminKlient('varsel-logg-verify-tittel')
    if (!service) throw new Error('adminKlient ga null')
    const { data, error: verifyFeil } = await service
      .from('varsel_logg')
      .select('tittel')
      .eq('id', VARSEL_PETTER_ID)
      .single()
    expect(verifyFeil).toBeNull()
    expect(data?.tittel).toBe('Testvarsel Petter')
  })

  test('Petter kan ikke lese Olas varsel', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const { data, error } = await petter.from('varsel_logg').select('*').eq('id', VARSEL_OLA_ID)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('Admin kan lese Olas varsel (varsel_logg har en admin-leser-alt-policy)', async () => {
    const admin = await loggInnKlient(ADMIN.epost)
    const { data, error } = await admin.from('varsel_logg').select('*').eq('id', VARSEL_OLA_ID)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
