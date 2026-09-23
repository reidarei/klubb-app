-- Video i chat: legger til video_url som tredje media-type på alle fem chat-tabellene.
-- Samme prinsipp som bilder (063): minst én av (innhold, bilde_url, video_url) må være
-- satt — så meldinger kan være ren-tekst, ren-bilde, ren-video eller media med caption.

-- arrangement_chat
alter table arrangement_chat add column if not exists video_url text;
alter table arrangement_chat drop constraint if exists arrangement_chat_innhold_eller_bilde;
alter table arrangement_chat add constraint arrangement_chat_innhold_eller_media
  check (innhold is not null or bilde_url is not null or video_url is not null);

-- klubb_chat
alter table klubb_chat add column if not exists video_url text;
alter table klubb_chat drop constraint if exists klubb_chat_innhold_eller_bilde;
alter table klubb_chat add constraint klubb_chat_innhold_eller_media
  check (innhold is not null or bilde_url is not null or video_url is not null);

-- poll_chat
alter table poll_chat add column if not exists video_url text;
alter table poll_chat drop constraint if exists poll_chat_innhold_eller_bilde;
alter table poll_chat add constraint poll_chat_innhold_eller_media
  check (innhold is not null or bilde_url is not null or video_url is not null);

-- melding_chat (kommentarer på meldinger/innlegg)
alter table melding_chat add column if not exists video_url text;
alter table melding_chat drop constraint if exists melding_chat_innhold_eller_bilde;
alter table melding_chat add constraint melding_chat_innhold_eller_media
  check (innhold is not null or bilde_url is not null or video_url is not null);

-- samtale_chat (private meldinger)
alter table samtale_chat add column if not exists video_url text;
alter table samtale_chat drop constraint if exists samtale_chat_innhold_eller_bilde;
alter table samtale_chat add constraint samtale_chat_innhold_eller_media
  check (innhold is not null or bilde_url is not null or video_url is not null);
