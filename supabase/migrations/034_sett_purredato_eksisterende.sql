-- Sett purredato på eksisterende arrangoransvar-rader som mangler den
update arrangoransvar set purredato = (aar || '-01-01')::date
  where purredato is null and lower(arrangement_navn) like '%januar%';
update arrangoransvar set purredato = (aar || '-03-01')::date
  where purredato is null and lower(arrangement_navn) like '%mars%';
update arrangoransvar set purredato = (aar || '-05-01')::date
  where purredato is null and lower(arrangement_navn) like '%mai%';
update arrangoransvar set purredato = (aar || '-08-01')::date
  where purredato is null and lower(arrangement_navn) like '%august%';
update arrangoransvar set purredato = (aar || '-10-01')::date
  where purredato is null and lower(arrangement_navn) like '%oktober%';
update arrangoransvar set purredato = (aar || '-11-01')::date
  where purredato is null and lower(arrangement_navn) like '%jule%';
