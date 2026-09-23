-- RPC som avslutter en kåringspoll: telles stemmer, avgjør vinner (eller
-- markér tiebreak), og skriv til kaaring_vinnere. Kjøres typisk av
-- påminnelses-cronen kl 06 UTC, men kan også triggeres manuelt.
--
-- SECURITY DEFINER fordi cron-en bruker service-role allerede, men
-- definer-bypass gir oss en garanti om at samme funksjon kan brukes
-- senere fra en bruker-action uten å måtte tenke på RLS-policyer på
-- kaaring_vinnere. search_path er låst til public+pg_temp slik PG
-- 15+ best practice tilsier (forhindrer at en angriper med skrivetilgang
-- til en annen schema kan kapre tabellnavn).
--
-- Idempotent: kjøres samme poll to ganger blir andre kall en no-op
-- (avsluttet_paa er allerede satt → returnerer var_ny = false).

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
  -- Lås raden så vi ikke får race condition mellom to cron-kjøringer.
  select id, kaaring_mal_id, aar, svarfrist, avsluttet_paa
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

  -- Allerede avsluttet — idempotent retur.
  if v_poll.avsluttet_paa is not null then
    return query select null::uuid, null::uuid, false, 'allerede_avsluttet'::text;
    return;
  end if;

  -- Ikke moden — frist ikke passert ennå.
  if v_poll.svarfrist > now() then
    return query select null::uuid, null::uuid, false, 'ikke_moden'::text;
    return;
  end if;

  -- Aggregér stemmer per valg.
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

  -- Ingen stemmer i det hele tatt.
  if v_topp_antall is null or v_topp_antall = 0 then
    update poll
       set avsluttet_paa = now()
     where id = p_poll_id;
    return query select null::uuid, null::uuid, true, 'ingen_stemmer'::text;
    return;
  end if;

  -- Likt antall på topp → generalsekretær må velge i UI.
  if v_topp_count > 1 then
    update poll
       set avsluttet_paa   = now(),
           tiebreak_status = 'venter_paa_tiebreak'
     where id = p_poll_id;
    return query select null::uuid, null::uuid, true, 'venter_paa_tiebreak'::text;
    return;
  end if;

  -- Entydig vinner — finn raden og skriv til kaaring_vinnere.
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

  -- on conflict do nothing fordi (mal_id, aar) er unik — om noen har
  -- satt vinneren manuelt før cronen rakk det, så vinner manuell.
  insert into kaaring_vinnere (mal_id, aar, profil_id, arrangement_id, opprettet_av, poll_id)
  select v_poll.kaaring_mal_id,
         v_poll.aar,
         v_vinner_valg.referanse_profil_id,
         v_vinner_valg.referanse_arrangement_id,
         coalesce(
           (select opprettet_av from poll where id = p_poll_id),
           '00000000-0000-0000-0000-000000000000'::uuid
         ),
         p_poll_id
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

grant execute on function avslutt_kaaringspoll(uuid) to authenticated;
