-- Tørrkjøring før aktivering av JWT-hooken (migrasjon 166, #869). Se docs/drift.md § 4.
--
-- Kjøres som `postgres` (Supabase SQL-editoren). Hver rad skal ha ok = true.
-- CI kjører NØYAKTIG denne fila som postgres (pr-check.yml, steget «Tørrkjøring fra
-- runbooken») og krever det samme, så runbook og CI ikke kan drive fra hverandre.
--
-- Hva den beviser: at grantene, policyen og RLS-innstillingene som «Verifiser JWT-hook»
-- i CI testet UNDER supabase_auth_admin, finnes identisk her. Hva den IKKE beviser: at
-- invoker-stien faktisk kjører i denne instansen — postgres kan ikke `set role
-- supabase_auth_admin` på hosted Supabase (42501), så det skjer først ved aktivering.

with
  hook as (select 'public.custom_access_token_hook(jsonb)'::regprocedure as oid),
  hook_kolonner as (select unnest(array['profil_id', 'klubb_id', 'rolle', 'aktiv', 'opprettet']) as k),
  mtab as (select 'public.medlemskap'::regclass as oid)
select kontroll, ok from (values
  -- Funksjonens form
  ('01 hooken er security invoker',
     (select not p.prosecdef from pg_proc p, hook where p.oid = hook.oid)),
  ('02 hooken har tomt search_path',
     (select coalesce(p.proconfig @> array['search_path=""'], false) from pg_proc p, hook where p.oid = hook.oid)),
  -- Hvem kan kalle den
  ('03 supabase_auth_admin kan kjøre hooken',
     (select has_function_privilege('supabase_auth_admin', hook.oid, 'execute') from hook)),
  ('04 authenticated kan ikke kjøre hooken',
     (select not has_function_privilege('authenticated', hook.oid, 'execute') from hook)),
  ('05 anon kan ikke kjøre hooken',
     (select not has_function_privilege('anon', hook.oid, 'execute') from hook)),
  ('06 public kan ikke kjøre hooken',
     (select not has_function_privilege('public', hook.oid, 'execute') from hook)),
  -- Det invoker-stien trenger for å lese medlemskap
  ('07 supabase_auth_admin har usage på schema public',
     has_schema_privilege('supabase_auth_admin', 'public', 'usage')),
  ('08 supabase_auth_admin kan lese de fem hook-kolonnene',
     (select bool_and(has_column_privilege('supabase_auth_admin', mtab.oid, k, 'select')) from hook_kolonner, mtab)),
  ('09 policyen for supabase_auth_admin finnes (select, using true)',
     exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'medlemskap'
                and policyname = 'Auth-hooken leser medlemskap på tvers av klubber'
                and roles = array['supabase_auth_admin']::name[]
                and cmd = 'SELECT' and qual = 'true')),
  ('10 RLS er på for medlemskap (ellers er policyen uten betydning)',
     (select c.relrowsecurity from pg_class c, mtab where c.oid = mtab.oid)),
  ('11 RLS er ikke tvunget på eieren av medlemskap',
     (select not c.relforcerowsecurity from pg_class c, mtab where c.oid = mtab.oid)),
  -- Ingen glipp bak «alt er true»: ikke mer enn nødvendig
  ('12 supabase_auth_admin har ikke tabell-select på medlemskap (kun kolonnene)',
     (select not has_table_privilege('supabase_auth_admin', mtab.oid, 'select') from mtab)),
  ('13 supabase_auth_admin kan ikke lese andre kolonner i medlemskap',
     not exists (select 1 from pg_attribute a, mtab
                  where a.attrelid = mtab.oid and a.attnum > 0 and not a.attisdropped
                    and a.attname not in (select k from hook_kolonner)
                    and has_column_privilege('supabase_auth_admin', mtab.oid, a.attnum, 'select'))),
  ('14 supabase_auth_admin kan ikke skrive til medlemskap',
     (select not has_table_privilege('supabase_auth_admin', mtab.oid, 'insert, update, delete, truncate, references, trigger')
         and not has_any_column_privilege('supabase_auth_admin', mtab.oid, 'insert, update, references') from mtab)),
  ('15 ingen annen policy på medlemskap nevner supabase_auth_admin',
     not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'medlemskap'
                    and 'supabase_auth_admin' = any(roles)
                    and policyname <> 'Auth-hooken leser medlemskap på tvers av klubber')),
  -- jwt_klubb_id() og fraværet av jwt_rolle()
  ('16 authenticated kan kjøre jwt_klubb_id(), anon kan ikke',
     has_function_privilege('authenticated', 'public.jwt_klubb_id()', 'execute')
       and not has_function_privilege('anon', 'public.jwt_klubb_id()', 'execute')),
  ('17 public.jwt_rolle() finnes ikke',
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'jwt_rolle'))
) as t(kontroll, ok)
order by kontroll;
