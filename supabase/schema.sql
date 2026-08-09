create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username text,
  email text,
  role text not null default 'player',
  coins integer not null default 0,
  level integer not null default 1,
  xp integer not null default 0,
  stat_points integer not null default 0,
  hp integer not null default 100,
  max_hp integer not null default 100,
  attack integer not null default 10,
  defense integer not null default 5,
  speed integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists username text;

alter table public.profiles
add column if not exists email text;

alter table public.profiles
add column if not exists role text not null default 'player';

alter table public.profiles
add column if not exists coins integer not null default 0;

alter table public.profiles
add column if not exists level integer not null default 1;

alter table public.profiles
add column if not exists xp integer not null default 0;

alter table public.profiles
add column if not exists stat_points integer not null default 0;

alter table public.profiles
add column if not exists hp integer not null default 100;

alter table public.profiles
add column if not exists max_hp integer not null default 100;

alter table public.profiles
add column if not exists attack integer not null default 10;

alter table public.profiles
add column if not exists defense integer not null default 5;

alter table public.profiles
add column if not exists speed integer not null default 5;

alter table public.profiles
alter column coins set default 0,
alter column level set default 1,
alter column xp set default 0,
alter column stat_points set default 0,
alter column hp set default 100,
alter column max_hp set default 100,
alter column attack set default 10,
alter column defense set default 5,
alter column speed set default 5;

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
drop constraint if exists profiles_starter_stats_check;

alter table public.profiles
add constraint profiles_starter_stats_check
check (
  coins >= 0
  and level >= 1
  and xp >= 0
  and stat_points >= 0
  and hp >= 0
  and max_hp >= 1
  and hp <= max_hp
  and attack >= 0
  and defense >= 0
  and speed >= 0
);

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

create table if not exists public.quests (
  id text primary key,
  title text not null,
  quest_type text not null,
  exercise_type text not null,
  monster_name text,
  camera_angle text,
  impact_level text,
  space_required text,
  target_reps integer not null default 0,
  target_seconds integer not null default 0,
  warmup_seconds integer not null default 0,
  cooldown_seconds integer not null default 0,
  base_xp integer not null default 0,
  base_coins integer not null default 0,
  difficulty integer not null default 1,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quests
drop constraint if exists quests_type_check;

alter table public.quests
add constraint quests_type_check
check (quest_type in ('easy', 'normal', 'hard', 'main', 'side', 'daily', 'story'));

alter table public.quests
add column if not exists monster_name text;

alter table public.quests
add column if not exists camera_angle text;

alter table public.quests
add column if not exists impact_level text;

alter table public.quests
add column if not exists space_required text;

alter table public.quests
drop constraint if exists quests_numbers_check;

alter table public.quests
add constraint quests_numbers_check
check (
  target_reps >= 0
  and target_seconds >= 0
  and warmup_seconds >= 0
  and cooldown_seconds >= 0
  and base_xp >= 0
  and base_coins >= 0
  and difficulty between 1 and 100
);

create table if not exists public.quest_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null references public.quests(id),
  status text not null default 'started',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds integer not null default 0,
  reps_done integer not null default 0,
  valid_reps integer not null default 0,
  xp_earned integer not null default 0,
  coins_earned integer not null default 0,
  difficulty_used integer not null default 1,
  form_score numeric(5,2),
  target_reps_used integer not null default 0,
  target_seconds_used integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quest_sessions
drop constraint if exists quest_sessions_status_check;

alter table public.quest_sessions
add constraint quest_sessions_status_check
check (status in ('started', 'completed', 'abandoned', 'failed'));

alter table public.quest_sessions
drop constraint if exists quest_sessions_numbers_check;

alter table public.quest_sessions
add constraint quest_sessions_numbers_check
check (
  duration_seconds >= 0
  and reps_done >= 0
  and valid_reps >= 0
  and valid_reps <= reps_done
  and target_reps_used >= 0
  and target_seconds_used >= 0
  and xp_earned >= 0
  and coins_earned >= 0
  and difficulty_used between 1 and 100
  and (form_score is null or form_score between 0 and 100)
);

create index if not exists quest_sessions_user_started_idx
on public.quest_sessions (user_id, started_at desc);

create index if not exists quest_sessions_quest_idx
on public.quest_sessions (quest_id);

create table if not exists public.difficulty_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null references public.quests(id),
  exercise_type text not null,
  source_session_id uuid references public.quest_sessions(id) on delete set null,
  previous_target_reps integer not null default 0,
  previous_target_seconds integer not null default 0,
  adjusted_target_reps integer not null default 0,
  adjusted_target_seconds integer not null default 0,
  adjustment_percent numeric(5,2) not null default 0,
  reason text not null default 'baseline',
  based_on_sessions integer not null default 0,
  avg_completion_ratio numeric(6,3),
  avg_form_score numeric(5,2),
  created_at timestamptz not null default now(),
  constraint difficulty_adjustments_numbers_check check (
    previous_target_reps >= 0
    and previous_target_seconds >= 0
    and adjusted_target_reps >= 0
    and adjusted_target_seconds >= 0
    and based_on_sessions >= 0
    and (avg_completion_ratio is null or avg_completion_ratio >= 0)
    and (avg_form_score is null or avg_form_score between 0 and 100)
  )
);

create index if not exists difficulty_adjustments_user_created_idx
on public.difficulty_adjustments (user_id, created_at desc);

create index if not exists difficulty_adjustments_exercise_idx
on public.difficulty_adjustments (user_id, exercise_type, created_at desc);

create table if not exists public.daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  total_duration_seconds integer not null default 0,
  total_reps integer not null default 0,
  valid_reps integer not null default 0,
  xp_earned integer not null default 0,
  coins_earned integer not null default 0,
  quests_completed integer not null default 0,
  sessions_started integer not null default 0,
  best_form_score numeric(5,2),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

alter table public.daily_activity
drop constraint if exists daily_activity_numbers_check;

alter table public.daily_activity
add constraint daily_activity_numbers_check
check (
  total_duration_seconds >= 0
  and total_reps >= 0
  and valid_reps >= 0
  and valid_reps <= total_reps
  and xp_earned >= 0
  and coins_earned >= 0
  and quests_completed >= 0
  and sessions_started >= 0
  and (best_form_score is null or best_form_score between 0 and 100)
);

create table if not exists public.inventory_items (
  id text primary key,
  name text not null,
  item_type text not null,
  category text not null,
  price integer not null default 0,
  stat_bonus jsonb not null default '{}'::jsonb,
  rarity text not null default 'common',
  is_consumable boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items
drop constraint if exists inventory_items_type_check;

alter table public.inventory_items
add constraint inventory_items_type_check
check (item_type in ('weapon', 'armor', 'shoes', 'gloves', 'helmet', 'boost'));

alter table public.inventory_items
drop constraint if exists inventory_items_rarity_check;

alter table public.inventory_items
add constraint inventory_items_rarity_check
check (rarity in ('starter', 'common', 'rare', 'epic', 'legendary'));

alter table public.inventory_items
drop constraint if exists inventory_items_price_check;

alter table public.inventory_items
add constraint inventory_items_price_check
check (price >= 0);

create table if not exists public.player_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.inventory_items(id),
  quantity integer not null default 1,
  is_equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.player_inventory
drop constraint if exists player_inventory_quantity_check;

alter table public.player_inventory
add constraint player_inventory_quantity_check
check (quantity >= 0);

create index if not exists player_inventory_user_idx
on public.player_inventory (user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists quests_touch_updated_at on public.quests;
create trigger quests_touch_updated_at
before update on public.quests
for each row execute function public.touch_updated_at();

drop trigger if exists quest_sessions_touch_updated_at on public.quest_sessions;
create trigger quest_sessions_touch_updated_at
before update on public.quest_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists inventory_items_touch_updated_at on public.inventory_items;
create trigger inventory_items_touch_updated_at
before update on public.inventory_items
for each row execute function public.touch_updated_at();

drop trigger if exists player_inventory_touch_updated_at on public.player_inventory;
create trigger player_inventory_touch_updated_at
before update on public.player_inventory
for each row execute function public.touch_updated_at();

alter table public.quests enable row level security;
alter table public.quest_sessions enable row level security;
alter table public.daily_activity enable row level security;
alter table public.inventory_items enable row level security;
alter table public.player_inventory enable row level security;
alter table public.difficulty_adjustments enable row level security;

drop policy if exists "Anyone can read active quests" on public.quests;
create policy "Anyone can read active quests"
on public.quests
for select
to anon, authenticated
using (is_active);

drop policy if exists "Admins can manage quests" on public.quests;
create policy "Admins can manage quests"
on public.quests
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Users can read own quest sessions" on public.quest_sessions;
create policy "Users can read own quest sessions"
on public.quest_sessions
for select
to authenticated
using ((select auth.uid()) = user_id or public.current_user_is_admin());

drop policy if exists "Users can insert own quest sessions" on public.quest_sessions;
drop policy if exists "Users can update own quest sessions" on public.quest_sessions;

drop policy if exists "Users can read own daily activity" on public.daily_activity;
create policy "Users can read own daily activity"
on public.daily_activity
for select
to authenticated
using ((select auth.uid()) = user_id or public.current_user_is_admin());

drop policy if exists "Users can insert own daily activity" on public.daily_activity;
drop policy if exists "Users can update own daily activity" on public.daily_activity;

drop policy if exists "Anyone can read active inventory items" on public.inventory_items;
create policy "Anyone can read active inventory items"
on public.inventory_items
for select
to anon, authenticated
using (is_active);

drop policy if exists "Admins can manage inventory items" on public.inventory_items;
create policy "Admins can manage inventory items"
on public.inventory_items
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Users can read own inventory" on public.player_inventory;
create policy "Users can read own inventory"
on public.player_inventory
for select
to authenticated
using ((select auth.uid()) = user_id or public.current_user_is_admin());

drop policy if exists "Admins can manage player inventory" on public.player_inventory;
create policy "Admins can manage player inventory"
on public.player_inventory
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "Users can read own difficulty adjustments" on public.difficulty_adjustments;
create policy "Users can read own difficulty adjustments"
on public.difficulty_adjustments
for select
to authenticated
using ((select auth.uid()) = user_id or public.current_user_is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.quests, public.inventory_items to anon, authenticated;
grant select on public.quest_sessions, public.daily_activity to authenticated;
grant select on public.player_inventory to authenticated;
grant select on public.difficulty_adjustments to authenticated;
grant all on public.quests, public.inventory_items, public.quest_sessions, public.daily_activity, public.player_inventory, public.difficulty_adjustments to service_role;

insert into public.quests (
  id, title, quest_type, exercise_type, monster_name, camera_angle, impact_level,
  space_required, target_reps, target_seconds, warmup_seconds, cooldown_seconds,
  base_xp, base_coins, difficulty, sort_order
)
values
  ('slime_patrol_jumping_jack', 'Slime Patrol', 'easy', 'jumping_jack', 'Slime Patrol', 'Front', 'Medium', 'Small', 0, 45, 30, 30, 20, 0, 1, 10),
  ('bat_chase_high_knee', 'Bat Chase', 'easy', 'high_knee', 'Bat Chase', 'Front', 'Low', 'Small', 0, 40, 30, 30, 20, 0, 1, 20),
  ('swift_rat_butt_kick', 'Swift Rat', 'easy', 'butt_kick', 'Swift Rat', 'Side', 'Medium', 'Small', 0, 40, 30, 30, 20, 0, 1, 30),
  ('cave_crawler_mountain_climber', 'Cave Crawler', 'normal', 'mountain_climber', 'Cave Crawler', 'Side 45', 'Medium', 'Mat', 0, 30, 45, 45, 25, 0, 2, 40),
  ('frost_imp_skater_jump', 'Frost Imp', 'normal', 'skater_jump', 'Frost Imp', 'Front', 'Medium', 'Wide', 12, 0, 45, 45, 25, 0, 2, 50),
  ('stone_slime_squat', 'Stone Slime', 'normal', 'squat', 'Stone Slime', 'Side', 'Low', 'Small', 12, 0, 45, 45, 25, 0, 2, 60),
  ('shell_bug_plank', 'Shell Bug', 'normal', 'plank', 'Shell Bug', 'Side', 'Low', 'Mat', 0, 30, 45, 45, 25, 0, 2, 70),
  ('moss_turtle_glute_bridge', 'Moss Turtle', 'normal', 'glute_bridge', 'Moss Turtle', 'Side', 'Low', 'Mat', 12, 0, 45, 45, 25, 0, 2, 80)
on conflict (id) do update
set
  title = excluded.title,
  quest_type = excluded.quest_type,
  exercise_type = excluded.exercise_type,
  monster_name = excluded.monster_name,
  camera_angle = excluded.camera_angle,
  impact_level = excluded.impact_level,
  space_required = excluded.space_required,
  target_reps = excluded.target_reps,
  target_seconds = excluded.target_seconds,
  warmup_seconds = excluded.warmup_seconds,
  cooldown_seconds = excluded.cooldown_seconds,
  base_xp = excluded.base_xp,
  base_coins = excluded.base_coins,
  difficulty = excluded.difficulty,
  sort_order = excluded.sort_order,
  is_active = true;

update public.quests
set is_active = false
where id not in (
  'slime_patrol_jumping_jack',
  'bat_chase_high_knee',
  'swift_rat_butt_kick',
  'cave_crawler_mountain_climber',
  'frost_imp_skater_jump',
  'stone_slime_squat',
  'shell_bug_plank',
  'moss_turtle_glute_bridge'
);

insert into public.inventory_items (
  id, name, item_type, category, price, stat_bonus, rarity, is_consumable, sort_order
)
values
  ('wood_sword', 'Wood Sword', 'weapon', 'Sword', 0, '{"attack": 2}'::jsonb, 'starter', false, 10),
  ('trainee_armor', 'Trainee Armor', 'armor', 'Armor', 0, '{"defense": 2}'::jsonb, 'starter', false, 20),
  ('ice_sword', 'Ice Sword', 'weapon', 'Sword', 500, '{"attack": 10}'::jsonb, 'rare', false, 30),
  ('hp_potion', 'HP Potion', 'boost', 'Boost', 125, '{"hp": 100}'::jsonb, 'common', true, 40),
  ('aqua_armor', 'Aqua Armor', 'armor', 'Armor', 820, '{"defense": 16}'::jsonb, 'rare', false, 50),
  ('flash_shoes', 'Flash Shoes', 'shoes', 'Shoes', 650, '{"defense": 6}'::jsonb, 'rare', false, 60),
  ('power_gloves', 'Power Gloves', 'gloves', 'Gloves', 420, '{"attack": 4}'::jsonb, 'common', false, 70)
on conflict (id) do update
set
  name = excluded.name,
  item_type = excluded.item_type,
  category = excluded.category,
  price = excluded.price,
  stat_bonus = excluded.stat_bonus,
  rarity = excluded.rarity,
  is_consumable = excluded.is_consumable,
  sort_order = excluded.sort_order,
  is_active = true;

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

  insert into public.player_inventory (user_id, item_id, quantity, is_equipped)
  values
    (new.id, 'wood_sword', 1, true),
    (new.id, 'trainee_armor', 1, true)
  on conflict (user_id, item_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

create or replace function public.start_quest_session(target_quest_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_session_id uuid;
  target_difficulty integer;
  adjusted_reps integer;
  adjusted_seconds integer;
  dda_percent numeric;
  dda_reason text;
  dda_sessions integer;
  dda_completion numeric;
  dda_form numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  select difficulty
  into target_difficulty
  from public.quests
  where id = target_quest_id
  and is_active = true;

  if target_difficulty is null then
    raise exception 'Quest not found';
  end if;

  select
    dda.adjusted_target_reps,
    dda.adjusted_target_seconds,
    dda.adjustment_percent,
    dda.reason,
    dda.based_on_sessions,
    dda.avg_completion_ratio,
    dda.avg_form_score
  into adjusted_reps, adjusted_seconds, dda_percent, dda_reason, dda_sessions, dda_completion, dda_form
  from public.calculate_dda_for_quest(target_quest_id) dda;

  insert into public.quest_sessions (
    user_id,
    quest_id,
    difficulty_used,
    target_reps_used,
    target_seconds_used,
    metadata
  )
  values (
    (select auth.uid()),
    target_quest_id,
    target_difficulty,
    coalesce(adjusted_reps, 0),
    coalesce(adjusted_seconds, 0),
    jsonb_build_object(
      'dda_reason', coalesce(dda_reason, 'baseline_until_3_sessions'),
      'adjustment_percent', coalesce(dda_percent, 0),
      'based_on_sessions', coalesce(dda_sessions, 0),
      'avg_completion_ratio', dda_completion,
      'avg_form_score', dda_form
    )
  )
  returning id into new_session_id;

  insert into public.difficulty_adjustments (
    user_id,
    quest_id,
    exercise_type,
    source_session_id,
    previous_target_reps,
    previous_target_seconds,
    adjusted_target_reps,
    adjusted_target_seconds,
    adjustment_percent,
    reason,
    based_on_sessions,
    avg_completion_ratio,
    avg_form_score
  )
  select
    (select auth.uid()),
    quest.id,
    quest.exercise_type,
    new_session_id,
    quest.target_reps,
    quest.target_seconds,
    coalesce(adjusted_reps, quest.target_reps),
    coalesce(adjusted_seconds, quest.target_seconds),
    coalesce(dda_percent, 0),
    coalesce(dda_reason, 'baseline_until_3_sessions'),
    coalesce(dda_sessions, 0),
    dda_completion,
    dda_form
  from public.quests quest
  where quest.id = target_quest_id;

  insert into public.daily_activity (user_id, activity_date, sessions_started)
  values ((select auth.uid()), current_date, 1)
  on conflict (user_id, activity_date) do update
  set
    sessions_started = public.daily_activity.sessions_started + 1,
    updated_at = now();

  return new_session_id;
end;
$$;

revoke execute on function public.start_quest_session(text) from public;
grant execute on function public.start_quest_session(text) to authenticated;

create or replace function public.calculate_dda_for_quest(target_quest_id text)
returns table (
  quest_id text,
  adjusted_target_reps integer,
  adjusted_target_seconds integer,
  adjustment_percent numeric,
  reason text,
  based_on_sessions integer,
  avg_completion_ratio numeric,
  avg_form_score numeric
)
language sql
security definer
set search_path = public
as $$
  with target_quest as (
    select *
    from public.quests
    where id = target_quest_id
    and is_active = true
  ), recent_sessions as (
    select
      session.id,
      session.valid_reps,
      session.duration_seconds,
      session.target_reps_used,
      session.target_seconds_used,
      session.form_score,
      (
        coalesce(
          case
            when coalesce(nullif(session.target_reps_used, 0), target_quest.target_reps) > 0
              then least(1.5, session.valid_reps::numeric / coalesce(nullif(session.target_reps_used, 0), target_quest.target_reps))
          end,
          0
        )
        +
        coalesce(
          case
            when coalesce(nullif(session.target_seconds_used, 0), target_quest.target_seconds) > 0
              then least(1.5, session.duration_seconds::numeric / coalesce(nullif(session.target_seconds_used, 0), target_quest.target_seconds))
          end,
          0
        )
      )
      / nullif(
        (case when coalesce(nullif(session.target_reps_used, 0), target_quest.target_reps) > 0 then 1 else 0 end)
        + (case when coalesce(nullif(session.target_seconds_used, 0), target_quest.target_seconds) > 0 then 1 else 0 end),
        0
      ) as completion_ratio
    from public.quest_sessions session
    join public.quests session_quest on session_quest.id = session.quest_id
    cross join target_quest
    where session.user_id = (select auth.uid())
    and session.status = 'completed'
    and session_quest.exercise_type = target_quest.exercise_type
    order by session.completed_at desc nulls last, session.started_at desc
    limit 3
  ), aggregates as (
    select
      count(*)::integer as session_count,
      avg(completion_ratio) as avg_completion,
      avg(coalesce(form_score, 75)) as avg_form
    from recent_sessions
  ), decision as (
    select
      target_quest.id,
      target_quest.target_reps,
      target_quest.target_seconds,
      aggregates.session_count,
      aggregates.avg_completion,
      aggregates.avg_form,
      case
        when aggregates.session_count < 3 then 0.00
        when aggregates.avg_completion >= 1.00 and aggregates.avg_form >= 85 then 0.20
        when aggregates.avg_completion >= 0.90 and aggregates.avg_form >= 75 then 0.10
        when aggregates.avg_completion < 0.65 or aggregates.avg_form < 60 then -0.20
        when aggregates.avg_completion < 0.80 or aggregates.avg_form < 70 then -0.10
        else 0.00
      end as adjustment,
      case
        when aggregates.session_count < 3 then 'baseline_until_3_sessions'
        when aggregates.avg_completion >= 1.00 and aggregates.avg_form >= 85 then 'increase_20_percent_strong_performance'
        when aggregates.avg_completion >= 0.90 and aggregates.avg_form >= 75 then 'increase_10_percent_good_performance'
        when aggregates.avg_completion < 0.65 or aggregates.avg_form < 60 then 'decrease_20_percent_needs_recovery'
        when aggregates.avg_completion < 0.80 or aggregates.avg_form < 70 then 'decrease_10_percent_stabilize_form'
        else 'keep_current_difficulty'
      end as reason
    from target_quest
    cross join aggregates
  )
  select
    decision.id,
    case
      when decision.target_reps > 0 then greatest(1, round(decision.target_reps * (1 + decision.adjustment))::integer)
      else 0
    end,
    case
      when decision.target_seconds > 0 then greatest(1, round(decision.target_seconds * (1 + decision.adjustment))::integer)
      else 0
    end,
    (decision.adjustment * 100)::numeric(5,2),
    decision.reason,
    decision.session_count,
    decision.avg_completion::numeric(6,3),
    decision.avg_form::numeric(5,2)
  from decision;
$$;

revoke execute on function public.calculate_dda_for_quest(text) from public;
grant execute on function public.calculate_dda_for_quest(text) to authenticated;

drop function if exists public.get_adjusted_quests();

create or replace function public.get_adjusted_quests()
returns table (
  id text,
  title text,
  quest_type text,
  exercise_type text,
  monster_name text,
  camera_angle text,
  impact_level text,
  space_required text,
  base_target_reps integer,
  base_target_seconds integer,
  adjusted_target_reps integer,
  adjusted_target_seconds integer,
  warmup_seconds integer,
  cooldown_seconds integer,
  base_xp integer,
  base_coins integer,
  difficulty integer,
  adjustment_percent numeric,
  dda_reason text,
  based_on_sessions integer,
  avg_completion_ratio numeric,
  avg_form_score numeric,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  select
    quest.id,
    quest.title,
    quest.quest_type,
    quest.exercise_type,
    quest.monster_name,
    quest.camera_angle,
    quest.impact_level,
    quest.space_required,
    quest.target_reps,
    quest.target_seconds,
    coalesce(dda.adjusted_target_reps, quest.target_reps),
    coalesce(dda.adjusted_target_seconds, quest.target_seconds),
    quest.warmup_seconds,
    quest.cooldown_seconds,
    quest.base_xp,
    quest.base_coins,
    quest.difficulty,
    coalesce(dda.adjustment_percent, 0),
    coalesce(dda.reason, 'baseline_until_3_sessions'),
    coalesce(dda.based_on_sessions, 0),
    dda.avg_completion_ratio,
    dda.avg_form_score,
    quest.sort_order
  from public.quests quest
  left join lateral public.calculate_dda_for_quest(quest.id) dda on true
  where quest.is_active
  order by quest.sort_order, quest.title;
$$;

revoke execute on function public.get_adjusted_quests() from public;
grant execute on function public.get_adjusted_quests() to authenticated;

create or replace function public.complete_quest_session(
  target_session_id uuid,
  reps_done_value integer,
  valid_reps_value integer,
  duration_seconds_value integer,
  form_score_value numeric default null
)
returns table (
  session_id uuid,
  xp_earned integer,
  coins_earned integer,
  profile_level integer,
  profile_xp integer,
  profile_coins integer,
  profile_stat_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session public.quest_sessions%rowtype;
  target_quest public.quests%rowtype;
  earned_xp integer;
  earned_coins integer;
  next_level integer;
  next_xp integer;
  next_coins integer;
  next_stat_points integer;
  previous_level integer;
  previous_xp integer;
  calculated_level integer;
  required_reps integer;
  required_seconds integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into target_session
  from public.quest_sessions
  where id = target_session_id
  and user_id = (select auth.uid())
  and status = 'started'
  for update;

  if target_session.id is null then
    raise exception 'Active quest session not found';
  end if;

  select level, xp
  into previous_level, previous_xp
  from public.profiles
  where id = (select auth.uid())
  for update;

  select *
  into target_quest
  from public.quests
  where id = target_session.quest_id
  and is_active = true;

  required_reps := coalesce(nullif(target_session.target_reps_used, 0), target_quest.target_reps);
  required_seconds := coalesce(nullif(target_session.target_seconds_used, 0), target_quest.target_seconds);

  earned_xp := case
    when valid_reps_value >= required_reps
      and duration_seconds_value >= required_seconds
      then target_quest.base_xp
    else floor(target_quest.base_xp * 0.35)::integer
  end;

  earned_coins := case
    when valid_reps_value >= required_reps
      and duration_seconds_value >= required_seconds
      then target_quest.base_coins
    else floor(target_quest.base_coins * 0.35)::integer
  end;

  update public.quest_sessions
  set
    status = 'completed',
    completed_at = now(),
    reps_done = greatest(0, reps_done_value),
    valid_reps = least(greatest(0, valid_reps_value), greatest(0, reps_done_value)),
    duration_seconds = greatest(0, duration_seconds_value),
    form_score = form_score_value,
    xp_earned = earned_xp,
    coins_earned = earned_coins
  where id = target_session_id;

  calculated_level := greatest(1, 1 + floor((previous_xp + earned_xp) / 500)::integer);

  update public.profiles
  set
    xp = xp + earned_xp,
    coins = coins + earned_coins,
    level = greatest(1, 1 + floor((xp + earned_xp) / 500)::integer),
    stat_points = stat_points + greatest(0, calculated_level - previous_level) * 4
  where id = (select auth.uid())
  returning level, xp, coins, stat_points
  into next_level, next_xp, next_coins, next_stat_points;

  insert into public.daily_activity (
    user_id,
    activity_date,
    total_duration_seconds,
    total_reps,
    valid_reps,
    xp_earned,
    coins_earned,
    quests_completed,
    best_form_score
  )
  values (
    (select auth.uid()),
    current_date,
    greatest(0, duration_seconds_value),
    greatest(0, reps_done_value),
    least(greatest(0, valid_reps_value), greatest(0, reps_done_value)),
    earned_xp,
    earned_coins,
    1,
    form_score_value
  )
  on conflict (user_id, activity_date) do update
  set
    total_duration_seconds = public.daily_activity.total_duration_seconds + excluded.total_duration_seconds,
    total_reps = public.daily_activity.total_reps + excluded.total_reps,
    valid_reps = public.daily_activity.valid_reps + excluded.valid_reps,
    xp_earned = public.daily_activity.xp_earned + excluded.xp_earned,
    coins_earned = public.daily_activity.coins_earned + excluded.coins_earned,
    quests_completed = public.daily_activity.quests_completed + 1,
    best_form_score = greatest(public.daily_activity.best_form_score, excluded.best_form_score),
    updated_at = now();

  return query
  select target_session_id, earned_xp, earned_coins, next_level, next_xp, next_coins, next_stat_points;
end;
$$;

revoke execute on function public.complete_quest_session(uuid, integer, integer, integer, numeric) from public;
grant execute on function public.complete_quest_session(uuid, integer, integer, integer, numeric) to authenticated;

create or replace function public.buy_inventory_item(target_item_id text)
returns table (
  item_id text,
  quantity integer,
  profile_coins integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_item public.inventory_items%rowtype;
  next_quantity integer;
  next_coins integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into target_item
  from public.inventory_items
  where id = target_item_id
  and is_active = true;

  if target_item.id is null then
    raise exception 'Item not found';
  end if;

  update public.profiles
  set coins = coins - target_item.price
  where id = (select auth.uid())
  and coins >= target_item.price
  returning coins into next_coins;

  if next_coins is null then
    raise exception 'Not enough coins';
  end if;

  insert into public.player_inventory (user_id, item_id, quantity)
  values ((select auth.uid()), target_item_id, 1)
  on conflict (user_id, item_id) do update
  set
    quantity = public.player_inventory.quantity + 1,
    updated_at = now()
  returning quantity into next_quantity;

  return query
  select target_item_id, next_quantity, next_coins;
end;
$$;

revoke execute on function public.buy_inventory_item(text) from public;
grant execute on function public.buy_inventory_item(text) to authenticated;

create or replace function public.upgrade_player_stat(target_stat text)
returns table (
  upgraded_stat text,
  profile_coins integer,
  profile_stat_points integer,
  profile_hp integer,
  profile_max_hp integer,
  profile_attack integer,
  profile_defense integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if target_stat not in ('max_hp', 'attack', 'defense') then
    raise exception 'Unsupported stat';
  end if;

  update public.profiles
  set
    stat_points = stat_points - 1,
    max_hp = case when target_stat = 'max_hp' then max_hp + 10 else max_hp end,
    hp = case when target_stat = 'max_hp' then least(max_hp + 10, hp + 10) else hp end,
    attack = case when target_stat = 'attack' then attack + 1 else attack end,
    defense = case when target_stat = 'defense' then defense + 1 else defense end
  where id = (select auth.uid())
  and stat_points >= 1
  returning coins, stat_points, hp, max_hp, attack, defense
  into profile_coins, profile_stat_points, profile_hp, profile_max_hp, profile_attack, profile_defense;

  if profile_coins is null then
    raise exception 'No stat points';
  end if;

  upgraded_stat := target_stat;
  return next;
end;
$$;

revoke execute on function public.upgrade_player_stat(text) from public;
grant execute on function public.upgrade_player_stat(text) to authenticated;
