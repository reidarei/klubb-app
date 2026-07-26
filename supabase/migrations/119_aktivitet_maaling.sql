-- Anonym aktivitetsmåling (#484)
--
-- To aggregat-tabeller — ingen per-bruker-rader, ingen profil_id. Klienten
-- (AktivitetTeller) sender kun tre booleans (unik_dag, unik_uke, treff);
-- serveren teller opp uten å vite hvem eller hvilken enhet det gjaldt.
-- unike <= treff er IKKE en constraint her — de to tallene økes i separate
-- upsert-grener og kan i prinsippet drifte hvis en av grenene svikter
-- (ingen rekkefølge-avhengighet mellom dem er ønsket eller garantert).

create table public.aktivitet_dag (
  dag    date not null primary key,
  unike  int  not null default 0,
  treff  int  not null default 0,
  check (unike >= 0 and treff >= 0)
);

create table public.aktivitet_uke (
  uke_start date not null primary key,
  unike     int  not null default 0,
  check (unike >= 0)
);

alter table public.aktivitet_dag enable row level security;
alter table public.aktivitet_uke enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på eksisterende prosjekter, jf. migrasjonspolicy)
-- IKKE grant til anon — ingen offentlige flater. Ingen delete-grant: radene
-- skal aldri fjernes av klient-kode, kun akkumuleres av tell_aktivitet().
grant select on public.aktivitet_dag to authenticated;
grant select, insert, update on public.aktivitet_dag to service_role;

grant select on public.aktivitet_uke to authenticated;
grant select, insert, update on public.aktivitet_uke to service_role;

create policy "Admin kan lese aktivitet_dag"
  on public.aktivitet_dag for select
  using (er_admin());

create policy "Admin kan lese aktivitet_uke"
  on public.aktivitet_uke for select
  using (er_admin());

-- RPC som gjør begge upsert i én transaksjon (atomisk — enten begge lykkes
-- eller ingen). Dato/uke regnes server-autoritativt fra Oslo-tid inne i
-- funksjonen; klienten sender aldri en dato selv (unngår klokke-juks/-drift
-- og holder endepunktet anonymt — ingen tidsstempel som kan korreleres mot
-- andre logger per bruker).
--
-- date_trunc('week', ...) i Postgres er ISO-uke (mandag-basert) — matcher
-- lib/dato.ts sin osloUkestart().
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
  on conflict (dag) do update set
    unike = aktivitet_dag.unike + (case when p_unik_dag then 1 else 0 end),
    treff = aktivitet_dag.treff + (case when p_treff then 1 else 0 end);

  insert into public.aktivitet_uke (uke_start, unike)
  values (v_uke, case when p_unik_uke then 1 else 0 end)
  on conflict (uke_start) do update set
    unike = aktivitet_uke.unike + (case when p_unik_uke then 1 else 0 end);
end; $$;

grant execute on function public.tell_aktivitet(boolean, boolean, boolean) to service_role;
