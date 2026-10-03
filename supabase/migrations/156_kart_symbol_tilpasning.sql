-- Admin-styrt navn og emoji for de varslende kartsymbolene (/innstillinger/kart).
--
-- Overstyrer etikett og emoji fra klubbens symbolregister (lib/klubb-symboler.ts)
-- per symbol-id. Mangler raden, gjelder registerets default — tabellen er
-- tom på en fersk instans, og det er normaltilstanden.
--
-- `symbol` er registerets id (f.eks. 'ol', 'mat'), samme format som
-- kart_markering.symbol (migrasjon 152). Ingen FK — registeret bor i kode,
-- ikke i en tabell. Id-en endres aldri herfra; det er den som lagres på
-- markeringene, så et nytt navn eller en ny emoji slår igjennom på alle
-- eksisterende markeringer uten datamigrering.
--
-- Tegnegrensene speiler KART_SYMBOL_NAVN_MAKS / KART_SYMBOL_EMOJI_MAKS i
-- lib/konstanter.ts. Emoji-grensen er i tegn (code points), ikke grafemer:
-- en sammensatt emoji (familie, flagg, hudtone) kan være opptil ~10 code
-- points. Selve «én emoji»-sjekken gjøres i server-actionen.
create table public.kart_symbol_tilpasning (
  symbol text primary key check (symbol ~ '^[a-z][a-z0-9_]{0,23}$'),
  etikett text not null check (char_length(btrim(etikett)) between 1 and 16),
  emoji text not null check (char_length(emoji) between 1 and 16),
  oppdatert timestamptz not null default now()
);

alter table public.kart_symbol_tilpasning enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på vårt prosjekt).
-- Ingen anon (jf. #412-auditen). Ingen delete — siden setter alltid en verdi,
-- og «tilbake til standard» er å lagre standardverdiene.
grant select, insert, update on public.kart_symbol_tilpasning to authenticated;
grant select, insert, update, delete on public.kart_symbol_tilpasning to service_role;

-- Alle innloggede leser: kartet viser navn og emoji for alle medlemmer, og
-- varselet bygger tittelen fra samme rad med brukerens egen klient.
create policy "Innloggede kan lese kart-symboltilpasning"
  on public.kart_symbol_tilpasning for select
  to authenticated
  using (true);

create policy "Admin kan sette inn kart-symboltilpasning"
  on public.kart_symbol_tilpasning for insert
  to authenticated
  with check (er_admin());

create policy "Admin kan endre kart-symboltilpasning"
  on public.kart_symbol_tilpasning for update
  to authenticated
  using (er_admin())
  with check (er_admin());
