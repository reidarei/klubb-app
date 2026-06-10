-- Bilder i chat: legger til bilde_url på alle fem chat-tabellene.
-- innhold blir nullable, men en CHECK-constraint sikrer at minst én av
-- (innhold, bilde_url) er satt — så meldinger kan være ren-tekst, ren-bilde
-- eller bilde med caption.

-- arrangement_chat
alter table arrangement_chat add column if not exists bilde_url text;
alter table arrangement_chat alter column innhold drop not null;
alter table arrangement_chat drop constraint if exists arrangement_chat_innhold_check;
alter table arrangement_chat add constraint arrangement_chat_innhold_check
  check (innhold is null or char_length(innhold) between 1 and 500);
alter table arrangement_chat drop constraint if exists arrangement_chat_innhold_eller_bilde;
alter table arrangement_chat add constraint arrangement_chat_innhold_eller_bilde
  check (innhold is not null or bilde_url is not null);

-- klubb_chat
alter table klubb_chat add column if not exists bilde_url text;
alter table klubb_chat alter column innhold drop not null;
alter table klubb_chat drop constraint if exists klubb_chat_innhold_check;
alter table klubb_chat add constraint klubb_chat_innhold_check
  check (innhold is null or char_length(innhold) between 1 and 500);
alter table klubb_chat drop constraint if exists klubb_chat_innhold_eller_bilde;
alter table klubb_chat add constraint klubb_chat_innhold_eller_bilde
  check (innhold is not null or bilde_url is not null);

-- poll_chat
alter table poll_chat add column if not exists bilde_url text;
alter table poll_chat alter column innhold drop not null;
alter table poll_chat drop constraint if exists poll_chat_innhold_check;
alter table poll_chat add constraint poll_chat_innhold_check
  check (innhold is null or char_length(innhold) between 1 and 500);
alter table poll_chat drop constraint if exists poll_chat_innhold_eller_bilde;
alter table poll_chat add constraint poll_chat_innhold_eller_bilde
  check (innhold is not null or bilde_url is not null);

-- melding_chat (kommentarer på meldinger/innlegg)
alter table melding_chat add column if not exists bilde_url text;
alter table melding_chat alter column innhold drop not null;
alter table melding_chat drop constraint if exists melding_chat_innhold_check;
alter table melding_chat add constraint melding_chat_innhold_check
  check (innhold is null or char_length(innhold) between 1 and 500);
alter table melding_chat drop constraint if exists melding_chat_innhold_eller_bilde;
alter table melding_chat add constraint melding_chat_innhold_eller_bilde
  check (innhold is not null or bilde_url is not null);

-- samtale_chat (private meldinger)
alter table samtale_chat add column if not exists bilde_url text;
alter table samtale_chat alter column innhold drop not null;
alter table samtale_chat drop constraint if exists samtale_chat_innhold_check;
alter table samtale_chat add constraint samtale_chat_innhold_check
  check (innhold is null or char_length(innhold) between 1 and 2000);
alter table samtale_chat drop constraint if exists samtale_chat_innhold_eller_bilde;
alter table samtale_chat add constraint samtale_chat_innhold_eller_bilde
  check (innhold is not null or bilde_url is not null);
