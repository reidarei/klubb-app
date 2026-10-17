-- Multi-tenant 2.3 (#870, del av #861): alle RLS-policyer avgrenset til brukerens klubb.
--
-- Hver policy på en klubbeid tabell får et klubbledd: `klubb_id = (select public.aktiv_klubb())`,
-- både i using og with check. En rad i en annen klubb er dermed usynlig og kan verken
-- settes inn eller flyttes inn i brukerens klubb (42501).
--
-- * aktiv_klubb() = tokenets klubb (jwt_klubb_id()) hvis brukeren har et AKTIVT medlemskap der,
--   ellers null. security definer er nødvendig (medlemskap-policyen bruker selv funksjonen,
--   ellers rekursjon), og en definer-funksjon inlines aldri av planleggeren. Derfor er
--   `(select public.aktiv_klubb())` OBLIGATORISK i policyer: uten select-pakken kalles den per rad.
--   Samme form for er_admin(…)/er_generalsekretaer(…) og auth.uid().
-- * FALLBACK (variant B, 17.10.2026): jwt_klubb_id() null (hooken av eller feilet) →
--   standard_klubb_id(). Mildt: en claim vinner alltid, og exists-kravet gjelder fortsatt, så
--   ingenting lekker. Fallbacken FJERNES i 2.4b (#896) — innen få dager — sammen med fallbacken
--   i aktivKlubbId() (TS). Da blir aktiv_klubb() feile-lukket uten token-claim.
-- * Rolle leses aldri fra tokenet: er_admin(klubb)/er_generalsekretaer(klubb) slår opp medlemskap.
-- * Inaktive: aktiv_klubb() er null for et deaktivert medlemskap, så medlemmet mister alt uten
--   nytt token. «exists(… profiles.aktiv)» i 21 policyer er erstattet av klubbleddet.
--   medlemskap: inaktive er synlige for admin (reaktivering), profiles: medlemmer av klubben.
-- * to public → to authenticated på alle (anon har ingen grants uansett).
-- * UPDATE-policyer uten with check får det (lik using). Klubbleddet i with check hindrer flytting
--   av en rad til en annen klubb.
-- * har_pass_tilgang() fikk klubbfilter (definer, omgår RLS).
-- * Røres IKKE: hook-policyen «Auth-hooken leser medlemskap på tvers av klubber» (varig, #869);
--   push_subscriptions og pass_info (globale, egen-profil-policyer); «Slette egne» på meldinger
--   (forfatteren kan slette egne innlegg også fra Facebook-import); de seks
--   definer-RPC-ene som omgår RLS (get_statistikk m.fl., eget issue 2.3b).
-- * Samtale: motpartene må ha aktivt medlemskap i samtalens klubb (var profiles.aktiv).
-- * Policyene beholder navnene (alter policy), selv der navnet ikke lenger beskriver alt.
-- Policyene er generert fra pg_policies på 166 og omskrevet mekanisk; egenkontrollen nederst
-- bekrefter formen. Down-SQL: supabase/sjekk/167_ned.sql. se CLAUDE.md § Policy: Migrasjoner

-- 1) Forhåndssjekk
do $$
begin
  if to_regprocedure('public.jwt_klubb_id()') is null then
    raise exception 'jwt_klubb_id() mangler — kjør 166 først';
  end if;
  if to_regprocedure('public.er_admin(uuid)') is null or to_regprocedure('public.er_generalsekretaer(uuid)') is null then
    raise exception 'er_admin(uuid)/er_generalsekretaer(uuid) mangler — kjør 163 først';
  end if;
end
$$;

-- 2) Klubben brukeren opererer i: tokenets klubb (eller standardklubben, jf. fallbacken over)
--    hvis han har et aktivt medlemskap der. PK (klubb_id, profil_id) gir høyst én rad.
create function public.aktiv_klubb()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.klubb_id
    from public.medlemskap m
   where m.klubb_id = coalesce(public.jwt_klubb_id(), public.standard_klubb_id())
     and m.profil_id = auth.uid()
     and m.aktiv
$$;

revoke execute on function public.aktiv_klubb() from public, anon;
grant execute on function public.aktiv_klubb() to authenticated, service_role;

-- 3) Passtilgang gjelder bare forespørsler i brukerens egen klubb.
create or replace function public.har_pass_tilgang(eier uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from pass_tilgang_forespørsel
    where eier_id = eier
      and soker_id = auth.uid()
      and klubb_id = public.aktiv_klubb()
      and status = 'godkjent'
      and gyldig_til > now()
  )
$$;

-- 4) Policyene

-- aktivitet_dag
alter policy "Admin kan lese aktivitet_dag" on public."aktivitet_dag" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- aktivitet_uke
alter policy "Admin kan lese aktivitet_uke" on public."aktivitet_uke" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- album
alter policy "Eier eller admin kan slette album" on public."album" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));
alter policy "Aktive kan opprette album" on public."album" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())))));
alter policy "Aktive kan lese album" on public."album" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Eier eller admin kan oppdatere album" on public."album" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))))
  with check (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));

-- album_bilde
alter policy "Opplaster, album-eier eller admin kan slette album_bilde" on public."album_bilde" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((lastet_opp_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))) OR (EXISTS ( SELECT 1 FROM album a WHERE ((a.id = album_bilde.album_id) AND (a.opprettet_av = (select auth.uid()))))))));
alter policy "Aktive kan laste opp album_bilde" on public."album_bilde" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((lastet_opp_av = (select auth.uid())))));
alter policy "Aktive kan lese album_bilde" on public."album_bilde" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Album-eier eller admin kan oppdatere album_bilde" on public."album_bilde" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((select public.er_admin((select public.aktiv_klubb()))) OR (EXISTS ( SELECT 1 FROM album a WHERE ((a.id = album_bilde.album_id) AND (a.opprettet_av = (select auth.uid()))))))))
  with check (klubb_id = (select public.aktiv_klubb()) and (((select public.er_admin((select public.aktiv_klubb()))) OR (EXISTS ( SELECT 1 FROM album a WHERE ((a.id = album_bilde.album_id) AND (a.opprettet_av = (select auth.uid()))))))));

-- album_bilde_chat
alter policy "Slette egne album_bilde_chat" on public."album_bilde_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Aktive kan poste album_bilde_chat" on public."album_bilde_chat" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())))));
alter policy "Aktive kan lese album_bilde_chat" on public."album_bilde_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- album_bilde_reaksjon
alter policy "Egne reaksjoner — delete" on public."album_bilde_reaksjon" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Egne reaksjoner — insert" on public."album_bilde_reaksjon" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())))));
alter policy "Aktive kan lese album_bilde_reaksjon" on public."album_bilde_reaksjon" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- app_innstillinger
alter policy "Admin kan sette inn app_innstillinger" on public."app_innstillinger" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Innloggede kan lese app_innstillinger" on public."app_innstillinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre app_innstillinger" on public."app_innstillinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- arrangement_chat
alter policy "Slette egne" on public."arrangement_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Aktive kan poste" on public."arrangement_chat" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())))));
alter policy "Aktive kan lese" on public."arrangement_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Oppdatere egne" on public."arrangement_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));

-- arrangementer
alter policy "Eier eller admin kan slette arrangement" on public."arrangementer" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));
alter policy "Alle kan opprette arrangementer" on public."arrangementer" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((opprettet_av = (select auth.uid()))));
alter policy "Alle kan lese arrangementer" on public."arrangementer" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Eier eller admin kan oppdatere arrangement" on public."arrangementer" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))))
  with check (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));

-- arrangementmaler
alter policy "Autentiserte kan lese arrangementmaler" on public."arrangementmaler" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- arrangoransvar
alter policy "Admin kan slette arrangøransvar" on public."arrangoransvar" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin kan opprette arrangøransvar" on public."arrangoransvar" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Alle kan lese arrangøransvar" on public."arrangoransvar" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan oppdatere arrangøransvar" on public."arrangoransvar" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- bursdagsbilde
alter policy "Alle innlogget kan lese bursdagsbilder" on public."bursdagsbilde" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- chat_reaksjoner
alter policy "Alle kan fjerne egne reaksjoner" on public."chat_reaksjoner" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Alle kan legge til egne reaksjoner" on public."chat_reaksjoner" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Alle kan lese chat-reaksjoner" on public."chat_reaksjoner" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- feil_logg
alter policy "Admin kan lese feil_logg" on public."feil_logg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- fond_bevegelse
alter policy "Autentiserte kan lese fond_bevegelse" on public."fond_bevegelse" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- fond_eiendom
alter policy "Admin kan slette fond_eiendom" on public."fond_eiendom" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin kan opprette fond_eiendom" on public."fond_eiendom" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Autentiserte kan lese fond_eiendom" on public."fond_eiendom" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre fond_eiendom" on public."fond_eiendom" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- fond_innskudd
alter policy "Admin kan slette fond_innskudd" on public."fond_innskudd" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin kan opprette fond_innskudd" on public."fond_innskudd" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Autentiserte kan lese fond_innskudd" on public."fond_innskudd" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre fond_innskudd" on public."fond_innskudd" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- fond_kontant
alter policy "Admin kan opprette fond_kontant" on public."fond_kontant" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Autentiserte kan lese fond_kontant" on public."fond_kontant" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre fond_kontant" on public."fond_kontant" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- fond_navn_alias
alter policy "Admin kan slette navnealias" on public."fond_navn_alias" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin kan opprette navnealias" on public."fond_navn_alias" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Alle innloggede kan lese navnealias" on public."fond_navn_alias" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre navnealias" on public."fond_navn_alias" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- fond_verdi_historikk
alter policy "Admin kan sette inn fond_verdi_historikk" on public."fond_verdi_historikk" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin kan lese fond_verdi_historikk" on public."fond_verdi_historikk" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- fond_verdipapir
alter policy "Admin kan slette fond_verdipapir" on public."fond_verdipapir" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin kan opprette fond_verdipapir" on public."fond_verdipapir" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Autentiserte kan lese fond_verdipapir" on public."fond_verdipapir" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre fond_verdipapir" on public."fond_verdipapir" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- innspill_kobling
alter policy "Egen kobling eller admin kan lese innspill_kobling" on public."innspill_kobling" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));

-- kaaring_vinnere
alter policy "Admin kan slette kåringvinnere" on public."kaaring_vinnere" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin kan sette kåringvinnere" on public."kaaring_vinnere" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Autentiserte kan lese kåringvinnere" on public."kaaring_vinnere" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre kåringvinnere" on public."kaaring_vinnere" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- kaaringmaler
alter policy "Autentiserte kan lese kåringmaler" on public."kaaringmaler" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- kart_markering
alter policy "Egen markering eller admin kan slette" on public."kart_markering" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));
alter policy "Egen markering kan settes" on public."kart_markering" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((opprettet_av = (select auth.uid()))));
alter policy "Aktive markeringer er synlige for alle medlemmer" on public."kart_markering" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((utloper > now()) OR (opprettet_av = (select auth.uid())))));

-- kart_symbol_tilpasning
alter policy "Admin kan sette inn kart-symboltilpasning" on public."kart_symbol_tilpasning" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Innloggede kan lese kart-symboltilpasning" on public."kart_symbol_tilpasning" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre kart-symboltilpasning" on public."kart_symbol_tilpasning" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- klubb
alter policy "Innloggede kan lese klubber" on public."klubb" to authenticated
  using (id = (select public.aktiv_klubb()));

-- klubb_chat
alter policy "Slette egne" on public."klubb_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Aktive kan poste" on public."klubb_chat" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())))));
alter policy "Aktive kan lese" on public."klubb_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Oppdatere egne" on public."klubb_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));

-- klubb_info
alter policy "Admin kan sette inn klubbinfo" on public."klubb_info" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Innloggede kan lese klubbinfo" on public."klubb_info" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan endre klubbinfo" on public."klubb_info" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- medlemskap
alter policy "Medlemskap i klubben er synlige (inaktive bare for admin)" on public."medlemskap" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (aktiv or (select public.er_admin((select public.aktiv_klubb())))));
alter policy "Admin i klubben oppdaterer medlemskap" on public."medlemskap" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (select public.er_admin((select public.aktiv_klubb()))))
  with check (klubb_id = (select public.aktiv_klubb()) and (select public.er_admin((select public.aktiv_klubb()))));

-- melding_bilder
alter policy "Forfatter eller admin kan slette melding_bilder" on public."melding_bilder" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((((EXISTS ( SELECT 1 FROM meldinger WHERE ((meldinger.id = melding_bilder.melding_id) AND (meldinger.profil_id = (select auth.uid()))))) OR (select public.er_admin((select public.aktiv_klubb())))) AND (NOT (EXISTS ( SELECT 1 FROM meldinger WHERE ((meldinger.id = melding_bilder.melding_id) AND (meldinger.fra_facebook = true))))))));
alter policy "Forfatter kan legge til melding_bilder" on public."melding_bilder" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((EXISTS ( SELECT 1 FROM meldinger WHERE ((meldinger.id = melding_bilder.melding_id) AND (meldinger.profil_id = (select auth.uid())))))));
alter policy "Aktive kan lese melding_bilder" on public."melding_bilder" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- melding_chat
alter policy "Slette egne" on public."melding_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Aktive kan poste melding_chat" on public."melding_chat" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())))));
alter policy "Aktive kan lese melding_chat" on public."melding_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Oppdatere egne melding_chat (ikke FB)" on public."melding_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND (profil_id = (select auth.uid())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND (profil_id = (select auth.uid())))));

-- melding_reaksjon
alter policy "Egne reaksjoner — delete" on public."melding_reaksjon" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Egne reaksjoner — insert" on public."melding_reaksjon" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Aktive kan lese melding_reaksjon" on public."melding_reaksjon" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- meldinger
alter policy "Slette egne" on public."meldinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Slette egne melding eller admin (ikke FB)" on public."meldinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND ((profil_id = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb())))))));
alter policy "Aktive kan poste melding" on public."meldinger" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())))));
alter policy "Aktive kan lese meldinger" on public."meldinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Oppdatere egne melding (ikke FB)" on public."meldinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND ((profil_id = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb())))))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND ((profil_id = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb())))))));

-- paameldinger
alter policy "Kan slette egen påmelding" on public."paameldinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Kan opprette egen påmelding" on public."paameldinger" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Alle kan lese påmeldinger" on public."paameldinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Kan oppdatere egen påmelding" on public."paameldinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));

-- pass_tilgang_forespørsel
alter policy "Tur-arrangør kan opprette pass-forespørsel for ja-deltaker" on public."pass_tilgang_forespørsel" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((soker_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM arrangementer a WHERE ((a.id = "pass_tilgang_forespørsel".arrangement_id) AND (a.opprettet_av = (select auth.uid())) AND (a.type = 'tur'::arrangementstype) AND (a.start_tidspunkt > now())))) AND (EXISTS ( SELECT 1 FROM paameldinger p WHERE ((p.arrangement_id = "pass_tilgang_forespørsel".arrangement_id) AND (p.profil_id = "pass_tilgang_forespørsel".eier_id) AND (p.status = 'ja'::paameldingsstatus)))))));
alter policy "Lese pass-forespørsel — partene eller admin" on public."pass_tilgang_forespørsel" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((soker_id = (select auth.uid())) OR (eier_id = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));
alter policy "Generalsekretær kan oppdatere pass-forespørsel" on public."pass_tilgang_forespørsel" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_generalsekretaer((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_generalsekretaer((select public.aktiv_klubb())))));

-- poll
alter policy "Oppretter eller admin kan slette poll" on public."poll" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));
alter policy "Alle kan opprette polls" on public."poll" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) AND ((kaaring_mal_id IS NULL) OR (select public.er_admin((select public.aktiv_klubb())))))));
alter policy "Alle kan lese polls" on public."poll" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Oppretter eller admin kan oppdatere poll" on public."poll" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))))
  with check (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));

-- poll_chat
alter policy "Slette egne" on public."poll_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Aktive kan poste" on public."poll_chat" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())))));
alter policy "Aktive kan lese" on public."poll_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Oppdatere egne" on public."poll_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));

-- poll_stemme
alter policy "Slette egen stemme kun før frist" on public."poll_stemme" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM poll p WHERE ((p.id = poll_stemme.poll_id) AND (p.svarfrist > now())))))));
alter policy "Egen stemme kun før frist" on public."poll_stemme" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM poll p WHERE ((p.id = poll_stemme.poll_id) AND (p.svarfrist > now())))))));
alter policy "Stemmer leses med kåring-anonymitet" on public."poll_stemme" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM poll p WHERE ((p.id = poll_stemme.poll_id) AND ((p.kaaring_mal_id IS NULL) OR ((select public.er_admin((select public.aktiv_klubb()))) AND (p.avsluttet_paa IS NOT NULL)))))))));

-- poll_valg
alter policy "Poll-oppretter kan slette valg" on public."poll_valg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((EXISTS ( SELECT 1 FROM poll p WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb())))))))));
alter policy "Poll-oppretter kan legge til valg" on public."poll_valg" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((EXISTS ( SELECT 1 FROM poll p WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb())))))))));
alter policy "Alle kan lese poll-valg" on public."poll_valg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Poll-oppretter kan oppdatere valg" on public."poll_valg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((EXISTS ( SELECT 1 FROM poll p WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb())))))))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((EXISTS ( SELECT 1 FROM poll p WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb())))))))));

-- posisjon_deling
alter policy "Egen deling kan avsluttes" on public."posisjon_deling" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Egen deling kan settes" on public."posisjon_deling" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Deling er synlig for alle medlemmer" on public."posisjon_deling" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Egen deling kan oppdateres" on public."posisjon_deling" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));

-- posisjon_punkt
alter policy "Egne punkter kan slettes" on public."posisjon_punkt" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Egne punkter kan legges inn" on public."posisjon_punkt" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Punkter er synlige mens eieren deler" on public."posisjon_punkt" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())) OR (EXISTS ( SELECT 1 FROM posisjon_deling d WHERE ((d.profil_id = posisjon_punkt.profil_id) AND (d.deler_til > now())))))));

-- profiles
alter policy "Alle aktive kan lese profiler" on public."profiles" to authenticated
  using (id in (select m.profil_id from public.medlemskap m where m.klubb_id = (select public.aktiv_klubb()) and (m.aktiv or (select public.er_admin((select public.aktiv_klubb()))))));
alter policy "Kan oppdatere egen profil eller admin" on public."profiles" to authenticated
  using (((id = (select auth.uid()) and (select public.aktiv_klubb()) is not null) or (id in (select m.profil_id from public.medlemskap m where m.klubb_id = (select public.aktiv_klubb())) and (select public.er_admin((select public.aktiv_klubb()))))))
  with check (((id = (select auth.uid()) and (select public.aktiv_klubb()) is not null) or (id in (select m.profil_id from public.medlemskap m where m.klubb_id = (select public.aktiv_klubb())) and (select public.er_admin((select public.aktiv_klubb()))))));

-- samtale
alter policy "Deltakere kan opprette samtale" on public."samtale" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((((select auth.uid()) = profil_a) OR ((select auth.uid()) = profil_b)) AND (EXISTS ( SELECT 1 FROM public.medlemskap m WHERE ((m.klubb_id = samtale.klubb_id) AND (m.profil_id = samtale.profil_a) AND m.aktiv))) AND (EXISTS ( SELECT 1 FROM public.medlemskap m WHERE ((m.klubb_id = samtale.klubb_id) AND (m.profil_id = samtale.profil_b) AND m.aktiv))))));
alter policy "Deltakere kan lese samtale" on public."samtale" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((((select auth.uid()) = profil_a) OR ((select auth.uid()) = profil_b))));

-- samtale_chat
alter policy "Slette egne" on public."samtale_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Deltakere kan poste samtale_chat" on public."samtale_chat" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM samtale s WHERE ((s.id = samtale_chat.samtale_id) AND (((select auth.uid()) = s.profil_a) OR ((select auth.uid()) = s.profil_b))))))));
alter policy "Deltakere kan lese samtale_chat" on public."samtale_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((EXISTS ( SELECT 1 FROM samtale s WHERE ((s.id = samtale_chat.samtale_id) AND (((select auth.uid()) = s.profil_a) OR ((select auth.uid()) = s.profil_b)))))));
alter policy "Avsender kan redigere samtale_chat" on public."samtale_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Mottaker kan markere samtale_chat lest" on public."samtale_chat" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((profil_id <> (select auth.uid())) AND (EXISTS ( SELECT 1 FROM samtale s WHERE ((s.id = samtale_chat.samtale_id) AND (((select auth.uid()) = s.profil_a) OR ((select auth.uid()) = s.profil_b))))))))
  with check (klubb_id = (select public.aktiv_klubb()) and (((profil_id <> (select auth.uid())) AND (EXISTS ( SELECT 1 FROM samtale s WHERE ((s.id = samtale_chat.samtale_id) AND (((select auth.uid()) = s.profil_a) OR ((select auth.uid()) = s.profil_b))))))));

-- timeplan_post
alter policy "Egen post eller admin kan slette" on public."timeplan_post" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and (((opprettet_av = (select auth.uid())) OR (select public.er_admin((select public.aktiv_klubb()))))));
alter policy "Egen post kan legges inn" on public."timeplan_post" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((opprettet_av = (select auth.uid()))));
alter policy "Timeplanen er synlig for alle medlemmer" on public."timeplan_post" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- varsel_innstillinger
alter policy "Admin kan sette inn varselinnstillinger" on public."varsel_innstillinger" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Alle kan lese varselinnstillinger" on public."varsel_innstillinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan oppdatere varselinnstillinger" on public."varsel_innstillinger" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- varsel_logg
alter policy "Admin leser alle varsler" on public."varsel_logg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Les egne varsler" on public."varsel_logg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Oppdater egne varsler" on public."varsel_logg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));

-- varsel_preferanser
alter policy "Sett inn egne varselpreferanser" on public."varsel_preferanser" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Les egne varselpreferanser" on public."varsel_preferanser" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));
alter policy "Oppdater egne varselpreferanser" on public."varsel_preferanser" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((profil_id = (select auth.uid()))));

-- vedtekter
alter policy "Alle kan lese vedtekter" on public."vedtekter" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));
alter policy "Admin kan oppdatere vedtekter" on public."vedtekter" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))))
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- vedtekter_versjoner
alter policy "Admin kan opprette vedtektversjon" on public."vedtekter_versjoner" to authenticated
  with check (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));
alter policy "Alle kan lese vedtektversjoner" on public."vedtekter_versjoner" to authenticated
  using (klubb_id = (select public.aktiv_klubb()));

-- vitals_logg
alter policy "Admin kan lese vitals" on public."vitals_logg" to authenticated
  using (klubb_id = (select public.aktiv_klubb()) and ((select public.er_admin((select public.aktiv_klubb())))));

-- 5) Egenkontroll: formen skal være den samme overalt.
do $$
declare
  r record;
  n integer := 0;
  tekst text;
begin
  for r in
    select tablename, policyname, cmd, roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
      from pg_policies
     where schemaname = 'public'
       and not ('supabase_auth_admin' = any (roles))
       and tablename not in ('push_subscriptions', 'pass_info')
  loop
    n := n + 1;
    tekst := r.qual || ' ' || r.with_check;
    if 'public' = any (r.roles) then
      raise exception 'policy % på % er fortsatt to public', r.policyname, r.tablename;
    end if;
    if r.cmd <> 'INSERT' and r.qual not like '%aktiv_klubb()%' then
      raise exception 'policy % på % mangler aktiv_klubb() i using', r.policyname, r.tablename;
    end if;
    if r.cmd in ('INSERT', 'UPDATE') and r.with_check not like '%aktiv_klubb()%' then
      raise exception 'policy % på % mangler aktiv_klubb() i with check', r.policyname, r.tablename;
    end if;
    if tekst like '%er_admin()%' or tekst like '%er_generalsekretaer()%' then
      raise exception 'policy % på % bruker er_admin()/er_generalsekretaer() uten klubb', r.policyname, r.tablename;
    end if;
    if tekst like '%profiles.aktiv%' then
      raise exception 'policy % på % leser fortsatt profiles.aktiv', r.policyname, r.tablename;
    end if;
    -- Hver funksjon skal stå i select-form (initplan): like mange kall som «AS navn»-aliaser.
    if (length(tekst) - length(replace(tekst, 'aktiv_klubb()', ''))) / length('aktiv_klubb()')
       <> (length(tekst) - length(replace(tekst, 'AS aktiv_klubb)', ''))) / length('AS aktiv_klubb)') then
      raise exception 'policy % på %: aktiv_klubb() uten select-pakke', r.policyname, r.tablename;
    end if;
    if (length(tekst) - length(replace(tekst, 'er_admin(', ''))) / length('er_admin(')
       <> (length(tekst) - length(replace(tekst, 'AS er_admin)', ''))) / length('AS er_admin)') then
      raise exception 'policy % på %: er_admin() uten select-pakke', r.policyname, r.tablename;
    end if;
    if (length(tekst) - length(replace(tekst, 'er_generalsekretaer(', ''))) / length('er_generalsekretaer(')
       <> (length(tekst) - length(replace(tekst, 'AS er_generalsekretaer)', ''))) / length('AS er_generalsekretaer)') then
      raise exception 'policy % på %: er_generalsekretaer() uten select-pakke', r.policyname, r.tablename;
    end if;
    if (length(tekst) - length(replace(tekst, 'auth.uid()', ''))) / length('auth.uid()')
       <> (length(tekst) - length(replace(tekst, 'AS uid)', ''))) / length('AS uid)') then
      raise exception 'policy % på %: auth.uid() uten select-pakke', r.policyname, r.tablename;
    end if;
  end loop;
  if n <> 151 then
    raise exception 'forventet 151 policyer med klubbledd, fant %', n;
  end if;
end
$$;
