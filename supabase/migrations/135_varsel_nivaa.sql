-- Per-medlem nivåvalg for varsler: «viktige» eller «alle». Se #614.
--
-- Bakgrunn: #612 (mig. 134) ga varsel på all chat, og innførte skillet
-- teller_ulest (true = viktig, false = lavsignal/chat) for å holde
-- innboksen lesbar. Dette skillet er FASIT for hva som er «viktig» — vi
-- innfører derfor IKKE en egen liste over hvilke `type`-verdier som er
-- viktige her. En egen liste ville vært en andre sannhet som kan drifte fra
-- teller_ulest over tid; gaten i lib/varsler.ts leser tellerUlest direkte.
--
-- Nivået er en egen akse fra KANAL (push_aktiv/epost_aktiv, mig. 029/030):
-- kanal styrer HVOR et varsel går, nivå styrer HVILKE varsler som i det
-- hele tatt får lov til å gå på push/epost. De to kombineres fritt — en mann
-- kan ha push+epost på, men nivå 'viktige', og mister da chat-plingene på
-- begge kanaler samtidig.
--
-- Default 'alle' er kritisk: uten den reverserer denne migrasjonen #612
-- stille for alle eksisterende medlemmer (chat-varsling ville sluttet å nå
-- push/epost for hele klubben, dagen etter at #612 nettopp innførte det).
--
-- `if not exists` — idempotent, som 134: en migrasjon som feiler halvveis
-- skal kunne kjøres om igjen uten manuell opprydding.
alter table public.varsel_preferanser
  add column if not exists varsel_nivaa text not null default 'alle'
  check (varsel_nivaa in ('viktige', 'alle'));

-- Ingen grant-endring nødvendig: migrasjon 107 ga `authenticated` FULL
-- select/insert/update på hele varsel_preferanser-tabellen (ingen
-- kolonnevern som på varsel_logg, mig. 121) — den nye kolonnen er dermed
-- automatisk skrivbar for et medlem som endrer sin egen rad. Verifisert
-- mot 107/086 før denne linjen ble skrevet.
