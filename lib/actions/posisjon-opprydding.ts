import type { SupabaseClient } from '@supabase/supabase-js'
import { naa } from '@/lib/dato'
import { ARRANGEMENT_ANTATT_TIMER } from '@/lib/posisjon'
import { POSISJON_SPOR_TIMER } from '@/lib/konstanter'
import { logg } from '@/lib/logg'

/**
 * Rydder posisjonsspor som har gjort jobben sin (#695).
 *
 * Sporing er avgrenset i TID, ikke bare i synlighet — det er hele avveiningen
 * bak å lagre historikk i det hele tatt. RLS skjuler allerede punkter til en
 * mann som ikke deler lenger, men skjult er ikke det samme som borte, og
 * løftet i appen sier borte.
 *
 * Fem ting ryddes, og de er fem forskjellige tilstander:
 *
 *   1. Utgåtte DELINGER — vinduet er passert. Raden har ingen funksjon lenger.
 *   2. ELDRELØSE PUNKTER — punkter fra en mann som ikke lenger har en aktiv
 *      deling. Dekker både «vinduet gikk ut» og en avbrutt stoppDeling() der
 *      punktslettingen feilet etter at delingen var borte.
 *   3. Punkter fra AVSLUTTEDE ARRANGEMENTER — kveldens spor, etter kvelden.
 *      Dette er tilfellet Reidar faktisk ba om: sporet lever mens turen varer.
 *   3b. LØSE PUNKTER ELDRE ENN SPOR-VINDUET (#698) — punkter uten arrangement
 *      vises i POSISJON_SPOR_TIMER. Etter det er de usynlige, og lagret data
 *      ingen kan se er nøyaktig tilstanden vi ikke vil ha.
 *   4. UTLØPTE KARTMARKERINGER (#697) — samme tanke, egen kolonne: `utloper`
 *      ble regnet ut ved opprettelse, så her er det bare å slette det som er
 *      forbi.
 *
 * Kjøres fra påminnelses-cronet, som allerede har en admin-klient og en fast
 * daglig kjøring. Egen jobb med egen try/catch der, så en feil her ikke tar
 * med seg påminnelsene.
 */
export async function ryddPosisjonsspor(admin: SupabaseClient): Promise<{
  delinger: number
  eldreloese: number
  avsluttede: number
  gamleLoese: number
  markeringer: number
  feil: number
}> {
  const naaIso = naa()
  let feil = 0

  // ── 1. Utgåtte delinger ────────────────────────────────────────────────────
  const { data: utgaatte, error: delingFeil } = await admin
    .from('posisjon_deling')
    .delete()
    .lt('deler_til', naaIso)
    .select('profil_id')

  if (delingFeil) {
    await logg.feil('cron.posisjon.rydd.feilet', delingFeil, {
      fingerprint: 'delinger',
    })
    feil++
  }

  // ── 2. Punkter uten aktiv deling ───────────────────────────────────────────
  // To steg, ikke én spørring med subquery: PostgREST kan ikke uttrykke
  // «delete where not exists (...)», og en RPC for denne ene jobben ville vært
  // mer maskineri enn den fortjener. Listen er maks 18 rader.
  const { data: aktive, error: aktiveFeil } = await admin
    .from('posisjon_deling')
    .select('profil_id')
    .gt('deler_til', naaIso)

  let eldreloese = 0
  if (aktiveFeil) {
    await logg.feil('cron.posisjon.rydd.feilet', aktiveFeil, { fingerprint: 'aktive-oppslag' })
    feil++
  } else {
    // Fail-closed mot SLETTING: er lista tom fordi spørringen feilet, ville
    // «ingen deler» blitt lest som «slett alt». Derfor kjører dette kun i
    // else-grenen — en tom liste her betyr faktisk at ingen deler, og da SKAL
    // alle punkter bort.
    const aktiveIder = (aktive ?? []).map(r => r.profil_id)
    const spørring = admin.from('posisjon_punkt').delete()
    const { data: slettet, error: punktFeil } = await (aktiveIder.length > 0
      ? spørring.not('profil_id', 'in', `(${aktiveIder.join(',')})`)
      : spørring.gte('registrert', '1970-01-01')
    ).select('id')

    if (punktFeil) {
      await logg.feil('cron.posisjon.rydd.feilet', punktFeil, { fingerprint: 'eldreloese' })
      feil++
    } else {
      eldreloese = slettet?.length ?? 0
    }
  }

  // ── 3. Punkter fra arrangementer som er over ───────────────────────────────
  // Et arrangement uten sluttid regnes som over ARRANGEMENT_ANTATT_TIMER etter
  // start — nøyaktig samme grense som finnPaagaaendeArrangement() bruker til å
  // si at det PÅGÅR. Faller de to fra hverandre, oppstår et vindu der punkter
  // verken knyttes til et spor eller ryddes som del av ett.
  const antattSlutt = new Date(
    Date.now() - ARRANGEMENT_ANTATT_TIMER * 60 * 60 * 1000,
  ).toISOString()

  const { data: avsluttedeArr, error: arrFeil } = await admin
    .from('arrangementer')
    .select('id, slutt_tidspunkt, start_tidspunkt')
    .lt('start_tidspunkt', naaIso)

  let avsluttede = 0
  if (arrFeil) {
    await logg.feil('cron.posisjon.rydd.feilet', arrFeil, { fingerprint: 'arrangement-oppslag' })
    feil++
  } else {
    const overIder = (avsluttedeArr ?? [])
      .filter(a =>
        a.slutt_tidspunkt ? a.slutt_tidspunkt < naaIso : a.start_tidspunkt < antattSlutt,
      )
      .map(a => a.id)

    if (overIder.length > 0) {
      const { data: slettet, error: punktFeil } = await admin
        .from('posisjon_punkt')
        .delete()
        .in('arrangement_id', overIder)
        .select('id')

      if (punktFeil) {
        await logg.feil('cron.posisjon.rydd.feilet', punktFeil, { fingerprint: 'avsluttede' })
        feil++
      } else {
        avsluttede = slettet?.length ?? 0
      }
    }
  }

  // ── 3b. Løse punkter eldre enn spor-vinduet (#698) ────────────────────────
  // Punkter UTEN arrangement vises i POSISJON_SPOR_TIMER og skal ikke ligge
  // igjen etterpå. Uten denne ville de bare forsvunnet når mannen sluttet å
  // dele — og en mann som fornyer delingen hver dag ville aldri fått ryddet,
  // mens kartet uansett ikke viste punktene lenger. Lagret data som ingen kan
  // se er nøyaktig den tilstanden vi ikke vil ha.
  const sporGrense = new Date(Date.now() - POSISJON_SPOR_TIMER * 60 * 60 * 1000).toISOString()
  const { data: gamleLoese, error: loeseFeil } = await admin
    .from('posisjon_punkt')
    .delete()
    .is('arrangement_id', null)
    .lt('registrert', sporGrense)
    .select('id')

  let loese = 0
  if (loeseFeil) {
    await logg.feil('cron.posisjon.rydd.feilet', loeseFeil, { fingerprint: 'loese-gamle' })
    feil++
  } else {
    loese = gamleLoese?.length ?? 0
  }

  // ── 4. Utløpte kartmarkeringer (#697) ─────────────────────────────────────
  // Egen kolonne og enklere regel enn punktene: `utloper` ble regnet ut da
  // markeringen ble satt (arrangementets slutt, eller et timesvindu), så her
  // er det bare å slette det som har passert. Markeringer fra et SLETTET
  // arrangement er allerede borte via on delete cascade.
  const { data: markeringer, error: markeringFeil } = await admin
    .from('kart_markering')
    .delete()
    .lt('utloper', naaIso)
    .select('id')

  let markeringerSlettet = 0
  if (markeringFeil) {
    await logg.feil('cron.posisjon.rydd.feilet', markeringFeil, { fingerprint: 'markeringer' })
    feil++
  } else {
    markeringerSlettet = markeringer?.length ?? 0
  }

  return {
    delinger: utgaatte?.length ?? 0,
    eldreloese,
    avsluttede,
    gamleLoese: loese,
    markeringer: markeringerSlettet,
    feil,
  }
}
