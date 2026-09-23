-- RPC for å sette chat_sist_sett med Postgres' egen now() — samme klokke
-- som klubb_chat.opprettet bruker. Unngår klokkedrift mellom Node-serveren
-- og Postgres som ellers kan gi at en samtidig melding ender opp som
-- "ulest" rett etter at brukeren har sett siden.
--
-- security definer fordi vi vil at funksjonen skal kunne kjøre uavhengig av
-- hvilken policy som styrer profiles.update — id-en låses uansett til
-- auth.uid() i body-en, så brukeren kan kun røre sin egen rad.
-- Issue #197.

create or replace function public.marker_chat_sett()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set chat_sist_sett = now() where id = auth.uid();
$$;

grant execute on function public.marker_chat_sett() to authenticated;
