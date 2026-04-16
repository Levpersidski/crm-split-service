create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.service_catalog(id) on delete cascade,
  node_type text not null check (node_type in ('direction','subcategory','service')),
  name text not null,
  price numeric,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_catalog_price_rule check (
    (node_type = 'service' and price is not null and price >= 0)
    or (node_type in ('direction','subcategory') and price is null)
  )
);

create index if not exists service_catalog_parent_idx
  on public.service_catalog(parent_id, sort_order, created_at);

create unique index if not exists service_catalog_unique_name_per_parent
  on public.service_catalog(coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

alter table public.service_catalog enable row level security;

drop policy if exists "authenticated read service catalog" on public.service_catalog;
create policy "authenticated read service catalog"
on public.service_catalog
for select
to authenticated
using (true);

drop policy if exists "admin manage service catalog" on public.service_catalog;
create policy "admin manage service catalog"
on public.service_catalog
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create or replace function public.set_service_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists service_catalog_set_updated_at on public.service_catalog;
create trigger service_catalog_set_updated_at
before update on public.service_catalog
for each row execute procedure public.set_service_catalog_updated_at();
