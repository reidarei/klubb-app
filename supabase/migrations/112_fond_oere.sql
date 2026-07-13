-- Fond: beløpskolonner fra bigint (hele kroner) til numeric(12,2) (#443-oppfølger)
--
-- Kontant-innskudd og saldo har øre i praksis (bankkontoer er ikke hele kroner).
-- numeric(12,2) er eksakt desimal-aritmetikk — aldri float for penger.
-- bigint → numeric er tapsfri, så eksisterende rader konverteres trygt.
-- RLS, grants og policies er uendret av kolonnetype-endring.

alter table public.fond_eiendom
  alter column markedsverdi type numeric(12,2),
  alter column anskaffelsesverdi type numeric(12,2);

alter table public.fond_verdipapir
  alter column verdi type numeric(12,2),
  alter column anskaffelsesverdi type numeric(12,2);

alter table public.fond_innskudd
  alter column belop type numeric(12,2);

alter table public.fond_kontant
  alter column saldo type numeric(12,2);

alter table public.fond_verdi_historikk
  alter column gammel_verdi type numeric(12,2),
  alter column ny_verdi type numeric(12,2);
