-- Rydder to steder der RLS ga admin mer enn resten av appen mente den skulle ha.
--
-- 1) Pass-tilgang: kun generalsekretær kan avgjøre.
--    /om-appen lover medlemmene at «generalsekretæren må godkjenne», varselet
--    om ny forespørsel går kun til ham, og avslagsteksten sier «Generalsekretæren
--    har avslått forespørselen» — men gaten var er_admin(), så enhver admin
--    kunne avgjøre. Passnummer er det mest sensitive vi lagrer; da skal koden
--    følge løftet, ikke omvendt. TypeScript-siden speiles av den nye
--    rettigheten `godkjennerPassTilgang` i lib/roller.ts.
--
-- 2) melding_chat: fjern admin-bypass på sletting som kom tilbake ved et uhell.
--    Migrasjon 069 fjernet admin-bypass på sletting fra alle fem chat-tabeller
--    med den uttrykte regelen «kun forfatter kan slette egne meldinger via
--    UI/API; må admin fjerne noe, gjøres det direkte i Supabase». Migrasjon 081
--    (Facebook-import) gjorde deretter `drop policy if exists "Slette egne
--    melding_chat eller admin"` — et navn 069 allerede hadde erstattet, så
--    droppet var en no-op — og opprettet så en NY policy med `or er_admin()`.
--    Policyer OR-es, så melding_chat endte med både «Slette egne» og en
--    admin-variant. De fire andre chat-tabellene er urørt og allerede riktige.

-- ── 1) Pass-tilgang: er_admin() → er_generalsekretaer() ─────────────────────
-- er_generalsekretaer() finnes fra migrasjon 080 (brukt av lukk_kaaringspoll_naa).
drop policy if exists "Admin kan oppdatere pass-forespørsel" on pass_tilgang_forespørsel;

create policy "Generalsekretær kan oppdatere pass-forespørsel"
  on pass_tilgang_forespørsel for update
  using (er_generalsekretaer());

-- SELECT-policyen er bevisst urørt: admin kan fortsatt se at en forespørsel
-- finnes (raden inneholder ingen passdata, bare hvem som spurte om hva), og
-- det gjør at en admin kan feilsøke uten å kunne avgjøre.

-- ── 2) melding_chat: kun forfatter kan slette ───────────────────────────────
-- Begge eksisterende policyer droppes og erstattes av én, slik at formen blir
-- identisk med de fire søsken-tabellene (arrangement_chat, klubb_chat,
-- poll_chat, samtale_chat): `profil_id = auth.uid()`, uten FB-vakt.
-- Fraværet av FB-vakt er tilsiktet, jf. migrasjon 068: sendte du meldingen selv
-- — i appen eller i Messenger før importen — skal du kunne slette den.
drop policy if exists "Slette egne melding_chat eller admin (ikke FB)" on melding_chat;
drop policy if exists "Slette egne" on melding_chat;

create policy "Slette egne" on melding_chat
  for delete using (profil_id = auth.uid());
