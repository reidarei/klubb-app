-- Erstatt purre_maaned med purredato (full dato, år ignoreres — kun dag+måned brukes)
alter table arrangementmaler add column purredato date;

update arrangementmaler
  set purredato = make_date(2000, purre_maaned, 1)
  where purre_maaned is not null;

alter table arrangementmaler drop column purre_maaned;
