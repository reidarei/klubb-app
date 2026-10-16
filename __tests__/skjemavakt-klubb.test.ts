// Skjemavakt (multi-tenant 1.3, #866): ingen tabell i public uten klubb_id, og
// policy-/indekskravene innføres trinnvis via pinnede lister som bare kan krympe.
// Leser migrasjonsfilene direkte, ingen database; kjører i kjerneporten.
import { describe, it, expect } from 'vitest'
import { byggSkjema, lesMigrasjoner, refererKlubbId, type Skjema } from './helpers/migrasjon-skjema'
import {
  KLUBB_FK_UTEN_STOETTEINDEKS,
  KLUBB_ID_NULLABLE,
  KLUBB_ID_UNNTAK,
  KLUBB_UTEN_KLUBB_POLICY,
  tabellerFraTyper,
} from './helpers/klubb-tabeller'

const skjema = byggSkjema(lesMigrasjoner())
const unntakSet = new Set<string>(KLUBB_ID_UNNTAK.map(u => u.tabell))
const klubbeide = [...skjema.tabeller].filter(([navn]) => !unntakSet.has(navn))

// Kjernen i «lista kan bare krympe»: lista er nøyaktig de klubbeide tabellene uten
// klubb-policy, OG ingen på lista har noen gang hatt en klubb-policy. Det siste
// stopper at en ferdig tabell mister policyen og føres tilbake på lista.
function policyListeAvvik(s: Skjema, liste: readonly string[]): string[] {
  const uten = [...s.tabeller]
    .filter(([navn, t]) => !unntakSet.has(navn) && t.klubbId)
    .filter(([, t]) => ![...t.policyer.values()].some(p => refererKlubbId(p.tekst)))
    .map(([navn]) => navn)
  const pinnet = new Set(liste)
  return [
    ...uten.filter(t => !pinnet.has(t)).map(t => `${t} mangler policy som refererer klubb_id. Skriv policyen med klubb-sjekk (2.3, #870).`),
    ...liste.filter(t => !uten.includes(t)).map(t => `Fjern ${t} fra KLUBB_UTEN_KLUBB_POLICY.`),
    ...liste
      .filter(t => s.nogensinneKlubbPolicy.has(t))
      .map(t => `${t} har hatt en klubb-policy og får ikke føres tilbake på KLUBB_UTEN_KLUBB_POLICY. Gjenopprett klubb-policyen.`),
  ]
}

describe('parseren (fixtures)', () => {
  const bygg = (...sql: string[]) => byggSkjema(sql.map((s, i) => ({ fil: `${i}.sql`, sql: s })))

  it('create table med og uten public., med if not exists', () => {
    const s = bygg('create table public.tabell_a (id int); create table if not exists tabell_b (id int);')
    expect([...s.tabeller.keys()]).toEqual(['tabell_a', 'tabell_b'])
  })

  it('drop table fjerner tabell og policyer, men nogensinneOpprettet beholder den', () => {
    const s = bygg('create table public.x (id int); create policy "p" on public.x using (true); drop table public.x;')
    expect(s.tabeller.size).toBe(0)
    expect(s.nogensinneOpprettet.has('x')).toBe(true)
  })

  it('rename tar med policyene', () => {
    const s = bygg('create table public.x (id int); create policy "p" on public.x using (true); alter table public.x rename to y;')
    expect(s.tabeller.has('x')).toBe(false)
    expect([...s.tabeller.get('y')!.policyer.keys()]).toEqual(['p'])
  })

  it('drop policy if exists på ukjent policy gir ingen advarsel; uten if exists gir advarsel', () => {
    const stille = bygg('create table public.x (id int); drop policy if exists "p" on public.x;')
    expect(stille.policyAdvarsler).toEqual([])
    const hoeylytt = bygg('create table public.x (id int); drop policy "p" on public.x;')
    expect(hoeylytt.policyAdvarsler).toHaveLength(1)
  })

  it('policy på annet schema enn public ignoreres', () => {
    const s = bygg('create table public.x (id int); create policy "p" on storage.objects using (true);')
    expect(s.tabeller.get('x')!.policyer.size).toBe(0)
  })

  it('create table inni dollar-quotet kropp (execute) feiler lukket', () => {
    const s = bygg('do $$ begin execute \'create table public.skjult (id int)\'; end $$; create table public.synlig (id int);')
    expect([...s.tabeller.keys()]).toEqual(['synlig'])
    expect(s.ukjentTabellDdl).toHaveLength(1)
  })

  it('create table … as, unlogged og partition of feiler lukket', () => {
    expect(bygg('create table public.kopi as select * from public.x;').ukjentTabellDdl).toHaveLength(1)
    expect(bygg('create unlogged table public.u (id int);').ukjentTabellDdl).toHaveLength(1)
    expect(bygg('create table public.p partition of public.x for values in (1);').ukjentTabellDdl).toHaveLength(1)
  })

  it('create table i kommentar teller ikke, vanlig create table gir ingen advarsel', () => {
    const s = bygg('-- create table public.gammel (id int)\n/* create table public.b (id int) */\ncreate table public.x (id int);')
    expect(s.ukjentTabellDdl).toEqual([])
  })

  it('create table if not exists på eksisterende tabell er en no-op', () => {
    const s = bygg(
      'create table public.x (klubb_id uuid not null references public.klubb(id), id int); create policy "p" on public.x using (true); create index x_idx on public.x (klubb_id);',
      'create table if not exists public.x (id int);',
    )
    const t = s.tabeller.get('x')!
    expect(t.opprettetI).toBe('0.sql')
    expect(t.klubbId).not.toBeNull()
    expect([...t.policyer.keys()]).toEqual(['p'])
    expect(t.klubbIdIndekser.size).toBe(1)
  })

  it('create table uten if not exists etter drop starter med blank tilstand', () => {
    const s = bygg('create table public.x (id int); create policy "p" on public.x using (true); drop table public.x; create table public.x (id int);')
    expect(s.tabeller.get('x')!.policyer.size).toBe(0)
  })

  it('nogensinneKlubbPolicy husker klubb-policy etter drop og følger rename', () => {
    const s = bygg(
      'create table public.x (id int); create policy "p" on public.x using (klubb_id = public.standard_klubb_id());',
      'drop policy "p" on public.x; alter table public.x rename to y;',
    )
    expect(s.tabeller.get('y')!.policyer.size).toBe(0)
    expect(s.nogensinneKlubbPolicy.has('y')).toBe(true)
  })

  it('policylista: gjeninnført gjeld blir rød', () => {
    const klubbTabell = 'create table public.x (klubb_id uuid not null references public.klubb(id), id int);'
    // Utgangspunkt: x står på lista uten klubb-policy, grønt.
    expect(policyListeAvvik(bygg(klubbTabell, 'create policy "p" on public.x using (true);'), ['x'])).toEqual([])
    // x får klubb-policy, mister den igjen og føres tilbake på lista: rødt.
    const gjeninnfoert = bygg(
      klubbTabell,
      'create policy "p" on public.x using (true);',
      'drop policy "p" on public.x; create policy "p" on public.x using (klubb_id = public.standard_klubb_id());',
      'drop policy "p" on public.x; create policy "p" on public.x using (true);',
    )
    expect(policyListeAvvik(gjeninnfoert, ['x'])).toHaveLength(1)
    // Og uten x på lista er den rød som ny tabell uten klubb-policy.
    expect(policyListeAvvik(gjeninnfoert, [])).toHaveLength(1)
  })

  it('inline klubb_id og alter column drop not null', () => {
    const s = bygg(
      'create table public.x (klubb_id uuid not null references public.klubb(id), id int);',
      'alter table public.x alter column klubb_id drop not null;',
    )
    expect(s.tabeller.get('x')!.klubbId).toEqual({ nullable: true, fil: '0.sql' })
  })

  it('create index med klubb_id først registreres, drop index fjerner den', () => {
    const s = bygg('create table public.x (id int); create index x_idx on public.x (klubb_id, id);')
    expect(s.tabeller.get('x')!.klubbIdIndekser.size).toBe(1)
    const borte = bygg('create table public.x (id int); create index x_idx on public.x (klubb_id, id); drop index x_idx;')
    expect(borte.tabeller.get('x')!.klubbIdIndekser.size).toBe(0)
  })
})

describe('skjemavakt: klubb_id', () => {
  it('migrasjonene har ingen parseradvarsler', () => {
    expect(skjema.policyAdvarsler).toEqual([])
  })

  it('all tabellopprettende DDL er gjenkjent (ingen create table i do $$/execute, as select e.l.)', () => {
    expect(skjema.ukjentTabellDdl, 'Skriv tabellen som vanlig `create table public.<navn> (…)` på toppnivå, så vakten ser den').toEqual([])
  })

  it('hver tabell i de genererte typene finnes i migrasjonene (kryssjekk)', () => {
    const mangler = tabellerFraTyper().filter(t => !skjema.nogensinneOpprettet.has(t))
    // Ikke likhet: typene regenereres først etter merge, så de ligger ett steg bak.
    expect(mangler, 'Tabell i database.types.ts som parseren ikke fant i migrasjonene: sjekk __tests__/helpers/migrasjon-skjema.ts').toEqual([])
  })

  it('hver tabell har klubb_id eller er et klassifisert unntak', () => {
    const avvik = klubbeide
      .filter(([, t]) => !t.klubbId)
      .map(([navn, t]) =>
        `${navn} (opprettet i ${t.opprettetI}) mangler klubb_id. Enten: legg til ` +
        '`klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict` ' +
        '(se CLAUDE.md § Policy: Migrasjoner), eller klassifiser den i KLUBB_ID_UNNTAK i __tests__/helpers/klubb-tabeller.ts med klasse og begrunnelse.')
    expect(avvik).toEqual([])
  })

  it('unntakene har ikke klubb_id, og finnes', () => {
    for (const u of KLUBB_ID_UNNTAK) {
      const t = skjema.tabeller.get(u.tabell)
      expect(t, `${u.tabell} i KLUBB_ID_UNNTAK finnes ikke i migrasjonene`).toBeDefined()
      expect(t!.klubbId, `${u.tabell} har klubb_id: fjern den fra KLUBB_ID_UNNTAK (og fra unntakslista i pr-check.yml)`).toBeNull()
    }
  })

  it('unntaksklassene er gyldige', () => {
    for (const u of KLUBB_ID_UNNTAK) expect(u.begrunnelse.trim(), u.tabell).not.toBe('')
    expect(KLUBB_ID_UNNTAK.filter(u => u.klasse === 'rot').map(u => u.tabell)).toEqual(['klubb'])
  })

  it('nullable klubb_id er bevisst og registrert i KLUBB_ID_NULLABLE', () => {
    const nullable = klubbeide.filter(([, t]) => t.klubbId?.nullable).map(([navn]) => navn).sort()
    expect(nullable, 'Nullable klubb_id må registreres i KLUBB_ID_NULLABLE (se #896)').toEqual(KLUBB_ID_NULLABLE.map(n => n.tabell).sort())
  })
})

describe('skjemavakt: policyer', () => {
  const klubbMedKolonne = klubbeide.filter(([, t]) => t.klubbId)

  it('hver klubbeid tabell har minst én policy', () => {
    expect(klubbMedKolonne.filter(([, t]) => t.policyer.size === 0).map(([navn]) => navn)).toEqual([])
  })

  it('tabeller uten klubb-policy er nøyaktig de pinnede (lista kan bare krympe)', () => {
    expect(policyListeAvvik(skjema, KLUBB_UTEN_KLUBB_POLICY)).toEqual([])
  })

  it('alle på policylista fantes allerede i migrasjon 161 (nye tabeller får ikke føres hit)', () => {
    const ved161 = byggSkjema(lesMigrasjoner(161)).tabeller
    expect(KLUBB_UTEN_KLUBB_POLICY.filter(t => !ved161.has(t))).toEqual([])
  })
})

describe('skjemavakt: støtteindekser', () => {
  it('FK-er mot klubb uten indeks med klubb_id først er nøyaktig de pinnede', () => {
    const uten = klubbeide
      .filter(([, t]) => t.klubbId && t.klubbIdIndekser.size === 0)
      .map(([navn]) => navn)
      .sort()
    const pinnet = new Set(KLUBB_FK_UTEN_STOETTEINDEKS)
    const nye = uten.filter(t => !pinnet.has(t)).map(t => `${t} har FK mot klubb uten støtteindeks. Legg indeks (klubb_id, …) eller føre tabellen på KLUBB_FK_UTEN_STOETTEINDEKS (#895, #886).`)
    const ferdige = KLUBB_FK_UTEN_STOETTEINDEKS.filter(t => !uten.includes(t)).map(t => `Fjern ${t} fra KLUBB_FK_UTEN_STOETTEINDEKS.`)
    expect([...nye, ...ferdige]).toEqual([])
  })
})
