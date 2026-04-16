1. Open your Supabase project SQL Editor.
2. Run [`supabase_schema.sql`](/Users/swift/Desktop/CRM%20v2/supabase_schema.sql).
3. Run [`supabase_seed.sql`](/Users/swift/Desktop/CRM%20v2/supabase_seed.sql).
4. Run [`supabase_policy_patch.sql`](/Users/swift/Desktop/CRM%20v2/supabase_policy_patch.sql).
5. In Authentication, create users for:
   - owner/admin
   - call center employees
   - technicians if they need direct access later
6. After each auth user is created, connect them to `public.employees.auth_user_id`.

Recommended initial role mapping:
- owner: `admin`
- Мария: `call_center`
- Анна: `call_center`
- Наталья: `call_center`

Important:
- Passport data should be stored only in `public.employee_private`.
- Do not store passport in the main `public.employees` table in production.
- The current frontend is prepared for Supabase config, but the repository is still using local persistence until the next integration step replaces it with live CRUD.
