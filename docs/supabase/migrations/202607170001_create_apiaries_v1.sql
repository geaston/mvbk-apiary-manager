-- MVBK Apiary Manager
-- V1 apiaries table, privacy-safe RPCs, and Row Level Security.
--
-- Run this in the Supabase SQL Editor, or keep it as a Supabase CLI migration.
-- This migration is designed to preserve the existing email-based members allowlist.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Upgrade the existing members allowlist without replacing it.
-- ---------------------------------------------------------------------------

alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists display_name text,
  add column if not exists role text not null default 'member',
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_role_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_role_check
      check (role in ('member', 'admin', 'super_admin'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_status_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_status_check
      check (status in ('active', 'pending', 'inactive'));
  end if;
end
$$;

create unique index if not exists members_email_lower_uidx
  on public.members (lower(email));

create unique index if not exists members_user_id_uidx
  on public.members (user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Shared helper functions.
-- ---------------------------------------------------------------------------

create or replace function public.current_member_email()
returns text
language sql
stable
security invoker
set search_path = public, auth, extensions
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select exists (
    select 1
    from public.members m
    where m.status = 'active'
      and (
        m.user_id = auth.uid()
        or lower(m.email) = public.current_member_email()
      )
  );
$$;

create or replace function public.is_club_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $$
  select exists (
    select 1
    from public.members m
    where m.status = 'active'
      and m.role in ('admin', 'super_admin')
      and (
        m.user_id = auth.uid()
        or lower(m.email) = public.current_member_email()
      )
  );
$$;

revoke all on function public.current_member_email() from public;
revoke all on function public.is_active_member() from public;
revoke all on function public.is_club_admin() from public;

grant execute on function public.current_member_email() to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_club_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Core apiaries table.
-- ---------------------------------------------------------------------------

create table if not exists public.apiaries (
  id uuid primary key default extensions.gen_random_uuid(),

  -- Ten member-facing fields.
  apiary_name text not null,
  owner_display_name text not null,
  yard_type text not null default 'honey',
  county_name text not null,
  hive_count integer not null default 0,
  mite_count numeric(5,2),
  treated boolean not null default false,
  nys_inspected boolean not null default false,
  mite_biter boolean not null default false,
  honey_produced_lbs numeric(10,2),

  -- Protected ownership and location fields.
  owner_user_id uuid references auth.users(id) on delete set null,
  private_location extensions.geography(Point, 4326),
  display_location extensions.geography(Point, 4326),
  location_privacy_method text not null default 'manual',

  -- Workflow and audit fields.
  status text not null default 'pending',
  show_on_map boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint apiaries_name_not_blank
    check (length(btrim(apiary_name)) > 0),

  constraint apiaries_owner_name_not_blank
    check (length(btrim(owner_display_name)) > 0),

  constraint apiaries_county_not_blank
    check (length(btrim(county_name)) > 0),

  constraint apiaries_yard_type_check
    check (
      yard_type in (
        'honey',
        'nuc',
        'queen_mating',
        'drone_flood',
        'resource',
        'educational',
        'other'
      )
    ),

  constraint apiaries_status_check
    check (status in ('pending', 'active', 'inactive', 'archived')),

  constraint apiaries_privacy_method_check
    check (
      location_privacy_method in (
        'manual',
        'nearest_intersection',
        'randomized',
        'road_centroid',
        'town_centroid'
      )
    ),

  constraint apiaries_hive_count_check
    check (hive_count between 0 and 1000),

  constraint apiaries_mite_count_check
    check (mite_count is null or mite_count between 0 and 100),

  constraint apiaries_honey_check
    check (honey_produced_lbs is null or honey_produced_lbs >= 0),

  constraint apiaries_active_requires_display_location
    check (
      status <> 'active'
      or show_on_map = false
      or display_location is not null
    )
);

create index if not exists apiaries_owner_user_id_idx
  on public.apiaries (owner_user_id);

create index if not exists apiaries_status_idx
  on public.apiaries (status);

create index if not exists apiaries_county_name_idx
  on public.apiaries (county_name);

create index if not exists apiaries_yard_type_idx
  on public.apiaries (yard_type);

create index if not exists apiaries_display_location_gix
  on public.apiaries using gist (display_location);

create index if not exists apiaries_private_location_gix
  on public.apiaries using gist (private_location);

-- ---------------------------------------------------------------------------
-- 4. Automatic timestamps and user linkage.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, extensions
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apiaries_set_updated_at on public.apiaries;
create trigger apiaries_set_updated_at
before update on public.apiaries
for each row
execute function public.set_updated_at();

create or replace function public.claim_member_account()
returns public.members
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  claimed public.members;
  jwt_email text := public.current_member_email();
begin
  if auth.uid() is null or jwt_email = '' then
    raise exception 'Authentication required';
  end if;

  update public.members
  set
    user_id = auth.uid(),
    updated_at = now()
  where lower(email) = jwt_email
    and status = 'active'
    and (user_id is null or user_id = auth.uid())
  returning * into claimed;

  if claimed is null then
    raise exception 'No active club membership matches this account';
  end if;

  return claimed;
end;
$$;

revoke all on function public.claim_member_account() from public;
grant execute on function public.claim_member_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security on the private base table.
-- ---------------------------------------------------------------------------

alter table public.apiaries enable row level security;

drop policy if exists "owners can read own apiaries" on public.apiaries;
create policy "owners can read own apiaries"
on public.apiaries
for select
to authenticated
using (
  owner_user_id = auth.uid()
);

drop policy if exists "admins can read all apiaries" on public.apiaries;
create policy "admins can read all apiaries"
on public.apiaries
for select
to authenticated
using (
  public.is_club_admin()
);

drop policy if exists "members can submit own pending apiaries" on public.apiaries;
create policy "members can submit own pending apiaries"
on public.apiaries
for insert
to authenticated
with check (
  public.is_active_member()
  and owner_user_id = auth.uid()
  and status = 'pending'
  and approved_at is null
  and approved_by is null
);

drop policy if exists "owners can update own apiaries" on public.apiaries;
create policy "owners can update own apiaries"
on public.apiaries
for update
to authenticated
using (
  owner_user_id = auth.uid()
)
with check (
  owner_user_id = auth.uid()
);

drop policy if exists "admins can update all apiaries" on public.apiaries;
create policy "admins can update all apiaries"
on public.apiaries
for update
to authenticated
using (
  public.is_club_admin()
)
with check (
  public.is_club_admin()
);

-- No DELETE policy. Records should be archived instead of deleted.

revoke all on table public.apiaries from anon;
revoke all on table public.apiaries from authenticated;

-- Owners may read their own base record. Writes are performed through RPCs below.
grant select on table public.apiaries to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Member submission and owner-update RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.submit_apiary(
  p_apiary_name text,
  p_owner_display_name text,
  p_yard_type text,
  p_county_name text,
  p_hive_count integer,
  p_mite_count numeric default null,
  p_treated boolean default false,
  p_nys_inspected boolean default false,
  p_mite_biter boolean default false,
  p_honey_produced_lbs numeric default null,
  p_private_lat double precision default null,
  p_private_lng double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid;
  exact_point extensions.geography(Point, 4326);
begin
  if not public.is_active_member() then
    raise exception 'Active club membership required';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_private_lat is not null or p_private_lng is not null then
    if p_private_lat is null or p_private_lng is null then
      raise exception 'Both latitude and longitude are required';
    end if;

    if p_private_lat not between -90 and 90
       or p_private_lng not between -180 and 180 then
      raise exception 'Invalid latitude or longitude';
    end if;

    exact_point :=
      extensions.st_setsrid(
        extensions.st_makepoint(p_private_lng, p_private_lat),
        4326
      )::extensions.geography;
  end if;

  insert into public.apiaries (
    apiary_name,
    owner_display_name,
    yard_type,
    county_name,
    hive_count,
    mite_count,
    treated,
    nys_inspected,
    mite_biter,
    honey_produced_lbs,
    owner_user_id,
    private_location,
    status
  )
  values (
    btrim(p_apiary_name),
    btrim(p_owner_display_name),
    p_yard_type,
    btrim(p_county_name),
    p_hive_count,
    p_mite_count,
    coalesce(p_treated, false),
    coalesce(p_nys_inspected, false),
    coalesce(p_mite_biter, false),
    p_honey_produced_lbs,
    auth.uid(),
    exact_point,
    'pending'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.submit_apiary(
  text, text, text, text, integer, numeric, boolean, boolean, boolean, numeric,
  double precision, double precision
) from public;

grant execute on function public.submit_apiary(
  text, text, text, text, integer, numeric, boolean, boolean, boolean, numeric,
  double precision, double precision
) to authenticated;

create or replace function public.update_own_apiary(
  p_apiary_id uuid,
  p_apiary_name text,
  p_owner_display_name text,
  p_yard_type text,
  p_county_name text,
  p_hive_count integer,
  p_mite_count numeric default null,
  p_treated boolean default false,
  p_nys_inspected boolean default false,
  p_mite_biter boolean default false,
  p_honey_produced_lbs numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_active_member() then
    raise exception 'Active club membership required';
  end if;

  update public.apiaries
  set
    apiary_name = btrim(p_apiary_name),
    owner_display_name = btrim(p_owner_display_name),
    yard_type = p_yard_type,
    county_name = btrim(p_county_name),
    hive_count = p_hive_count,
    mite_count = p_mite_count,
    treated = coalesce(p_treated, false),
    nys_inspected = coalesce(p_nys_inspected, false),
    mite_biter = coalesce(p_mite_biter, false),
    honey_produced_lbs = p_honey_produced_lbs
  where id = p_apiary_id
    and owner_user_id = auth.uid()
    and status <> 'archived';

  if not found then
    raise exception 'Apiary not found or not owned by current user';
  end if;
end;
$$;

revoke all on function public.update_own_apiary(
  uuid, text, text, text, text, integer, numeric, boolean, boolean, boolean, numeric
) from public;

grant execute on function public.update_own_apiary(
  uuid, text, text, text, text, integer, numeric, boolean, boolean, boolean, numeric
) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Admin approval and archival RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.approve_apiary(
  p_apiary_id uuid,
  p_display_lat double precision,
  p_display_lng double precision,
  p_privacy_method text default 'manual'
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_club_admin() then
    raise exception 'Club administrator role required';
  end if;

  if p_display_lat not between -90 and 90
     or p_display_lng not between -180 and 180 then
    raise exception 'Invalid display latitude or longitude';
  end if;

  update public.apiaries
  set
    display_location =
      extensions.st_setsrid(
        extensions.st_makepoint(p_display_lng, p_display_lat),
        4326
      )::extensions.geography,
    location_privacy_method = p_privacy_method,
    status = 'active',
    approved_at = now(),
    approved_by = auth.uid()
  where id = p_apiary_id
    and status in ('pending', 'inactive');

  if not found then
    raise exception 'Pending or inactive apiary not found';
  end if;
end;
$$;

revoke all on function public.approve_apiary(
  uuid, double precision, double precision, text
) from public;

grant execute on function public.approve_apiary(
  uuid, double precision, double precision, text
) to authenticated;

create or replace function public.archive_apiary(p_apiary_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  update public.apiaries
  set
    status = 'archived',
    show_on_map = false
  where id = p_apiary_id
    and (
      owner_user_id = auth.uid()
      or public.is_club_admin()
    );

  if not found then
    raise exception 'Apiary not found or permission denied';
  end if;
end;
$$;

revoke all on function public.archive_apiary(uuid) from public;
grant execute on function public.archive_apiary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Privacy-safe map RPC.
--
-- Column names intentionally match the current apiaries.json JavaScript shape.
-- The function never returns private_location or owner_user_id.
-- ---------------------------------------------------------------------------

create or replace function public.get_member_apiaries()
returns table (
  id uuid,
  name text,
  owner text,
  type text,
  county text,
  hives integer,
  "miteCount" numeric,
  treated boolean,
  "nysInspected" boolean,
  "miteBiter" boolean,
  "honeyProduced" numeric,
  lat double precision,
  lng double precision,
  status text
)
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_active_member() then
    raise exception 'Active club membership required';
  end if;

  return query
  select
    a.id,
    a.apiary_name as name,
    a.owner_display_name as owner,
    a.yard_type as type,
    a.county_name as county,
    a.hive_count as hives,
    a.mite_count as "miteCount",
    a.treated,
    a.nys_inspected as "nysInspected",
    a.mite_biter as "miteBiter",
    a.honey_produced_lbs as "honeyProduced",
    extensions.st_y(a.display_location::extensions.geometry) as lat,
    extensions.st_x(a.display_location::extensions.geometry) as lng,
    a.status
  from public.apiaries a
  where a.status = 'active'
    and a.show_on_map = true
    and a.display_location is not null
  order by a.apiary_name;
end;
$$;

revoke all on function public.get_member_apiaries() from public;
grant execute on function public.get_member_apiaries() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Admin review RPC that includes protected data.
-- ---------------------------------------------------------------------------

create or replace function public.get_pending_apiaries()
returns table (
  id uuid,
  apiary_name text,
  owner_display_name text,
  yard_type text,
  county_name text,
  hive_count integer,
  mite_count numeric,
  treated boolean,
  nys_inspected boolean,
  mite_biter boolean,
  honey_produced_lbs numeric,
  private_lat double precision,
  private_lng double precision,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_club_admin() then
    raise exception 'Club administrator role required';
  end if;

  return query
  select
    a.id,
    a.apiary_name,
    a.owner_display_name,
    a.yard_type,
    a.county_name,
    a.hive_count,
    a.mite_count,
    a.treated,
    a.nys_inspected,
    a.mite_biter,
    a.honey_produced_lbs,
    case
      when a.private_location is null then null
      else extensions.st_y(a.private_location::extensions.geometry)
    end as private_lat,
    case
      when a.private_location is null then null
      else extensions.st_x(a.private_location::extensions.geometry)
    end as private_lng,
    a.created_at
  from public.apiaries a
  where a.status = 'pending'
  order by a.created_at;
end;
$$;

revoke all on function public.get_pending_apiaries() from public;
grant execute on function public.get_pending_apiaries() to authenticated;

commit;
