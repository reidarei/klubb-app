-- Markeringer på kartet (#697).
--
-- Bakgrunn: et medlem spurte i en PM om man kunne sette en «sighting» på kartet.
-- Funksjonen er bygget GENERISK — en markering med fritekst — i stedet for den
-- ene vitsen den ble foreslått som. Da dekker den også «møt meg her», «bra pub»
-- og «bussen går herfra», og den overlever at vitsen går ut på dato.
--
-- Livsløpet er det samme som posisjonssporet: en markering hører til kvelden,
-- ikke til evigheten. `utloper` beregnes ved opprettelse (arrangementets slutt
-- hvis noe pågår, ellers KART_MARKERING_TIMER fram i tid) og ryddes av samme
-- cron-jobb som sporet. Én kolonne, én regel — enklere å forklare enn to.
create table public.kart_markering (
  id            uuid primary key default gen_random_uuid(),
  opprettet_av  uuid not null references public.profiles(id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  tekst         text not null,
  opprettet     timestamptz not null default now(),
  utloper       timestamptz not null,
  -- Arrangementet markeringen ble satt under, hvis noe pågikk. on delete
  -- cascade: slettes turen, forsvinner markeringene med den.
  arrangement_id uuid references public.arrangementer(id) on delete cascade,
  constraint kart_markering_lat_gyldig check (lat between -90 and 90),
  constraint kart_markering_lng_gyldig check (lng between -180 and 180),
  -- Speiler KART_MARKERING_MAKS_LENGDE i lib/konstanter.ts — endres den ene,
  -- må den andre følge etter. En markering er en etikett på et kart, ikke et
  -- innlegg; lengre tekst ville uansett ikke fått plass ved siden av nåla.
  constraint kart_markering_tekst_gyldig check (length(btrim(tekst)) between 1 and 60)
);

-- Oppryddingsjobben sletter på utloper; kartet leser de aktive på samme kolonne.
create index kart_markering_utloper_idx on public.kart_markering (utloper);

alter table public.kart_markering enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30, jf. migrasjonspolicyen). Ingen anon.
-- Ingen update: en markering rettes ikke, den slettes og settes på nytt. Det
-- holder «hvem satte hva» sant uten en redigeringshistorikk å forholde seg til.
grant select, insert, delete on public.kart_markering to authenticated;
grant select, insert, update, delete on public.kart_markering to service_role;

-- Markeringer er hele poenget delt: alle medlemmer ser dem så lenge de lever.
-- Egne vises også etter utløp, slik at UI-et kan skille «den er borte» fra
-- «den har aldri vært der» hvis noen lurer.
create policy "Aktive markeringer er synlige for alle medlemmer"
  on public.kart_markering for select
  using (utloper > now() or opprettet_av = auth.uid());

create policy "Egen markering kan settes"
  on public.kart_markering for insert
  with check (opprettet_av = auth.uid());

-- Egen markering, eller admin. Admin er med fordi en markering er synlig for
-- hele klubben: står det noe der som ikke bør stå, skal det kunne fjernes uten
-- å vente på at den som satte den våkner.
create policy "Egen markering eller admin kan slette"
  on public.kart_markering for delete
  using (opprettet_av = auth.uid() or er_admin());
