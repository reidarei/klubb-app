-- Multi-tenant 2.4 (#871, del av #861): SQL-funksjoner som setter inn rader setter klubb selv.
--
-- HVA: fem funksjoner som skriver rader uten å gå via en brukers RLS-kontekst (eller der
-- klubben i dag bare kommer fra kolonne-defaulten standard_klubb_id()) får klubben eksplisitt
-- i insertene sine:
--   * tell_aktivitet        (service_role)  — ny parameter p_klubb_id uuid default null
--   * krev_bursdagsbilde    (service_role)  — ny parameter p_klubb_id uuid default null
--   * avslutt_kaaringspoll  (cron)          — klubb_id leses fra pollen (v_poll.klubb_id)
--   * lukk_kaaringspoll_naa (brukerklient)  — klubb_id leses fra pollen (v_poll.klubb_id)
--   * skriv_fond_bevegelser (brukerklient)  — klubb_id = public.aktiv_klubb()
--
-- HVORFOR: 2.4b (#896) gjør standard_klubb_id() feile-lukket. Da kan ingen insert lene seg på
-- defaulten. I prod er oppførselen identisk med før (det finnes én klubb), så dette er ren
-- forberedelse.
--
-- REKKEFØLGE: parametrene har default null og faller tilbake til standard_klubb_id(), så
-- migrasjonen er bakoverkompatibel med dagens kode. Den skal kjøres FØR koden som sender
-- p_klubb_id (ukjent parameter gir PGRST202). 2.4b fjerner «default null» og fallbacken.
--
-- tell_aktivitet og krev_bursdagsbilde får ny signatur, så den gamle droppes (grants forsvinner
-- med den og gjenopprettes under). De tre andre har uendret signatur: create or replace bevarer
-- grants (avslutt: kun service_role fra 078; lukk: authenticated fra 080; fond: authenticated +
-- service_role fra 126). Kroppene er kopiert fra 077/080/126/162; eneste endring er klubb.
--
-- IKKE med her: klubbfilter på delete i skriv_fond_bevegelser og er_admin(klubb) i samme
-- funksjon — det hører til 2.3b (#907).
-- Down-SQL: supabase/sjekk/168_ned.sql. se CLAUDE.md § Policy: Migrasjoner

-- ─── tell_aktivitet ──────────────────────────────────────────────────────────
drop function public.tell_aktivitet(boolean, boolean, boolean);

create function public.tell_aktivitet(
  p_unik_dag boolean, p_unik_uke boolean, p_treff boolean,
  p_klubb_id uuid default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_dag date := (now() at time zone 'Europe/Oslo')::date;
  v_uke date := date_trunc('week', now() at time zone 'Europe/Oslo')::date; -- ISO-mandag
  v_klubb uuid := coalesce(p_klubb_id, public.standard_klubb_id());
begin
  insert into public.aktivitet_dag (klubb_id, dag, unike, treff)
  values (v_klubb, v_dag, case when p_unik_dag then 1 else 0 end, case when p_treff then 1 else 0 end)
  on conflict (klubb_id, dag) do update set
    unike = aktivitet_dag.unike + (case when p_unik_dag then 1 else 0 end),
    treff = aktivitet_dag.treff + (case when p_treff then 1 else 0 end);

  insert into public.aktivitet_uke (klubb_id, uke_start, unike)
  values (v_klubb, v_uke, case when p_unik_uke then 1 else 0 end)
  on conflict (klubb_id, uke_start) do update set
    unike = aktivitet_uke.unike + (case when p_unik_uke then 1 else 0 end);
end; $$;

revoke execute on function public.tell_aktivitet(boolean, boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.tell_aktivitet(boolean, boolean, boolean, uuid) to service_role;

-- ─── krev_bursdagsbilde ──────────────────────────────────────────────────────
drop function public.krev_bursdagsbilde(uuid, date, boolean);

create function public.krev_bursdagsbilde(
  p_profil_id uuid,
  p_feiringsdato date,
  p_tvungen boolean default false,
  p_klubb_id uuid default null
)
returns setof public.bursdagsbilde
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.bursdagsbilde (klubb_id, profil_id, feiringsdato, status, paabegynt, forsok)
  values (coalesce(p_klubb_id, public.standard_klubb_id()), p_profil_id, p_feiringsdato, 'paagaar', now(),
          case when p_tvungen then 0 else 1 end)
  on conflict (klubb_id, profil_id, feiringsdato) do update
     set status = 'paagaar',
         paabegynt = now(),
         forsok = bursdagsbilde.forsok + case when p_tvungen then 0 else 1 end,
         siste_feil = null
   where case
           when p_tvungen then
             bursdagsbilde.status <> 'paagaar'
             or bursdagsbilde.paabegynt < now() - interval '60 seconds'
           else
             (bursdagsbilde.status = 'feilet'
              or (bursdagsbilde.status = 'paagaar'
                  and bursdagsbilde.paabegynt < now() - interval '10 minutes'))
             and bursdagsbilde.forsok < 5
         end
  returning *;
$$;

revoke execute on function public.krev_bursdagsbilde(uuid, date, boolean, uuid) from public, anon, authenticated;
grant execute on function public.krev_bursdagsbilde(uuid, date, boolean, uuid) to service_role;

-- ─── avslutt_kaaringspoll (kropp fra 077; grants fra 078 urørt) ──────────────
create or replace function avslutt_kaaringspoll(p_poll_id uuid)
returns table (
  vinner_profil_id      uuid,
  vinner_arrangement_id uuid,
  var_ny                boolean,
  status                text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_poll record;
  v_topp_antall integer;
  v_topp_count integer;
  v_vinner_valg record;
begin
  select id, klubb_id, kaaring_mal_id, aar, svarfrist, avsluttet_paa, opprettet_av
    into v_poll
    from poll
   where id = p_poll_id
   for update;

  if not found then
    return query select null::uuid, null::uuid, false, 'ikke_funnet'::text;
    return;
  end if;

  if v_poll.kaaring_mal_id is null then
    return query select null::uuid, null::uuid, false, 'ikke_kaaring'::text;
    return;
  end if;

  if v_poll.avsluttet_paa is not null then
    return query select null::uuid, null::uuid, false, 'allerede_avsluttet'::text;
    return;
  end if;

  if v_poll.svarfrist > now() then
    return query select null::uuid, null::uuid, false, 'ikke_moden'::text;
    return;
  end if;

  with stemmer_per_valg as (
    select pv.id as valg_id,
           pv.referanse_profil_id,
           pv.referanse_arrangement_id,
           count(ps.profil_id) as antall
      from poll_valg pv
      left join poll_stemme ps on ps.valg_id = pv.id
     where pv.poll_id = p_poll_id
     group by pv.id, pv.referanse_profil_id, pv.referanse_arrangement_id
  )
  select max(antall), count(*) filter (where antall = (select max(antall) from stemmer_per_valg))
    into v_topp_antall, v_topp_count
    from stemmer_per_valg;

  if v_topp_antall is null or v_topp_antall = 0 then
    update poll
       set avsluttet_paa = now()
     where id = p_poll_id;
    return query select null::uuid, null::uuid, true, 'ingen_stemmer'::text;
    return;
  end if;

  if v_topp_count > 1 then
    update poll
       set avsluttet_paa   = now(),
           tiebreak_status = 'venter_paa_tiebreak'
     where id = p_poll_id;
    return query select null::uuid, null::uuid, true, 'venter_paa_tiebreak'::text;
    return;
  end if;

  with stemmer_per_valg as (
    select pv.id as valg_id,
           pv.referanse_profil_id,
           pv.referanse_arrangement_id,
           count(ps.profil_id) as antall
      from poll_valg pv
      left join poll_stemme ps on ps.valg_id = pv.id
     where pv.poll_id = p_poll_id
     group by pv.id, pv.referanse_profil_id, pv.referanse_arrangement_id
  )
  select valg_id, referanse_profil_id, referanse_arrangement_id
    into v_vinner_valg
    from stemmer_per_valg
   where antall = v_topp_antall
   limit 1;

  -- Drop coalesce — opprettet_av er not null på poll, så fallback maskerte
  -- bare evt. invariant-brudd. La det feile.
  insert into kaaring_vinnere (klubb_id, mal_id, aar, profil_id, arrangement_id, opprettet_av, poll_id)
  values (
    v_poll.klubb_id,
    v_poll.kaaring_mal_id,
    v_poll.aar,
    v_vinner_valg.referanse_profil_id,
    v_vinner_valg.referanse_arrangement_id,
    v_poll.opprettet_av,
    p_poll_id
  )
  on conflict (mal_id, aar) do nothing;

  update poll
     set avsluttet_paa   = now(),
         tiebreak_status = 'avgjort'
   where id = p_poll_id;

  return query select v_vinner_valg.referanse_profil_id,
                      v_vinner_valg.referanse_arrangement_id,
                      true,
                      'avgjort'::text;
end;
$$;

-- ─── lukk_kaaringspoll_naa (kropp fra 080) ───────────────────────────────────
create or replace function lukk_kaaringspoll_naa(p_poll_id uuid)
returns table (
  vinner_profil_id      uuid,
  vinner_arrangement_id uuid,
  var_ny                boolean,
  status                text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_poll record;
  v_topp_antall integer;
  v_topp_count integer;
  v_vinner_valg record;
begin
  if not er_generalsekretaer() then
    raise exception 'forbudt';
  end if;

  select id, klubb_id, kaaring_mal_id, aar, svarfrist, avsluttet_paa, opprettet_av
    into v_poll
    from poll
   where id = p_poll_id
   for update;

  if not found then
    return query select null::uuid, null::uuid, false, 'ikke_funnet'::text;
    return;
  end if;

  if v_poll.kaaring_mal_id is null then
    return query select null::uuid, null::uuid, false, 'ikke_kaaring'::text;
    return;
  end if;

  if v_poll.avsluttet_paa is not null then
    return query select null::uuid, null::uuid, false, 'allerede_avsluttet'::text;
    return;
  end if;

  -- NB: Hopper over moden-sjekken bevisst — manuell lukking skal kunne
  -- skje før svarfristen er passert.

  with stemmer_per_valg as (
    select pv.id as valg_id,
           pv.referanse_profil_id,
           pv.referanse_arrangement_id,
           count(ps.profil_id) as antall
      from poll_valg pv
      left join poll_stemme ps on ps.valg_id = pv.id
     where pv.poll_id = p_poll_id
     group by pv.id, pv.referanse_profil_id, pv.referanse_arrangement_id
  )
  select max(antall), count(*) filter (where antall = (select max(antall) from stemmer_per_valg))
    into v_topp_antall, v_topp_count
    from stemmer_per_valg;

  if v_topp_antall is null or v_topp_antall = 0 then
    update poll
       set avsluttet_paa = now(),
           svarfrist     = least(svarfrist, now())
     where id = p_poll_id;
    return query select null::uuid, null::uuid, true, 'ingen_stemmer'::text;
    return;
  end if;

  if v_topp_count > 1 then
    update poll
       set avsluttet_paa   = now(),
           svarfrist       = least(svarfrist, now()),
           tiebreak_status = 'venter_paa_tiebreak'
     where id = p_poll_id;
    return query select null::uuid, null::uuid, true, 'venter_paa_tiebreak'::text;
    return;
  end if;

  with stemmer_per_valg as (
    select pv.id as valg_id,
           pv.referanse_profil_id,
           pv.referanse_arrangement_id,
           count(ps.profil_id) as antall
      from poll_valg pv
      left join poll_stemme ps on ps.valg_id = pv.id
     where pv.poll_id = p_poll_id
     group by pv.id, pv.referanse_profil_id, pv.referanse_arrangement_id
  )
  select valg_id, referanse_profil_id, referanse_arrangement_id
    into v_vinner_valg
    from stemmer_per_valg
   where antall = v_topp_antall
   limit 1;

  insert into kaaring_vinnere (klubb_id, mal_id, aar, profil_id, arrangement_id, opprettet_av, poll_id)
  values (
    v_poll.klubb_id,
    v_poll.kaaring_mal_id,
    v_poll.aar,
    v_vinner_valg.referanse_profil_id,
    v_vinner_valg.referanse_arrangement_id,
    v_poll.opprettet_av,
    p_poll_id
  )
  on conflict (mal_id, aar) do nothing;

  update poll
     set avsluttet_paa   = now(),
         svarfrist       = least(svarfrist, now()),
         tiebreak_status = 'avgjort'
   where id = p_poll_id;

  return query select v_vinner_valg.referanse_profil_id,
                      v_vinner_valg.referanse_arrangement_id,
                      true,
                      'avgjort'::text;
end;
$$;

-- ─── skriv_fond_bevegelser (kropp fra 126) ───────────────────────────────────
create or replace function public.skriv_fond_bevegelser(p_aar int, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_andel     jsonb;
  v_profil_id uuid;
begin
  -- security definer omgår RLS, så autorisasjonen må sjekkes eksplisitt her.
  if not er_admin() then
    raise exception 'Kun admin kan skrive fondsbevegelser';
  end if;

  for v_andel in select * from jsonb_array_elements(p_data)
  loop
    v_profil_id := (v_andel->>'profil_id')::uuid;

    -- Avgrens slettingen til året vi importerer. Uten det ville en import
    -- av 2027 tørket ut 2026-historikken.
    delete from fond_bevegelse
     where profil_id = v_profil_id
       and dato >= make_date(p_aar, 1, 1)
       and dato <  make_date(p_aar + 1, 1, 1);

    insert into fond_bevegelse (klubb_id, profil_id, dato, belop)
    select public.aktiv_klubb(), v_profil_id, (b->>'dato')::date, (b->>'belop')::numeric
      from jsonb_array_elements(v_andel->'bevegelser') b;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

-- ─── Egenkontroll ────────────────────────────────────────────────────────────
do $$
declare
  v_sig text;
begin
  select pg_get_function_identity_arguments('public.tell_aktivitet(boolean, boolean, boolean, uuid)'::regprocedure) into v_sig;
  if v_sig <> 'p_unik_dag boolean, p_unik_uke boolean, p_treff boolean, p_klubb_id uuid' then
    raise exception 'tell_aktivitet har uventet signatur: %', v_sig;
  end if;
  if to_regprocedure('public.tell_aktivitet(boolean, boolean, boolean)') is not null then
    raise exception 'gammel tell_aktivitet-signatur finnes fortsatt';
  end if;

  select pg_get_function_identity_arguments('public.krev_bursdagsbilde(uuid, date, boolean, uuid)'::regprocedure) into v_sig;
  if v_sig <> 'p_profil_id uuid, p_feiringsdato date, p_tvungen boolean, p_klubb_id uuid' then
    raise exception 'krev_bursdagsbilde har uventet signatur: %', v_sig;
  end if;
  if to_regprocedure('public.krev_bursdagsbilde(uuid, date, boolean)') is not null then
    raise exception 'gammel krev_bursdagsbilde-signatur finnes fortsatt';
  end if;

  select pg_get_function_identity_arguments('public.avslutt_kaaringspoll(uuid)'::regprocedure) into v_sig;
  if v_sig <> 'p_poll_id uuid' then
    raise exception 'avslutt_kaaringspoll har uventet signatur: %', v_sig;
  end if;
  select pg_get_function_identity_arguments('public.lukk_kaaringspoll_naa(uuid)'::regprocedure) into v_sig;
  if v_sig <> 'p_poll_id uuid' then
    raise exception 'lukk_kaaringspoll_naa har uventet signatur: %', v_sig;
  end if;
  select pg_get_function_identity_arguments('public.skriv_fond_bevegelser(integer, jsonb)'::regprocedure) into v_sig;
  if v_sig <> 'p_aar integer, p_data jsonb' then
    raise exception 'skriv_fond_bevegelser har uventet signatur: %', v_sig;
  end if;

  -- De to service_role-funksjonene skal aldri kunne kalles av klienter.
  if has_function_privilege('public', 'public.tell_aktivitet(boolean, boolean, boolean, uuid)', 'execute')
     or has_function_privilege('anon', 'public.tell_aktivitet(boolean, boolean, boolean, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.tell_aktivitet(boolean, boolean, boolean, uuid)', 'execute') then
    raise exception 'tell_aktivitet har execute for public/anon/authenticated';
  end if;
  if has_function_privilege('public', 'public.krev_bursdagsbilde(uuid, date, boolean, uuid)', 'execute')
     or has_function_privilege('anon', 'public.krev_bursdagsbilde(uuid, date, boolean, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.krev_bursdagsbilde(uuid, date, boolean, uuid)', 'execute') then
    raise exception 'krev_bursdagsbilde har execute for public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.tell_aktivitet(boolean, boolean, boolean, uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.krev_bursdagsbilde(uuid, date, boolean, uuid)', 'execute') then
    raise exception 'service_role mangler execute på tell_aktivitet/krev_bursdagsbilde';
  end if;
end
$$;
