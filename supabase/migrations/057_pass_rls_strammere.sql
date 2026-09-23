-- Strammer INSERT-policyen på pass_tilgang_forespørsel: eier må også
-- være meldt på som «ja» på turen. Uten denne sjekken kunne en
-- arrangør i teorien be om passinfo for noen som ikke deltar.

drop policy if exists "Tur-arrangør kan opprette pass-forespørsel"
  on pass_tilgang_forespørsel;

create policy "Tur-arrangør kan opprette pass-forespørsel for ja-deltaker"
  on pass_tilgang_forespørsel for insert
  with check (
    soker_id = auth.uid()
    and exists (
      select 1 from arrangementer a
      where a.id = arrangement_id
        and a.opprettet_av = auth.uid()
        and a.type = 'tur'
        and a.start_tidspunkt > now()
    )
    and exists (
      select 1 from paameldinger p
      where p.arrangement_id = pass_tilgang_forespørsel.arrangement_id
        and p.profil_id = eier_id
        and p.status = 'ja'
    )
  );
