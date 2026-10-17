-- Multi-tenant 2.1b (#895, del av #861/#868): barn og forelder i samme klubb.
--
-- Hver fremmednøkkel mellom to klubbeide tabeller blir sammensatt:
-- (klubb_id, forelder_id) → forelder(klubb_id, id). Databasen avviser da en
-- barnerad som peker på en forelder i en annen klubb (23503), uavhengig av hva
-- appkoden eller en fremtidig RLS-policy gjør. Dertil kommer sammensatte FK-er
-- (klubb_id, profilkolonne) → medlemskap(klubb_id, profil_id) ved siden av de
-- eksisterende FK-ene mot profiles: personen må være medlem av klubben raden
-- tilhører.
--
-- * klubb_id står FØRST i de nye unike nøklene (<forelder>_klubb_id_id_key),
--   jf. nøkkelvakten fra 1.4 (#867). (id, klubb_id) hadde blitt rødt der.
-- * De 30 sammensatte FK-ene beholder NØYAKTIG det gamle constraint-navnet. Koden
--   bruker navnene som PostgREST-hint (album_bilde!album_bilde_album_id_fkey,
--   album_bilde!album_cover_fk, album!meldinger_album_id_fkey …); ligger både en
--   gammel og en ny FK mellom to tabeller, svarer PostgREST PGRST201. Derfor droppes
--   den gamle og den nye får samme navn.
-- * on delete set null får kolonneliste (set null (<kol>), PG ≥ 15): uten den ville
--   sletting av forelderen også nullet klubb_id, som er not null.
-- * Mot medlemskap brukes NO ACTION (ingen on delete-klausul), ikke RESTRICT: sletting
--   av en auth-bruker cascader til både profiles og barnerader, og NO ACTION sjekkes
--   først ved slutten av setningen, så begge cascade-stiene rekker å fullføre.
--   Sletter man et medlemskap mens personen har innhold i klubben, gir det 23503 —
--   ønsket: innholdet må flyttes eller slettes først.
-- * Gamle enkeltindekser på barnekolonnene beholdes; nye (<kol>, klubb_id)-indekser
--   støtter de sammensatte FK-ene. Opprydding av de gamle venter til 2.3 (EXPLAIN).
-- * Ingen grants, policyer eller triggere (policyene skrives i 2.3, #870).
--
-- Bare personen, ingen medlemskaps-FK: pass_tilgang_forespørsel.besluttet_av,
-- bursdagsbilde.slettet_av, feil_logg.profil_id, fond_navn_alias.opprettet_av,
-- fond_verdi_historikk.endret_av, vedtekter_versjoner.endret_av, varsel_logg.profil_id,
-- push_subscriptions, pass_info og medlemskap.profil_id (listet i PROFIL_FK_BARE_PERSON).
-- Down-SQL ligger i PR-teksten.

-- Se 161 om 25P01-varselet: grensen gjelder likevel for resten av fila.
set local lock_timeout = '3s';

-- 1) Forhåndssjekker: tydelig feil i stedet for en kryptisk 23503 midt i kjeden.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Migrasjon 165 avbrutt: krever PostgreSQL 15 eller nyere (on delete set null med kolonneliste).';
  end if;
  if exists (select 1 from public.album_bilde b join public.album p on p.id = b.album_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: album_bilde.album_id peker på album i en annen klubb.';
  end if;
  if exists (select 1 from public.meldinger b join public.album p on p.id = b.album_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: meldinger.album_id peker på album i en annen klubb.';
  end if;
  if exists (select 1 from public.album b join public.album_bilde p on p.id = b.cover_bilde_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: album.cover_bilde_id peker på album_bilde i en annen klubb.';
  end if;
  if exists (select 1 from public.album_bilde_chat b join public.album_bilde p on p.id = b.album_bilde_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: album_bilde_chat.album_bilde_id peker på album_bilde i en annen klubb.';
  end if;
  if exists (select 1 from public.album_bilde_reaksjon b join public.album_bilde p on p.id = b.bilde_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: album_bilde_reaksjon.bilde_id peker på album_bilde i en annen klubb.';
  end if;
  if exists (select 1 from public.pass_tilgang_forespørsel b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: pass_tilgang_forespørsel.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.album b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: album.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.arrangement_chat b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: arrangement_chat.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.arrangoransvar b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: arrangoransvar.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.kaaring_vinnere b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: kaaring_vinnere.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.kart_markering b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: kart_markering.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.paameldinger b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: paameldinger.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.poll b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: poll.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.poll_valg b join public.arrangementer p on p.id = b.referanse_arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: poll_valg.referanse_arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.posisjon_punkt b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: posisjon_punkt.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.timeplan_post b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: timeplan_post.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.varsel_logg b join public.arrangementer p on p.id = b.arrangement_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: varsel_logg.arrangement_id peker på arrangementer i en annen klubb.';
  end if;
  if exists (select 1 from public.kaaring_vinnere b join public.kaaringmaler p on p.id = b.mal_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: kaaring_vinnere.mal_id peker på kaaringmaler i en annen klubb.';
  end if;
  if exists (select 1 from public.poll b join public.kaaringmaler p on p.id = b.kaaring_mal_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: poll.kaaring_mal_id peker på kaaringmaler i en annen klubb.';
  end if;
  if exists (select 1 from public.melding_bilder b join public.meldinger p on p.id = b.melding_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: melding_bilder.melding_id peker på meldinger i en annen klubb.';
  end if;
  if exists (select 1 from public.melding_chat b join public.meldinger p on p.id = b.melding_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: melding_chat.melding_id peker på meldinger i en annen klubb.';
  end if;
  if exists (select 1 from public.melding_reaksjon b join public.meldinger p on p.id = b.melding_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: melding_reaksjon.melding_id peker på meldinger i en annen klubb.';
  end if;
  if exists (select 1 from public.kaaring_vinnere b join public.poll p on p.id = b.poll_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: kaaring_vinnere.poll_id peker på poll i en annen klubb.';
  end if;
  if exists (select 1 from public.poll_chat b join public.poll p on p.id = b.poll_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: poll_chat.poll_id peker på poll i en annen klubb.';
  end if;
  if exists (select 1 from public.poll_stemme b join public.poll p on p.id = b.poll_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: poll_stemme.poll_id peker på poll i en annen klubb.';
  end if;
  if exists (select 1 from public.poll_valg b join public.poll p on p.id = b.poll_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: poll_valg.poll_id peker på poll i en annen klubb.';
  end if;
  if exists (select 1 from public.varsel_logg b join public.poll p on p.id = b.poll_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: varsel_logg.poll_id peker på poll i en annen klubb.';
  end if;
  if exists (select 1 from public.poll_stemme b join public.poll_valg p on p.id = b.valg_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: poll_stemme.valg_id peker på poll_valg i en annen klubb.';
  end if;
  if exists (select 1 from public.samtale_chat b join public.samtale p on p.id = b.samtale_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: samtale_chat.samtale_id peker på samtale i en annen klubb.';
  end if;
  if exists (select 1 from public.vedtekter_versjoner b join public.vedtekter p on p.id = b.vedtekt_id where p.klubb_id <> b.klubb_id) then
    raise exception 'Migrasjon 165 avbrutt: vedtekter_versjoner.vedtekt_id peker på vedtekter i en annen klubb.';
  end if;
  if exists (select 1 from public.arrangementer b where b.opprettet_av is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.opprettet_av)) then
    raise exception 'Migrasjon 165 avbrutt: arrangementer.opprettet_av har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.paameldinger b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: paameldinger.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.arrangement_chat b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: arrangement_chat.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.klubb_chat b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: klubb_chat.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.chat_reaksjoner b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: chat_reaksjoner.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.poll b where b.opprettet_av is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.opprettet_av)) then
    raise exception 'Migrasjon 165 avbrutt: poll.opprettet_av har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.poll_stemme b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: poll_stemme.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.poll_chat b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: poll_chat.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.poll_valg b where b.referanse_profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.referanse_profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: poll_valg.referanse_profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.meldinger b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: meldinger.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.melding_chat b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: melding_chat.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.melding_reaksjon b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: melding_reaksjon.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.samtale b where b.profil_a is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_a)) then
    raise exception 'Migrasjon 165 avbrutt: samtale.profil_a har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.samtale b where b.profil_b is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_b)) then
    raise exception 'Migrasjon 165 avbrutt: samtale.profil_b har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.samtale_chat b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: samtale_chat.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.album b where b.opprettet_av is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.opprettet_av)) then
    raise exception 'Migrasjon 165 avbrutt: album.opprettet_av har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.album_bilde b where b.lastet_opp_av is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.lastet_opp_av)) then
    raise exception 'Migrasjon 165 avbrutt: album_bilde.lastet_opp_av har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.album_bilde_reaksjon b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: album_bilde_reaksjon.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.album_bilde_chat b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: album_bilde_chat.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.kaaring_vinnere b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: kaaring_vinnere.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.kaaring_vinnere b where b.opprettet_av is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.opprettet_av)) then
    raise exception 'Migrasjon 165 avbrutt: kaaring_vinnere.opprettet_av har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.arrangoransvar b where b.ansvarlig_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.ansvarlig_id)) then
    raise exception 'Migrasjon 165 avbrutt: arrangoransvar.ansvarlig_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.kart_markering b where b.opprettet_av is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.opprettet_av)) then
    raise exception 'Migrasjon 165 avbrutt: kart_markering.opprettet_av har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.timeplan_post b where b.opprettet_av is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.opprettet_av)) then
    raise exception 'Migrasjon 165 avbrutt: timeplan_post.opprettet_av har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.bursdagsbilde b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: bursdagsbilde.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.innspill_kobling b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: innspill_kobling.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.pass_tilgang_forespørsel b where b.soker_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.soker_id)) then
    raise exception 'Migrasjon 165 avbrutt: pass_tilgang_forespørsel.soker_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.pass_tilgang_forespørsel b where b.eier_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.eier_id)) then
    raise exception 'Migrasjon 165 avbrutt: pass_tilgang_forespørsel.eier_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.fond_bevegelse b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: fond_bevegelse.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.fond_innskudd b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: fond_innskudd.profil_id har rader uten medlemskap i radens klubb.';
  end if;
  if exists (select 1 from public.fond_navn_alias b where b.profil_id is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.profil_id)) then
    raise exception 'Migrasjon 165 avbrutt: fond_navn_alias.profil_id har rader uten medlemskap i radens klubb.';
  end if;
end $$;

-- 2) Unike nøkler (klubb_id først) som de sammensatte FK-ene refererer til.
alter table public.arrangementer add constraint arrangementer_klubb_id_id_key unique (klubb_id, id);
alter table public.poll add constraint poll_klubb_id_id_key unique (klubb_id, id);
alter table public.album_bilde add constraint album_bilde_klubb_id_id_key unique (klubb_id, id);
alter table public.meldinger add constraint meldinger_klubb_id_id_key unique (klubb_id, id);
alter table public.kaaringmaler add constraint kaaringmaler_klubb_id_id_key unique (klubb_id, id);
alter table public.album add constraint album_klubb_id_id_key unique (klubb_id, id);
alter table public.samtale add constraint samtale_klubb_id_id_key unique (klubb_id, id);
alter table public.poll_valg add constraint poll_valg_klubb_id_id_key unique (klubb_id, id);
alter table public.vedtekter add constraint vedtekter_klubb_id_id_key unique (klubb_id, id);

-- 3) Forelder-FK-er: drop og add med samme navn, hver for seg (162-mønsteret).
alter table public.album_bilde drop constraint album_bilde_album_id_fkey;
alter table public.album_bilde add constraint album_bilde_album_id_fkey foreign key (klubb_id, album_id) references public.album (klubb_id, id) on update cascade on delete cascade;
alter table public.meldinger drop constraint meldinger_album_id_fkey;
alter table public.meldinger add constraint meldinger_album_id_fkey foreign key (klubb_id, album_id) references public.album (klubb_id, id) on update cascade on delete set null (album_id);
alter table public.album drop constraint album_cover_fk;
alter table public.album add constraint album_cover_fk foreign key (klubb_id, cover_bilde_id) references public.album_bilde (klubb_id, id) on update cascade on delete set null (cover_bilde_id);
alter table public.album_bilde_chat drop constraint album_bilde_chat_album_bilde_id_fkey;
alter table public.album_bilde_chat add constraint album_bilde_chat_album_bilde_id_fkey foreign key (klubb_id, album_bilde_id) references public.album_bilde (klubb_id, id) on update cascade on delete cascade;
alter table public.album_bilde_reaksjon drop constraint album_bilde_reaksjon_bilde_id_fkey;
alter table public.album_bilde_reaksjon add constraint album_bilde_reaksjon_bilde_id_fkey foreign key (klubb_id, bilde_id) references public.album_bilde (klubb_id, id) on update cascade on delete cascade;
alter table public.pass_tilgang_forespørsel drop constraint pass_tilgang_forespørsel_arrangement_id_fkey;
alter table public.pass_tilgang_forespørsel add constraint pass_tilgang_forespørsel_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete cascade;
alter table public.album drop constraint album_arrangement_id_fkey;
alter table public.album add constraint album_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete set null (arrangement_id);
alter table public.arrangement_chat drop constraint arrangement_chat_arrangement_id_fkey;
alter table public.arrangement_chat add constraint arrangement_chat_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete cascade;
alter table public.arrangoransvar drop constraint arrangoransvar_arrangement_id_fkey;
alter table public.arrangoransvar add constraint arrangoransvar_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete set null (arrangement_id);
alter table public.kaaring_vinnere drop constraint kaaring_vinnere_arrangement_id_fkey;
alter table public.kaaring_vinnere add constraint kaaring_vinnere_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete set null (arrangement_id);
alter table public.kart_markering drop constraint kart_markering_arrangement_id_fkey;
alter table public.kart_markering add constraint kart_markering_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete cascade;
alter table public.paameldinger drop constraint paameldinger_arrangement_id_fkey;
alter table public.paameldinger add constraint paameldinger_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete cascade;
alter table public.poll drop constraint poll_arrangement_id_fkey;
alter table public.poll add constraint poll_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete set null (arrangement_id);
alter table public.poll_valg drop constraint poll_valg_referanse_arrangement_id_fkey;
alter table public.poll_valg add constraint poll_valg_referanse_arrangement_id_fkey foreign key (klubb_id, referanse_arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete cascade;
alter table public.posisjon_punkt drop constraint posisjon_punkt_arrangement_id_fkey;
alter table public.posisjon_punkt add constraint posisjon_punkt_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete cascade;
alter table public.timeplan_post drop constraint timeplan_post_arrangement_id_fkey;
alter table public.timeplan_post add constraint timeplan_post_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete cascade;
alter table public.varsel_logg drop constraint varsel_logg_arrangement_id_fkey;
alter table public.varsel_logg add constraint varsel_logg_arrangement_id_fkey foreign key (klubb_id, arrangement_id) references public.arrangementer (klubb_id, id) on update cascade on delete set null (arrangement_id);
alter table public.kaaring_vinnere drop constraint kaaring_vinnere_mal_id_fkey;
alter table public.kaaring_vinnere add constraint kaaring_vinnere_mal_id_fkey foreign key (klubb_id, mal_id) references public.kaaringmaler (klubb_id, id) on update cascade on delete set null (mal_id);
alter table public.poll drop constraint poll_kaaring_mal_id_fkey;
alter table public.poll add constraint poll_kaaring_mal_id_fkey foreign key (klubb_id, kaaring_mal_id) references public.kaaringmaler (klubb_id, id) on update cascade on delete restrict;
alter table public.melding_bilder drop constraint melding_bilder_melding_id_fkey;
alter table public.melding_bilder add constraint melding_bilder_melding_id_fkey foreign key (klubb_id, melding_id) references public.meldinger (klubb_id, id) on update cascade on delete cascade;
alter table public.melding_chat drop constraint melding_chat_melding_id_fkey;
alter table public.melding_chat add constraint melding_chat_melding_id_fkey foreign key (klubb_id, melding_id) references public.meldinger (klubb_id, id) on update cascade on delete cascade;
alter table public.melding_reaksjon drop constraint melding_reaksjon_melding_id_fkey;
alter table public.melding_reaksjon add constraint melding_reaksjon_melding_id_fkey foreign key (klubb_id, melding_id) references public.meldinger (klubb_id, id) on update cascade on delete cascade;
alter table public.kaaring_vinnere drop constraint kaaring_vinnere_poll_id_fkey;
alter table public.kaaring_vinnere add constraint kaaring_vinnere_poll_id_fkey foreign key (klubb_id, poll_id) references public.poll (klubb_id, id) on update cascade on delete set null (poll_id);
alter table public.poll_chat drop constraint poll_chat_poll_id_fkey;
alter table public.poll_chat add constraint poll_chat_poll_id_fkey foreign key (klubb_id, poll_id) references public.poll (klubb_id, id) on update cascade on delete cascade;
alter table public.poll_stemme drop constraint poll_stemme_poll_id_fkey;
alter table public.poll_stemme add constraint poll_stemme_poll_id_fkey foreign key (klubb_id, poll_id) references public.poll (klubb_id, id) on update cascade on delete cascade;
alter table public.poll_valg drop constraint poll_valg_poll_id_fkey;
alter table public.poll_valg add constraint poll_valg_poll_id_fkey foreign key (klubb_id, poll_id) references public.poll (klubb_id, id) on update cascade on delete cascade;
alter table public.varsel_logg drop constraint varsel_logg_poll_id_fkey;
alter table public.varsel_logg add constraint varsel_logg_poll_id_fkey foreign key (klubb_id, poll_id) references public.poll (klubb_id, id) on update cascade on delete set null (poll_id);
alter table public.poll_stemme drop constraint poll_stemme_valg_id_fkey;
alter table public.poll_stemme add constraint poll_stemme_valg_id_fkey foreign key (klubb_id, valg_id) references public.poll_valg (klubb_id, id) on update cascade on delete cascade;
alter table public.samtale_chat drop constraint samtale_chat_samtale_id_fkey;
alter table public.samtale_chat add constraint samtale_chat_samtale_id_fkey foreign key (klubb_id, samtale_id) references public.samtale (klubb_id, id) on update cascade on delete cascade;
alter table public.vedtekter_versjoner drop constraint vedtekter_versjoner_vedtekt_id_fkey;
alter table public.vedtekter_versjoner add constraint vedtekter_versjoner_vedtekt_id_fkey foreign key (klubb_id, vedtekt_id) references public.vedtekter (klubb_id, id) on update cascade on delete cascade;

-- 4) Medlemskap-FK-er ved siden av FK-ene mot profiles (NO ACTION, se toppen).
alter table public.arrangementer add constraint arrangementer_opprettet_av_medlemskap_fkey foreign key (klubb_id, opprettet_av) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.paameldinger add constraint paameldinger_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.arrangement_chat add constraint arrangement_chat_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.klubb_chat add constraint klubb_chat_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.chat_reaksjoner add constraint chat_reaksjoner_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.poll add constraint poll_opprettet_av_medlemskap_fkey foreign key (klubb_id, opprettet_av) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.poll_stemme add constraint poll_stemme_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.poll_chat add constraint poll_chat_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.poll_valg add constraint poll_valg_referanse_profil_id_medlemskap_fkey foreign key (klubb_id, referanse_profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.meldinger add constraint meldinger_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.melding_chat add constraint melding_chat_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.melding_reaksjon add constraint melding_reaksjon_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.samtale add constraint samtale_profil_a_medlemskap_fkey foreign key (klubb_id, profil_a) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.samtale add constraint samtale_profil_b_medlemskap_fkey foreign key (klubb_id, profil_b) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.samtale_chat add constraint samtale_chat_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.album add constraint album_opprettet_av_medlemskap_fkey foreign key (klubb_id, opprettet_av) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.album_bilde add constraint album_bilde_lastet_opp_av_medlemskap_fkey foreign key (klubb_id, lastet_opp_av) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.album_bilde_reaksjon add constraint album_bilde_reaksjon_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.album_bilde_chat add constraint album_bilde_chat_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.kaaring_vinnere add constraint kaaring_vinnere_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.kaaring_vinnere add constraint kaaring_vinnere_opprettet_av_medlemskap_fkey foreign key (klubb_id, opprettet_av) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.arrangoransvar add constraint arrangoransvar_ansvarlig_id_medlemskap_fkey foreign key (klubb_id, ansvarlig_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.kart_markering add constraint kart_markering_opprettet_av_medlemskap_fkey foreign key (klubb_id, opprettet_av) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.timeplan_post add constraint timeplan_post_opprettet_av_medlemskap_fkey foreign key (klubb_id, opprettet_av) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.bursdagsbilde add constraint bursdagsbilde_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.innspill_kobling add constraint innspill_kobling_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.pass_tilgang_forespørsel add constraint pass_tilgang_forespørsel_soker_id_medlemskap_fkey foreign key (klubb_id, soker_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.pass_tilgang_forespørsel add constraint pass_tilgang_forespørsel_eier_id_medlemskap_fkey foreign key (klubb_id, eier_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.fond_bevegelse add constraint fond_bevegelse_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.fond_innskudd add constraint fond_innskudd_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;
alter table public.fond_navn_alias add constraint fond_navn_alias_profil_id_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade;

-- 5) Støtteindekser for de sammensatte FK-ene (barnesiden).
create index album_bilde_album_id_klubb_id_idx on public.album_bilde (album_id, klubb_id);
create index meldinger_album_id_klubb_id_idx on public.meldinger (album_id, klubb_id);
create index album_cover_bilde_id_klubb_id_idx on public.album (cover_bilde_id, klubb_id);
create index album_bilde_chat_album_bilde_id_klubb_id_idx on public.album_bilde_chat (album_bilde_id, klubb_id);
create index album_bilde_reaksjon_bilde_id_klubb_id_idx on public.album_bilde_reaksjon (bilde_id, klubb_id);
create index pass_tilgang_forespørsel_arrangement_id_klubb_id_idx on public.pass_tilgang_forespørsel (arrangement_id, klubb_id);
create index album_arrangement_id_klubb_id_idx on public.album (arrangement_id, klubb_id);
create index arrangement_chat_arrangement_id_klubb_id_idx on public.arrangement_chat (arrangement_id, klubb_id);
create index arrangoransvar_arrangement_id_klubb_id_idx on public.arrangoransvar (arrangement_id, klubb_id);
create index kaaring_vinnere_arrangement_id_klubb_id_idx on public.kaaring_vinnere (arrangement_id, klubb_id);
create index kart_markering_arrangement_id_klubb_id_idx on public.kart_markering (arrangement_id, klubb_id);
create index paameldinger_arrangement_id_klubb_id_idx on public.paameldinger (arrangement_id, klubb_id);
create index poll_arrangement_id_klubb_id_idx on public.poll (arrangement_id, klubb_id);
create index poll_valg_referanse_arrangement_id_klubb_id_idx on public.poll_valg (referanse_arrangement_id, klubb_id);
create index posisjon_punkt_arrangement_id_klubb_id_idx on public.posisjon_punkt (arrangement_id, klubb_id);
create index timeplan_post_arrangement_id_klubb_id_idx on public.timeplan_post (arrangement_id, klubb_id);
create index varsel_logg_arrangement_id_klubb_id_idx on public.varsel_logg (arrangement_id, klubb_id);
create index kaaring_vinnere_mal_id_klubb_id_idx on public.kaaring_vinnere (mal_id, klubb_id);
create index poll_kaaring_mal_id_klubb_id_idx on public.poll (kaaring_mal_id, klubb_id);
create index melding_bilder_melding_id_klubb_id_idx on public.melding_bilder (melding_id, klubb_id);
create index melding_chat_melding_id_klubb_id_idx on public.melding_chat (melding_id, klubb_id);
create index melding_reaksjon_melding_id_klubb_id_idx on public.melding_reaksjon (melding_id, klubb_id);
create index kaaring_vinnere_poll_id_klubb_id_idx on public.kaaring_vinnere (poll_id, klubb_id);
create index poll_chat_poll_id_klubb_id_idx on public.poll_chat (poll_id, klubb_id);
create index poll_stemme_poll_id_klubb_id_idx on public.poll_stemme (poll_id, klubb_id);
create index poll_valg_poll_id_klubb_id_idx on public.poll_valg (poll_id, klubb_id);
create index varsel_logg_poll_id_klubb_id_idx on public.varsel_logg (poll_id, klubb_id);
create index poll_stemme_valg_id_klubb_id_idx on public.poll_stemme (valg_id, klubb_id);
create index samtale_chat_samtale_id_klubb_id_idx on public.samtale_chat (samtale_id, klubb_id);
create index vedtekter_versjoner_vedtekt_id_klubb_id_idx on public.vedtekter_versjoner (vedtekt_id, klubb_id);
