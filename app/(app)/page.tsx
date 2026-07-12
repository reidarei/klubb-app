import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import { formaterDato, norskAar, norskDatoNaa, norskDatoNokkel, iDagOslo } from '@/lib/dato'
import { subMonths } from 'date-fns'
import SectionLabel from '@/components/ui/SectionLabel'
import PushPaaminnelse from './PushPaaminnelse'
import HighlightKort from '@/components/agenda/HighlightKort'
import ArrangementKort from '@/components/agenda/ArrangementKort'
import UtkastKort from '@/components/agenda/UtkastKort'
import BursdagKort from '@/components/agenda/BursdagKort'
import KlubbJubileumKort from '@/components/agenda/KlubbJubileumKort'
import InnspillKnapp from '@/components/agenda/InnspillKnapp'
import PollKort from '@/components/agenda/PollKort'
import MeldingKort from '@/components/agenda/MeldingKort'
import NyFAB from '@/components/agenda/NyFAB'
import MiniKalender from '@/components/agenda/MiniKalender'
import RsvpInline from '@/components/agenda/RsvpInline'
import { byggAgenda } from '@/lib/agenda-sortering'
import { kanAdministrere } from '@/lib/roller'
import { hentAgendaData } from '@/lib/queries/agenda'
import { AGENDA_VINDU_MND } from '@/lib/konstanter'

// Agenda-forsiden: henter rådata via hentAgendaData (lib/queries/agenda.ts)
// og delegerer all sortering/gruppering til lib/agenda-sortering.ts. Denne
// filen skal holdes tynn — kun fetch + render.
export default async function Forside() {
  const [user, supabase] = await Promise.all([
    getInnloggetBruker(),
    createServerClient(),
  ])

  const naa = norskDatoNaa()
  // Felles cutoff for alle element-typer på forsiden: AGENDA_VINDU_MND måneder
  // tilbake. Eldre vises via /tidligere (full historikk, paginert). Issue #176.
  const cutoff = subMonths(new Date(), AGENDA_VINDU_MND)
  const cutoffIso = cutoff.toISOString()
  const aar = norskAar()

  // Alle spørringer + rå-mapping bor i lib/queries/agenda.ts (#378).
  const {
    arrangementerBerikt,
    ansvar,
    profilerMedBursdag,
    poller,
    meldingerForAgenda,
    kommentarerPerArr,
    kommentarerPerPoll,
    kommentarerPerMelding,
    totaltPerArr,
    totaltPerPoll,
    chatProfiler,
  } = await hentAgendaData(supabase, { brukerId: user!.id, aar, cutoffIso })

  const { ubesvarte, meldinger, idag, kommende, tidligere } = byggAgenda({
    arrangementer: arrangementerBerikt,
    ansvar,
    profilerMedBursdag,
    poller,
    meldinger: meldingerForAgenda,
    meg: user!.id,
    naa,
    aar,
  })

  // Slå opp innlogget brukers profil fra aktive-profiler-lista (allerede hentet).
  // Brukes til rolle-sjekk (erAdmin) og til optimistisk kommentar-rad. (#312, #316)
  const minProfil = chatProfiler.find(p => p.id === user!.id)
  const minRolle = minProfil?.rolle ?? null
  // ChatProfil.navn er nullable; ArrangementKort.brukerNavn tar string | undefined.
  // Koalescér null → undefined så delt ChatProfil-kontrakt (#378-review) passer propen.
  const minNavn = minProfil?.navn ?? undefined
  const erAdmin = kanAdministrere(minRolle)

  // Unike dager med minst ett arrangement — brukes av MiniKalender (#429).
  // Ren in-memory map over allerede-hentede data; ingen ekstra spørring.
  const arrangementDatoer = [...new Set(
    arrangementerBerikt.map(a => norskDatoNokkel(a.start_tidspunkt))
  )]

  // Bursdager som MM-dd-nøkler (uten år — de gjentar seg årlig, og
  // kalenderen kan blas på tvers av år). fodselsdato er en date-kolonne
  // (yyyy-MM-dd), så slice(5) gir måned-dag direkte.
  const bursdagMMDD = [...new Set(
    profilerMedBursdag
      .filter(p => p.fodselsdato)
      .map(p => p.fodselsdato!.slice(5))
  )]

  // Header viser dagens norske dato: ukedag (eyebrow), dato (h1), "I dag" (label).
  // Følger M5-referansen fra #190.
  const naaIso = new Date().toISOString()
  const ukedag = formaterDato(naaIso, 'EEEE')
  const idagDato = formaterDato(naaIso, 'd. MMMM')

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          marginBottom: 26,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {ukedag}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 44,
              fontWeight: 400,
              letterSpacing: '-1px',
              lineHeight: 1,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            {idagDato}
          </h1>
        </div>

        {/* Mikro-kalenderen bor i luken mellom dato-blokka og NyFAB (#429) */}
        <MiniKalender arrangementDatoer={arrangementDatoer} bursdagMMDD={bursdagMMDD} iDag={iDagOslo()} />

        <NyFAB />
      </header>

      <PushPaaminnelse />

      {/* Ubesvarte fremtidige arrangementer — vises øverst som påminnelse (#271).
          Hvert kort er en vanlig <Link> med en RsvpInline-rad rett under.
          RsvpInline ligger *utenfor* <Link> for å unngå nested-button-i-link-feil.
          Arrangementet forsvinner herfra (og dukker opp i Kommende/I kveld) så
          snart revalidatePath('/') kjøres etter at svaret er lagret. */}
      {ubesvarte.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Ikke svart ennå</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ubesvarte.map(i => {
              if (i.kind !== 'arrangement') return null
              return (
                // Wrapper med overflow:hidden klipper bort bunnavrunding på kortet
                // og lar RsvpInline fylle ut bunnen — de to elementene ser da ut
                // som ett sammenhengende kort (#271).
                <div
                  key={i.data.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                    // Accent-outline + halo signaliserer "her må du gjøre noe" (#275)
                    border: '1px solid var(--accent)',
                    boxShadow: '0 0 0 4px var(--accent-soft)',
                  }}
                >
                  <ArrangementKort
                    arr={i.data}
                    visKommentarer={false}
                  />
                  {/* RsvpInline sitter utenfor <Link> i ArrangementKort slik at
                      knapp-klikk ikke trigger navigasjon. Wrapperens overflow:hidden
                      sørger for at bunnavrundingen kuttes riktig. */}
                  <RsvpInline arrangementId={i.data.id} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Levende meldinger — fjerde element-type, øverst på agenda */}
      {meldinger.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Nytt fra gutta</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meldinger.map(i => {
              if (i.kind !== 'melding') return null
              return (
                <MeldingKort
                  key={i.data.id}
                  melding={i.data}
                  brukerId={user!.id}
                  kommentarer={kommentarerPerMelding.get(i.data.id) ?? []}
                  profiler={chatProfiler}
                  erAdmin={erAdmin}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* I kveld */}
      {idag.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>
            I kveld · {formaterDato(idag[0].sortIso!, 'd. MMMM').toLowerCase()}
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {idag.map(i => {
              if (i.kind === 'highlight') return <HighlightKort key={i.data.id} arr={i.data} />
              if (i.kind === 'bursdag') return <BursdagKort key={i.data.id} bursdag={i.data} />
              if (i.kind === 'klubbjubileum') return <KlubbJubileumKort key={i.data.id} jubileum={i.data} />
              if (i.kind === 'utkast') return <UtkastKort key={i.data.id} utkast={i.data} meg={user!.id} />
              if (i.kind === 'poll')
                return <PollKort key={i.data.id} poll={i.data} kommentarer={kommentarerPerPoll.get(i.data.id) ?? []} totaltKommentarer={totaltPerPoll.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} />
              if (i.kind === 'arrangement')
                return <ArrangementKort key={i.data.id} arr={i.data} kommentarer={kommentarerPerArr.get(i.data.id) ?? []} totaltKommentarer={totaltPerArr.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} brukerNavn={minNavn} brukerBildeUrl={minProfil?.bilde_url} brukerRolle={minRolle} />
              // Meldinger plasseres kun i toppseksjonen (eller Tidligere) — ikke her
              return null
            })}
          </div>
        </section>
      )}

      {/* Kommende */}
      <section style={{ marginBottom: 20 }}>
        <SectionLabel>Kommende</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {kommende.map(i => {
            if (i.kind === 'arrangement')
              return <ArrangementKort key={i.data.id} arr={i.data} kommentarer={kommentarerPerArr.get(i.data.id) ?? []} totaltKommentarer={totaltPerArr.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} brukerNavn={minNavn} brukerBildeUrl={minProfil?.bilde_url} brukerRolle={minRolle} />
            if (i.kind === 'bursdag') return <BursdagKort key={i.data.id} bursdag={i.data} />
            if (i.kind === 'klubbjubileum') return <KlubbJubileumKort key={i.data.id} jubileum={i.data} />
            if (i.kind === 'utkast') return <UtkastKort key={i.data.id} utkast={i.data} meg={user!.id} />
            if (i.kind === 'poll')
              return <PollKort key={i.data.id} poll={i.data} kommentarer={kommentarerPerPoll.get(i.data.id) ?? []} totaltKommentarer={totaltPerPoll.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} />
            if (i.kind === 'highlight') return <HighlightKort key={i.data.id} arr={i.data} />
            // Meldinger plasseres kun i toppseksjonen eller Tidligere
            return null
          })}
          {kommende.length === 0 && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.5px',
                margin: '8px 0',
              }}
            >
              Ingen planlagte sammenkomster.
            </p>
          )}
        </div>
      </section>

      {/* Innspill */}
      <InnspillKnapp />

      {/* Tidligere */}
      {tidligere.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Tidligere</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tidligere.map(t => {
              if (t.kind === 'arrangement')
                return <ArrangementKort key={t.data.id} arr={t.data} tidligere />
              if (t.kind === 'poll') return <PollKort key={t.data.id} poll={t.data} tidligere />
              return <MeldingKort key={t.data.id} melding={t.data} brukerId={user!.id} erAdmin={erAdmin} />
            })}
          </div>
          <Link
            href="/tidligere"
            style={{
              display: 'block',
              marginTop: 16,
              padding: '10px 14px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              border: '0.5px solid var(--border)',
              borderRadius: 999,
              textDecoration: 'none',
            }}
          >
            Se hele historikken →
          </Link>
        </section>
      )}
    </div>
  )
}
