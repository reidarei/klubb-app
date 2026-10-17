-- Multi-tenant 2.1 PR B (#861, #868): varselvalg og posisjonsdata hører til medlemskapet.
--
-- varsel_preferanser, posisjon_deling og posisjon_punkt var unntatt fra klubb_id
-- i 161 fordi de tilhører medlemskapet, ikke personen. Nå som medlemskap finnes
-- (163) får alle tre klubb_id, og en sammensatt FK (klubb_id, profil_id) mot
-- medlemskap: slettes medlemskapet, går varselvalg og posisjonsdata med.
--
-- Primærnøklene på varsel_preferanser og posisjon_deling blir (klubb_id, profil_id).
-- Konfliktmålet (ON CONFLICT) MÅ ha nøyaktig samme kolonnesett som nøkkelen, ellers
-- 42P10: onConflict i koden byttes i samme PR, og opprett_varsel_preferanser()
-- skrives om her. posisjon_punkt beholder PK id.
--
-- Triggeren som oppretter varselvalg flyttes fra profiles til medlemskap:
-- handle_ny_bruker() setter inn profilen FØR medlemskapet, så med den sammensatte
-- FK-en ville en profil-trigger feilet med 23503.
--
-- Ingen ny indeks: posisjon_punkt_profil_tid_idx (profil_id, registrert desc) gir
-- delvis støtte for cascade, og volumet er lite. Ingen grant- eller policy-endring
-- (policyene skrives i 2.3, #870). Sammensatte FK-er mot arrangementer kommer i
-- 2.1b (#895). Down-SQL ligger i PR-teksten.

-- Se 161 om 25P01-varselet: grensen gjelder likevel for resten av fila.
set local lock_timeout = '3s';

-- 1) Forhåndssjekk: hver rad må ha medlemskap i standardklubben, ellers feiler FK-en senere uten klar melding.
do $$
begin
  if exists (
    select 1 from public.varsel_preferanser t
    where not exists (select 1 from public.medlemskap m where m.klubb_id = public.standard_klubb_id() and m.profil_id = t.profil_id)
  ) then
    raise exception 'Migrasjon 164 avbrutt: varsel_preferanser har rader uten medlemskap i standardklubben.';
  end if;
  if exists (
    select 1 from public.posisjon_deling t
    where not exists (select 1 from public.medlemskap m where m.klubb_id = public.standard_klubb_id() and m.profil_id = t.profil_id)
  ) then
    raise exception 'Migrasjon 164 avbrutt: posisjon_deling har rader uten medlemskap i standardklubben.';
  end if;
  if exists (
    select 1 from public.posisjon_punkt t
    where not exists (select 1 from public.medlemskap m where m.klubb_id = public.standard_klubb_id() and m.profil_id = t.profil_id)
  ) then
    raise exception 'Migrasjon 164 avbrutt: posisjon_punkt har rader uten medlemskap i standardklubben.';
  end if;
end $$;

-- 2) klubb_id (161-malen).
alter table public.varsel_preferanser add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.posisjon_deling add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.posisjon_punkt add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;

-- 3) Primærnøkler med klubb_id først (162-mønsteret: drop/add separat, uten «if exists»).
alter table public.varsel_preferanser drop constraint varsel_preferanser_pkey;
alter table public.varsel_preferanser add constraint varsel_preferanser_pkey primary key (klubb_id, profil_id);

alter table public.posisjon_deling drop constraint posisjon_deling_pkey;
alter table public.posisjon_deling add constraint posisjon_deling_pkey primary key (klubb_id, profil_id);

-- 4) Sammensatt FK mot medlemskap. FK-ene mot profiles beholdes.
alter table public.varsel_preferanser add constraint varsel_preferanser_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade on delete cascade;
alter table public.posisjon_deling add constraint posisjon_deling_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade on delete cascade;
alter table public.posisjon_punkt add constraint posisjon_punkt_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade on delete cascade;

-- 5) Triggeren flyttes fra profiles til medlemskap (095 → her).
drop trigger ved_ny_profil_varsel_preferanser on public.profiles;

create or replace function public.opprett_varsel_preferanser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.varsel_preferanser (klubb_id, profil_id)
  values (new.klubb_id, new.profil_id)
  on conflict (klubb_id, profil_id) do nothing;
  return new;
end;
$$;

create trigger ved_nytt_medlemskap_varsel_preferanser
  after insert on public.medlemskap
  for each row
  execute function public.opprett_varsel_preferanser();

-- 6) Idempotent backfill: ett sett varselvalg per medlemskap.
insert into public.varsel_preferanser (klubb_id, profil_id)
select klubb_id, profil_id from public.medlemskap
on conflict (klubb_id, profil_id) do nothing;
