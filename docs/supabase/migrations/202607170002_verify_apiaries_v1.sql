-- MVBK Apiary Manager migration checks
-- Run after 202607170001_create_apiaries_v1.sql.

-- 1. Confirm required columns.
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'apiaries'
order by ordinal_position;

-- 2. Confirm RLS is enabled.
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'apiaries';

-- 3. Review policies.
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'apiaries'
order by policyname;

-- 4. Confirm RPCs exist.
select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'claim_member_account',
    'submit_apiary',
    'update_own_apiary',
    'approve_apiary',
    'archive_apiary',
    'get_member_apiaries',
    'get_pending_apiaries'
  )
order by routine_name;

-- 5. Confirm there is no anonymous access to the private table.
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'apiaries'
order by grantee, privilege_type;

-- 6. SQL Editor smoke test.
-- The SQL Editor runs with elevated privileges, so this checks table constraints,
-- not authenticated-user RLS. It rolls back automatically.

begin;

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
  private_location,
  display_location,
  location_privacy_method,
  status
)
values (
  'Migration Test Yard',
  'Test Beekeeper',
  'honey',
  'Schoharie',
  5,
  2.1,
  true,
  true,
  false,
  150,
  extensions.st_setsrid(extensions.st_makepoint(-74.40, 42.69), 4326)::extensions.geography,
  extensions.st_setsrid(extensions.st_makepoint(-74.395, 42.695), 4326)::extensions.geography,
  'manual',
  'active'
);

select
  apiary_name,
  status,
  extensions.st_y(display_location::extensions.geometry) as display_lat,
  extensions.st_x(display_location::extensions.geometry) as display_lng
from public.apiaries
where apiary_name = 'Migration Test Yard';

rollback;
