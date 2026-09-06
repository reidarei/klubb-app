// Orkestrering av bursdagsbilde-generering (#641): claim → hent profilbilde
// → Vertex AI → R2 → oppdater rad. Kalt fra to steder som deler nøyaktig
// samme logikk: cron-ruta (app/api/cron/bursdagsbilde/route.ts, tvungen =
// false) og admin-flatens «Generer»-knapp
// (app/(app)/innstillinger/bursdagsbilde/actions.ts, tvungen = true).
//
// VANLIG lib-modul, IKKE 'use server' — bevisst. En eksportert funksjon i en
// 'use server'-modul blir et klient-kallbart endepunkt, og genererBursdagsbilde()
// tar en ferdig admin-klient og en fritt oppgitt profil som argumenter: den har
// ingen egen autorisasjon å falle tilbake på, og skal derfor ikke være
// eksponert som en action. Autorisasjonen ligger hos de to kallstedene
// (CRON_SECRET i cron-ruta, ensureAdmin() i admin-actionen).
//
// BEVISST GRENSE — les før du endrer denne fila: ingen sendVarsel(), ingen
// sendChatVarsler(), og lib/actions/bursdagsgratulasjon.ts /
// lib/actions/bursdagsvarsel.ts er IKKE rørt av #641. Bursdagsbildet er en
// visuell endring av hero-flaten på agenda-kortet — ingen får varsel om at
// et bilde er klart, og admin må selv oppsøke /innstillinger/bursdagsbilde
// for å se resultatet. Dette er Reidars uttrykkelige beslutning (issue
// #641), ikke en forglemmelse — se risikoliste i PR-beskrivelsen.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { lastOppR2, slettR2, r2StiFraUrl } from '@/lib/r2'
import { bildeSti, nyttR2Filnavn, EXT_FRA_BILDE_MIME } from '@/lib/bilde-utils'
import { byggBursdagsprompt, statusForFeilklasse } from '@/lib/bursdagsbilde'
import { genererBildeVertex, VertexFeil, type VertexFeilKlasse } from '@/lib/vertex'
import {
  BURSDAGSBILDE_BUDSJETT_HENT_MS,
  BURSDAGSBILDE_BUDSJETT_MODELL_MS,
  BURSDAGSBILDE_BUDSJETT_R2_MS,
  BURSDAGSBILDE_INPUT_MAKS_MB,
  MEDGJESTER_MAKS_ANTALL,
} from '@/lib/konstanter'
import { logg } from '@/lib/logg'

type Admin = SupabaseClient<Database>

// Feltene oppdaterRad() får lov til å skrive. Bundet til de genererte
// typene (migrasjon 140) i stedet for et løst Record<string, unknown>, så
// en feilstavet kolonne blir en kompileringsfeil og ikke en stille
// PostgREST-400 i cron-loggen.
type BursdagsbildeOppdatering = Database['public']['Tables']['bursdagsbilde']['Update']

function feilTekst(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function oppdaterRad(
  admin: Admin,
  profilId: string,
  feiringsdato: string,
  patch: BursdagsbildeOppdatering,
) {
  const { error } = await admin
    .from('bursdagsbilde')
    .update(patch)
    .eq('profil_id', profilId)
    .eq('feiringsdato', feiringsdato)
  if (error) {
    await logg.feil('bursdagsbilde.generering.feilet', error, {
      fingerprint: 'db-update',
      ctx: { profil_id: profilId },
    })
  }
}

// Hent profilbildet server-side som rå bytes. Egen, streng validering her
// (ikke bare "stol på at bilde_url er trygt") fordi kilden kan være et
// eldre Supabase Storage-bilde eller en R2-URL vi ikke selv kontrollerte
// opplastings-valideringen av.
async function hentProfilbildeBytes(
  url: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(BURSDAGSBILDE_BUDSJETT_HENT_MS) })
  if (!res.ok) throw new Error(`Kunne ikke hente profilbilde: HTTP ${res.status}`)

  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!(mimeType in EXT_FRA_BILDE_MIME)) {
    throw new Error(`Ugyldig profilbilde-MIME: "${mimeType}"`)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  const maksBytes = BURSDAGSBILDE_INPUT_MAKS_MB * 1024 * 1024
  if (bytes.byteLength > maksBytes) {
    throw new Error(`Profilbilde for stort (${bytes.byteLength} bytes, maks ${maksBytes})`)
  }

  return { bytes, mimeType }
}

type Medgjest = { navn: string; bilde: { base64: string; mimeType: string } }

// Velg ut klubbkameratene som skal være med på bildet, og hent ansiktene
// deres. Utvalget er DETERMINISTISK for (bursdagsbarn, feiringsdato): et
// nytt forsøk etter en feilet generering skal gi samme følge, ellers ville
// «prøv igjen» stille byttet ut hvem som var med. Samtidig gir en ny
// feiringsdato et nytt utvalg, så samme mann ikke får de samme to
// kameratene år etter år.
//
// Hele funksjonen er FAIL-OPEN: bursdagsbildet er hovedsaken, medgjestene
// er pynt. Feiler oppslaget, eller har klubben for få menn med profilbilde,
// lages bildet med bursdagsbarnet alene — det er en tydelig dårligere
// grunn til å stå uten bilde på bursdagen sin enn å mangle en kompis i
// bakgrunnen. Feil logges, aldri svelges stille.
async function hentMedgjester(
  admin: Admin,
  bursdagsbarnId: string,
  feiringsdato: string,
): Promise<Medgjest[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, visningsnavn, navn, bilde_url')
    .eq('aktiv', true)
    .neq('id', bursdagsbarnId)
    .not('bilde_url', 'is', null)
    .order('id', { ascending: true })

  if (error) {
    await logg.feil('bursdagsbilde.medgjester.oppslag_feilet', error, {
      ctx: { profil_id: bursdagsbarnId },
    })
    return []
  }

  const kandidater = (data ?? []).filter(
    (p): p is typeof p & { bilde_url: string } => Boolean(p.bilde_url),
  )
  if (kandidater.length === 0) return []

  // Deterministisk rotasjon i stedet for en tilfeldighetsgenerator: start
  // på en indeks utledet av nøkkelen, og ta de neste N. Enkelt å resonnere
  // om, og gir ulikt utvalg per mann og per år uten noen lagret tilstand.
  const start = Math.abs(hashKode(`${bursdagsbarnId}:${feiringsdato}`)) % kandidater.length
  const valgt = Array.from(
    { length: Math.min(MEDGJESTER_MAKS_ANTALL, kandidater.length) },
    (_, i) => kandidater[(start + i) % kandidater.length],
  )

  const hentet: Medgjest[] = []
  for (const kandidat of valgt) {
    try {
      const bilde = await hentProfilbildeBytes(kandidat.bilde_url)
      hentet.push({
        navn: kandidat.visningsnavn || kandidat.navn,
        bilde: { base64: Buffer.from(bilde.bytes).toString('base64'), mimeType: bilde.mimeType },
      })
    } catch (e) {
      // Én kompis med ødelagt bilde skal ikke ta med seg den andre.
      await logg.feil('bursdagsbilde.medgjest.hent_feilet', e, {
        ctx: { profil_id: bursdagsbarnId, medgjest_id: kandidat.id },
      })
    }
  }
  return hentet
}

// Liten, stabil strenghash (FNV-1a-aktig). Kun til utvalgsrotasjonen over —
// ikke kryptografisk, og skal aldri brukes til noe som krever det.
function hashKode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

export type BursdagsbildeUtfall =
  | { utfall: 'hoppet' }
  | { utfall: 'ferdig'; bildeUrl: string }
  | { utfall: 'feilet' | 'avvist'; klasse: VertexFeilKlasse }

/**
 * Generer (eller regenerer) bursdagsbildet for én mann på én feiringsdato.
 * Nøkkelen (profil_id, feiringsdato) er allerede utledet av kalleren via
 * nesteFeiringsdato() i lib/bursdagsbilde.ts — eneste stedet datodelen
 * utledes, felles for cron og admin-flaten.
 */
export async function genererBursdagsbilde(
  admin: Admin,
  opts: {
    profil: { id: string; navn: string; bildeUrl: string; alder: number; stikkord: string[] }
    feiringsdato: string
    tvungen?: boolean
  },
): Promise<BursdagsbildeUtfall> {
  const { profil, feiringsdato, tvungen = false } = opts

  // 1. Lease-claim — se migrasjon 140 for hele resonnementet. 0 rader er
  // det vanlige, forventede utfallet på 3 av 4 slots (en annen invokasjon
  // har allerede raden, eller den er ferdig/terminal) — ikke en feil.
  const { data: claimRader, error: claimFeil } = await admin.rpc('krev_bursdagsbilde', {
    p_profil_id: profil.id,
    p_feiringsdato: feiringsdato,
    p_tvungen: tvungen,
  })

  if (claimFeil) {
    await logg.feil('bursdagsbilde.claim.feilet', claimFeil, { ctx: { profil_id: profil.id } })
    return { utfall: 'feilet', klasse: 'transient' }
  }
  if (!claimRader || claimRader.length === 0) return { utfall: 'hoppet' }

  const claimet = claimRader[0]
  const gammelUrl = claimet.bilde_url

  // 2. Hent profilbildet. Feiler dette, er det INPUT-en som er ugyldig, ikke
  // Vertex — klassifiseres som 'ugyldig'. Statusen utledes av
  // statusForFeilklasse() som alle andre feil, ikke hardkodes her: en
  // hardkodet 'avvist' ville gjort en ren timeout mot bilde-CDN-en
  // permanent, og ville dessuten drevet fra terminalitets-regelen den ene
  // dagen den regelen endres (den er bevisst løs inntil first light).
  let input: { bytes: Uint8Array; mimeType: string }
  try {
    input = await hentProfilbildeBytes(profil.bildeUrl)
  } catch (e) {
    await logg.feil('bursdagsbilde.input.avvist', e, { ctx: { profil_id: profil.id } })
    const inputStatus = statusForFeilklasse('ugyldig')
    await oppdaterRad(admin, profil.id, feiringsdato, {
      status: inputStatus,
      siste_feil: `input: ${feilTekst(e)}`,
    })
    return { utfall: inputStatus, klasse: 'ugyldig' }
  }

  // Medgjestene hentes ETTER bursdagsbarnets eget bilde: feiler det, er
  // hele genereringen ute uansett, og da er det bortkastet å laste ned to
  // bilder til.
  const medgjester = await hentMedgjester(admin, profil.id, feiringsdato)

  const prompt = byggBursdagsprompt({
    navn: profil.navn,
    alder: profil.alder,
    stikkord: profil.stikkord,
    medgjester: medgjester.map(m => m.navn),
  })

  // 3. Vertex-kallet.
  let bilde: Awaited<ReturnType<typeof genererBildeVertex>>
  try {
    bilde = await genererBildeVertex({
      // Bursdagsbarnet FØRST — prompten viser til «the first reference
      // photo» for ham og til de neste for medgjestene, i denne rekkefølgen.
      bilder: [
        { base64: Buffer.from(input.bytes).toString('base64'), mimeType: input.mimeType },
        ...medgjester.map(m => m.bilde),
      ],
      prompt,
      signal: AbortSignal.timeout(BURSDAGSBILDE_BUDSJETT_MODELL_MS),
    })
    // Logg størrelse og mimeType på det vi faktisk fikk — nettopp det man
    // trenger å se ved first light, når verken modell-ID, request-form eller
    // svarform er verifisert mot en ekte konto. Ingen PII: bare tall og
    // MIME-type, aldri prompt eller bytes. Vi KASTER ikke på uventede
    // verdier (vi bestilte 4:3/1K, men verifiserer ikke at leverandøren
    // overholdt det — se docs/ai-act-vurdering.md).
    // logg.warn er appens eneste ikke-Sentry stdout-kanal (lib/logg.ts) —
    // brukt her bevisst for en ren observability-linje, ikke fordi noe er galt.
    logg.warn('bursdagsbilde.generering.levert', {
      profil_id: profil.id,
      bytes: bilde.bytes.byteLength,
      mime_type: bilde.mimeType,
      modell: bilde.modell,
    })
  } catch (e) {
    const klasse: VertexFeilKlasse = e instanceof VertexFeil ? e.klasse : 'transient'
    const status = statusForFeilklasse(klasse)
    const sisteFeil =
      e instanceof VertexFeil ? `${klasse} ${e.status}: ${e.kropp}` : feilTekst(e)
    await logg.feil('bursdagsbilde.generering.feilet', e, {
      fingerprint: klasse,
      ctx: { profil_id: profil.id, klasse },
    })
    await oppdaterRad(admin, profil.id, feiringsdato, { status, siste_feil: sisteFeil })
    return { utfall: status, klasse }
  }

  // 4. R2-opplasting. Rå bytes, INGEN re-encoding — bevisst unntak fra
  // klient-komprimeringen i Policy: Bildelagring (som gjelder klient-
  // opplastinger av ekte fotografier). Et generert bilde skal beholde
  // SynthID-vannmerket i pikseldataen; enhver reprosessering (skalering,
  // JPEG-re-encoding) risikerer å ødelegge det umerkelig for øyet.
  const ext = EXT_FRA_BILDE_MIME[bilde.mimeType] ?? 'png'
  const sti = bildeSti('bursdagsbilder', nyttR2Filnavn(ext))
  let nyUrl: string
  try {
    nyUrl = await lastOppR2(sti, bilde.bytes, bilde.mimeType, {
      signal: AbortSignal.timeout(BURSDAGSBILDE_BUDSJETT_R2_MS),
    })
  } catch (e) {
    await logg.feil('bursdagsbilde.generering.feilet', e, {
      fingerprint: 'r2',
      ctx: { profil_id: profil.id },
    })
    await oppdaterRad(admin, profil.id, feiringsdato, {
      status: 'feilet',
      siste_feil: `r2: ${feilTekst(e)}`,
    })
    return { utfall: 'feilet', klasse: 'transient' }
  }

  // 5. Oppdater raden til 'ferdig'.
  const { error: oppdaterFeil } = await admin
    .from('bursdagsbilde')
    .update({ status: 'ferdig', bilde_url: nyUrl, prompt, modell: bilde.modell, siste_feil: null })
    .eq('profil_id', profil.id)
    .eq('feiringsdato', feiringsdato)

  if (oppdaterFeil) {
    await logg.feil('bursdagsbilde.generering.feilet', oppdaterFeil, {
      fingerprint: 'db-update',
      ctx: { profil_id: profil.id },
    })
    // Bildet ER generert og ligger i R2, men raden ble ikke oppdatert til å
    // peke på det — rydd opp det ferske, ubrukte objektet fremfor å la det
    // henge foreldreløst i bucket-en.
    // Husets regel (CLAUDE.md § Policy: Side-effekter ved sidelast): aldri
    // en tom lambda. Feiler også oppryddingen, ligger det et foreldreløst
    // KI-generert ansiktsbilde i R2 som ingen rad peker på — og det er
    // nøyaktig det vi må kunne finne igjen i loggen.
    await slettR2(sti).catch((e: unknown) =>
      logg
        .feil('bursdagsbilde.slett.feilet', e, {
          fingerprint: 'opprydding',
          ctx: { profil_id: profil.id, sti },
        })
        .catch(() => {}),
    )
    return { utfall: 'feilet', klasse: 'transient' }
  }

  // 6. Ved ERSTATNING: slett det gamle R2-objektet ETTER at raden peker på
  // det nye. Motsatt rekkefølge kan miste et fungerende bilde hvis noe
  // feiler mellom slett og oppdater.
  if (gammelUrl) {
    const gammelSti = r2StiFraUrl(gammelUrl)
    if (gammelSti) {
      // Dobbel catch (husets mønster, jf. oppryddingsgrenen over): logg.feil()
      // returnerer en promise, og uten den ytre catch-en ville en feilende
      // logging boblet ut ETTER at raden alt står som 'ferdig' — en vellykket
      // generering ville blitt rapportert som feilet til kalleren.
      await slettR2(gammelSti).catch((e: unknown) =>
        logg
          .feil('bursdagsbilde.slett.feilet', e, {
            ctx: { profil_id: profil.id, sti: gammelSti },
          })
          .catch(() => {}),
      )
    }
  }

  return { utfall: 'ferdig', bildeUrl: nyUrl }
}
