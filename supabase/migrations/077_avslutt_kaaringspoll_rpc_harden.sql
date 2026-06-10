-- Sikkerhetsharding av RPC-en fra 074:
--   1. Trekk tilbake default execute-grant fra `public`. SECURITY
--      DEFINER betyr at funksjonen kjører med skjema-eierens rettigheter,
--      og uten revoke kan `anon` (uautentisert) kalle den.
--   2. Drop coalesce-fallback til null-UUID for opprettet_av — `poll.opprettet_av`
--      er `not null` i skjemaet, så fallbacken kunne aldri trigge i
--      praksis, men den maskerer en ekte bug hvis invarianten brytes
--      senere. Bedre å feile hardt.

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

revoke execute on function avslutt_kaaringspoll(uuid) from public;
grant execute on function avslutt_kaaringspoll(uuid) to authenticated;
