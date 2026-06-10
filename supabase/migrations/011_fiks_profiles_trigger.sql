-- Fiks: trigger satte ikke navn, som er not null
-- Bruker e-post som midlertidig navn til admin oppdaterer profilen

create or replace function handle_ny_bruker()
returns trigger as $$
begin
  insert into public.profiles (id, epost, navn)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;
