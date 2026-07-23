create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username text,
  email text,
  role text not null default 'player',
  coins integer not null default 9999,
  level integer not null default 67,
  xp integer not null default 780,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists username text;

alter table public.profiles
add column if not exists email text;

alter table public.profiles
add column if not exists role text not null default 'player';

create or replace function public.normalize_username(raw_value text, fallback_value text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(lower(coalesce(raw_value, '')), '[^a-z0-9_]', '', 'g') ~ '^[a-z0-9_]{3,24}$'
      then regexp_replace(lower(coalesce(raw_value, '')), '[^a-z0-9_]', '', 'g')
    else fallback_value
  end;
$$;

update public.profiles profile
set
  email = coalesce(profile.email, auth_user.email),
  username = public.normalize_username(
    coalesce(profile.username, profile.display_name, split_part(auth_user.email, '@', 1)),
    'player_' || substr(replace(profile.id::text, '-', ''), 1, 8)
  )
from auth.users auth_user
where profile.id = auth_user.id;

with duplicate_usernames as (
  select
    id,
    username,
    row_number() over (partition by username order by created_at, id) as username_rank
  from public.profiles
)
update public.profiles profile
set username = left(duplicate_usernames.username, 15) || '_' || substr(replace(profile.id::text, '-', ''), 1, 8)
from duplicate_usernames
where profile.id = duplicate_usernames.id
and duplicate_usernames.username_rank > 1;

alter table public.profiles
alter column username set not null;

alter table public.profiles
alter column email set not null;

alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('player', 'admin'));

alter table public.profiles
drop constraint if exists profiles_username_format;

alter table public.profiles
add constraint profiles_username_format
check (username ~ '^[a-z0-9_]{3,24}$');

create unique index if not exists profiles_username_unique
on public.profiles (username);

create unique index if not exists profiles_email_unique
on public.profiles (lower(email));

alter table public.profiles enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
    and role = 'admin'
  );
$$;

revoke execute on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Admins can read all profiles" on public.profiles;

create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.current_user_is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'Player'),
    public.normalize_username(
      coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
      'player_' || substr(replace(new.id::text, '-', ''), 1, 8)
    ),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public;

create or replace function public.resolve_login_email(login_identifier text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where username = lower(login_identifier)
  limit 1;
$$;

revoke execute on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

create or replace function public.is_username_available(candidate_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where username = lower(candidate_username)
  );
$$;

revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
