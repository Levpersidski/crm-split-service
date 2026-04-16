create table if not exists public.contact_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tone_key text not null default 'blue',
  sort_order integer not null default 0,
  system_key text unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_reasons (
  id uuid primary key default gen_random_uuid(),
  contact_status_id uuid not null references public.contact_statuses(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  city_id uuid not null references public.cities(id) on delete restrict,
  contact_status_id uuid not null references public.contact_statuses(id) on delete restrict,
  contact_reason_id uuid references public.contact_reasons(id) on delete set null,
  comment text,
  callback_date date,
  created_by uuid references public.employees(id) on delete set null,
  last_edited_by uuid references public.employees(id) on delete set null,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  last_call_at timestamptz,
  converted_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_phone_digits_check check (regexp_replace(phone, '\D', '', 'g') <> '')
);

alter table public.contacts
  add column if not exists name text;

create index if not exists contact_statuses_sort_idx
  on public.contact_statuses(sort_order, created_at);

create index if not exists contact_reasons_status_sort_idx
  on public.contact_reasons(contact_status_id, sort_order, created_at);

create unique index if not exists contact_reasons_unique_name_per_status_idx
  on public.contact_reasons(contact_status_id, lower(name));

create index if not exists contacts_created_at_idx
  on public.contacts(created_at desc);

create index if not exists contacts_phone_idx
  on public.contacts(phone);

create index if not exists contacts_city_idx
  on public.contacts(city_id);

create index if not exists contacts_status_idx
  on public.contacts(contact_status_id);

create index if not exists contacts_reason_idx
  on public.contacts(contact_reason_id);

create index if not exists contacts_callback_idx
  on public.contacts(callback_date)
  where callback_date is not null;

create unique index if not exists contact_statuses_single_default_idx
  on public.contact_statuses((is_default))
  where is_default = true;

create or replace function public.validate_contact_reason_for_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reason_status_id uuid;
  callback_status_id uuid;
begin
  select cs.id
  into callback_status_id
  from public.contact_statuses cs
  where cs.system_key = 'callback'
  limit 1;

  if callback_status_id is not null and new.contact_status_id = callback_status_id and new.callback_date is null then
    raise exception 'Для статуса "Перезвонить" требуется дата перезвона';
  end if;

  if callback_status_id is not null and new.contact_status_id <> callback_status_id then
    new.callback_date = null;
  end if;

  if new.contact_reason_id is null then
    return new;
  end if;

  select cr.contact_status_id
  into reason_status_id
  from public.contact_reasons cr
  where cr.id = new.contact_reason_id;

  if reason_status_id is null then
    raise exception 'Причина контакта не найдена';
  end if;

  if reason_status_id <> new.contact_status_id then
    raise exception 'Причина не принадлежит выбранному статусу контакта';
  end if;

  return new;
end;
$$;

create or replace function public.normalize_contact_default_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_default then
    update public.contact_statuses
    set is_default = false
    where id <> new.id
      and is_default = true;
  end if;

  return new;
end;
$$;

drop trigger if exists contact_statuses_set_updated_at on public.contact_statuses;
create trigger contact_statuses_set_updated_at
before update on public.contact_statuses
for each row execute function public.set_updated_at();

drop trigger if exists contact_reasons_set_updated_at on public.contact_reasons;
create trigger contact_reasons_set_updated_at
before update on public.contact_reasons
for each row execute function public.set_updated_at();

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists validate_contact_reason_for_status on public.contacts;
create trigger validate_contact_reason_for_status
before insert or update on public.contacts
for each row execute function public.validate_contact_reason_for_status();

drop trigger if exists normalize_contact_default_status on public.contact_statuses;
create trigger normalize_contact_default_status
before insert or update on public.contact_statuses
for each row execute function public.normalize_contact_default_status();

alter table public.contact_statuses enable row level security;
alter table public.contact_reasons enable row level security;
alter table public.contacts enable row level security;

drop policy if exists "authenticated read contact statuses" on public.contact_statuses;
create policy "authenticated read contact statuses"
on public.contact_statuses
for select
to authenticated
using (public.current_employee_role() in ('admin', 'call_center'));

drop policy if exists "admin manage contact statuses" on public.contact_statuses;
create policy "admin manage contact statuses"
on public.contact_statuses
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "authenticated read contact reasons" on public.contact_reasons;
create policy "authenticated read contact reasons"
on public.contact_reasons
for select
to authenticated
using (public.current_employee_role() in ('admin', 'call_center'));

drop policy if exists "admin manage contact reasons" on public.contact_reasons;
create policy "admin manage contact reasons"
on public.contact_reasons
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "crm roles read contacts" on public.contacts;
create policy "crm roles read contacts"
on public.contacts
for select
to authenticated
using (public.current_employee_role() in ('admin', 'call_center'));

drop policy if exists "crm roles insert contacts" on public.contacts;
create policy "crm roles insert contacts"
on public.contacts
for insert
to authenticated
with check (
  public.current_employee_role() in ('admin', 'call_center')
  and (created_by is null or created_by = public.current_employee_id())
  and (last_edited_by is null or last_edited_by = public.current_employee_id())
);

drop policy if exists "crm roles update contacts" on public.contacts;
create policy "crm roles update contacts"
on public.contacts
for update
to authenticated
using (public.current_employee_role() in ('admin', 'call_center'))
with check (
  public.current_employee_role() in ('admin', 'call_center')
  and (last_edited_by is null or last_edited_by = public.current_employee_id())
);

drop policy if exists "admin delete contacts" on public.contacts;
create policy "admin delete contacts"
on public.contacts
for delete
to authenticated
using (public.is_admin_user());

insert into public.contact_statuses (name, tone_key, sort_order, system_key, is_default)
values
  ('Новый', 'blue', 0, 'new', true),
  ('Перезвонить', 'yellow', 1, 'callback', false),
  ('Недозвонился', 'orange', 2, 'missed', false),
  ('Неактуально', 'red', 3, 'inactive', false),
  ('Записан', 'green', 4, 'booked', false)
on conflict (name) do update set
  tone_key = excluded.tone_key,
  sort_order = excluded.sort_order,
  system_key = excluded.system_key,
  is_default = excluded.is_default;

with statuses as (
  select id, name
  from public.contact_statuses
)
insert into public.contact_reasons (name, contact_status_id, sort_order)
select *
from (
  select 'Занят'::text, (select id from statuses where name = 'Перезвонить'), 0
  union all
  select 'Просил позже', (select id from statuses where name = 'Перезвонить'), 1
  union all
  select 'Неудобно говорить', (select id from statuses where name = 'Перезвонить'), 2
  union all
  select 'Нужно посоветоваться', (select id from statuses where name = 'Перезвонить'), 3
  union all
  select 'Не взял трубку', (select id from statuses where name = 'Недозвонился'), 0
  union all
  select 'Сбросил', (select id from statuses where name = 'Недозвонился'), 1
  union all
  select 'Вне зоны', (select id from statuses where name = 'Недозвонился'), 2
  union all
  select 'Неверный номер', (select id from statuses where name = 'Недозвонился'), 3
  union all
  select 'Уже обслужили', (select id from statuses where name = 'Неактуально'), 0
  union all
  select 'Неинтересно', (select id from statuses where name = 'Неактуально'), 1
  union all
  select 'Ошибочный контакт', (select id from statuses where name = 'Неактуально'), 2
  union all
  select 'Переехал', (select id from statuses where name = 'Неактуально'), 3
  union all
  select 'Нет кондиционера', (select id from statuses where name = 'Неактуально'), 4
) seeded(name, contact_status_id, sort_order)
where contact_status_id is not null
on conflict (contact_status_id, lower(name)) do update set
  sort_order = excluded.sort_order;
