-- Aggregat-funksjon for stemmer per valg.
--
-- Bakgrunn: RLS på poll_stemme (mig. 076) skjuler andres stemmer for
-- vanlige medlemmer mens en poll er åpen — anonymitet under stemming.
-- Det betyr at klient-koden ikke kan bygge en stemmefordeling fra
-- poll_stemme-rader direkte: en vanlig medlem ville bare sett sine egne.
--
-- Denne funksjonen returnerer kun aggregatet `(valg_id, antall)`. Den
-- lekker ikke profil_id — det er den eneste kolonnen som er sensitiv
-- her. SECURITY DEFINER er bevisst valgt: return-typen `(valg_id, antall)`
-- er sikkerhetsgrenseflaten. INVOKER ville falt på RLS i mig. 076 og
-- returnert kun kallerens egne stemmer.
--
-- Indeks: poll_stemme(poll_id) finnes som poll_stemme_poll_id_idx fra
-- mig. 049, så group by er billig.

create or replace function tell_poll_stemmer(p_poll_id uuid)
returns table (
  valg_id uuid,
  antall  bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select valg_id, count(*)::bigint
    from poll_stemme
   where poll_id = p_poll_id
   group by valg_id
$$;

revoke execute on function tell_poll_stemmer(uuid) from public;
grant execute on function tell_poll_stemmer(uuid) to authenticated;
