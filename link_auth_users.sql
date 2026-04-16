-- 1. Create auth users manually in Supabase Dashboard -> Authentication -> Users
-- 2. Replace the emails below with the exact emails you created
-- 3. Run this script in SQL Editor

update public.employees e
set auth_user_id = u.id
from auth.users u
where e.name = 'Владелец'
  and u.email = 'owner@example.com';

update public.employees e
set auth_user_id = u.id
from auth.users u
where e.name = 'Мария'
  and u.email = 'maria@example.com';

update public.employees e
set auth_user_id = u.id
from auth.users u
where e.name = 'Анна'
  and u.email = 'anna@example.com';

update public.employees e
set auth_user_id = u.id
from auth.users u
where e.name = 'Наталья'
  and u.email = 'natalia@example.com';

select e.name, e.employee_type, e.auth_user_id, u.email
from public.employees e
left join auth.users u on u.id = e.auth_user_id
order by e.employee_type, e.name;
