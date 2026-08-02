-- Fond: eksempelrader som viser strukturen uten å påstå noe om formuen (#555)
--
-- Eiendom- og verdipapir-seksjonene sto tomme fordi klubben ikke eier noe av
-- delen ennå, og «Ingen eiendommer» viser ikke hva feltene er til. Radene her
-- fyller det hullet: de er ekspanderbare som ekte rader, så husleie,
-- driftskostnader og utbytte er synlige — men ALLE beløp er 0.
--
-- Null i alle beløp er poenget, ikke en forglemmelse: totalverdien i heroen
-- summerer eiendom + verdipapir + kontanter, og en oppdiktet verdi ville vist
-- gutta en formue klubben ikke har. Navnene sier det samme i klartekst, slik
-- at ingen tar dem for ekte poster.
--
-- Slettes via /fond/rediger når klubben faktisk kjøper noe.

-- Idempotent: migrasjoner skal tåle å kjøres mot en instans som allerede har
-- radene (test-instansen bringes ajour manuelt mellom resets, se
-- docs/test-instans.md). `where not exists` på navn er nok — navnet er det
-- eneste som identifiserer raden før den har en id.
insert into public.fond_eiendom (navn, anskaffelsesverdi, markedsverdi, husleie_i_aar, driftskostnader_i_aar)
select 'Eiendom vi ikke har', 0, 0, 0, 0
where not exists (select 1 from public.fond_eiendom where navn = 'Eiendom vi ikke har');

insert into public.fond_verdipapir (navn, type, anskaffelsesverdi, verdi, utbytte_i_aar)
select 'Aksje vi ikke har', 'aksje', 0, 0, 0
where not exists (select 1 from public.fond_verdipapir where navn = 'Aksje vi ikke har');

insert into public.fond_verdipapir (navn, type, anskaffelsesverdi, verdi, utbytte_i_aar)
select 'Fond vi ikke har', 'fond', 0, 0, 0
where not exists (select 1 from public.fond_verdipapir where navn = 'Fond vi ikke har');
