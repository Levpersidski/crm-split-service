alter table public.orders
  add column if not exists technician_confirmed_at timestamptz;

alter table public.orders
  add column if not exists technician_confirmed_by uuid references public.employees(id) on delete set null;

alter table public.orders
  add column if not exists returned_to_office_at timestamptz;

alter table public.orders
  add column if not exists returned_to_office_by uuid references public.employees(id) on delete set null;

alter table public.orders
  add column if not exists return_to_office_comment text;

alter table public.orders
  add column if not exists office_attention_required boolean not null default false;

insert into public.status_catalog (name, short_label, tone_key, sort_order)
values
  ('Подтвержден мастером', 'МАСТЕР', 'green', 3),
  ('Возврат в офис', 'ВОЗВР.', 'red', 9)
on conflict (name) do update set
  short_label = excluded.short_label,
  tone_key = excluded.tone_key,
  sort_order = excluded.sort_order;
