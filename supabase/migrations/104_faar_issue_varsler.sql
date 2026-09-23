-- Per-medlem flagg for hvem som mottar system-varsler: nye innspill fra
-- GitHub-webhooken og klientfeil-alarmen fra cron.
--
-- Flytter sannheten fra rolle-matrisen i lib/roller.ts (faarIssueVarsler,
-- som var hardkodet til kun 'admin') til en kolonne admin kan styre per
-- medlem i RedigerMedlemSkjema. Rollen bestemmer ikke lenger mottakerne.
--
-- Kolonnen ligger på profiles (ikke varsel_preferanser) fordi dette er
-- admin-styrt målretting, ikke en brukerstyrt preferanse.

alter table public.profiles
  add column faar_issue_varsler boolean not null default false;

-- Seed: bevar dagens adferd — admins mottar, generalsekretær og medlem ikke.
update public.profiles
  set faar_issue_varsler = true
  where rolle = 'admin';
