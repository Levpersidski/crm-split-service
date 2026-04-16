alter table public.orders
  add column if not exists direction_id uuid references public.service_catalog(id) on delete set null;

alter table public.orders
  add column if not exists subcategory_id uuid references public.service_catalog(id) on delete set null;

create table if not exists public.employee_service_scopes (
  employee_id uuid not null references public.employees(id) on delete cascade,
  direction_id uuid not null references public.service_catalog(id) on delete cascade,
  subcategory_id uuid not null references public.service_catalog(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, subcategory_id)
);

create table if not exists public.order_service_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid not null references public.service_catalog(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id, service_id)
);

alter table public.employee_service_scopes enable row level security;
alter table public.order_service_items enable row level security;

drop policy if exists "authenticated read employee scopes" on public.employee_service_scopes;
create policy "authenticated read employee scopes"
on public.employee_service_scopes
for select
to authenticated
using (true);

drop policy if exists "admin manage employee scopes" on public.employee_service_scopes;
create policy "admin manage employee scopes"
on public.employee_service_scopes
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "authenticated read order items" on public.order_service_items;
create policy "authenticated read order items"
on public.order_service_items
for select
to authenticated
using (true);

drop policy if exists "authenticated manage order items" on public.order_service_items;
create policy "authenticated manage order items"
on public.order_service_items
for all
to authenticated
using (true)
with check (true);
