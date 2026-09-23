-- push_aktiv skal default til false — brukeren må aktivt godkjenne push
alter table varsel_preferanser alter column push_aktiv set default false;

-- Sett push_aktiv=false for alle som ikke har en faktisk push-subscription
update varsel_preferanser
set push_aktiv = false
where profil_id not in (select distinct profil_id from push_subscriptions);
