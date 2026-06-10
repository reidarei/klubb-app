-- Pass-info + tilgangsforespørsler (#75). Pass-data lagres i egen
-- tabell utenfor profiles slik at RLS kan være streng uten å påvirke
-- den eksisterende «alle aktive kan lese profiler»-policyen.

-- === pass_info ==================================================
create table pass_info (
  profil_id uuid primary key references profiles(id) on delete cascade,
  nummer    text,
  utloper   date,
  oppdatert timestamptz not null default now()
);

alter table pass_info enable row level security;

-- === pass_tilgang_forespørsel ===================================
-- Én rad per forespørsel. status går venter → godkjent/avslatt.
-- gyldig_til settes ved godkjenning til now() + 1 dag og leses av
-- har_pass_tilgang() under for å håndheve dagstilgangen.
create table pass_tilgang_forespørsel (
  id              uuid primary key default gen_random_uuid(),
  soker_id        uuid not null references profiles(id) on delete cascade,
  eier_id         uuid not null references profiles(id) on delete cascade,
  arrangement_id  uuid not null references arrangementer(id) on delete cascade,
  status          text not null default 'venter'
                    check (status in ('venter','godkjent','avslatt')),
  opprettet       timestamptz not null default now(),
  besluttet_av    uuid references profiles(id),
  besluttet_paa   timestamptz,
  gyldig_til      timestamptz
);

create index pass_tg_eier_idx on pass_tilgang_forespørsel(eier_id);
create index pass_tg_status_idx on pass_tilgang_forespørsel(status)
  where status = 'venter';
create index pass_tg_soker_idx on pass_tilgang_forespørsel(soker_id);

alter table pass_tilgang_forespørsel enable row level security;

-- === Hjelp-funksjon: har innlogget bruker gyldig dagstilgang? ===
create or replace function har_pass_tilgang(eier uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from pass_tilgang_forespørsel
    where eier_id = eier
      and soker_id = auth.uid()
      and status = 'godkjent'
      and gyldig_til > now()
  )
$$;

-- === RLS: pass_info =============================================
-- Eier kan alltid se sin egen rad. Andre kan se KUN hvis de har en
-- godkjent forespørsel som ikke har gått ut.
create policy "Lese pass_info — eier eller godkjent tilgang"
  on pass_info for select
  using (profil_id = auth.uid() or har_pass_tilgang(profil_id));

create policy "Eier kan opprette egen pass_info"
  on pass_info for insert
  with check (profil_id = auth.uid());

create policy "Eier kan oppdatere egen pass_info"
  on pass_info for update
  using (profil_id = auth.uid());

create policy "Eier kan slette egen pass_info"
  on pass_info for delete
  using (profil_id = auth.uid());

-- === RLS: pass_tilgang_forespørsel ==============================
-- Søker, eier og admin/generalsekretær kan se. Vi viser eier-innsikt
-- så hen kan sjekke historikk over hvem som har spurt.
create policy "Lese pass-forespørsel — partene eller admin"
  on pass_tilgang_forespørsel for select
  using (
    soker_id = auth.uid()
    or eier_id = auth.uid()
    or er_admin()
  );

-- INSERT kun hvis innlogget bruker er arrangør for en kommende tur.
-- Vi sjekker at det finnes et arrangement der opprettet_av = soker_id,
-- type = 'tur', og start_tidspunkt > now(). RLS i app-laget passer på
-- at arrangement_id matcher dette via verifiserings-spørring i action.
create policy "Tur-arrangør kan opprette pass-forespørsel"
  on pass_tilgang_forespørsel for insert
  with check (
    soker_id = auth.uid()
    and exists (
      select 1 from arrangementer a
      where a.id = arrangement_id
        and a.opprettet_av = auth.uid()
        and a.type = 'tur'
        and a.start_tidspunkt > now()
    )
  );

-- UPDATE: kun admin/generalsekretær kan godkjenne/avslå.
create policy "Admin kan oppdatere pass-forespørsel"
  on pass_tilgang_forespørsel for update
  using (er_admin());
