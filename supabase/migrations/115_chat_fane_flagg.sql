-- Funksjonsflagg for Chat-fanen — admin kan skru den av for vanlige medlemmer.
--
-- Gjenbruker app_innstillinger fra migrasjon 111 (#447). Seedes til true fordi
-- chat er live i dag — flagget skal ikke endre noe før admin aktivt skrur av.
-- on conflict do nothing: idempotent hvis raden allerede finnes (f.eks. opprettet
-- via upsert i oppdaterAppInnstilling før migrasjonen kjørte).

insert into public.app_innstillinger (noekkel, aktiv, beskrivelse)
values ('chat_fane', true, 'Vis Chat-fanen for alle medlemmer')
on conflict (noekkel) do nothing;
