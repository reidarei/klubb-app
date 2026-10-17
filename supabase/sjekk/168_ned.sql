-- Down-SQL for migrasjon 168 (#871): gjenoppretter de fem funksjonene slik de var før 168.
-- tell_aktivitet/krev_bursdagsbilde (kropp fra 162), avslutt_kaaringspoll (077), lukk_kaaringspoll_naa (080),
-- skriv_fond_bevegelser (126). Grants fra 078/080/126 bevares av create or replace.
-- Kjøres som postgres i én transaksjon. Kjør KUN etter at koden som sender p_klubb_id er rullet tilbake.
begin;

drop function public.tell_aktivitet(boolean, boolean, boolean, uuid);
drop function public.krev_bursdagsbilde(uuid, date, boolean, uuid);

create or replace function public.tell_aktivitet(
  p_unik_dag boolean, p_unik_uke boolean, p_treff boolean
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_dag date := (now() at time zone 'Europe/Oslo')::date;
  v_uke date := date_trunc('week', now() at time zone 'Europe/Oslo')::date; -- ISO-mandag
begin
  insert into public.aktivitet_dag (dag, unike, treff)
  values (v_dag, case when p_unik_dag then 1 else 0 end, case when p_treff then 1 else 0 end)
  on conflict (klubb_id, dag) do update set
    unike = aktivitet_dag.unike + (case when p_unik_dag then 1 else 0 end),
    treff = aktivitet_dag.treff + (case when p_treff then 1 else 0 end);

  insert into public.aktivitet_uke (uke_start, unike)
  values (v_uke, case when p_unik_uke then 1 else 0 end)
  on conflict (klubb_id, uke_start) do update set
    unike = aktivitet_uke.unike + (case when p_unik_uke then 1 else 0 end);
end; $$;

grant execute on function public.tell_aktivitet(boolean, boolean, boolean) to service_role;

create or replace function public.krev_bursdagsbilde(
  p_profil_id uuid,
  p_feiringsdato date,
  p_tvungen boolean default false
)
returns setof public.bursdagsbilde
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.bursdagsbilde (profil_id, feiringsdato, status, paabegynt, forsok)
  values (p_profil_id, p_feiringsdato, 'paagaar', now(),
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

revoke execute on function public.krev_bursdagsbilde(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.krev_bursdagsbilde(uuid, date, boolean) to service_role;

-- avslutt_kaaringspoll (077)
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
  select id, kaaring_mal_id, aar, svarfrist, avsluttet_paa, opprettet_av
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
  insert into kaaring_vinnere (mal_id, aar, profil_id, arrangement_id, opprettet_av, poll_id)
  values (
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

-- lukk_kaaringspoll_naa (080)
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

  select id, kaaring_mal_id, aar, svarfrist, avsluttet_paa, opprettet_av
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

  insert into kaaring_vinnere (mal_id, aar, profil_id, arrangement_id, opprettet_av, poll_id)
  values (
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

-- skriv_fond_bevegelser (126)
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

    insert into fond_bevegelse (profil_id, dato, belop)
    select v_profil_id, (b->>'dato')::date, (b->>'belop')::numeric
      from jsonb_array_elements(v_andel->'bevegelser') b;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
