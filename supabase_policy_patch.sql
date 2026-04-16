create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.employee_type = 'admin'
  );
$$;

drop policy if exists "admin manage cities" on public.cities;
create policy "admin manage cities" on public.cities
for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "admin and call center manage day offs" on public.day_offs;
drop policy if exists "authenticated read day offs" on public.day_offs;
create policy "authenticated read day offs" on public.day_offs
for select to authenticated
using (
  public.current_employee_role() in ('admin', 'call_center')
  or exists (
    select 1
    from public.employees e
    where e.id = technician_id
      and e.id = public.current_employee_id()
  )
);
create policy "admin and call center manage day offs" on public.day_offs
for all to authenticated
using (public.current_employee_role() in ('admin', 'call_center'))
with check (public.current_employee_role() in ('admin', 'call_center'));

drop policy if exists "admin and call center create sources" on public.sources;
create policy "admin and call center create sources" on public.sources
for insert to authenticated with check (exists (
  select 1
  from public.employees e
  where e.auth_user_id = auth.uid()
    and e.employee_type in ('admin', 'call_center')
));

drop policy if exists "admin manage employees" on public.employees;
create policy "admin manage employees" on public.employees
for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "admin read employee private" on public.employee_private;
create policy "admin read employee private" on public.employee_private
for select to authenticated using (public.is_admin_user());

drop policy if exists "admin manage employee private" on public.employee_private;
create policy "admin manage employee private" on public.employee_private
for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
