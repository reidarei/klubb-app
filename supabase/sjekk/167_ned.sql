-- Down-SQL for migrasjon 167 (#870): gjenoppretter alle policyer slik de var etter 166.
-- GENERERT 17.10.2026 fra pg_policies på test-instansen (mig. 166), verifisert identisk med prod.
-- Generator: gen-167-ned.mjs
-- Kjøres som postgres i én transaksjon. Policyer 167 dropper gjenopprettes med create policy;
-- resten med alter policy (rolle, using, with check).
-- UPDATE-policyer uten with check hadde implisitt with check = using; settes eksplisitt lik qual.
begin;
alter policy "Admin kan lese aktivitet_dag" on public."aktivitet_dag" to public using (er_admin());
alter policy "Admin kan lese aktivitet_uke" on public."aktivitet_uke" to public using (er_admin());
alter policy "Aktive kan lese album" on public."album" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Aktive kan opprette album" on public."album" to public with check (((opprettet_av = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Eier eller admin kan oppdatere album" on public."album" to public using (((opprettet_av = auth.uid()) OR er_admin())) with check (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Eier eller admin kan slette album" on public."album" to public using (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Aktive kan laste opp album_bilde" on public."album_bilde" to public with check (((lastet_opp_av = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Aktive kan lese album_bilde" on public."album_bilde" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Album-eier eller admin kan oppdatere album_bilde" on public."album_bilde" to public using ((er_admin() OR (EXISTS ( SELECT 1
   FROM album a
  WHERE ((a.id = album_bilde.album_id) AND (a.opprettet_av = auth.uid())))))) with check ((er_admin() OR (EXISTS ( SELECT 1
   FROM album a
  WHERE ((a.id = album_bilde.album_id) AND (a.opprettet_av = auth.uid()))))));
alter policy "Opplaster, album-eier eller admin kan slette album_bilde" on public."album_bilde" to public using (((lastet_opp_av = auth.uid()) OR er_admin() OR (EXISTS ( SELECT 1
   FROM album a
  WHERE ((a.id = album_bilde.album_id) AND (a.opprettet_av = auth.uid()))))));
alter policy "Aktive kan lese album_bilde_chat" on public."album_bilde_chat" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Aktive kan poste album_bilde_chat" on public."album_bilde_chat" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Slette egne album_bilde_chat" on public."album_bilde_chat" to public using ((profil_id = auth.uid()));
alter policy "Aktive kan lese album_bilde_reaksjon" on public."album_bilde_reaksjon" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Egne reaksjoner — delete" on public."album_bilde_reaksjon" to public using ((profil_id = auth.uid()));
alter policy "Egne reaksjoner — insert" on public."album_bilde_reaksjon" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Admin kan endre app_innstillinger" on public."app_innstillinger" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan sette inn app_innstillinger" on public."app_innstillinger" to public with check (er_admin());
alter policy "Innloggede kan lese app_innstillinger" on public."app_innstillinger" to public using ((auth.role() = 'authenticated'::text));
alter policy "Aktive kan lese" on public."arrangement_chat" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Aktive kan poste" on public."arrangement_chat" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Oppdatere egne" on public."arrangement_chat" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Slette egne" on public."arrangement_chat" to public using ((profil_id = auth.uid()));
alter policy "Alle kan lese arrangementer" on public."arrangementer" to public using (true);
alter policy "Alle kan opprette arrangementer" on public."arrangementer" to public with check ((opprettet_av = auth.uid()));
alter policy "Eier eller admin kan oppdatere arrangement" on public."arrangementer" to public using (((opprettet_av = auth.uid()) OR er_admin())) with check (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Eier eller admin kan slette arrangement" on public."arrangementer" to public using (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Autentiserte kan lese arrangementmaler" on public."arrangementmaler" to public using ((auth.role() = 'authenticated'::text));
alter policy "Admin kan oppdatere arrangøransvar" on public."arrangoransvar" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan opprette arrangøransvar" on public."arrangoransvar" to public with check (er_admin());
alter policy "Admin kan slette arrangøransvar" on public."arrangoransvar" to public using (er_admin());
alter policy "Alle kan lese arrangøransvar" on public."arrangoransvar" to public using (true);
alter policy "Alle innlogget kan lese bursdagsbilder" on public."bursdagsbilde" to "authenticated" using (true);
alter policy "Alle kan fjerne egne reaksjoner" on public."chat_reaksjoner" to public using ((profil_id = auth.uid()));
alter policy "Alle kan legge til egne reaksjoner" on public."chat_reaksjoner" to public with check ((profil_id = auth.uid()));
alter policy "Alle kan lese chat-reaksjoner" on public."chat_reaksjoner" to public using ((auth.role() = 'authenticated'::text));
alter policy "Admin kan lese feil_logg" on public."feil_logg" to "authenticated" using (er_admin());
alter policy "Autentiserte kan lese fond_bevegelse" on public."fond_bevegelse" to public using ((auth.role() = 'authenticated'::text));
alter policy "Admin kan endre fond_eiendom" on public."fond_eiendom" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan opprette fond_eiendom" on public."fond_eiendom" to public with check (er_admin());
alter policy "Admin kan slette fond_eiendom" on public."fond_eiendom" to public using (er_admin());
alter policy "Autentiserte kan lese fond_eiendom" on public."fond_eiendom" to public using ((auth.role() = 'authenticated'::text));
alter policy "Admin kan endre fond_innskudd" on public."fond_innskudd" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan opprette fond_innskudd" on public."fond_innskudd" to public with check (er_admin());
alter policy "Admin kan slette fond_innskudd" on public."fond_innskudd" to public using (er_admin());
alter policy "Autentiserte kan lese fond_innskudd" on public."fond_innskudd" to public using ((auth.role() = 'authenticated'::text));
alter policy "Admin kan endre fond_kontant" on public."fond_kontant" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan opprette fond_kontant" on public."fond_kontant" to public with check (er_admin());
alter policy "Autentiserte kan lese fond_kontant" on public."fond_kontant" to public using ((auth.role() = 'authenticated'::text));
alter policy "Admin kan endre navnealias" on public."fond_navn_alias" to "authenticated" using (er_admin()) with check (er_admin());
alter policy "Admin kan opprette navnealias" on public."fond_navn_alias" to "authenticated" with check (er_admin());
alter policy "Admin kan slette navnealias" on public."fond_navn_alias" to "authenticated" using (er_admin());
alter policy "Alle innloggede kan lese navnealias" on public."fond_navn_alias" to "authenticated" using (true);
alter policy "Admin kan lese fond_verdi_historikk" on public."fond_verdi_historikk" to public using (er_admin());
alter policy "Admin kan sette inn fond_verdi_historikk" on public."fond_verdi_historikk" to public with check (er_admin());
alter policy "Admin kan endre fond_verdipapir" on public."fond_verdipapir" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan opprette fond_verdipapir" on public."fond_verdipapir" to public with check (er_admin());
alter policy "Admin kan slette fond_verdipapir" on public."fond_verdipapir" to public using (er_admin());
alter policy "Autentiserte kan lese fond_verdipapir" on public."fond_verdipapir" to public using ((auth.role() = 'authenticated'::text));
alter policy "Egen kobling eller admin kan lese innspill_kobling" on public."innspill_kobling" to public using (((profil_id = auth.uid()) OR er_admin()));
alter policy "Admin kan endre kåringvinnere" on public."kaaring_vinnere" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan sette kåringvinnere" on public."kaaring_vinnere" to public with check (er_admin());
alter policy "Admin kan slette kåringvinnere" on public."kaaring_vinnere" to public using (er_admin());
alter policy "Autentiserte kan lese kåringvinnere" on public."kaaring_vinnere" to public using ((auth.role() = 'authenticated'::text));
alter policy "Autentiserte kan lese kåringmaler" on public."kaaringmaler" to public using ((auth.role() = 'authenticated'::text));
alter policy "Aktive markeringer er synlige for alle medlemmer" on public."kart_markering" to public using (((utloper > now()) OR (opprettet_av = auth.uid())));
alter policy "Egen markering eller admin kan slette" on public."kart_markering" to public using (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Egen markering kan settes" on public."kart_markering" to public with check ((opprettet_av = auth.uid()));
alter policy "Admin kan endre kart-symboltilpasning" on public."kart_symbol_tilpasning" to "authenticated" using (er_admin()) with check (er_admin());
alter policy "Admin kan sette inn kart-symboltilpasning" on public."kart_symbol_tilpasning" to "authenticated" with check (er_admin());
alter policy "Innloggede kan lese kart-symboltilpasning" on public."kart_symbol_tilpasning" to "authenticated" using (true);
alter policy "Innloggede kan lese klubber" on public."klubb" to "authenticated" using (true);
alter policy "Aktive kan lese" on public."klubb_chat" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Aktive kan poste" on public."klubb_chat" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Oppdatere egne" on public."klubb_chat" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Slette egne" on public."klubb_chat" to public using ((profil_id = auth.uid()));
alter policy "Admin kan endre klubbinfo" on public."klubb_info" to "authenticated" using (er_admin()) with check (er_admin());
alter policy "Admin kan sette inn klubbinfo" on public."klubb_info" to "authenticated" with check (er_admin());
alter policy "Innloggede kan lese klubbinfo" on public."klubb_info" to "authenticated" using (true);
alter policy "Admin i klubben oppdaterer medlemskap" on public."medlemskap" to "authenticated" using (er_admin(klubb_id)) with check (er_admin(klubb_id));
alter policy "Medlemskap i klubben er synlige (inaktive bare for admin)" on public."medlemskap" to "authenticated" using (((klubb_id = standard_klubb_id()) AND (aktiv OR er_admin(klubb_id))));
alter policy "Aktive kan lese melding_bilder" on public."melding_bilder" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Forfatter eller admin kan slette melding_bilder" on public."melding_bilder" to public using ((((EXISTS ( SELECT 1
   FROM meldinger
  WHERE ((meldinger.id = melding_bilder.melding_id) AND (meldinger.profil_id = auth.uid())))) OR er_admin()) AND (NOT (EXISTS ( SELECT 1
   FROM meldinger
  WHERE ((meldinger.id = melding_bilder.melding_id) AND (meldinger.fra_facebook = true)))))));
alter policy "Forfatter kan legge til melding_bilder" on public."melding_bilder" to public with check ((EXISTS ( SELECT 1
   FROM meldinger
  WHERE ((meldinger.id = melding_bilder.melding_id) AND (meldinger.profil_id = auth.uid())))));
alter policy "Aktive kan lese melding_chat" on public."melding_chat" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Aktive kan poste melding_chat" on public."melding_chat" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Oppdatere egne melding_chat (ikke FB)" on public."melding_chat" to public using ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND (profil_id = auth.uid()))) with check ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND (profil_id = auth.uid())));
alter policy "Slette egne" on public."melding_chat" to public using ((profil_id = auth.uid()));
alter policy "Aktive kan lese melding_reaksjon" on public."melding_reaksjon" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Egne reaksjoner — delete" on public."melding_reaksjon" to public using ((profil_id = auth.uid()));
alter policy "Egne reaksjoner — insert" on public."melding_reaksjon" to public with check ((profil_id = auth.uid()));
alter policy "Aktive kan lese meldinger" on public."meldinger" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Aktive kan poste melding" on public."meldinger" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Oppdatere egne melding (ikke FB)" on public."meldinger" to public using ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND ((profil_id = auth.uid()) OR er_admin()))) with check ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND ((profil_id = auth.uid()) OR er_admin())));
alter policy "Slette egne" on public."meldinger" to public using ((profil_id = auth.uid()));
alter policy "Slette egne melding eller admin (ikke FB)" on public."meldinger" to public using ((((fra_facebook IS NULL) OR (fra_facebook = false)) AND ((profil_id = auth.uid()) OR er_admin())));
alter policy "Alle kan lese påmeldinger" on public."paameldinger" to public using (true);
alter policy "Kan oppdatere egen påmelding" on public."paameldinger" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Kan opprette egen påmelding" on public."paameldinger" to public with check ((profil_id = auth.uid()));
alter policy "Kan slette egen påmelding" on public."paameldinger" to public using ((profil_id = auth.uid()));
alter policy "Eier kan oppdatere egen pass_info" on public."pass_info" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Eier kan opprette egen pass_info" on public."pass_info" to public with check ((profil_id = auth.uid()));
alter policy "Eier kan slette egen pass_info" on public."pass_info" to public using ((profil_id = auth.uid()));
alter policy "Lese pass_info — eier eller godkjent tilgang" on public."pass_info" to public using (((profil_id = auth.uid()) OR har_pass_tilgang(profil_id)));
alter policy "Generalsekretær kan oppdatere pass-forespørsel" on public."pass_tilgang_forespørsel" to public using (er_generalsekretaer()) with check (er_generalsekretaer());
alter policy "Lese pass-forespørsel — partene eller admin" on public."pass_tilgang_forespørsel" to public using (((soker_id = auth.uid()) OR (eier_id = auth.uid()) OR er_admin()));
alter policy "Tur-arrangør kan opprette pass-forespørsel for ja-deltaker" on public."pass_tilgang_forespørsel" to public with check (((soker_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM arrangementer a
  WHERE ((a.id = "pass_tilgang_forespørsel".arrangement_id) AND (a.opprettet_av = auth.uid()) AND (a.type = 'tur'::arrangementstype) AND (a.start_tidspunkt > now())))) AND (EXISTS ( SELECT 1
   FROM paameldinger p
  WHERE ((p.arrangement_id = "pass_tilgang_forespørsel".arrangement_id) AND (p.profil_id = "pass_tilgang_forespørsel".eier_id) AND (p.status = 'ja'::paameldingsstatus))))));
alter policy "Alle kan lese polls" on public."poll" to public using ((auth.role() = 'authenticated'::text));
alter policy "Alle kan opprette polls" on public."poll" to public with check (((opprettet_av = auth.uid()) AND ((kaaring_mal_id IS NULL) OR er_admin())));
alter policy "Oppretter eller admin kan oppdatere poll" on public."poll" to public using (((opprettet_av = auth.uid()) OR er_admin())) with check (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Oppretter eller admin kan slette poll" on public."poll" to public using (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Aktive kan lese" on public."poll_chat" to public using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true)))));
alter policy "Aktive kan poste" on public."poll_chat" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.aktiv = true))))));
alter policy "Oppdatere egne" on public."poll_chat" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Slette egne" on public."poll_chat" to public using ((profil_id = auth.uid()));
alter policy "Egen stemme kun før frist" on public."poll_stemme" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM poll p
  WHERE ((p.id = poll_stemme.poll_id) AND (p.svarfrist > now()))))));
alter policy "Slette egen stemme kun før frist" on public."poll_stemme" to public using (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM poll p
  WHERE ((p.id = poll_stemme.poll_id) AND (p.svarfrist > now()))))));
alter policy "Stemmer leses med kåring-anonymitet" on public."poll_stemme" to public using (((profil_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM poll p
  WHERE ((p.id = poll_stemme.poll_id) AND ((p.kaaring_mal_id IS NULL) OR (er_admin() AND (p.avsluttet_paa IS NOT NULL))))))));
alter policy "Alle kan lese poll-valg" on public."poll_valg" to public using ((auth.role() = 'authenticated'::text));
alter policy "Poll-oppretter kan legge til valg" on public."poll_valg" to public with check ((EXISTS ( SELECT 1
   FROM poll p
  WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = auth.uid()) OR er_admin())))));
alter policy "Poll-oppretter kan oppdatere valg" on public."poll_valg" to public using ((EXISTS ( SELECT 1
   FROM poll p
  WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = auth.uid()) OR er_admin()))))) with check ((EXISTS ( SELECT 1
   FROM poll p
  WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = auth.uid()) OR er_admin())))));
alter policy "Poll-oppretter kan slette valg" on public."poll_valg" to public using ((EXISTS ( SELECT 1
   FROM poll p
  WHERE ((p.id = poll_valg.poll_id) AND ((p.opprettet_av = auth.uid()) OR er_admin())))));
alter policy "Deling er synlig for alle medlemmer" on public."posisjon_deling" to public using (true);
alter policy "Egen deling kan avsluttes" on public."posisjon_deling" to public using ((profil_id = auth.uid()));
alter policy "Egen deling kan oppdateres" on public."posisjon_deling" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Egen deling kan settes" on public."posisjon_deling" to public with check ((profil_id = auth.uid()));
alter policy "Egne punkter kan legges inn" on public."posisjon_punkt" to public with check ((profil_id = auth.uid()));
alter policy "Egne punkter kan slettes" on public."posisjon_punkt" to public using ((profil_id = auth.uid()));
alter policy "Punkter er synlige mens eieren deler" on public."posisjon_punkt" to public using (((profil_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM posisjon_deling d
  WHERE ((d.profil_id = posisjon_punkt.profil_id) AND (d.deler_til > now()))))));
alter policy "Alle aktive kan lese profiler" on public."profiles" to public using ((aktiv = true));
alter policy "Kan oppdatere egen profil eller admin" on public."profiles" to public using (((id = auth.uid()) OR er_admin())) with check (((id = auth.uid()) OR er_admin()));
alter policy "Kan lese egne push-abonnementer" on public."push_subscriptions" to public using ((profil_id = auth.uid()));
alter policy "Kan oppdatere eget push-abonnement" on public."push_subscriptions" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Kan opprette eget push-abonnement" on public."push_subscriptions" to public with check ((profil_id = auth.uid()));
alter policy "Kan slette eget push-abonnement" on public."push_subscriptions" to public using ((profil_id = auth.uid()));
alter policy "Legg til push-subscription" on public."push_subscriptions" to public with check ((profil_id = auth.uid()));
alter policy "Les egne push-subscriptions" on public."push_subscriptions" to public using ((profil_id = auth.uid()));
alter policy "Slett egne push-subscriptions" on public."push_subscriptions" to public using ((profil_id = auth.uid()));
alter policy "Deltakere kan lese samtale" on public."samtale" to public using (((auth.uid() = profil_a) OR (auth.uid() = profil_b)));
alter policy "Deltakere kan opprette samtale" on public."samtale" to public with check ((((auth.uid() = profil_a) OR (auth.uid() = profil_b)) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = samtale.profil_a) AND (profiles.aktiv = true)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = samtale.profil_b) AND (profiles.aktiv = true))))));
alter policy "Avsender kan redigere samtale_chat" on public."samtale_chat" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Deltakere kan lese samtale_chat" on public."samtale_chat" to public using ((EXISTS ( SELECT 1
   FROM samtale s
  WHERE ((s.id = samtale_chat.samtale_id) AND ((auth.uid() = s.profil_a) OR (auth.uid() = s.profil_b))))));
alter policy "Deltakere kan poste samtale_chat" on public."samtale_chat" to public with check (((profil_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM samtale s
  WHERE ((s.id = samtale_chat.samtale_id) AND ((auth.uid() = s.profil_a) OR (auth.uid() = s.profil_b)))))));
alter policy "Mottaker kan markere samtale_chat lest" on public."samtale_chat" to public using (((profil_id <> auth.uid()) AND (EXISTS ( SELECT 1
   FROM samtale s
  WHERE ((s.id = samtale_chat.samtale_id) AND ((auth.uid() = s.profil_a) OR (auth.uid() = s.profil_b))))))) with check (((profil_id <> auth.uid()) AND (EXISTS ( SELECT 1
   FROM samtale s
  WHERE ((s.id = samtale_chat.samtale_id) AND ((auth.uid() = s.profil_a) OR (auth.uid() = s.profil_b)))))));
alter policy "Slette egne" on public."samtale_chat" to public using ((profil_id = auth.uid()));
alter policy "Egen post eller admin kan slette" on public."timeplan_post" to public using (((opprettet_av = auth.uid()) OR er_admin()));
alter policy "Egen post kan legges inn" on public."timeplan_post" to public with check ((opprettet_av = auth.uid()));
alter policy "Timeplanen er synlig for alle medlemmer" on public."timeplan_post" to public using (true);
alter policy "Admin kan oppdatere varselinnstillinger" on public."varsel_innstillinger" to public using (er_admin()) with check (er_admin());
alter policy "Admin kan sette inn varselinnstillinger" on public."varsel_innstillinger" to public with check (er_admin());
alter policy "Alle kan lese varselinnstillinger" on public."varsel_innstillinger" to public using (true);
alter policy "Admin leser alle varsler" on public."varsel_logg" to public using (er_admin());
alter policy "Les egne varsler" on public."varsel_logg" to public using ((profil_id = auth.uid()));
alter policy "Oppdater egne varsler" on public."varsel_logg" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Les egne varselpreferanser" on public."varsel_preferanser" to public using ((profil_id = auth.uid()));
alter policy "Oppdater egne varselpreferanser" on public."varsel_preferanser" to public using ((profil_id = auth.uid())) with check ((profil_id = auth.uid()));
alter policy "Sett inn egne varselpreferanser" on public."varsel_preferanser" to public with check ((profil_id = auth.uid()));
alter policy "Admin kan oppdatere vedtekter" on public."vedtekter" to public using (er_admin()) with check (er_admin());
alter policy "Alle kan lese vedtekter" on public."vedtekter" to public using (true);
alter policy "Admin kan opprette vedtektversjon" on public."vedtekter_versjoner" to public with check (er_admin());
alter policy "Alle kan lese vedtektversjoner" on public."vedtekter_versjoner" to public using (true);
alter policy "Admin kan lese vitals" on public."vitals_logg" to public using (er_admin());

-- «Slette egne» på meldinger droppes IKKE i 167 (17.10: regel A skal gjelde). Linja under er kun referanse:
-- create policy "Slette egne" on public.meldinger for delete to public using ((profil_id = auth.uid()));

-- har_pass_tilgang slik den var før 167:
CREATE OR REPLACE FUNCTION public.har_pass_tilgang(eier uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from pass_tilgang_forespørsel
    where eier_id = eier
      and soker_id = auth.uid()
      and status = 'godkjent'
      and gyldig_til > now()
  )
$function$
;

drop function if exists public.aktiv_klubb();
commit;
