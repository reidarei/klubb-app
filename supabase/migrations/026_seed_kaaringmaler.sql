-- Seed kaaringmaler with default categories
insert into kaaringmaler (navn, rekkefolge) values
  ('Årets herre', 1),
  ('Årets møte', 2)
on conflict do nothing;
