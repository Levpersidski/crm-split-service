drop policy if exists "authenticated read sources" on public.sources;
create policy "authenticated read sources" on public.sources
for select to authenticated
using (true);

drop policy if exists "admin and call center create sources" on public.sources;
drop policy if exists "admin manage sources" on public.sources;
create policy "admin manage sources" on public.sources
for all to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());
