alter table public.employee_private
  add column if not exists residence_address text;

alter table public.employee_private
  add column if not exists residence_lat double precision;

alter table public.employee_private
  add column if not exists residence_lng double precision;
