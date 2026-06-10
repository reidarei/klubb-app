-- Lukk kåringspoll umiddelbart (manuell variant av avslutt_kaaringspoll).
--
-- Bakgrunn: cron-jobben (lib/actions/paaminnelser.ts) plukker opp poller
-- når svarfristen er passert og kaller avslutt_kaaringspoll. Generalsekretær
-- skal i tillegg kunne lukke en åpen kåring her og nå — uten å vente på
-- at fristen og cron skal innfinne seg. Logikken er identisk med 077,
-- bortsett fra at vi hopper over moden-sjekken (svarfrist > now()).
--
-- Tilgang: kun generalsekretær. Vi sjekker dette i SQL via en hjelper
-- som speiler Policy: Roller fra app-laget. Samme som er_admin() — RLS
-- må kjenne rollene fordi SECURITY DEFINER omgår normal RLS.
--
-- Vi setter også svarfrist = least(svarfrist, now()) når vi lukker.
-- Insert-policyen for poll_stemme (mig. 049) sjekker `svarfrist > now()`,
-- ikke avsluttet_paa, så uten denne oppdateringen kunne medlemmer fortsette
-- å stemme etter manuell lukking — og potensielt endre vinneren etter at
-- den allerede er beregnet og varsler er sendt.

create or replace function er_generalsekretaer()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles
     where id = auth.uid()
       and rolle = 'generalsekretaer'
  )
$$;

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

revoke execute on function lukk_kaaringspoll_naa(uuid) from public;
grant execute on function lukk_kaaringspoll_naa(uuid) to authenticated;
