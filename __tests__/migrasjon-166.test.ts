// Statisk vakt for migrasjon 166 (#869, 2.2): JWT-hooken. Selve virkningen bevises
// i psql-stegene «Verifiser JWT-hook» og «Kastende hook …» i pr-check.yml; her pinnes
// formen, så en uforsiktig redigering ikke gjør hooken kastende eller privilegert.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const les = (rel: string) => readFileSync(path.resolve(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n')
const RAA = les('supabase/migrations/166_jwt_klubb_hook.sql')
// Kommentarer fjernes slik at en kommentar som nevner f.eks. «security definer» ikke teller.
const SQL = RAA.replace(/--[^\n]*/g, '').toLowerCase()
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const F = flat(SQL)

describe('migrasjon 166 — custom_access_token_hook', () => {
  it('security invoker og tomt search_path, aldri security definer', () => {
    expect(F).toContain("create function public.custom_access_token_hook(event jsonb) returns jsonb language plpgsql stable security invoker set search_path = ''")
    expect(F).not.toContain('security definer')
    expect((F.match(/set search_path = ''/g) ?? []).length).toBe(2) // hook + jwt_klubb_id
  })

  it('valgregel: eldste aktive medlemskap, deterministisk', () => {
    expect(F).toContain('order by m.opprettet, m.klubb_id limit 1')
    expect(F).toContain('and m.aktiv')
  })

  it('klubb_id, rolle og klubb_status strippes fra innkommende claims (normalgren og feilgren)', () => {
    const strip = "- 'klubb_id' - 'rolle' - 'klubb_status'"
    expect(F.split(strip).length - 1).toBe(2)
  })

  it("exception-grenen gir 'feil' og slår aldri opp i en tabell", () => {
    const fra = F.indexOf('exception when others')
    const til = F.indexOf('end; return')
    expect(fra).toBeGreaterThan(0)
    expect(til).toBeGreaterThan(fra)
    const handler = F.slice(fra, til)
    expect(handler).toContain("'klubb_status', 'feil'")
    expect(handler).not.toMatch(/\bfrom\b/)
  })

  it('rettigheter: execute kun for supabase_auth_admin, kolonnegrant og navngitt policy', () => {
    expect(F).toContain('revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated')
    expect(F).toContain('grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin')
    expect(F).toContain('grant select (profil_id, klubb_id, rolle, aktiv, opprettet) on public.medlemskap to supabase_auth_admin')
    expect(F).toContain('create policy "auth-hooken leser medlemskap på tvers av klubber" on public.medlemskap for select to supabase_auth_admin using (true)')
  })

  it('jwt_klubb_id() validerer med regex før cast; ingen jwt_rolle() (rolle-claimen er ikke autorisasjon)', () => {
    expect(F).toContain("v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid")
    expect(F).toContain('grant execute on function public.jwt_klubb_id() to authenticated, service_role')
    expect(F).not.toContain('jwt_rolle')
  })

  it('redefinerer ikke rolle-funksjonene', () => {
    expect(F).not.toMatch(/function public\.er_admin/)
    expect(F).not.toMatch(/function public\.er_generalsekretaer/)
    expect(F).not.toMatch(/function public\.standard_klubb_id/)
  })

  it('config.toml aktiverer hooken lokalt med riktig uri', () => {
    const toml = les('supabase/config.toml')
    expect(toml).toMatch(/^\[auth\.hook\.custom_access_token\]\nenabled = true\nuri = "pg-functions:\/\/postgres\/public\/custom_access_token_hook"$/m)
  })
})

// Runbookens tørrkjøring (docs/drift.md § 4) og CI kjører samme fil, så de ikke kan drive.
describe('tørrkjøringen før aktivering — delt mellom runbook og CI', () => {
  const SJEKK = les('supabase/sjekk/166_toerrkjoering.sql')
  const DRIFT = les('docs/drift.md')
  const CI = les('.github/workflows/pr-check.yml')
  // Samme mønster som CI-steget teller med (grep -cE "^  \('[0-9]{2} ").
  const kontroller = SJEKK.match(/^ {2}\('\d{2} /gm) ?? []

  it('CI kjører fila som postgres, og pinner at postgres ikke kan bli supabase_auth_admin', () => {
    const steg = CI.slice(CI.indexOf('- name: Tørrkjøring fra runbooken (som postgres)'), CI.indexOf('- name: Verifiser JWT-hook'))
    expect(steg).toContain('fil=supabase/sjekk/166_toerrkjoering.sql')
    expect(steg).toContain('-U postgres')
    expect(steg).not.toContain('-U supabase_admin')
    expect(steg).toContain('permission denied to set role')
  })

  it('runbooken lenker til fila, oppgir riktig antall rader og har ingen egen kopi av blokk 1', () => {
    expect(kontroller.length).toBeGreaterThanOrEqual(17)
    expect(DRIFT).toContain('supabase/sjekk/166_toerrkjoering.sql')
    expect(DRIFT).toContain(`Alle ${kontroller.length} rader skal ha \`ok = true\``)
    expect(DRIFT).not.toContain("has_column_privilege('supabase_auth_admin'")
  })

  it('kolonnelista i sjekken er den samme som migrasjonen granter', () => {
    expect(SJEKK).toContain("array['profil_id', 'klubb_id', 'rolle', 'aktiv', 'opprettet']")
    expect(F).toContain('grant select (profil_id, klubb_id, rolle, aktiv, opprettet) on public.medlemskap to supabase_auth_admin')
  })
})
