create or replace function er_admin()
returns boolean as $$
  select rolle = 'admin'
  from profiles
  where id = auth.uid()
$$ language sql security definer stable;
