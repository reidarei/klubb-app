-- Fiks: per_aar-CTE brukte rå UTC-tidspunkt som kan gi feil årstall rundt nyttår.
-- Endrer extract() til å bruke 'Europe/Oslo'-tidssone — konsistens med i_aar_arr-CTE.
-- Mønsteret er det samme som i mig. 091 (search_path) og 079 (tell_poll_stemmer).

create or replace function get_statistikk()
returns json
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with historiske as (
    select id, start_tidspunkt, opprettet_av
    from arrangementer
    where start_tidspunkt < now()
  ),
  i_aar_arr as (
    select id
    from historiske
    where extract(year from start_tidspunkt at time zone 'Europe/Oslo')
          = extract(year from (now() at time zone 'Europe/Oslo'))
  ),
  deltagelse as (
    select
      p.profil_id,
      count(*) as totalt,
      count(*) filter (where a.start_tidspunkt >= now() - interval '12 months') as siste12,
      count(*) filter (where a.id in (select id from i_aar_arr)) as i_aar
    from paameldinger p
    join historiske a on a.id = p.arrangement_id
    where p.status = 'ja'
    group by p.profil_id
  ),
  arrangert as (
    select opprettet_av, count(*) as antall
    from historiske
    group by opprettet_av
  ),
  per_aar as (
    -- Oslo-tid også her, se #229 — konsistens med i_aar_arr
    select extract(year from start_tidspunkt at time zone 'Europe/Oslo')::int as aar, count(*)::int as antall
    from historiske
    group by 1
  )
  select json_build_object(
    'totalt', (select count(*) from historiske),
    'siste12', (select count(*) from historiske where start_tidspunkt >= now() - interval '12 months'),
    'i_aar_totalt', (select count(*) from i_aar_arr),
    'deltagelse', (
      select json_agg(
        json_build_object(
          'id', pr.id,
          'navn', pr.navn,
          'totalt', coalesce(d.totalt, 0),
          'siste12', coalesce(d.siste12, 0),
          'arrangert', coalesce(arr.antall, 0),
          'i_aar', coalesce(d.i_aar, 0)
        )
        order by coalesce(d.totalt, 0) desc, pr.navn
      )
      from profiles pr
      left join deltagelse d on d.profil_id = pr.id
      left join arrangert arr on arr.opprettet_av = pr.id
      where pr.aktiv = true
    ),
    'per_aar', (
      select json_agg(json_build_object('aar', aar, 'antall', antall) order by aar desc)
      from per_aar
    )
  )
$$;

revoke execute on function public.get_statistikk() from public;
grant execute on function public.get_statistikk() to authenticated;
