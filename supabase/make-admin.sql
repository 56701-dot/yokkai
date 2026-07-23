-- Run this after creating an account through the app or Supabase Auth.
-- Replace this value with the email or username that should become admin.

with target_admin as (
  select lower('admin@example.com') as login
)

update public.profiles
set role = 'admin'
where lower(email) = (select login from target_admin)
or username = (select login from target_admin);

select id, email, username, role
from public.profiles
where role = 'admin'
order by created_at desc;
