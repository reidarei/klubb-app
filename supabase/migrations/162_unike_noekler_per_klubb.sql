-- Multi-tenant 1.4 (#861, #867): unike nøkler og dedup-indekser per klubb.
--
-- Etter 161 har alle klubbeide tabeller klubb_id, men nøklene er fortsatt
-- globale: to klubber kunne ikke begge ha arrangøransvar for «Juletur 2027»,
-- en varselinnstilling med samme nøkkel eller samme dedup_noekkel i
-- varsel_logg. Her får hver nøkkel klubb_id FØRST (så den også er
-- FK-støtteindeks for klubb_id).
--
-- Inventaret har to klasser (se HK-app_losningsdesign.md § 2.11):
--   endres (21 nøkler på 19 tabeller)  får klubb_id først, samme navn beholdt
--   via forelder (9)                   står: nøkkelen inneholder en FK til en
--       klubbeid forelder (f.eks. paameldinger (arrangement_id, profil_id)).
--       Å legge til klubb_id ville gjort nøkkelen romsligere, ikke strengere;
--       krysskobling stoppes av sammensatte FK-er i 2.1b (#895).
-- Surrogatnøkler (id) står uendret. Ingen unntak: chat_reaksjoner har en
-- polymorf melding_id uten FK, så klubben kan ikke følge en forelder — da
-- må klubb_id stå i nøkkelen som på alle andre.
--
-- Én-rad-tabellene klubb_info og fond_kontant mister id-kolonnen og får PK
-- (klubb_id): én rad per klubb.
--
-- Konfliktmålet (ON CONFLICT) MÅ ha nøyaktig samme kolonnesett som nøkkelen, ellers 42P10.
-- Derfor skrives tell_aktivitet() og krev_bursdagsbilde() om her, og
-- onConflict i koden byttes i samme PR. Insert i funksjonene oppgir ikke
-- klubb_id: defaulten fyller den (eksplisitt klubb kommer i 2.4).
--
-- drop/add er separate setninger uten «if exists»: et feil navn skal feile
-- høyt og rulle tilbake, og skjemavakten (migrasjon-skjema.ts) leser bare
-- «alter table X add …». Vaktes av psql-steget «Verifiser unike nøkler per
-- klubb» i .github/workflows/pr-check.yml og e2e/rls/klubb-noekler.spec.ts.

-- Se 161 om 25P01-varselet: grensen gjelder likevel for resten av fila.
set local lock_timeout = '3s';

alter table public.aktivitet_dag drop constraint aktivitet_dag_pkey;
alter table public.aktivitet_dag add constraint aktivitet_dag_pkey primary key (klubb_id, dag);

alter table public.aktivitet_uke drop constraint aktivitet_uke_pkey;
alter table public.aktivitet_uke add constraint aktivitet_uke_pkey primary key (klubb_id, uke_start);

alter table public.app_innstillinger drop constraint app_innstillinger_pkey;
alter table public.app_innstillinger add constraint app_innstillinger_pkey primary key (klubb_id, noekkel);

alter table public.bursdagsbilde drop constraint bursdagsbilde_pkey;
alter table public.bursdagsbilde add constraint bursdagsbilde_pkey primary key (klubb_id, profil_id, feiringsdato);

alter table public.fond_navn_alias drop constraint fond_navn_alias_pkey;
alter table public.fond_navn_alias add constraint fond_navn_alias_pkey primary key (klubb_id, api_navn);

alter table public.innspill_kobling drop constraint innspill_kobling_pkey;
alter table public.innspill_kobling add constraint innspill_kobling_pkey primary key (klubb_id, issue_nummer);

alter table public.kart_symbol_tilpasning drop constraint kart_symbol_tilpasning_pkey;
alter table public.kart_symbol_tilpasning add constraint kart_symbol_tilpasning_pkey primary key (klubb_id, symbol);

alter table public.arrangoransvar drop constraint arrangoransvar_aar_arrangement_navn_ansvarlig_id_key;
alter table public.arrangoransvar add constraint arrangoransvar_aar_arrangement_navn_ansvarlig_id_key unique (klubb_id, aar, arrangement_navn, ansvarlig_id);

alter table public.samtale drop constraint samtale_par_unik;
alter table public.samtale add constraint samtale_par_unik unique (klubb_id, profil_a, profil_b);

alter table public.varsel_innstillinger drop constraint varsel_innstillinger_noekkel_key;
alter table public.varsel_innstillinger add constraint varsel_innstillinger_noekkel_key unique (klubb_id, noekkel);

alter table public.vedtekter drop constraint vedtekter_slug_key;
alter table public.vedtekter add constraint vedtekter_slug_key unique (klubb_id, slug);

-- chat_reaksjoner: PK fra 048 og «én emoji per bruker» fra 114 (laget i en
-- do-blokk, men en vanlig constraint). melding_id er polymorf uten FK.
alter table public.chat_reaksjoner drop constraint chat_reaksjoner_pkey;
alter table public.chat_reaksjoner add constraint chat_reaksjoner_pkey primary key (klubb_id, melding_id, profil_id, emoji);

alter table public.chat_reaksjoner drop constraint chat_reaksjoner_unik_per_bruker;
alter table public.chat_reaksjoner add constraint chat_reaksjoner_unik_per_bruker unique (klubb_id, melding_id, profil_id);

-- Én-rad-tabeller: id (og check på id) forsvinner, PK blir klubb_id.
alter table public.klubb_info drop constraint klubb_info_pkey;
alter table public.klubb_info drop column id;
alter table public.klubb_info add constraint klubb_info_pkey primary key (klubb_id);

alter table public.fond_kontant drop constraint fond_kontant_pkey;
alter table public.fond_kontant drop column id;
alter table public.fond_kontant add constraint fond_kontant_pkey primary key (klubb_id);

-- Unike indekser (predikat og uttrykk ordrett fra 066/081/121/154).
drop index public.feil_logg_profil_event_minutt_uq;
create unique index feil_logg_profil_event_minutt_uq
  on public.feil_logg (
    klubb_id,
    coalesce(profil_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event,
    feil_logg_bucket(opprettet)
  )
  where (kontekst->>'klikk_id') is null;

drop index public.feil_logg_event_klikk_forsok_uq;
create unique index feil_logg_event_klikk_forsok_uq
  on public.feil_logg (
    klubb_id,
    event,
    (kontekst->>'klikk_id'),
    coalesce(kontekst->>'forsok', '')
  )
  where (kontekst->>'klikk_id') is not null;

drop index public.klubb_chat_kilde_ekstern_id_unique;
create unique index klubb_chat_kilde_ekstern_id_unique
  on public.klubb_chat (klubb_id, kilde_ekstern_id)
  where kilde_ekstern_id is not null;

drop index public.melding_chat_kilde_ekstern_id_unique;
create unique index melding_chat_kilde_ekstern_id_unique
  on public.melding_chat (klubb_id, kilde_ekstern_id)
  where kilde_ekstern_id is not null;

drop index public.meldinger_kilde_ekstern_id_unique;
create unique index meldinger_kilde_ekstern_id_unique
  on public.meldinger (klubb_id, kilde_ekstern_id)
  where kilde_ekstern_id is not null;

drop index public.varsel_logg_dedup_noekkel_uniq;
create unique index varsel_logg_dedup_noekkel_uniq
  on public.varsel_logg (klubb_id, dedup_noekkel, profil_id)
  where dedup_noekkel is not null;

-- Funksjoner med konfliktmål mot nøklene over: samme kropp som 119/140,
-- nytt konfliktmål.
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
