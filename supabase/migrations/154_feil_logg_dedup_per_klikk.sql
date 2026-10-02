-- #626 — push-klikk-telemetrien ble slukt av minutt-dedupen.
--
-- feil_logg_profil_event_minutt_uq (migrasjon 122) deduper på
-- (profil, event, UTC-minutt), og /api/logg-feil tier om 23505. Det er riktig
-- for feilstormer, men feil for push-telemetrien: hver rad der er en egen
-- hendelse identifisert av klikk_id. To ulike push-klikk fra samme medlem
-- innen samme minutt ga én push.klikk-rad, og det samme gjaldt
-- push.klikk.navigert og push.klikk.landet. Regnskapet push.klikk minus
-- navigerte/landede har derfor historisk kunnet vise for få rader på begge
-- sider av differansen.
--
-- Løsning: rader MED klikk_id i konteksten deduperes per klikk i stedet —
-- (event, klikk_id, forsok). forsok er med fordi gjentatte navigasjonsforsøk
-- for samme klikk (loop-brytelsen, PUSH_KLIKK_MAKS_FORSOK) er nettopp det vi
-- vil se. Rader UTEN klikk_id beholder minutt-dedupen uendret.
--
-- forsok coalesces til '' fordi NULL er distinkt i en unique-indeks — uten det
-- ville push.klikk (som ikke har forsok) aldri blitt deduplisert i det hele tatt.

-- Rydd eventuelle eksisterende duplikater før den nye indeksen bygges, ellers
-- feiler create unique index. Beholder laveste id per nøkkel.
delete from public.feil_logg a
using public.feil_logg b
where a.kontekst->>'klikk_id' is not null
  and a.kontekst->>'klikk_id' = b.kontekst->>'klikk_id'
  and a.event = b.event
  and coalesce(a.kontekst->>'forsok', '') = coalesce(b.kontekst->>'forsok', '')
  and a.id > b.id;

drop index if exists feil_logg_profil_event_minutt_uq;

create unique index feil_logg_profil_event_minutt_uq
  on public.feil_logg (
    coalesce(profil_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event,
    feil_logg_bucket(opprettet)
  )
  where (kontekst->>'klikk_id') is null;

create unique index feil_logg_event_klikk_forsok_uq
  on public.feil_logg (
    event,
    (kontekst->>'klikk_id'),
    coalesce(kontekst->>'forsok', '')
  )
  where (kontekst->>'klikk_id') is not null;

-- Kun indekser på en eksisterende tabell — ingen nye grants (jf. CLAUDE.md
-- § Policy: Migrasjoner).
