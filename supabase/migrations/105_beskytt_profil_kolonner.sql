-- Kolonnevern på profiles (#399): RLS er radbasert — update-policyen fra 009
-- lar et medlem oppdatere sin egen rad, men kan ikke begrense HVILKE kolonner.
-- Uten vern kunne et medlem endre egen rolle/aktiv/faar_issue_varsler via
-- PostgREST direkte (UI-et eksponerer det ikke, men RLS skal være sannheten).
--
-- Kolonnevern kan ikke uttrykkes i RLS-policyer; en before update-trigger er
-- standardmønsteret. `auth.uid() is null` dekker service_role, SQL-editor og
-- migrasjoner (ingen JWT-bruker) — de begrenses ikke, samme tillitsnivå som
-- BYPASSRLS. Merk at settGeneralsekretaer-RPC-en kalles av en innlogget admin,
-- så er_admin()-grenen dekker den.

create or replace function public.beskytt_profil_kolonner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or er_admin() then
    return new;
  end if;
  if new.rolle is distinct from old.rolle
     or new.aktiv is distinct from old.aktiv
     or new.faar_issue_varsler is distinct from old.faar_issue_varsler then
    raise exception 'Bare admin kan endre rolle, aktiv eller faar_issue_varsler';
  end if;
  return new;
end;
$$;

create trigger beskytt_profil_kolonner
  before update on public.profiles
  for each row execute function public.beskytt_profil_kolonner();
