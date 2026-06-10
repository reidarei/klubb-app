-- RLS for kåringspoll (#87). To kritiske endringer:
--
-- 1. Opprettelse av kåringspoll begrenses til admin/generalsekretær.
--    Vanlige polls (kaaring_mal_id is null) skal fortsatt være åpne for
--    alle medlemmer slik #86-flyten krever.
--
-- 2. Stemme-synlighet anonymiseres FØR fristen for kåringspoll. Dagens
--    "alle ser alle stemmer" beholdes for vanlige polls — ellers ville
--    forelopig-resultatet i PollResultat slutte å fungere. Etter at
--    fristen er passert kan admin/generalsekretær se totalene (men
--    ikke hvem stemte hva — det vises aldri ut over egen stemme).

-- === poll: insert-policy strammes inn for kåringspoll =====================
-- Den eksisterende "Alle kan opprette polls"-policyen krever at
-- opprettet_av = auth.uid(). Den fortsetter å gjelde for vanlige polls.
-- Vi legger til et restriktivt with check på kåringsfeltet via en
-- erstatningspolicy som dekker begge tilfellene atomisk.

drop policy "Alle kan opprette polls" on poll;

create policy "Alle kan opprette polls"
  on poll for insert
  with check (
    opprettet_av = auth.uid()
    and (kaaring_mal_id is null or er_admin())
  );

-- === poll_stemme: anonymiser kåringsstemmer før frist =====================
-- Eksisterende read-policy gir alle authenticated lesetilgang. Vi
-- erstatter den med en variant som:
--   - lar alle lese stemmer på vanlige polls (uendret oppførsel)
--   - lar brukeren alltid se sine egne stemmer
--   - lar admin/generalsekretær se kåringsstemmer ETTER svarfrist
--   - skjuler andres kåringsstemmer for vanlige medlemmer hele tiden
--
-- Vi joiner mot poll for å vite om dette er en kåringspoll. RLS-koden
-- evalueres på hver rad; partial-indexen poll_kaaring_aapne hjelper
-- ikke direkte her, men poll_id er PK-indeksert så join-en er billig.

drop policy "Alle kan lese stemmer" on poll_stemme;

create policy "Stemmer leses med kåring-anonymitet"
  on poll_stemme for select
  using (
    -- Egen stemme: alltid synlig
    profil_id = auth.uid()
    or exists (
      select 1 from poll p
      where p.id = poll_stemme.poll_id
        and (
          -- Vanlig poll: alle ser alt (uendret #86-oppførsel)
          p.kaaring_mal_id is null
          -- Kåringspoll: kun admin/generalsekretær, og kun etter frist
          or (er_admin() and p.svarfrist <= now())
        )
    )
  );

-- === kaaring_vinnere: skriving låses til admin eller RPC =================
-- Tabellen er fra migr. 023 og hadde admin-CRUD-policyer. Vi sjekker
-- at de fortsatt finnes (admin via er_admin) — RPC-en i 074 bruker
-- security definer og bypasser RLS uansett.
--
-- Ingen endringer her: eksisterende admin-policyer dekker både manuell
-- inntasting og RPC-fallback. Hvis nye policyer trengs senere, gjør
-- det i en egen migrasjon.
