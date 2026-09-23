-- Slå på fire varseltyper for kåringspoll-flyten i admin-panelet.
-- on conflict do nothing slik at re-kjøring ikke overskriver evt.
-- avslåtte innstillinger.

insert into varsel_innstillinger (noekkel, aktiv, beskrivelse) values
  ('kaaringspoll_opprettet',    true, 'Varsel ved ny kåringspoll'),
  ('kaaringspoll_vinner',       true, 'Varsel når en kåringspoll har fått vinner'),
  ('kaaringspoll_tiebreak',     true, 'Varsel til generalsekretær ved likt antall stemmer'),
  ('kaaringspoll_ingen_stemmer',true, 'Varsel når en kåringspoll lukkes uten stemmer')
on conflict (noekkel) do nothing;
