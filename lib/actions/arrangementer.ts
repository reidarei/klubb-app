'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendNyttArrangementVarsler, sendOppdatertVarsler, sendPurringVarsler } from '@/lib/varsler'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { naa } from '@/lib/dato'
import { r2StiFraUrl, slettR2 } from '@/lib/r2'
import { VARSLE_MAKS_LENGDE, PURRING_MAKS_LENGDE } from '@/lib/konstanter'
import { ensureInnlogget } from '@/lib/auth'
import { logg } from '@/lib/logg'
import { geokod } from '@/lib/geokoding'

export type ArrangementInput = {
  type: 'moete' | 'tur'
  tittel: string
  beskrivelse?: string | null
  start_tidspunkt: string
  oppmoetested?: string | null
  // Tur-felter. CHECK-constraint tur_felt_kun_for_tur krever at disse er null
  // når type='moete' — klienten må eksplisitt sende null, ikke tom streng.
  slutt_tidspunkt?: string | null
  destinasjon?: string | null
  pris_per_person?: number | null
  sensurerte_felt?: Record<string, boolean>
  bilde_url?: string | null
  // Mal-basert kobling til arrangøransvar. mal_navn = null eller "Annet" betyr
  // ingen kobling. Ellers kobles arrangementet til ALLE arrangoransvar-rader
  // med samme (aar, arrangement_navn) slik at alle ansvarlige markeres som
  // oppfylt atomisk.
  mal_navn?: string | null
  aar?: number | null
}

async function koble(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  arrangementId: string,
  malNavn: string | null | undefined,
  aar: number | null | undefined,
) {
  if (!malNavn || malNavn === 'Annet' || !aar) return
  await supabase
    .from('arrangoransvar')
    .update({ arrangement_id: arrangementId })
    .eq('aar', aar)
    .eq('arrangement_navn', malNavn)
}

async function losne(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  arrangementId: string,
) {
  // Sett arrangement_id = null på alle rader som peker til dette arrangementet
  await supabase
    .from('arrangoransvar')
    .update({ arrangement_id: null })
    .eq('arrangement_id', arrangementId)
}

export async function opprettArrangement(data: ArrangementInput) {
  const { supabase, user } = await ensureInnlogget()

  // Geokod destinasjonen til koordinat for Stedene-kartet. Kun for turer med
  // en destinasjon; best-effort (null ved feil) så oppretting aldri blokkeres.
  // IKKE geokod en sensurert destinasjon (blåtur) — da ville coords lekket
  // hemmeligheten via kartet eller raden. Coords lagres først når sladden
  // fjernes (via redigering). Se docs/geokoding.md.
  const destSensurert = data.sensurerte_felt?.destinasjon === true
  const koord =
    data.type === 'tur' && data.destinasjon && !destSensurert
      ? await geokod(data.destinasjon)
      : null

  const { data: arrangement, error } = await supabase
    .from('arrangementer')
    .insert({
      type: data.type,
      tittel: data.tittel,
      beskrivelse: data.beskrivelse || null,
      start_tidspunkt: data.start_tidspunkt,
      oppmoetested: data.oppmoetested || null,
      slutt_tidspunkt: data.slutt_tidspunkt || null,
      destinasjon: data.destinasjon || null,
      pris_per_person: data.pris_per_person || null,
      sensurerte_felt: data.sensurerte_felt || {},
      bilde_url: data.bilde_url || null,
      lat: koord?.lat ?? null,
      lng: koord?.lng ?? null,
      opprettet_av: user.id,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Oppretteren har implisitt sagt Ja — sett påmelding automatisk så
  // arrangementet ikke dukker opp i hans egen «Ikke svart»-seksjon (#271).
  // Upsert er idempotent og takler PK-konflikt (arrangement_id, profil_id) rent.
  // Best-effort: vi logger feil men kaster ikke — opprettelsen skal gå gjennom
  // selv om auto-RSVP glipper. Tidligere swallowing skjulte ekte RLS-glipp.
  const { error: rsvpError } = await supabase
    .from('paameldinger')
    .upsert(
      {
        arrangement_id: arrangement.id,
        profil_id: user.id,
        status: 'ja',
        oppdatert: naa(),
      },
      { onConflict: 'arrangement_id,profil_id' },
    )
  if (rsvpError) {
    await logg.feil('arrangement.rsvp.feilet', rsvpError, { ctx: { code: rsvpError.code } })
  }

  await koble(supabase, arrangement.id, data.mal_navn, data.aar)

  revalidatePath('/')
  revalidatePath('/arrangoransvar')

  // Send varsler før redirect — after() er ikke pålitelig på Vercel Hobby
  await sendNyttArrangementVarsler({
    arrangementId: arrangement.id,
    tittel: arrangement.tittel,
    startTidspunkt: arrangement.start_tidspunkt,
  }).catch((err: unknown) => logg.feil('arrangement.varsler.feilet', err))

  redirect(`/arrangementer/${arrangement.id}?varslet=true`)
}

export async function slettArrangement(id: string) {
  const supabase = await createServerClient()

  // Hent bilde_url først så vi kan rydde i R2 etter at arrangementet er
  // slettet. Hvis dette feiler er det ikke kritisk — orphan i R2 er bedre
  // enn at sletting feiler. Loggført likevel (warn, ikke feil) — bevisst
  // fail-open, ikke stille.
  const { data: arr, error: arrFeil } = await supabase
    .from('arrangementer')
    .select('bilde_url')
    .eq('id', id)
    .maybeSingle()
  if (arrFeil) logg.warn('arrangement.slett.bilde_oppslag.feilet', { code: arrFeil.code })

  // Løsne ansvar-rader før sletting slik at typen blir tilgjengelig igjen i
  // dropdown-en (FK har on delete set null, men vi gjør det eksplisitt først
  // for klarhet).
  await losne(supabase, id)
  const { error } = await supabase.from('arrangementer').delete().eq('id', id)
  if (error) throw new Error(error.message)

  // Best-effort opprydning av R2-bilde
  const r2Sti = r2StiFraUrl(arr?.bilde_url ?? null)
  if (r2Sti) slettR2(r2Sti).catch(() => {})

  revalidatePath('/')
  revalidatePath('/arrangoransvar')
  redirect('/')
}

export async function oppdaterArrangement(id: string, data: Partial<ArrangementInput>) {
  const supabase = await createServerClient()

  // Håndter mal-bytte separat fra arrangement-feltene
  const { mal_navn, aar, ...arrFelter } = data

  // Re-geokod hvis destinasjonen er en del av oppdateringen. Tømt destinasjon
  // (eller endret til møte) → null coords, så gamle koordinater ikke henger igjen.
  // Urørt destinasjon (undefined) lar coords stå som de er.
  const koordFelt =
    arrFelter.destinasjon !== undefined
      ? await (async () => {
          const dest = arrFelter.destinasjon?.trim()
          // Sensurert destinasjon (blåtur) → ingen coords. Slås sladden PÅ for
          // en tur som alt var plottet, nulles coords her, som fjerner den fra
          // kartet. Skjemaet sender alltid destinasjon + sensurerte_felt sammen.
          const sensurert = arrFelter.sensurerte_felt?.destinasjon === true
          const koord = dest && !sensurert ? await geokod(dest) : null
          return { lat: koord?.lat ?? null, lng: koord?.lng ?? null }
        })()
      : {}

  const { error } = await supabase
    .from('arrangementer')
    .update({
      ...arrFelter,
      ...koordFelt,
      oppdatert: naa(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  // Mal-bytte: hvis mal_navn er eksplisitt satt (inkludert til "Annet" eller
  // null), synkroniser koblingen. Udefinert = rør ikke.
  if (mal_navn !== undefined) {
    await losne(supabase, id)
    await koble(supabase, id, mal_navn, aar)
  }

  revalidatePath(`/arrangementer/${id}`)
  revalidatePath('/')
  revalidatePath('/arrangoransvar')
}

// hilsen er valgfri fri tekst fra avsender — valideres server-side mot
// VARSLE_MAKS_LENGDE slik at klient-maxLength aldri er eneste sperre. Se #282.
export async function varslOmArrangement(arrangementId: string, hilsen?: string) {
  const { supabase, user } = await ensureInnlogget()

  const trimmetHilsen = hilsen?.trim()

  if (trimmetHilsen && trimmetHilsen.length > VARSLE_MAKS_LENGDE) {
    throw new Error(`Hilsen kan ikke være lengre enn ${VARSLE_MAKS_LENGDE} tegn`)
  }

  // Feil hentes eksplisitt: uten den ville en DB-feil sett identisk ut som
  // «arrangement ikke funnet» under. maybeSingle (ikke single): single lar
  // PostgREST rapportere 0 rader som error PGRST116, og da hadde vakten over
  // spist «ikke funnet»-tilfellet og gjort norsk-meldingen under død kode.
  const { data: arrangement, error: arrangementFeil } = await supabase
    .from('arrangementer')
    .select('id, tittel, start_tidspunkt, opprettet_av')
    .eq('id', arrangementId)
    .maybeSingle()
  if (arrangementFeil) throw new Error(`Kunne ikke hente arrangementet: ${arrangementFeil.message}`)

  if (!arrangement) throw new Error('Arrangement ikke funnet')

  // Sjekk at bruker er admin eller opprettet arrangementet
  const profil = await getProfil()
  const erAdmin = kanAdministrere(profil?.rolle)
  const erOpprettet = arrangement.opprettet_av === user.id
  if (!erAdmin && !erOpprettet) throw new Error('Ikke tilgang')

  // Hent avsenders visningsnavn hvis hilsen er oppgitt — samme mønster
  // som purreAnsvarlig i lib/actions/arrangoransvar.ts. Ingen skriving er
  // gjort ennå (varselet sendes under), så vi kaster på feil i stedet for
  // stille fallback — samme resonnement som purrer-oppslaget der. maybeSingle
  // så en manglende profilrad fortsatt faller til 'En gutt' i stedet for å
  // kaste PGRST116 på en handling som ellers ville gått fint.
  let fraNavn: string | undefined
  if (trimmetHilsen) {
    const { data: avsender, error: avsenderFeil } = await supabase
      .from('profiles')
      .select('navn, visningsnavn')
      .eq('id', user.id)
      .maybeSingle()
    if (avsenderFeil) throw new Error(`Kunne ikke hente ditt navn: ${avsenderFeil.message}`)
    fraNavn = avsender?.visningsnavn || avsender?.navn || 'En gutt'
  }

  // Send én oppdatert-varsling til alle — med eller uten hilsen
  await sendOppdatertVarsler({
    arrangementId: arrangement.id,
    tittel: arrangement.tittel,
    startTidspunkt: arrangement.start_tidspunkt,
    fraNavn,
    hilsen: trimmetHilsen,
  })

  revalidatePath(`/arrangementer/${arrangementId}`)
}

// Manuell purring til alle som ikke har svart — trigges av admin/oppretter fra
// «Vis liste»-modalen via «Purre disse»-knappen. Ignorerer purring_aktiv-bryteren
// siden dette er en bevisst admin-handling, ikke en cron-jobb. Se #287.
export async function purreUtenSvar(arrangementId: string, hilsen?: string) {
  const { supabase, user } = await ensureInnlogget()

  const trimmetHilsen = hilsen?.trim()

  if (trimmetHilsen && trimmetHilsen.length > PURRING_MAKS_LENGDE) {
    throw new Error(`Hilsen kan ikke være lengre enn ${PURRING_MAKS_LENGDE} tegn`)
  }

  // Feil hentes eksplisitt, og maybeSingle så «ikke funnet» ikke drukner i
  // PGRST116 — se samme resonnement i varslOmArrangement over.
  const { data: arrangement, error: arrangementFeil } = await supabase
    .from('arrangementer')
    .select('id, tittel, start_tidspunkt, opprettet_av')
    .eq('id', arrangementId)
    .maybeSingle()
  if (arrangementFeil) throw new Error(`Kunne ikke hente arrangementet: ${arrangementFeil.message}`)

  if (!arrangement) throw new Error('Arrangement ikke funnet')

  // Kun admin eller oppretter kan purre — samme mønster som varslOmArrangement.
  const profil = await getProfil()
  const erAdmin = kanAdministrere(profil?.rolle)
  const erOpprettet = arrangement.opprettet_av === user.id
  if (!erAdmin && !erOpprettet) throw new Error('Ikke tilgang')

  // Hent avsenders visningsnavn hvis hilsen er oppgitt — kaster på feil,
  // maybeSingle beholder 'En gutt'-fallbacken; se varslOmArrangement over.
  let fraNavn: string | undefined
  if (trimmetHilsen) {
    const { data: avsender, error: avsenderFeil } = await supabase
      .from('profiles')
      .select('navn, visningsnavn')
      .eq('id', user.id)
      .maybeSingle()
    if (avsenderFeil) throw new Error(`Kunne ikke hente ditt navn: ${avsenderFeil.message}`)
    fraNavn = avsender?.visningsnavn || avsender?.navn || 'En gutt'
  }

  // Vi sender IKKE en pre-beregnet mottakerliste — sendPurringVarsler beregner
  // utenSvar selv så tett opp mot utsendingen som mulig. Det lukker et TOCTOU-vindu
  // hvor noen rekker å svare mellom beregning her og utsending der. Vi signaliserer
  // bare at dette er en manuell admin-handling som skal ignorere cron-bryteren. (#287)
  await sendPurringVarsler({
    arrangementId: arrangement.id,
    tittel: arrangement.tittel,
    startTidspunkt: arrangement.start_tidspunkt,
    fraNavn,
    hilsen: trimmetHilsen,
    ignorerAktivBryter: true,
  })

  // Refresh siden så «Ikke svart»-listen oppdateres hvis noen svarte
  // i mellomtiden (eller cron har kjørt mellom åpning og sending).
  revalidatePath(`/arrangementer/${arrangementId}`)
}
