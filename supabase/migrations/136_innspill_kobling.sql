-- Durabel kobling mellom et GitHub-issue og medlemmet som sendte det inn (#632).
--
-- Fram til nå lå koblingen kun som en skjult HTML-kommentar
-- (<!-- profil_id:... -->) i issue-teksten. Redigeres teksten — noe som skjer
-- rutinemessig når et ønske utvides eller presiseres — forsvinner markøren
-- sporløst, og webhooken svarer 200 uten å varsle noen (#625). Denne tabellen
-- er den nye primærkilden; markøren i body blir fallback for issues opprettet
-- før denne migrasjonen (og for #629-mønsteret der en admin ønsker å lese
-- avsenderen rett fra GitHub-UI).
create table public.innspill_kobling (
  issue_nummer integer primary key,
  profil_id    uuid not null references public.profiles(id) on delete cascade,
  opprettet    timestamptz not null default now()
);

alter table public.innspill_kobling enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på eksisterende prosjekter, jf. migrasjonspolicy)
-- IKKE grant til anon — ingen offentlige flater. Ingen insert/update/delete
-- til authenticated: raden skrives kun av service_role (webhook-ruten via
-- createAdminClient()) rett etter at issuet er opprettet hos GitHub.
grant select on public.innspill_kobling to authenticated;
grant select, insert, update, delete on public.innspill_kobling to service_role;

-- Egen kobling er ikke hemmelig for eieren, og admin trenger å kunne se hele
-- tabellen for feilsøking (jf. er_admin() i stedet for inline rolle-sjekk).
create policy "Egen kobling eller admin kan lese innspill_kobling"
  on public.innspill_kobling for select
  using (profil_id = auth.uid() or er_admin());
