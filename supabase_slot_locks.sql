create table if not exists public.slot_locks (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.employees(id) on delete cascade,
  order_date date not null,
  time_slot smallint not null check (time_slot between 0 and 12),
  employee_id uuid references public.employees(id) on delete cascade,
  employee_name text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (technician_id, order_date, time_slot)
);

create index if not exists slot_locks_lookup_idx
  on public.slot_locks(technician_id, order_date, time_slot, expires_at);

create index if not exists slot_locks_expires_idx
  on public.slot_locks(expires_at);

alter table public.slot_locks enable row level security;

drop policy if exists "authenticated read slot locks" on public.slot_locks;
create policy "authenticated read slot locks"
on public.slot_locks
for select
to authenticated
using (true);

drop policy if exists "authenticated manage slot locks" on public.slot_locks;
create policy "authenticated manage slot locks"
on public.slot_locks
for all
to authenticated
using (true)
with check (true);
