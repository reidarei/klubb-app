create or replace function get_statistikk()
returns json
language sql
security definer
stable
as $$
  with historiske as (
    select id, start_tidspunkt, opprettet_av
    from arrangementer
    where start_tidspunkt < now()
  ),
  deltagelse as (
    select
      p.profil_id,
      count(*) as totalt,
      count(*) filter (where a.start_tidspunkt >= now() - interval '12 months') as siste12
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
    select extract(year from start_tidspunkt)::int as aar, count(*)::int as antall
    from historiske
    group by 1
  )
  select json_build_object(
    'totalt', (select count(*) from historiske),
    'siste12', (select count(*) from historiske where start_tidspunkt >= now() - interval '12 months'),
    'deltagelse', (
      select json_agg(
        json_build_object(
          'id', pr.id,
          'navn', pr.navn,
          'totalt', coalesce(d.totalt, 0),
          'siste12', coalesce(d.siste12, 0),
          'arrangert', coalesce(arr.antall, 0)
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
