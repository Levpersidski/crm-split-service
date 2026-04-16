alter table public.orders
  add column if not exists final_price numeric;
