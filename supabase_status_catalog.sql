alter table public.orders
  drop constraint if exists orders_status_check;

create table if not exists public.status_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_label text not null,
  tone_key text not null default 'sky',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists status_catalog_sort_idx
  on public.status_catalog(sort_order, created_at);

alter table public.status_catalog enable row level security;

drop policy if exists "authenticated read statuses" on public.status_catalog;
create policy "authenticated read statuses"
on public.status_catalog
for select
to authenticated
using (true);

drop policy if exists "admin manage statuses" on public.status_catalog;
create policy "admin manage statuses"
on public.status_catalog
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

insert into public.status_catalog (name, short_label, tone_key, sort_order)
values
  ('Новый', 'НОВЫЙ', 'amber', 0),
  ('Прозвонен', 'ПРОЗВ.', 'sky', 1),
  ('Подтверждён', 'ПОДТВ.', 'green', 2),
  ('Подтвержден мастером', 'МАСТЕР', 'green', 3),
  ('В пути', 'В ПУТИ', 'blue', 4),
  ('На объекте', 'ОБЪЕКТ', 'violet', 5),
  ('Выполнен', 'ВЫПОЛН.', 'pink', 6),
  ('Отменён', 'ОТМЕН.', 'red', 7),
  ('Перенесён', 'ПЕРЕН.', 'yellow', 8),
  ('Возврат в офис', 'ВОЗВР.', 'red', 9)
on conflict (name) do update set
  short_label = excluded.short_label,
  tone_key = excluded.tone_key,
  sort_order = excluded.sort_order;
