import type { createServerClient } from '@/lib/supabase/server'
import type { MalValg } from '@/components/arrangement/mal-valg-typer'
import { byggAnnetValg } from '@/components/arrangement/mal-valg-typer'

// Henter alle uoppfylte (aar, arrangement_navn)-kombinasjoner med tildelte
// ansvarlige, joiner med arrangementmaler for type + purredato, og returnerer
// en sortert liste klar for TypeVelger-dropdown. "Annet" legges alltid på
// slutten.
//
// includeArrangementId: hvis satt, inkluderes også rader som allerede er
// koblet til dette arrangementet. Brukes fra rediger-siden slik at den
// nåværende koblingen forblir valgbar.
export async function hentMalValg(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  includeArrangementId?: string,
): Promise<MalValg[]> {
  const ansvarQuery = supabase
    .from('arrangoransvar')
    .select('aar, arrangement_navn, ansvarlig_id, ansvarlig:profiles!ansvarlig_id(navn)')

  const ansvarPromise = includeArrangementId
    ? ansvarQuery.or(`arrangement_id.is.null,arrangement_id.eq.${includeArrangementId}`)
    : ansvarQuery.is('arrangement_id', null)

  const [{ data: ansvar }, { data: maler }] = await Promise.all([
    ansvarPromise,
    supabase.from('arrangementmaler').select('navn, type, purredato'),
  ])

  const malMap = new Map<string, { type: 'moete' | 'tur' | null; purredato: string | null }>()
  for (const m of maler ?? []) {
    malMap.set(m.navn, {
      type: m.type as 'moete' | 'tur' | null,
      purredato: m.purredato,
    })
  }

  // Grupper på (aar, arrangement_navn) — samle ansvarlige navn og IDer.
  // Tomme slots (ansvarlig_id=null) inkluderes også slik at hvem som helst
  // kan opprette arrangementet for en uoppfylt mal.
  type Grp = { aar: number; mal_navn: string; ansvarlige: string[]; ansvarligeIds: string[] }
  const groups = new Map<string, Grp>()
  for (const a of ansvar ?? []) {
    if (a.aar == null || !a.arrangement_navn) continue
    const key = `${a.arrangement_navn}::${a.aar}`
    let g = groups.get(key)
    if (!g) {
      g = { aar: a.aar, mal_navn: a.arrangement_navn, ansvarlige: [], ansvarligeIds: [] }
      groups.set(key, g)
    }
    const ansv = a.ansvarlig as { navn: string | null } | null
    if (ansv?.navn) g.ansvarlige.push(ansv.navn)
    if (a.ansvarlig_id) g.ansvarligeIds.push(a.ansvarlig_id)
  }

  const gyldige = Array.from(groups.values())

  // Bygg MalValg
  const valg: MalValg[] = gyldige.map(g => {
    const mal = malMap.get(g.mal_navn)
    // Sett riktig år på purredato (mal-raden har år 2000 som sentinel)
    let purredato: string | null = null
    if (mal?.purredato) {
      const [, mnd, dag] = mal.purredato.split('-')
      purredato = `${g.aar}-${mnd}-${dag}`
    }
    return {
      key: `${g.mal_navn}::${g.aar}`,
      mal_navn: g.mal_navn,
      aar: g.aar,
      type: mal?.type ?? null,
      purredato,
      ansvarlige: g.ansvarlige,
      ansvarligeIds: g.ansvarligeIds,
    }
  })

  // Sortering: (aar asc, purredato asc nulls last)
  valg.sort((a, b) => {
    if (a.aar !== b.aar) return (a.aar ?? 0) - (b.aar ?? 0)
    if (a.purredato == null && b.purredato == null) return 0
    if (a.purredato == null) return 1
    if (b.purredato == null) return -1
    return a.purredato.localeCompare(b.purredato)
  })

  // "Annet" alltid til slutt
  valg.push(byggAnnetValg())
  return valg
}
