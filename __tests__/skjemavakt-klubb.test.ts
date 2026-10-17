// Skjemavakt (multi-tenant 1.3, #866): ingen tabell i public uten klubb_id, og
// policy-/indekskravene innføres trinnvis via pinnede lister som bare kan krympe.
// Leser migrasjonsfilene direkte, ingen database; kjører i kjerneporten.
import { describe, it, expect } from 'vitest'
import {
  brukerArgumentlosRolleSjekk,
  byggSkjema,
  effektiveKlausuler,
  harKlubbledd,
  lesMigrasjoner,
  refererAktivKlubb,
  refererKlubbId,
  type PolicyTilstand,
  type Skjema,
} from './helpers/migrasjon-skjema'
import {
  KLUBB_FK_UTEN_STOETTEINDEKS,
  KLUBB_ID_NULLABLE,
  KLUBB_ID_UNNTAK,
  KLUBB_UTEN_KLUBB_POLICY,
  tabellerFraTyper,
} from './helpers/klubb-tabeller'

const skjema = byggSkjema(lesMigrasjoner())

// Kontrakten fra 167 (#870), per klausul: klubbleddet står i using for SELECT/UPDATE/DELETE og i
// with check for INSERT/UPDATE (effektivt — uten with check gjenbruker Postgres using). Ett treff
// et sted i teksten er ikke nok: en UPDATE med riktig using og `with check (true)` lar raden flyttes.
function klubbleddAvvik(p: PolicyTilstand): string[] {
  const e = effektiveKlausuler(p)
  const avvik: string[] = []
  if (e.using !== undefined && !harKlubbledd(e.using)) avvik.push(`using mangler klubbleddet (${p.kommando})`)
  if (e.withCheck !== undefined && !harKlubbledd(e.withCheck)) avvik.push(`with check mangler klubbleddet (${p.kommando})`)
  if (p.roller !== 'authenticated') avvik.push(`er ikke to authenticated (${p.roller ?? 'public'})`)
  return avvik
}
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

  it('refererAktivKlubb krever select-pakken; argumentløs rolle-sjekk flagges', () => {
    expect(refererAktivKlubb('using (klubb_id = (select public.aktiv_klubb()))')).toBe(true)
    expect(refererAktivKlubb('using (klubb_id = public.aktiv_klubb())')).toBe(false)
    expect(refererAktivKlubb('using (klubb_id = standard_klubb_id())')).toBe(false)
    expect(brukerArgumentlosRolleSjekk('using (public.er_admin())')).toBe(true)
    expect(brukerArgumentlosRolleSjekk('using ( er_generalsekretaer( ) )')).toBe(true)
    expect(brukerArgumentlosRolleSjekk('using ((select public.er_admin((select public.aktiv_klubb()))))')).toBe(false)
    expect(brukerArgumentlosRolleSjekk('using (er_admin(klubb_id))')).toBe(false)
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

  const KT = 'create table public.x (klubb_id uuid not null references public.klubb(id), id int);'
  const LEDD = 'klubb_id = (select public.aktiv_klubb())'
  const avvikFor = (...sql: string[]) => klubbleddAvvik(bygg(KT, ...sql).tabeller.get('x')!.policyer.get('p')!)

  it('klubbledd: korrekt UPDATE, INSERT, SELECT og DELETE er grønne', () => {
    expect(avvikFor(`create policy "p" on public.x for update to authenticated using (${LEDD} and id = 1) with check (${LEDD});`)).toEqual([])
    expect(avvikFor(`create policy "p" on public.x for insert to authenticated with check (${LEDD} and ((id = 1)));`)).toEqual([])
    expect(avvikFor(`create policy "p" on public.x for select to authenticated using (${LEDD});`)).toEqual([])
    expect(avvikFor(`create policy "p" on public.x for delete to authenticated using ((${LEDD}) and (id = 1));`)).toEqual([])
    // UPDATE uten with check: Postgres gjenbruker using, og den har leddet.
    expect(avvikFor(`create policy "p" on public.x for update to authenticated using (${LEDD});`)).toEqual([])
  })

  it('klubbledd: UPDATE med riktig using men with check (true) er rød', () => {
    expect(avvikFor(`create policy "p" on public.x for update to authenticated using (${LEDD}) with check (true);`)).toEqual([
      'with check mangler klubbleddet (update)',
    ])
  })

  it('klubbledd: alter policy som bare setter using beholder den gamle with check (true) og er rød', () => {
    expect(
      avvikFor(
        'create policy "p" on public.x for update to authenticated using (true) with check (true);',
        `alter policy "p" on public.x to authenticated using (${LEDD});`,
      ),
    ).toEqual(['with check mangler klubbleddet (update)'])
    // Kommandoen kommer fra create: en alter uten `for` gjør ikke INSERT til noe annet.
    expect(
      avvikFor('create policy "p" on public.x for insert with check (true);', `alter policy "p" on public.x using (${LEDD});`),
    ).toEqual(['with check mangler klubbleddet (insert)', 'er ikke to authenticated (public)'])
  })

  it('klubbledd: leddet i feil klausul, bak et or, bare i en underspørring eller uten select-pakken er rødt', () => {
    expect(avvikFor(`create policy "p" on public.x for insert to authenticated using (${LEDD}) with check (true);`)).toHaveLength(1)
    expect(avvikFor(`create policy "p" on public.x for select to authenticated using (${LEDD} or true);`)).toHaveLength(1)
    expect(avvikFor(`create policy "p" on public.x for select to authenticated using (${LEDD} and id = 1 or true);`)).toHaveLength(1)
    expect(avvikFor(`create policy "p" on public.x for select to authenticated using (id in (select y.id from y where y.${LEDD}));`)).toHaveLength(1)
    expect(avvikFor('create policy "p" on public.x for select to authenticated using (klubb_id = public.aktiv_klubb());')).toHaveLength(1)
    // FOR ALL uten with check: using gjelder begge veier.
    expect(avvikFor('create policy "p" on public.x to authenticated using (true);')).toEqual([
      'using mangler klubbleddet (all)',
      'with check mangler klubbleddet (all)',
    ])
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

  // Hook-policyen er varig (#869): GoTrue må se medlemskap på tvers av klubber.
  const HOOK_POLICY = ['medlemskap', 'auth-hooken leser medlemskap på tvers av klubber'] as const // parseren lowercaser navn
  const erHookPolicy = (tabell: string, navn: string) => tabell === HOOK_POLICY[0] && navn === HOOK_POLICY[1]

  it('hver policy på en klubbeid tabell har klubbleddet i riktige klausuler og er to authenticated (#870)', () => {
    const avvik: string[] = []
    for (const [tabell, t] of klubbMedKolonne) {
      for (const [navn, p] of t.policyer) {
        if (erHookPolicy(tabell, navn)) continue
        for (const a of klubbleddAvvik(p)) avvik.push(`${tabell}: "${navn}" ${a} (${p.fil})`)
      }
    }
    expect(avvik, 'Hver klausul skal ha `klubb_id = (select public.aktiv_klubb()) and …` på toppnivå (se 167)').toEqual([])
  })

  // profiles (global) og klubb (roten) har ikke klubb_id, så klubbleddet har en egen form der.
  // De er pinnet eksakt per klausul: en ny eller endret policy her skal være et bevisst valg, og
  // atferden vaktes av CI-steget «Verifiser klubb-RLS» (deaktivering, admin ser inaktive, ingen B fra A).
  const PROFIL_KLAUSUL =
    '((id = (select auth.uid()) and (select public.aktiv_klubb()) is not null) or (id in (select m.profil_id from public.medlemskap m where m.klubb_id = (select public.aktiv_klubb())) and (select public.er_admin((select public.aktiv_klubb())))))'
  const SAERPOLICYER: Record<string, Record<string, { kommando: string; using?: string; withCheck?: string }>> = {
    klubb: {
      'innloggede kan lese klubber': { kommando: 'select', using: 'id = (select public.aktiv_klubb())' },
    },
    profiles: {
      'alle aktive kan lese profiler': {
        kommando: 'select',
        using:
          'id in (select m.profil_id from public.medlemskap m where m.klubb_id = (select public.aktiv_klubb()) and (m.aktiv or (select public.er_admin((select public.aktiv_klubb())))))',
      },
      'kan oppdatere egen profil eller admin': { kommando: 'update', using: PROFIL_KLAUSUL, withCheck: PROFIL_KLAUSUL },
    },
  }

  it('særpolicyene på profiles og klubb er nøyaktig de pinnede, per klausul (#870)', () => {
    for (const [tabell, forventet] of Object.entries(SAERPOLICYER)) {
      const faktisk = Object.fromEntries(
        [...skjema.tabeller.get(tabell)!.policyer].map(([navn, p]) => {
          const e = effektiveKlausuler(p)
          expect(p.roller, `${tabell}: "${navn}"`).toBe('authenticated')
          return [navn, { kommando: p.kommando, ...(e.using != null && { using: e.using }), ...(e.withCheck != null && { withCheck: e.withCheck }) }]
        }),
      )
      expect(faktisk, `${tabell}: policyene avviker fra SAERPOLICYER — endre bevisst, og dekk atferden i pr-check.yml`).toEqual(forventet)
    }
  })

  it('ingen policy på en klubbeid tabell bruker er_admin()/er_generalsekretaer() uten klubb-argument', () => {
    const avvik: string[] = []
    for (const [tabell, t] of klubbMedKolonne) {
      for (const [navn, p] of t.policyer) {
        if (brukerArgumentlosRolleSjekk(p.tekst)) avvik.push(`${tabell}: "${navn}" (${p.fil})`)
      }
    }
    expect(avvik).toEqual([])
  })

  it('hook-policyen på medlemskap er urørt (varig, #869)', () => {
    const p = skjema.tabeller.get('medlemskap')!.policyer.get(HOOK_POLICY[1])
    expect(p?.tekst).toContain('to supabase_auth_admin')
    expect(p?.tekst).toContain('using (true)')
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
