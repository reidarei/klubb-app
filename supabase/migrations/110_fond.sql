-- Klubbens fond (#443)
--
-- Fire tabeller: eiendommer, verdipapirer, kontant-singleton og innskudd.
-- Verdihistorikk logges eksplisitt fra server actions (ikke trigger) slik
-- at endret_av (bruker-id) er tilgjengelig uten omveier.
-- RLS: alle autentiserte kan lese; kun admin kan skrive.

-- ─── Eiendommer ──────────────────────────────────────────────────────────────

create table public.fond_eiendom (
  id               uuid        primary key default gen_random_uuid(),
  navn             text        not null,
  markedsverdi     bigint      not null,          -- hele kroner, ingen øre
  anskaffelsesverdi bigint     not null,
  oppdatert        timestamptz not null default now()
);

alter table public.fond_eiendom enable row level security;

grant select                          on public.fond_eiendom to authenticated;
grant insert, update, delete          on public.fond_eiendom to authenticated;
grant select, insert, update, delete  on public.fond_eiendom to service_role;

create policy "Autentiserte kan lese fond_eiendom"
  on public.fond_eiendom for select
  using (auth.role() = 'authenticated');

create policy "Admin kan opprette fond_eiendom"
  on public.fond_eiendom for insert
  with check (er_admin());

create policy "Admin kan endre fond_eiendom"
  on public.fond_eiendom for update
  using (er_admin());

create policy "Admin kan slette fond_eiendom"
  on public.fond_eiendom for delete
  using (er_admin());

-- ─── Verdipapirer ────────────────────────────────────────────────────────────

create table public.fond_verdipapir (
  id               uuid        primary key default gen_random_uuid(),
  navn             text        not null,
  type             text        not null check (type in ('aksje', 'fond')),
  verdi            bigint      not null,          -- hele kroner
  anskaffelsesverdi bigint     not null,
  oppdatert        timestamptz not null default now()
);

alter table public.fond_verdipapir enable row level security;

grant select                          on public.fond_verdipapir to authenticated;
grant insert, update, delete          on public.fond_verdipapir to authenticated;
grant select, insert, update, delete  on public.fond_verdipapir to service_role;

create policy "Autentiserte kan lese fond_verdipapir"
  on public.fond_verdipapir for select
  using (auth.role() = 'authenticated');

create policy "Admin kan opprette fond_verdipapir"
  on public.fond_verdipapir for insert
  with check (er_admin());

create policy "Admin kan endre fond_verdipapir"
  on public.fond_verdipapir for update
  using (er_admin());

create policy "Admin kan slette fond_verdipapir"
  on public.fond_verdipapir for delete
  using (er_admin());

-- ─── Kontant-singleton ───────────────────────────────────────────────────────
--
-- Enrads-tabell som representerer én enkelt kontantsaldo.
-- id-kolonnen er tvunget til 1 via CHECK — det er umulig å sette inn flere rader.
-- Prøver man INSERT med id != 1 kaster DB constraint-feil. ON CONFLICT DO UPDATE
-- fra actions sørger for at vi alltid oppdaterer, aldri duplikerer.

create table public.fond_kontant (
  id        int     primary key default 1 check (id = 1),
  saldo     bigint  not null default 0,           -- hele kroner
  oppdatert timestamptz not null default now()
);

alter table public.fond_kontant enable row level security;

grant select                          on public.fond_kontant to authenticated;
grant insert, update                  on public.fond_kontant to authenticated;
grant select, insert, update, delete  on public.fond_kontant to service_role;

create policy "Autentiserte kan lese fond_kontant"
  on public.fond_kontant for select
  using (auth.role() = 'authenticated');

create policy "Admin kan opprette fond_kontant"
  on public.fond_kontant for insert
  with check (er_admin());

create policy "Admin kan endre fond_kontant"
  on public.fond_kontant for update
  using (er_admin());

-- Seed: én rad med saldo 0 — nøytral default, trygg for template-speiling
-- (ingen klubbspesifikke tall). Reell saldo settes manuelt via admin-UI etter deploy.
insert into public.fond_kontant (id, saldo) values (1, 0);

-- ─── Innskudd ────────────────────────────────────────────────────────────────
--
-- ON DELETE RESTRICT fordi vi aldri vil miste historikk stille ved
-- profilsletting — aktiv håndtering kreves (flytt innskudd eller slett dem).

create table public.fond_innskudd (
  id         uuid    primary key default gen_random_uuid(),
  profil_id  uuid    not null references public.profiles(id) on delete restrict,
  belop      bigint  not null,                    -- hele kroner, positiv verdi
  dato       date    not null,
  opprettet  timestamptz not null default now()
);

alter table public.fond_innskudd enable row level security;

grant select                          on public.fond_innskudd to authenticated;
grant insert, update, delete          on public.fond_innskudd to authenticated;
grant select, insert, update, delete  on public.fond_innskudd to service_role;

create policy "Autentiserte kan lese fond_innskudd"
  on public.fond_innskudd for select
  using (auth.role() = 'authenticated');

create policy "Admin kan opprette fond_innskudd"
  on public.fond_innskudd for insert
  with check (er_admin());

create policy "Admin kan endre fond_innskudd"
  on public.fond_innskudd for update
  using (er_admin());

create policy "Admin kan slette fond_innskudd"
  on public.fond_innskudd for delete
  using (er_admin());

-- ─── Verdihistorikk ──────────────────────────────────────────────────────────
--
-- Historikk skrives eksplisitt fra server actions, ikke via trigger.
-- Fordelen: endret_av (user-id) er allerede tilgjengelig i actions
-- uten omveier via session_user eller row-level variabel.
-- kilde_id er null for kontant (singleton uten meningsfull uuid).

create table public.fond_verdi_historikk (
  id           bigserial   primary key,
  kilde        text        not null check (kilde in ('eiendom', 'verdipapir', 'kontant')),
  kilde_id     uuid,                              -- null for kontant-singleton
  gammel_verdi bigint      not null,
  ny_verdi     bigint      not null,
  endret_av    uuid        references public.profiles(id) on delete set null,
  tidspunkt    timestamptz not null default now()
);

alter table public.fond_verdi_historikk enable row level security;

-- Kun admins har tilgang til historikk-tabellen — den er interne revisjonsdata
grant select, insert                  on public.fond_verdi_historikk to authenticated;
grant select, insert, update, delete  on public.fond_verdi_historikk to service_role;
grant usage, select on sequence public.fond_verdi_historikk_id_seq to authenticated;

create policy "Admin kan lese fond_verdi_historikk"
  on public.fond_verdi_historikk for select
  using (er_admin());

create policy "Admin kan sette inn fond_verdi_historikk"
  on public.fond_verdi_historikk for insert
  with check (er_admin());

-- ─── Indekser ────────────────────────────────────────────────────────────────

create index on public.fond_innskudd (profil_id);
create index on public.fond_verdi_historikk (kilde, kilde_id, tidspunkt desc);
