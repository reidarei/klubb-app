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
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import Segment from '@/components/ui/Segment'
import { ToggleRad } from '@/components/ui/ToggleSwitch'

type Medlem = {
  id: string
  navn: string
  visningsnavn: string
  epost: string
  telefon: string | null
  rolle: string
  aktiv: boolean
  fodselsdato: string | null
}

type NaavaerendeGeneralsekretaer = { id: string; navn: string } | null

const labelStil: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '1.6px',
  marginBottom: 4,
}

const inputBaseStil: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  color: 'var(--text-primary)',
  lineHeight: 1.5,
}

const accentInputStil: React.CSSProperties = {
  ...inputBaseStil,
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 500,
  letterSpacing: '-0.3px',
  color: 'var(--accent)',
}

function Rad({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        padding: '10px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  )
}

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
      <SkjemaSeksjon label="Personalia">
        <Rad>
          <div style={labelStil}>Navn</div>
          <input
            type="text"
            value={navn}
            onChange={e => setNavn(e.target.value)}
            style={accentInputStil}
            required
          />
        </Rad>
        <Rad>
          <div style={labelStil}>Visningsnavn</div>
          <input
            type="text"
            value={visningsnavn}
            onChange={e => setVisningsnavn(e.target.value)}
            style={inputBaseStil}
            placeholder={navn}
          />
        </Rad>
        <Rad last>
          <div style={labelStil}>Fødselsdato</div>
          <input
            type="date"
            value={fodselsdato}
            onChange={e => setFodselsdato(e.target.value)}
            style={{ ...inputBaseStil, colorScheme: 'dark' }}
          />
        </Rad>
      </SkjemaSeksjon>

      {/* Kontakt */}
      <SkjemaSeksjon label="Kontakt">
        <Rad>
          <div style={labelStil}>E-post</div>
          <div style={{ ...inputBaseStil, color: 'var(--text-secondary)' }}>
            {medlem.epost}
          </div>
        </Rad>
        <Rad last>
          <div style={labelStil}>Telefon</div>
          <input
            type="tel"
            value={telefon}
            onChange={e => setTelefon(e.target.value)}
            style={inputBaseStil}
            placeholder="+47 ..."
          />
        </Rad>
      </SkjemaSeksjon>

      {/* Tilgang */}
      <SkjemaSeksjon label="Tilgang">
        {/* Segment for admin/medlem-rollen */}
        <div style={{ padding: '10px 4px', borderBottom: '0.5px solid var(--border-subtle)' }}>
          <div style={{ ...labelStil, marginBottom: 8 }}>Rolle</div>
          <Segment
            value={rolle}
            onChange={setRolle}
            options={VALGBARE_ROLLER.map(r => ({ value: r, label: tittelFor(r) }))}
          />
        </div>

        {/* ToggleSwitch for generalsekretær-tittelen — separat fra rolle-Segmentet
            fordi GS er en utmerkelse, ikke en sidestilt status i to-valgs-skjemaet.
            Confirm skjer ved toggle, ikke ved submit — slik at brukeren ser
            konsekvensen (hvem som mister tittelen) før han klikker Lagre. */}
        <div
          style={{
            padding: '10px 4px',
            borderBottom: '0.5px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...labelStil, marginBottom: 2 }}>Generalsekretær</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
              Bare én om gangen. Får gul glød på bildet.
            </div>
          </div>
          <ToggleRad
            on={erGeneralsekretaer}
            onChange={handleToggleGs}
            disabled={isPending}
            ariaLabel="Generalsekretær"
          />
        </div>

        <div style={{ padding: '10px 4px' }}>
          <div style={{ ...labelStil, marginBottom: 8 }}>Status</div>
          <Segment
            value={aktiv}
            onChange={setAktiv}
            options={[
              { value: 'aktiv', label: 'Aktiv' },
              { value: 'deaktivert', label: 'Deaktivert' },
            ]}
          />
        </div>
      </SkjemaSeksjon>

      {/* Faresone */}
      <SkjemaSeksjon label="Faresone">
        <button
          type="button"
          onClick={handleSlett}
          disabled={isPending}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 4px',
            cursor: isPending ? 'wait' : 'pointer',
            background: 'none',
            border: 'none',
            textAlign: 'left',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--danger)',
                letterSpacing: '-0.2px',
                marginBottom: 2,
              }}
            >
              Slett medlem
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1px',
              }}
            >
              Kan ikke angres. Arrangementer opprettet av medlemmet beholdes.
            </div>
          </div>
        </button>
      </SkjemaSeksjon>
    </div>
  )
}
