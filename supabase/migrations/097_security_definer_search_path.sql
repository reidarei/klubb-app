-- Sikkerhetsfiks: lås search_path på er_admin() og handle_ny_bruker().
--
-- SECURITY DEFINER-funksjoner uten eksplisitt search_path er sårbare for
-- search_path-hijacking via pg_temp: en angriper kan plassere egne objekter
-- (tabeller, funksjoner) i et schema som dukker opp foran 'public' i søkestien,
-- og dermed omgå logikken inni funksjonen.
--
-- Mønsteret er det samme som ble brukt i mig. 091 (get_statistikk) og
-- mig. 094 (sett_generalsekretaer, fjern_generalsekretaer).
-- Tracker: issue #301.
--
-- VIKTIG: search_path = public-tillegget er den primære endringen. I tillegg
-- hardes er_admin() til å returnere en total boolean (NULL → false) — se under.

-- 1) er_admin() — opprinnelig fra mig. 041, sist sett uten search_path
--
-- NULL-hardning lagt til etter Copilot-funn: tidligere kropp
-- (`select rolle in (...) from profiles where id = auth.uid()`) returnerer NULL
-- når SELECT-en ikke gir treff (f.eks. auth.uid() peker på rad som ikke finnes).
-- I RLS-policies (`using (er_admin())`) tolkes NULL som false og er trygt, men
-- i plpgsql-RPC-er som `sett_generalsekretaer` (mig. 094) brukes mønsteret
-- `if not er_admin() then raise` — og `not NULL` er NULL, så raise-grenen
-- hoppes over og admin-guarden omgås. `exists (...)` gir alltid true/false.
create or replace function er_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and rolle in ('admin', 'generalsekretaer')
  )
$$;

-- 2) handle_ny_bruker() — opprinnelig fra mig. 001, sist redigert i mig. 071 (btrim-forsvar mot whitespace i e-post)
create or replace function handle_ny_bruker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, epost, navn, visningsnavn)
  values (
    new.id,
    new.email,
    btrim(split_part(new.email, '@', 1)),
    btrim(split_part(new.email, '@', 1))
  );
  return new;
end;
$$;
