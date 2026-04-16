do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'duration_slots'
  ) then
    alter table public.orders
      add column duration_slots smallint not null default 2 check (duration_slots between 1 and 12);
  end if;

  alter table public.orders
    drop constraint if exists orders_time_slot_check;

  alter table public.busy_slots
    drop constraint if exists busy_slots_time_slot_check;

  update public.orders
    set time_slot = time_slot + 100
    where time_slot between 0 and 6;

  update public.busy_slots
    set time_slot = time_slot + 100
    where time_slot between 0 and 6;

  update public.orders
    set time_slot = (time_slot - 100) * 2
    where time_slot between 100 and 106;

  update public.busy_slots
    set time_slot = (time_slot - 100) * 2
    where time_slot between 100 and 106;

  alter table public.orders
    add constraint orders_time_slot_check check (time_slot between 0 and 12);

  alter table public.busy_slots
    add constraint busy_slots_time_slot_check check (time_slot between 0 and 12);
end $$;
