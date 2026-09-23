-- Generisk poll-funksjonalitet (#86). Alle medlemmer kan opprette poller,
-- andre stemmer, og etter svarfristen låses resultatet. Designet er bevisst
-- generisk slik at #57-B (kåringspoll) kan gjenbruke tabellene via
-- kontekst-feltet uten å duplisere struktur.
--
-- Tre tabeller:
--   poll         — metadata for selve pollen (spørsmål, frist, flervalg)
--   poll_valg    — alternativene i en poll (2–10 per poll håndheves i app)
--   poll_stemme  — hvilke profiler har stemt på hvilke valg. PK sikrer at
--                  en profil kun kan stemme én gang per valg; flervalg
--                  representeres som flere rader for samme (poll_id, profil_id).

create table poll (
  id             uuid primary key default gen_random_uuid(),
  spoersmaal     text not null check (char_length(spoersmaal) between 1 and 200),
  svarfrist      timestamptz not null,
  flervalg       boolean not null default false,
  opprettet_av   uuid not null references profiles(id) on delete cascade,
  opprettet      timestamptz not null default now(),
  -- kontekst + kontekst_data er tomme i MVP, brukes av #57-B for å markere
  -- pollen som «kåringspoll for år X» og referere til kandidatlista.
  kontekst       text,
  kontekst_data  jsonb
);

create index poll_svarfrist_idx on poll (svarfrist);
create index poll_opprettet_av_idx on poll (opprettet_av);

create table poll_valg (
  id           uuid primary key default gen_random_uuid(),
  poll_id      uuid not null references poll(id) on delete cascade,
  tekst        text not null check (char_length(tekst) between 1 and 120),
  rekkefoelge  int  not null default 0
);

create index poll_valg_poll_id_idx on poll_valg (poll_id);

create table poll_stemme (
  valg_id    uuid not null references poll_valg(id) on delete cascade,
  profil_id  uuid not null references profiles(id)  on delete cascade,
  -- poll_id dupliseres inn fra poll_valg for å kunne filtrere effektivt på
  -- poll-nivå og sjekke svarfrist i RLS uten join.
  poll_id    uuid not null references poll(id) on delete cascade,
  opprettet  timestamptz not null default now(),
  primary key (valg_id, profil_id)
);

create index poll_stemme_poll_id_idx  on poll_stemme (poll_id);
create index poll_stemme_profil_idx   on poll_stemme (profil_id);

-- === RLS ==================================================================

alter table poll         enable row level security;
alter table poll_valg    enable row level security;
alter table poll_stemme  enable row level security;

-- Poll: alle authenticated kan lese. Opprette krever at opprettet_av = auth.uid().
-- Oppdatere/slette tillates kun for oppretter eller admin.
create policy "Alle kan lese polls"
  on poll for select
  using (auth.role() = 'authenticated');

create policy "Alle kan opprette polls"
  on poll for insert
  with check (opprettet_av = auth.uid());

create policy "Oppretter eller admin kan oppdatere poll"
  on poll for update
  using (opprettet_av = auth.uid() or er_admin());

create policy "Oppretter eller admin kan slette poll"
  on poll for delete
  using (opprettet_av = auth.uid() or er_admin());

-- Poll-valg: lesing åpent. Insert/update/delete bare via poll-oppretter (for
-- opprett-flyten) eller admin. Dette forhindrer at andre legger til nye
-- alternativer på en eksisterende poll.
create policy "Alle kan lese poll-valg"
  on poll_valg for select
  using (auth.role() = 'authenticated');

create policy "Poll-oppretter kan legge til valg"
  on poll_valg for insert
  with check (
    exists (
      select 1 from poll p
      where p.id = poll_valg.poll_id
        and (p.opprettet_av = auth.uid() or er_admin())
    )
  );

create policy "Poll-oppretter kan oppdatere valg"
  on poll_valg for update
  using (
    exists (
      select 1 from poll p
      where p.id = poll_valg.poll_id
        and (p.opprettet_av = auth.uid() or er_admin())
    )
  );

create policy "Poll-oppretter kan slette valg"
  on poll_valg for delete
  using (
    exists (
      select 1 from poll p
      where p.id = poll_valg.poll_id
        and (p.opprettet_av = auth.uid() or er_admin())
    )
  );

-- Stemmer: lesing åpent (for resultat-visning). Insert krever at bruker
-- stemmer for seg selv OG at svarfristen ikke er passert. Delete er kun
-- tillatt for egen stemme og kun før fristen — app-laget bruker dette
-- til å "endre stemme" ved å slette og innsette på nytt.
create policy "Alle kan lese stemmer"
  on poll_stemme for select
  using (auth.role() = 'authenticated');

create policy "Egen stemme kun før frist"
  on poll_stemme for insert
  with check (
    profil_id = auth.uid()
    and exists (
      select 1 from poll p
      where p.id = poll_stemme.poll_id
        and p.svarfrist > now()
    )
  );

create policy "Slette egen stemme kun før frist"
  on poll_stemme for delete
  using (
    profil_id = auth.uid()
    and exists (
      select 1 from poll p
      where p.id = poll_stemme.poll_id
        and p.svarfrist > now()
    )
  );

-- === Realtime =============================================================
-- Stemmeoppdateringer strømmes til klienter som ser på en poll-detaljside.
-- poll_valg og poll trenger ikke realtime — de er sjelden-endret.

alter publication supabase_realtime add table poll_stemme;
