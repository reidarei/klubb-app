-- Enable RLS on kaaringmaler
alter table kaaringmaler enable row level security;

-- kaaringmaler policies - admin control is handled server-side via actions
create policy "Autentiserte kan lese kåringmaler"
  on kaaringmaler for select
  using (auth.role() = 'authenticated');
