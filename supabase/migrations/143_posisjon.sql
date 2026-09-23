-- Posisjonsdeling for kartet under Klubb (#693).
--
-- ÉN rad per mann, som overskrives. Bevisst ikke et spor: en PWA på iOS kan
-- uansett ikke hente posisjon i bakgrunnen (WebKit har verken Background
-- Geolocation eller Geofencing, og navigator.geolocation finnes ikke i en
-- service worker), så det finnes ingen jevn strøm av punkter å lagre. Da er
-- «siste kjente posisjon» hele datamodellen — og det gjør at det ikke finnes
-- en sporlogg noen kan be om innsyn i, og ingen retention-jobb å glemme.
--
-- Vil vi en dag ha rutehistorikk («hvor gikk vi den kvelden»), er det en egen
-- tabell med et eget bevisst valg bak seg, ikke en kolonne som snek seg inn her.
create table public.posisjon (
  profil_id       uuid primary key references public.profiles(id) on delete cascade,
  lat             double precision not null,
  lng             double precision not null,
  -- GPS-nøyaktighet i meter, som enheten selv oppgir. Lagres fordi et punkt
  -- med ±2000 m (mastetriangulering innendørs) og ett med ±8 m (fri sikt)
  -- betyr helt forskjellige ting for den som skal finne deg — kartet tegner
  -- usikkerheten som en sirkel i stedet for å late som prikken er eksakt.
  noeyaktighet_m  integer,
  oppdatert       timestamptz not null default now(),
  -- Når delingen slutter av seg selv. Hele poenget med kolonnen er at ingen
  -- kan GLEMME å skru av: RLS leverer ikke ut rader der den er passert, så en
  -- glemt deling blir usynlig uten at noen gjør noe.
  deler_til       timestamptz not null,
  constraint posisjon_lat_gyldig check (lat between -90 and 90),
  constraint posisjon_lng_gyldig check (lng between -180 and 180),
  -- Negativ nøyaktighet er meningsløst; taket holder en åpenbart ødelagt
  -- måling ute av basen i stedet for å la kartet tegne en sirkel over halve Europa.
  constraint posisjon_noeyaktighet_gyldig check (noeyaktighet_m is null or noeyaktighet_m between 0 and 100000)
);

alter table public.posisjon enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på eksisterende prosjekter, jf.
-- migrasjonspolicyen i CLAUDE.md). IKKE grant til anon — ingen offentlige flater.
grant select, insert, update, delete on public.posisjon to authenticated;
grant select, insert, update, delete on public.posisjon to service_role;

-- Beslutning (produkteieren, 15. september 2026): ALLE medlemmer ser kartet, ikke bare
-- de som er påmeldt en gitt tur. Delingen er uansett frivillig og tidsbegrenset,
-- og de som er hjemme har glede av å følge med. Det holder policyen til én
-- betingelse i stedet for en påmeldings-join.
--
-- «or profil_id = auth.uid()» er ikke en lekkasje av andres data: den lar deg se
-- DIN EGEN rad etter at vinduet er passert, slik at UI-et kan si «delingen din
-- utløp» i stedet for å bare late som du aldri delte.
create policy "Aktive posisjoner er synlige for alle medlemmer"
  on public.posisjon for select
  using (deler_til > now() or profil_id = auth.uid());

-- Skriving er alltid om deg selv. Ingen — heller ikke admin — kan plassere en
-- annen mann på kartet; en posisjon er en påstand om hvor DU er, og den påstanden
-- skal bare kunne komme fra din egen telefon.
create policy "Egen posisjon kan legges inn"
  on public.posisjon for insert
  with check (profil_id = auth.uid());

create policy "Egen posisjon kan oppdateres"
  on public.posisjon for update
  using (profil_id = auth.uid())
  with check (profil_id = auth.uid());

-- Å slutte å dele sletter raden i stedet for å sette deler_til = now().
-- Forskjellen er ikke kosmetisk: ingen rad betyr at det heller ikke ligger et
-- siste punkt igjen i basen etter at du har skrudd av.
create policy "Egen posisjon kan slettes"
  on public.posisjon for delete
  using (profil_id = auth.uid());
