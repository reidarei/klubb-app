-- Legg til purre_maaned på arrangementmaler (hvilken måned purring sendes ut)
alter table arrangementmaler add column purre_maaned smallint;

-- Seed eksisterende maler med riktige måneder
update arrangementmaler set purre_maaned = 1 where lower(navn) like '%januar%';
update arrangementmaler set purre_maaned = 3 where lower(navn) like '%mars%';
update arrangementmaler set purre_maaned = 5 where lower(navn) like '%mai%';
update arrangementmaler set purre_maaned = 8 where lower(navn) like '%august%';
update arrangementmaler set purre_maaned = 10 where lower(navn) like '%oktober%';
update arrangementmaler set purre_maaned = 11 where lower(navn) like '%jule%';
