-- Justering av RLS-vinduet i 073: stemmer ble åpnet for admin idet
-- svarfristen passerte, men appen behandler en kåringspoll som "fortsatt
-- åpen" til cron har satt `avsluttet_paa`. I praksis fikk admin se
-- stemmer på poller UI-et fortsatt rendret som åpne — inkonsistent.
--
-- Vi binder synligheten til `avsluttet_paa is not null` i stedet, slik
-- at både UI og RLS bruker samme sannhet om når kåringen er låst.
-- Idempotent RPC + cron sørger for at vinduet lukkes innen rimelig tid.
-- Også samme låsedato brukes for det "tilfellet" der admin avslutter
-- manuelt (RPC setter `avsluttet_paa`).

drop policy "Stemmer leses med kåring-anonymitet" on poll_stemme;

create policy "Stemmer leses med kåring-anonymitet"
  on poll_stemme for select
  using (
    -- Egen stemme: alltid synlig
    profil_id = auth.uid()
    or exists (
      select 1 from poll p
      where p.id = poll_stemme.poll_id
        and (
          -- Vanlig poll: alle ser alt (uendret #86-oppførsel)
          p.kaaring_mal_id is null
          -- Kåringspoll: kun admin/generalsekretær, og kun etter avslutning
          or (er_admin() and p.avsluttet_paa is not null)
        )
    )
  );
