// Spørrings- og tekstlogikk for den daglige feil-alarmen
// (/api/cron/sjekk-klientfeil). Ligger utenfor route.ts fordi Next.js kun
// tillater HTTP-metode-eksporter fra en route-fil — og fordi filtrene her er
// alarmens hele oppførsel og må kunne pinnes i test. Se #496/#498-review.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { ALARM_IGNORERTE_EVENTS, TOPP_EVENT_HENT_GRENSE } from '@/lib/konstanter'

type Admin = SupabaseClient<Database>

// PostgREST-syntaks for «not in»: (a,b,c). Listen bygges KUN av vår egen
// konstant — aldri av klient-input — og de verdiene er dot-separerte uten
// komma eller parentes, så ingen quoting trengs. Legger noen inn et event-navn
// med komma i ALARM_IGNORERTE_EVENTS, må det quotes: ("a,b").
const IGNORER_LISTE = `(${ALARM_IGNORERTE_EVENTS.join(',')})`

// Felles filtre for BEGGE spørringene under. Tellingen og topp-3-listen må se
// nøyaktig samme rader — ellers sier alarmen «3 feil» og lister opp to.
//   .neq('nivaa','warn')  — warn er ikke del av alarmsignalet (#496)
//   .not('event','in',…)  — kjent transiente events (#498-review MAJOR 3)
function medAlarmfiltre<T extends {
  neq: (k: string, v: string) => T
  not: (k: string, op: string, v: string) => T
  gte: (k: string, v: string) => T
}>(spørring: T, siden: string): T {
  return spørring
    .neq('nivaa', 'warn')
    .not('event', 'in', IGNORER_LISTE)
    .gte('opprettet', siden)
}

// Antall alarmverdige feil siden `siden` (ISO-tidsstempel).
// head: true → count uten å hente radene.
export async function tellAlarmverdigeFeil(admin: Admin, siden: string) {
  return await medAlarmfiltre(
    admin.from('feil_logg').select('*', { count: 'exact', head: true }),
    siden,
  )
}

// Rå event-navn til topp-3-aggregeringen. Hentes kun når alarmen faktisk fyrer.
// .order() er ikke kosmetikk: under en storm kutter .limit() ved
// TOPP_EVENT_HENT_GRENSE, og uten sortering er utvalget vilkårlig — da kan
// topp-3-listen peke på feil event. Nyeste først gjør utvalget forutsigbart og
// speiler det en admin ville sett i loggen.
export async function hentToppEventRader(admin: Admin, siden: string) {
  return await medAlarmfiltre(admin.from('feil_logg').select('event'), siden)
    .order('opprettet', { ascending: false })
    .limit(TOPP_EVENT_HENT_GRENSE)
}

// Teller opp forekomster per event-navn og returnerer topp 3 som lesbar tekst.
// «Klientfeil siste døgn» ble en usann alarmtekst i det øyeblikket server-feil
// begynte å lande i samme tabell (#496) — uten en oppdeling vet en admin bare
// «noe skjedde», ikke om det f.eks. er «tidligere-siden mister meldinger»
// (ett event, mange rader) versus spredt engangsstøy (mange ulike events).
export function lagToppEventTekst(rader: { event: string }[]): string {
  const tellinger = new Map<string, number>()
  for (const rad of rader) {
    tellinger.set(rad.event, (tellinger.get(rad.event) ?? 0) + 1)
  }
  const topp3 = [...tellinger.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topp3.length === 0) return ''
  return '\n\nTopp 3:\n' + topp3.map(([event, n]) => `${event}: ${n}`).join('\n')
}
