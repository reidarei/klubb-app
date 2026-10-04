'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  oppdaterMedlemAdmin,
  slettMedlem,
  settGeneralsekretaer,
  fjernGeneralsekretaer,
} from '@/lib/actions/profil'
import { VALGBARE_ROLLER, tittelFor, kanAdministrere, type Rolle } from '@/lib/roller'
import SkjemaBar from '@/components/ui/SkjemaBar'
import { SkjemaGruppe, SkjemaRad, RadInput, DatoFelt, ValgFelt, TekstRad } from '@/components/ui/Skjema'
import { ToggleRad } from '@/components/ui/ToggleSwitch'
import { STIKKORD_MAKS_LENGDE, MATALLERGIER_MAKS_LENGDE } from '@/lib/konstanter'

type Medlem = {
  id: string
  navn: string
  visningsnavn: string
  epost: string
  telefon: string | null
  rolle: string
  aktiv: boolean
  fodselsdato: string | null
  faar_issue_varsler: boolean
  faar_feilvarsler: boolean
  stikkord: string | null
  matallergier: string | null
}

type NaavaerendeGeneralsekretaer = { id: string; navn: string } | null

export default function RedigerMedlemSkjema({
  medlem,
  naavaerendeGeneralsekretaer,
}: {
  medlem: Medlem
  naavaerendeGeneralsekretaer: NaavaerendeGeneralsekretaer
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [navn, setNavn] = useState(medlem.navn)
  const [visningsnavn, setVisningsnavn] = useState(medlem.visningsnavn)
  const [telefon, setTelefon] = useState(medlem.telefon ?? '')
  const [fodselsdato, setFodselsdato] = useState(medlem.fodselsdato ?? '')
  const [stikkord, setStikkord] = useState(medlem.stikkord ?? '')
  const [matallergier, setMatallergier] = useState(medlem.matallergier ?? '')

  // Valgbare roller (Segment): bare 'medlem' og 'admin'.
  // Generalsekretær-rollen styres av ToggleSwitch nedenfor.
  const erValgbar = (VALGBARE_ROLLER as string[]).includes(medlem.rolle)
  const [rolle, setRolle] = useState<Rolle>(
    // For valgbare roller (medlem/admin): bruk DB-rollen direkte.
    // For andre (i praksis 'generalsekretaer'): velg admin/medlem basert på
    // om rollen har admin-rettigheter. Bruker kanAdministrere() i stedet for
    // hardkodet 'admin' så fremtidige roller med admin-rettigheter speiles
    // riktig i Segmentet uten å måtte huske å oppdatere denne linja.
    erValgbar ? (medlem.rolle as Rolle) : (kanAdministrere(medlem.rolle) ? 'admin' : 'medlem'),
  )
  const [aktiv, setAktiv] = useState<'aktiv' | 'deaktivert'>(
    medlem.aktiv ? 'aktiv' : 'deaktivert',
  )

  // GS-toggle: init fra om dette medlemmet er sittende GS.
  const [erGeneralsekretaer, setErGeneralsekretaer] = useState(
    medlem.rolle === 'generalsekretaer',
  )

  // To uavhengige varsel-brytere, begge admin-styrt per medlem, uavhengig av
  // rolle: innspill (migrasjon 104) og feilalarm (migrasjon 123). Delt i to
  // fordi de dekker helt ulike ting.
  const [faarIssueVarsler, setFaarIssueVarsler] = useState(medlem.faar_issue_varsler)
  const [faarFeilvarsler, setFaarFeilvarsler] = useState(medlem.faar_feilvarsler)

  // handleToggleGs kalles av ToggleSwitch — confirm skjer her, ikke ved submit.
  function handleToggleGs(nyVerdi: boolean) {
    if (nyVerdi) {
      // Toggle på: enten flytte tittelen fra eksisterende GS, eller ny GS.
      // Sjekk om en annen person allerede er GS (kan ikke være seg selv her
      // fordi da ville erGeneralsekretaer vært true og nyVerdi false).
      const annenGs = naavaerendeGeneralsekretaer?.id !== medlem.id
        ? naavaerendeGeneralsekretaer
        : null

      const beskjed = annenGs
        ? `Flytte generalsekretær-tittelen fra ${annenGs.navn} til ${medlem.navn}? ${annenGs.navn} blir admin og mister tittelen.`
        : `Gjøre ${medlem.navn} til generalsekretær?`

      if (!confirm(beskjed)) return  // bruker avbrøt → ikke toggle
    } else {
      // Toggle av: kun mulig hvis dette medlemmet faktisk er GS.
      if (!confirm(`Fjerne generalsekretær-tittelen fra ${medlem.navn}? Klubben står da uten generalsekretær.`)) return
    }
    setErGeneralsekretaer(nyVerdi)
  }

  async function handleLagre() {
    startTransition(async () => {
      // handleLagre-rekkefølge:
      //
      // 1. Oppdater navn/telefon/aktiv/rolle FØRST. Hvis dette feiler så er
      //    ingen GS-endring gjort ennå — vi ender ikke i den ekle tilstanden
      //    hvor GS er stille demotert mens resten av skjemaet rullet tilbake.
      //    Når DB-rolle er 'generalsekretaer' utelater oppdaterMedlemAdmin
      //    rolle-feltet helt (defensiv invariant i actionen), så det er trygt
      //    å kalle med rolle='admin'/'medlem' selv om personen er GS.
      //
      // 2. Fjern GS-tittel hvis dette medlemmet er GS og skal slutte å være det.
      //    Etter dette er DB ren for et evt. steg 3.
      //
      // 3. Sett GS-tittel hvis toggle er på. Partial unique index kan fortsatt
      //    feile med 23505 hvis en annen admin satte ny GS i mellomtiden —
      //    klienten viser da reaktiv confirm med oppdatert innehavernavn.

      const skalFjernes = medlem.rolle === 'generalsekretaer' && !erGeneralsekretaer
      const skalSettes  = erGeneralsekretaer && medlem.rolle !== 'generalsekretaer'

      // Steg 1: oppdater øvrige felter. Send 'admin' når personen er GS i DB
      // (Segment kan ikke vise 'generalsekretaer'); actionen ignorerer feltet
      // i bevaringsgrenen. Etter evt. steg 2 settes 'admin' uansett av RPC-en.
      await oppdaterMedlemAdmin(medlem.id, {
        navn,
        visningsnavn: visningsnavn || navn,
        telefon,
        rolle,
        aktiv: aktiv === 'aktiv',
        fodselsdato: fodselsdato || undefined,
        faar_issue_varsler: faarIssueVarsler,
        faar_feilvarsler: faarFeilvarsler,
        stikkord,
        matallergier,
      })

      // Steg 2: fjern GS-tittel (om nødvendig).
      // Vi sender medlem.id som forventet profil — RPC-en avbryter hvis
      // sittende GS ikke matcher (en annen admin har flyttet tittelen i
      // mellomtiden). Da viser vi en pen melding heller enn å demotere
      // feil person.
      if (skalFjernes) {
        const res = await fjernGeneralsekretaer(medlem.id)
        if (!res.ok) {
          if (res.kode === 'race_mismatch') {
            alert(
              `${medlem.navn} er ikke generalsekretær lenger — en annen admin har flyttet tittelen siden du åpnet siden. Last siden på nytt for oppdatert status.`,
            )
          } else {
            alert(`Feil ved fjerning av generalsekretær: ${res.melding}`)
          }
          return
        }
      }

      // Steg 3: sett GS-tittel (om nødvendig)
      if (skalSettes) {
        const res = await settGeneralsekretaer(medlem.id)
        if (!res.ok) {
          if (res.kode === 'generalsekretaer_finnes') {
            // Race-tilstand: en annen admin satte en ny GS i mellomtiden.
            // Spør på nytt med oppdatert innehavernavn.
            const bekreft = confirm(
              `${res.innehaver.navn} ble nettopp satt som generalsekretær av en annen admin. Vil du likevel flytte tittelen til ${medlem.navn}? ${res.innehaver.navn} blir admin og mister tittelen.`
            )
            if (bekreft) {
              const res2 = await settGeneralsekretaer(medlem.id)
              if (!res2.ok) {
                // Andre forsøk feilet også. Skill ut race-tilfellet for å
                // unngå en uendelig retry-loop og gi en konkret melding.
                const melding = res2.kode === 'generalsekretaer_finnes'
                  ? `En annen admin satte ${res2.innehaver.navn} som generalsekretær igjen. Last siden på nytt og prøv om ønskelig.`
                  : `Feil ved bytte av generalsekretær: ${res2.melding}`
                alert(melding)
                return
              }
            } else {
              // Bruker sa nei — naviger tilbake uten GS-endring
              router.push(`/klubbinfo/medlemmer/${medlem.id}`)
              router.refresh()
              return
            }
          } else {
            alert(`Feil ved setting av generalsekretær: ${res.melding}`)
            return
          }
        }
      }

      // Vis kvittering og naviger tilbake
      router.push(`/klubbinfo/medlemmer/${medlem.id}`)
      router.refresh()
    })
  }

  function handleSlett() {
    if (!confirm(`Slette ${medlem.navn}? Dette kan ikke angres.`)) return
    startTransition(() => slettMedlem(medlem.id))
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Rediger"
        tittel={medlem.navn}
        onAvbryt={() => router.push(`/klubbinfo/medlemmer/${medlem.id}`)}
        onLagre={handleLagre}
        laster={isPending}
      />

      {/* Personalia */}
      <SkjemaGruppe tittel="Personalia">
        <SkjemaRad etikett="Navn">
          <RadInput type="text" value={navn} onChange={e => setNavn(e.target.value)} required aria-label="Navn" />
        </SkjemaRad>
        <SkjemaRad etikett="Visningsnavn">
          <RadInput
            type="text"
            value={visningsnavn}
            onChange={e => setVisningsnavn(e.target.value)}
            placeholder={navn}
            aria-label="Visningsnavn"
          />
        </SkjemaRad>
        <SkjemaRad etikett="Fødselsdato">
          <DatoFelt value={fodselsdato} onChange={e => setFodselsdato(e.target.value)} aria-label="Fødselsdato" />
        </SkjemaRad>
        {/* «Ikke satt», ikke et eksempel med komma: stikkord er fritekst
            siden #685, og den gamle placeholderen antydet et listeformat
            som ikke lenger finnes. Samme tekst som i medlemmets eget skjema. */}
        <TekstRad
          etikett="Stikkord"
          minRader={1}
          value={stikkord}
          onChange={e => setStikkord(e.target.value)}
          maxLength={STIKKORD_MAKS_LENGDE}
          placeholder="Ikke satt"
          aria-label="Stikkord"
        />
        <TekstRad
          etikett="Matallergier"
          minRader={1}
          value={matallergier}
          onChange={e => setMatallergier(e.target.value)}
          maxLength={MATALLERGIER_MAKS_LENGDE}
          placeholder="Skalldyr, nøtter …"
          aria-label="Matallergier"
        />
      </SkjemaGruppe>

      {/* Kontakt */}
      <SkjemaGruppe tittel="Kontakt">
        <SkjemaRad etikett="E-post">
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--text-secondary)',
              overflowWrap: 'anywhere',
              textAlign: 'right',
            }}
          >
            {medlem.epost}
          </span>
        </SkjemaRad>
        <SkjemaRad etikett="Telefon">
          <RadInput
            type="tel"
            value={telefon}
            onChange={e => setTelefon(e.target.value)}
            placeholder="+47 ..."
            aria-label="Telefon"
          />
        </SkjemaRad>
      </SkjemaGruppe>

      {/* Tilgang. Rolle og status er to-valgs lister: ValgFelt i stedet for
          Segment, så de følger skjemastandarden (verdi i aksentfarge, native
          liste usynlig oppå). */}
      <SkjemaGruppe tittel="Tilgang">
        <SkjemaRad etikett="Rolle">
          <ValgFelt
            value={rolle}
            onChange={e => setRolle(e.target.value as Rolle)}
            valg={VALGBARE_ROLLER.map(r => ({ verdi: r, etikett: tittelFor(r) }))}
            aria-label="Rolle"
          />
        </SkjemaRad>
        <SkjemaRad etikett="Status">
          <ValgFelt
            value={aktiv}
            onChange={e => setAktiv(e.target.value as 'aktiv' | 'deaktivert')}
            valg={[
              { verdi: 'aktiv', etikett: 'Aktiv' },
              { verdi: 'deaktivert', etikett: 'Deaktivert' },
            ]}
            aria-label="Status"
          />
        </SkjemaRad>
      </SkjemaGruppe>

      {/* Generalsekretær-tittelen er separat fra rolle-valget fordi GS er en
          utmerkelse, ikke en sidestilt status. Confirm skjer ved toggle, ikke
          ved submit — så brukeren ser konsekvensen (hvem som mister tittelen)
          før han klikker Lagre. */}
      <SkjemaGruppe tittel="Generalsekretær" hjelp="Bare én om gangen. Får gul glød på bildet.">
        <SkjemaRad etikett="Generalsekretær">
          <ToggleRad
            on={erGeneralsekretaer}
            onChange={handleToggleGs}
            disabled={isPending}
            ariaLabel="Generalsekretær"
          />
        </SkjemaRad>
      </SkjemaGruppe>

      {/* To uavhengige brytere, uavhengig av rolle. Lagres ved submit sammen
          med resten av skjemaet, ingen confirm nødvendig. Feilvarsler er egen
          bryter fra innspill — feilhåndtering, ikke dialog om nye ønsker. */}
      <SkjemaGruppe
        tittel="Varsler"
        hjelp="Innspill: varsel når noen sender inn et innspill i appen. Feil: daglig alarm hvis appen har feil."
      >
        <SkjemaRad etikett="Innspill-varsler">
          <ToggleRad
            on={faarIssueVarsler}
            onChange={setFaarIssueVarsler}
            disabled={isPending}
            ariaLabel="Innspill-varsler"
          />
        </SkjemaRad>
        <SkjemaRad etikett="Feilvarsler">
          <ToggleRad
            on={faarFeilvarsler}
            onChange={setFaarFeilvarsler}
            disabled={isPending}
            ariaLabel="Feilvarsler"
          />
        </SkjemaRad>
      </SkjemaGruppe>

      {/* Faresone */}
      <SkjemaGruppe
        tittel="Faresone"
        hjelp="Kan ikke angres. Arrangementer opprettet av medlemmet beholdes."
      >
        <button
          type="button"
          onClick={handleSlett}
          disabled={isPending}
          style={{
            width: '100%',
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            background: 'none',
            border: 'none',
            textAlign: 'left',
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--danger)',
          }}
        >
          Slett medlem
        </button>
      </SkjemaGruppe>
    </div>
  )
}
