-- Multi-tenant 2.2 (#869, del av #861): klubb og rolle i innloggings-tokenet.
--
-- custom_access_token_hook() kjøres av GoTrue (som supabase_auth_admin) hver gang et
-- token utstedes eller fornyes, og legger tre claims på tokenet:
--   klubb_status = 'aktiv' | 'ingen_medlemskap' | 'feil'
--   klubb_id     = medlemskapets klubb  (bare når klubb_status = 'aktiv')
--   rolle        = medlemskapets rolle  (bare når klubb_status = 'aktiv')
-- Valgregel: eldste aktive medlemskap (order by opprettet, klubb_id limit 1). Før 2.4
-- finnes det bare ett.
--
-- * Hooken kaster ALDRI og skriver ALDRI. En feil gir klubb_status = 'feil' (handleren
--   bygger kun jsonb fra eventet, aldri et nytt tabelloppslag) — en kastende hook ville
--   fått GoTrue til å svare feil og innloggingen til å dø for alle.
-- * Innplantede klubb_id/rolle/klubb_status i eventet strippes først: markørene i
--   tokenet skal komme fra hooken og ingen annen.
-- * Security invoker + search_path = '': hooken kjører som supabase_auth_admin og får
--   ikke mer enn kolonnegrantene og policyen under gir den.
-- * rolle-claimen er ren informasjon. Den er opptil en time gammel og kan ikke trekkes
--   tilbake, så den brukes ALDRI til autorisasjon (derfor finnes det ingen jwt_rolle()
--   med vilje). Rolle leses ferskt fra medlemskap, jf. CLAUDE.md § Policy: Roller.
-- * Policyen under er VARIG: hooken må se medlemskap på tvers av klubber for å velge.
--   2.3 (#870) skal la den stå. Dropper 2.3 den, blir per-profil-sjekken i psql-steget
--   «Verifiser JWT-hook» (pr-check.yml) rød — vakten styret ba om.
-- * Hooken er ubrukt til den aktiveres per instans (Dashboard → Authentication → Hooks,
--   lokalt config.toml). Se docs/drift.md § 4.
-- Down-SQL ligger i PR-teksten.

create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(event->'claims', '{}'::jsonb) - 'klubb_id' - 'rolle' - 'klubb_status';
  v_klubb uuid;
  v_rolle text;
begin
  begin
    select m.klubb_id, m.rolle into v_klubb, v_rolle
      from public.medlemskap m
     where m.profil_id = (event->>'user_id')::uuid
       and m.aktiv
     order by m.opprettet, m.klubb_id
     limit 1;

    if found then
      v_claims := v_claims || jsonb_build_object(
        'klubb_status', 'aktiv', 'klubb_id', v_klubb, 'rolle', v_rolle);
    else
      v_claims := v_claims || jsonb_build_object('klubb_status', 'ingen_medlemskap');
    end if;
  exception when others then
    -- Handleren bygger KUN jsonb fra eventet — aldri et tabelloppslag (styret, #869).
    raise warning 'custom_access_token_hook feilet: % (sqlstate %)', sqlerrm, sqlstate;
    v_claims := (coalesce(event->'claims', '{}'::jsonb) - 'klubb_id' - 'rolle' - 'klubb_status')
                || jsonb_build_object('klubb_status', 'feil');
  end;

  return jsonb_set(event, '{claims}', v_claims);
end
$$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select (profil_id, klubb_id, rolle, aktiv, opprettet) on public.medlemskap to supabase_auth_admin;

create policy "Auth-hooken leser medlemskap på tvers av klubber" on public.medlemskap
  for select to supabase_auth_admin using (true);

-- Klubben i innloggingstokenet, for RLS-policyer i 2.3/2.4. Regex før cast: et ugyldig
-- claim gir null, ikke en 22P02 som ville revet ned hele spørringen.
create function public.jwt_klubb_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid end
    from (select auth.jwt() ->> 'klubb_id' as v) s
$$;

revoke execute on function public.jwt_klubb_id() from public, anon;
grant execute on function public.jwt_klubb_id() to authenticated, service_role;
