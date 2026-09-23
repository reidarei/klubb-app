'use server'

import { revalidatePath } from 'next/cache'
import { ensureInnlogget } from '@/lib/auth'
import { lastOppR2, slettR2, r2StiFraUrl } from '@/lib/r2'
import { albumSti, EXT_FRA_BILDE_MIME, nyttR2Filnavn } from '@/lib/bilde-utils'
import { logg } from '@/lib/logg'

// Album-server actions. Bilder lastes opp via egen flyt: klient komprimerer
// både hovedbilde og thumbnail, server tar imot begge i samme call og lagrer
// dem under `album/{album_id}/...` i R2 + en rad i album_bilde. Filnavn
// genereres server-side fra validert MIME — klient-oppgitt navn ignoreres.

const MAKS_BYTES = 5 * 1024 * 1024
// Egen, strammere grense for thumbnail. En thumb er en 400px-avledning
// (JPEG q0.85, typisk <150 KB) — er blobben større enn dette er den per
// definisjon ikke en gyldig thumb, og skal avvises før opplasting.
const MAKS_THUMB_BYTES = 1 * 1024 * 1024
// Utled tillatte MIME-typer fra EXT_FRA_BILDE_MIME i stedet for å hardkode
// dem — samme mønster som bilde-opplasting.ts. Garanterer at hver godkjent
// MIME har en kjent ext, så `ext` aldri blir undefined → filnavn `...undefined`.
const TILLATTE_TYPER = Object.keys(EXT_FRA_BILDE_MIME)

export async function opprettAlbum(input: {
  tittel: string
  arrangementId?: string | null
}): Promise<{ id: string }> {
  const { supabase, user } = await ensureInnlogget()
  const tittel = input.tittel.trim()
  if (!tittel) throw new Error('Tittel kan ikke være tom')

  const { data, error } = await supabase
    .from('album')
    .insert({
      tittel,
      arrangement_id: input.arrangementId ?? null,
      opprettet_av: user.id,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Kunne ikke opprette album')

  if (input.arrangementId) revalidatePath(`/arrangementer/${input.arrangementId}`)
  revalidatePath('/')
  return { id: data.id }
}

export async function lastOppAlbumBilde(formData: FormData): Promise<{ id: string; url: string }> {
  const { supabase, user } = await ensureInnlogget()

  const albumId = formData.get('albumId')
  const fil = formData.get('fil')
  const thumb = formData.get('thumb')
  const breddeRaw = formData.get('bredde')
  const hoydeRaw = formData.get('hoyde')

  if (typeof albumId !== 'string' || !albumId) throw new Error('Mangler albumId')
  if (!(fil instanceof File)) throw new Error('Mangler fil')
  if (fil.size > MAKS_BYTES) throw new Error(`Filen er for stor (maks ${MAKS_BYTES / 1024 / 1024} MB)`)
  if (!TILLATTE_TYPER.includes(fil.type)) throw new Error('Ugyldig filtype')

  const bredde = breddeRaw ? parseInt(String(breddeRaw)) : null
  const hoyde = hoydeRaw ? parseInt(String(hoydeRaw)) : null

  // Filnavn genereres server-side fra validert MIME. albumSti validerer
  // at albumId er UUID og filnavn er lovlig — begge kan komme fra klient.
  const ext = EXT_FRA_BILDE_MIME[fil.type]
  const filnavn = nyttR2Filnavn(ext)
  const sti = albumSti(albumId, filnavn)

  const data = new Uint8Array(await fil.arrayBuffer())
  const url = await lastOppR2(sti, data, fil.type)

  let thumbUrl: string | null = null
  if (thumb instanceof File && thumb.size > 0) {
    // Thumb kommer også fra FormData og kan ikke stoles på — valider størrelse
    // og type før opplasting, samme mønster som hovedbildet over. Uten dette
    // kunne en innlogget bruker laste opp en vilkårlig stor/ugyldig blob under
    // vår R2-nøkkel. Semantikken «thumb er valgfri» bevares: er thumb tom eller
    // fraværende hoppes blokka over (thumbUrl forblir null).
    if (thumb.size > MAKS_THUMB_BYTES) {
      throw new Error(`Thumbnail er for stor (maks ${MAKS_THUMB_BYTES / 1024 / 1024} MB)`)
    }
    // Krev jpeg spesifikt: lagThumbnail() produserer alltid jpeg, og vi lagrer
    // med .jpg-nøkkel + Content-Type image/jpeg. Å godta png/webp her ville
    // lagre de bytene bak en jpeg-etikett (endelse/Content-Type-mismatch).
    if (thumb.type !== 'image/jpeg') throw new Error('Ugyldig thumbnail-filtype (må være JPEG)')
    const thumbData = new Uint8Array(await thumb.arrayBuffer())
    // lagThumbnail() produserer alltid image/jpeg, så thumb-nøkkelen får sin
    // egen `.jpg`-endelse — ikke hovedbildets ext. Ellers kunne et png/webp-
    // hovedbilde gi thumb-nøkkel `...thumb_....png` med jpeg-innhold (endelse
    // ↔ Content-Type-mismatch). Eget random-suffiks + thumb_-prefiks holder
    // nøkkelen distinkt fra hovedbildet.
    const thumbSti = albumSti(albumId, 'thumb_' + nyttR2Filnavn('jpg'))
    thumbUrl = await lastOppR2(thumbSti, thumbData, 'image/jpeg')
  }

  const { data: rad, error } = await supabase
    .from('album_bilde')
    .insert({
      album_id: albumId,
      bilde_url: url,
      thumb_url: thumbUrl,
      bredde,
      hoyde,
      lastet_opp_av: user.id,
    })
    .select('id')
    .single()

  if (error || !rad) {
    // Rydd opp R2-objekter hvis DB-insert feilet
    await slettR2(sti).catch(() => {})
    if (thumbUrl) {
      const thumbSti = r2StiFraUrl(thumbUrl)
      if (thumbSti) await slettR2(thumbSti).catch(() => {})
    }
    throw new Error(error?.message ?? 'Kunne ikke registrere bildet')
  }

  // Bumper oppdatert på album så agendakort kan reflektere endring
  await supabase.from('album').update({ oppdatert: new Date().toISOString() }).eq('id', albumId)

  // Første opplastede bilde blir albumets omslag automatisk (#463) — sørger for
  // at innleggskort alltid har et cover å vise. `.is('cover_bilde_id', null)`
  // gjør settingen betinget: et manuelt valgt omslag (via lightbox) overskrives
  // aldri, og ved parallell opplasting (AlbumOpplaster kjører 3 samtidige
  // workers) vinner én rad — resten blir no-op.
  await supabase
    .from('album')
    .update({ cover_bilde_id: rad.id })
    .eq('id', albumId)
    .is('cover_bilde_id', null)

  revalidatePath(`/album/${albumId}`)
  return { id: rad.id, url }
}

export async function oppdaterAlbumTittel(id: string, tittel: string): Promise<void> {
  const { supabase } = await ensureInnlogget()
  const ny = tittel.trim()
  if (!ny) throw new Error('Tittel kan ikke være tom')
  if (ny.length > 200) throw new Error('Tittel er for lang')

  const { error } = await supabase
    .from('album')
    .update({ tittel: ny, oppdatert: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/album/${id}`)
  revalidatePath('/album')
}

export async function settOmslagsbilde(albumId: string, bildeId: string): Promise<void> {
  const { supabase } = await ensureInnlogget()

  // Verifiser at bildet faktisk tilhører albumet — uten denne sjekken kunne
  // en bruker som kjenner et annet albums bildeId sette det som cover her.
  // FK-en alene garanterer kun at bildeId eksisterer som album_bilde-rad.
  // Feil hentes eksplisitt: uten den ville en DB-feil her blitt tolket som
  // «hører ikke til», en sikkerhetsrelevant feilmelding som rett og slett
  // ikke stemmer — brukeren ville trodd tilhørigheten var sjekket og avvist.
  const { data: bilde, error: bildeFeil } = await supabase
    .from('album_bilde')
    .select('album_id')
    .eq('id', bildeId)
    .maybeSingle()
  if (bildeFeil) throw new Error(`Kunne ikke sjekke bildets album: ${bildeFeil.message}`)
  if (!bilde || bilde.album_id !== albumId) {
    throw new Error('Bildet hører ikke til dette albumet')
  }

  const { error } = await supabase
    .from('album')
    .update({ cover_bilde_id: bildeId, oppdatert: new Date().toISOString() })
    .eq('id', albumId)
  if (error) throw new Error(error.message)

  // Sjekk arrangement-id for revalidering. Oppdateringen over er alt
  // committet — feiler dette oppslaget mister vi kun én revalidatePath-linje
  // (arrangement-siden viser nytt omslag ved neste naturlige revalidering),
  // ikke selve mutasjonen. Fail-open med logging, ikke kast.
  const { data: album, error: albumFeil } = await supabase
    .from('album')
    .select('arrangement_id')
    .eq('id', albumId)
    .maybeSingle()
  if (albumFeil) await logg.feil('album.revalidering.oppslag.feilet', albumFeil)

  revalidatePath(`/album/${albumId}`)
  revalidatePath('/album')
  revalidatePath('/')
  if (album?.arrangement_id) revalidatePath(`/arrangementer/${album.arrangement_id}`)
}

export async function slettAlbumBilde(bildeId: string): Promise<void> {
  const { supabase } = await ensureInnlogget()

  // Hent URL-er + albumId før delete så vi kan rydde i R2 etterpå. Feil
  // hentes eksplisitt: uten den ville en DB-feil her sett identisk ut som
  // «bildet finnes ikke lenger» (samme `!bilde`-gren) og latt funksjonen
  // returnere stille — kalleren ville trodd bildet var slettet, mens
  // ingenting skjedde.
  const { data: bilde, error: bildeFeil } = await supabase
    .from('album_bilde')
    .select('bilde_url, thumb_url, album_id')
    .eq('id', bildeId)
    .maybeSingle()
  if (bildeFeil) throw new Error(`Kunne ikke hente bildet for sletting: ${bildeFeil.message}`)

  if (!bilde) return

  const { error } = await supabase.from('album_bilde').delete().eq('id', bildeId)
  if (error) throw new Error(error.message)

  // Best-effort opprydding i R2
  const s1 = r2StiFraUrl(bilde.bilde_url)
  if (s1) await slettR2(s1).catch(() => {})
  if (bilde.thumb_url) {
    const s2 = r2StiFraUrl(bilde.thumb_url)
    if (s2) await slettR2(s2).catch(() => {})
  }

  // Sjekk arrangement-id for revalidering. Sletting er alt committet over —
  // samme fail-open-begrunnelse som i settOmslagsbilde: vi mister høyst én
  // revalidatePath-linje, ikke selve slettingen.
  const { data: album, error: albumFeil } = await supabase
    .from('album')
    .select('arrangement_id')
    .eq('id', bilde.album_id)
    .maybeSingle()
  if (albumFeil) await logg.feil('album.revalidering.oppslag.feilet', albumFeil)

  revalidatePath(`/album/${bilde.album_id}`)
  revalidatePath('/album')
  revalidatePath('/')
  if (album?.arrangement_id) revalidatePath(`/arrangementer/${album.arrangement_id}`)
}

export async function slettAlbum(id: string): Promise<void> {
  const { supabase } = await ensureInnlogget()

  // Hent alle bilder for å rydde R2 før vi sletter raden (cascade tar DB).
  // Fail-open med logging, ikke kast: konsekvensen av en feilet spørring her
  // er orphanede R2-objekter (rydder seg ikke selv, men korrupter ingen data)
  // — å blokkere hele slettingen av et album pga. usikker opprydding er verre.
  const { data: bilder, error: bilderFeil } = await supabase
    .from('album_bilde')
    .select('bilde_url, thumb_url')
    .eq('album_id', id)
  if (bilderFeil) await logg.feil('album.slett.bilder_oppslag.feilet', bilderFeil)

  // Kun til revalidatePath under — samme fail-open-begrunnelse som ellers i fila.
  const { data: album, error: albumFeil } = await supabase
    .from('album')
    .select('arrangement_id')
    .eq('id', id)
    .maybeSingle()
  if (albumFeil) await logg.feil('album.revalidering.oppslag.feilet', albumFeil)

  const { error } = await supabase.from('album').delete().eq('id', id)
  if (error) throw new Error(error.message)

  // Best-effort opprydding i R2
  for (const b of bilder ?? []) {
    const s1 = r2StiFraUrl(b.bilde_url)
    if (s1) await slettR2(s1).catch(() => {})
    if (b.thumb_url) {
      const s2 = r2StiFraUrl(b.thumb_url)
      if (s2) await slettR2(s2).catch(() => {})
    }
  }

  if (album?.arrangement_id) revalidatePath(`/arrangementer/${album.arrangement_id}`)
  revalidatePath('/')
}

// Reaksjoner per bilde i lightboxen (#480). Egen tabell album_bilde_reaksjon —
// sammensatt PK (bilde_id, profil_id) håndhever «én reaksjon per bruker»
// direkte, så bytte av emoji gjøres som delete+insert (samme mønster som
// leggTilMeldingReaksjon i meldinger.ts). Ingen revalidatePath: reaksjoner
// vises kun i lightboxen på album-siden, og useReaksjoner-hooken kaller
// router.refresh() selv etter mutasjonen.
export async function leggTilAlbumBildeReaksjon(bildeId: string, emoji: string) {
  const { supabase, user } = await ensureInnlogget()

  const { error: sletteFeil } = await supabase
    .from('album_bilde_reaksjon')
    .delete()
    .eq('bilde_id', bildeId)
    .eq('profil_id', user.id)

  if (sletteFeil) throw new Error(sletteFeil.message)

  const { error: innsettingFeil } = await supabase
    .from('album_bilde_reaksjon')
    .insert({ bilde_id: bildeId, profil_id: user.id, emoji })

  if (innsettingFeil) throw new Error(innsettingFeil.message)
}

export async function fjernAlbumBildeReaksjon(bildeId: string, emoji: string) {
  const { supabase, user } = await ensureInnlogget()

  const { error } = await supabase
    .from('album_bilde_reaksjon')
    .delete()
    .eq('bilde_id', bildeId)
    .eq('profil_id', user.id)
    .eq('emoji', emoji)

  if (error) throw new Error(error.message)
}
