-- Håndhev én reaksjon per bruker per melding i DB (#472). Klienten
-- (lib/reaksjoner-hook.ts, KommentarReaksjoner, useChatReaksjoner) antok
-- allerede denne Messenger-modellen — velger du ny emoji BYTTER den din
-- forrige. Databasen tillot derimot flere samtidig fordi PK var
-- (melding_id, profil_id, emoji): to raske klikk ga to rader, og etter
-- server-refresh dukket begge opp igjen.
--
-- Triple-PK beholdes (kun ny unik-constraint legges til) — vi dropper den
-- IKKE. Supabase realtime sender kun PK-kolonnene i payload.old ved DELETE
-- (replica identity default), og useChatReaksjoner filtrerer bort den
-- slettede raden på gml.emoji. Fjerner vi emoji fra PK mister DELETE-eventet
-- den kolonnen, og chat-realtime-sletting brekker.

-- === melding_reaksjon ===========================================
-- Dedup: behold nyeste rad per (melding_id, profil_id), slett resten.
-- ctid brukes som deterministisk tie-break ved lik opprettet-verdi.
with rangert as (
  select ctid,
         row_number() over (
           partition by melding_id, profil_id
           order by opprettet desc, ctid desc
         ) as rn
  from public.melding_reaksjon
)
delete from public.melding_reaksjon mr
using rangert
where mr.ctid = rangert.ctid
  and rangert.rn > 1;

-- Idempotent add: Postgres har ikke ADD CONSTRAINT IF NOT EXISTS for unique,
-- så vi svelger duplicate_object (samme defensive stil som mig. 113 sine
-- drop ... if exists). Gjør migrasjonen re-kjørbar mot en shadow/reset-DB.
do $$ begin
  alter table public.melding_reaksjon
    add constraint melding_reaksjon_unik_per_bruker unique (melding_id, profil_id);
exception when duplicate_object then null;
end $$;

-- === chat_reaksjoner =============================================
with rangert as (
  select ctid,
         row_number() over (
           partition by melding_id, profil_id
           order by opprettet desc, ctid desc
         ) as rn
  from public.chat_reaksjoner
)
delete from public.chat_reaksjoner cr
using rangert
where cr.ctid = rangert.ctid
  and rangert.rn > 1;

do $$ begin
  alter table public.chat_reaksjoner
    add constraint chat_reaksjoner_unik_per_bruker unique (melding_id, profil_id);
exception when duplicate_object then null;
end $$;
