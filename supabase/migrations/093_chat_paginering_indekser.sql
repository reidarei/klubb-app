-- Sammensatte indekser for keyset-paginering i alle chat-tabeller (se #239).
-- Kolonnerekken er (fk, opprettet desc, id desc) for fire av fem tabeller, og
-- (opprettet desc, id desc) for klubb_chat som ikke har en FK (én klubb-tråd).
-- Dette dekker to behov:
--   1. Filtrering på FK (når relevant) + sortering på opprettet desc — det alle
--      chat-spørringer gjør i dag.
--   2. id desc som tiebreaker — klar for tuple-cursor (opprettet, id) om vi går
--      til «last item»-paginering. Nåværende klient bruker kun opprettet-prefikset.
-- Eksisterende indekser er ikke rørt; de kan brukes av andre spørringer.

create index if not exists arrangement_chat_paginering_idx on public.arrangement_chat (arrangement_id, opprettet desc, id desc);
create index if not exists klubb_chat_paginering_idx      on public.klubb_chat       (opprettet desc, id desc);
create index if not exists poll_chat_paginering_idx       on public.poll_chat        (poll_id, opprettet desc, id desc);
create index if not exists melding_chat_paginering_idx    on public.melding_chat     (melding_id, opprettet desc, id desc);
create index if not exists samtale_chat_paginering_idx    on public.samtale_chat     (samtale_id, opprettet desc, id desc);
