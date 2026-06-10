-- Egen logging av Core Web Vitals. Brukes i stedet for / ved siden av
-- Vercel Speed Insights, som blokkeres av iOS Safari ITP på mobil selv
-- om endpointet er first-party. Vår /api/vitals-route matcher ikke
-- tracker-heuristikken og slipper gjennom.

create table vitals_logg (
  id          uuid primary key default gen_random_uuid(),
  rute        text not null,   -- f.eks. '/', '/arrangementer/[id]'
  metric      text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  verdi       double precision not null,
  rating      text check (rating in ('good', 'needs-improvement', 'poor')),
  device_type text check (device_type in ('mobile', 'tablet', 'desktop')),
  opprettet   timestamptz not null default now()
);

-- Støtter tidsfiltrering + gruppe-queries per rute/metric i admin-UI
create index vitals_logg_opprettet_idx on vitals_logg (opprettet desc);
create index vitals_logg_rute_metric_idx on vitals_logg (rute, metric, opprettet desc);

alter table vitals_logg enable row level security;

-- Kun admin kan lese loggen — vanlige medlemmer har ikke bruk for dataene.
create policy "Admin kan lese vitals" on vitals_logg
  for select using (er_admin());

-- INSERT gjøres via /api/vitals med admin-klient (service role), så RLS
-- trenger ikke policy for det. Dette hindrer også at brukere spammer
-- direkte mot tabellen utenom API-et.
