# Apiaries V1 Setup Guide

## 1. Install the migration

Run:

```text
supabase/migrations/202607170001_create_apiaries_v1.sql
```

in the Supabase SQL Editor.

The script preserves the existing `members.email` allowlist and adds:

- `user_id`
- `display_name`
- `role`
- `status`
- timestamps

## 2. Assign the first administrator

Replace the email below:

```sql
update public.members
set role = 'admin',
    status = 'active'
where lower(email) = lower('YOUR_EMAIL@example.com');
```

## 3. Link a signed-in account to the member record

After signing in through the app, call:

```javascript
const { data, error } = await supabaseClient.rpc('claim_member_account');
```

This copies `auth.uid()` into the matching allowlist row.

The email in Supabase Auth must match `members.email`.

## 4. Submit a test apiary

```javascript
const { data: apiaryId, error } = await supabaseClient.rpc('submit_apiary', {
  p_apiary_name: 'East Hill Yard',
  p_owner_display_name: 'Glenn E.',
  p_yard_type: 'honey',
  p_county_name: 'Schoharie',
  p_hive_count: 12,
  p_mite_count: 2.3,
  p_treated: true,
  p_nys_inspected: true,
  p_mite_biter: true,
  p_honey_produced_lbs: 425.5,
  p_private_lat: 42.6900,
  p_private_lng: -74.4000
});
```

The record is created with `status = 'pending'`.

## 5. Review pending apiaries

Admin only:

```javascript
const { data, error } =
  await supabaseClient.rpc('get_pending_apiaries');
```

This function may return the exact location to an administrator. The normal map function does not.

## 6. Approve with a privacy-safe display point

Admin only:

```javascript
const { error } = await supabaseClient.rpc('approve_apiary', {
  p_apiary_id: apiaryId,
  p_display_lat: 42.6950,
  p_display_lng: -74.3950,
  p_privacy_method: 'manual'
});
```

The display coordinates should not be the exact apiary coordinates.

## 7. Read map records

```javascript
const { data: apiaries, error } =
  await supabaseClient.rpc('get_member_apiaries');
```

Returned keys match the current map data shape:

```text
id
name
owner
type
county
hives
miteCount
treated
nysInspected
miteBiter
honeyProduced
lat
lng
status
```

The function does not return:

- `private_location`
- exact latitude or longitude
- `owner_user_id`
- approval metadata

## 8. Replace the JSON fetch later

The current application uses:

```javascript
fetch('./apiaries.json')
```

The eventual replacement will be:

```javascript
async function loadApiariesFromSupabase() {
  const { data, error } =
    await supabaseClient.rpc('get_member_apiaries');

  if (error) {
    throw new Error('Apiary query failed: ' + error.message);
  }

  return data || [];
}
```

Keep the JSON file until the import and map behavior have been verified.

## Important security notes

- Never place the Supabase service-role key in browser JavaScript or GitHub.
- The anon key is expected to be visible.
- Exact locations are protected by database permissions and are excluded from the map RPC.
- Hiding fields in JavaScript is not a security boundary.
- Archive records instead of deleting them.
