-- Reaksjoner skal ikke lenger forlenge en meldings levetid på agenda.
-- Tidligere bumpet både kommentarer og reaksjoner sist_aktivitet,
-- som førte til at en gammel melding kunne henge igjen øverst lenge
-- bare fordi noen ga den et tomle. Nå er det kun kommentarer som
-- forlenger. Reaksjoner er for lette til å regnes som «aktivitet».

drop trigger if exists melding_reaksjon_oppdaterer_sist_aktivitet on melding_reaksjon;
