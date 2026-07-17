# V1 Apiaries Supabase Migration

This package creates the first secure `apiaries` data layer for MVBK Apiary Manager.

## Included files

```text
supabase/
└── migrations/
    ├── 202607170001_create_apiaries_v1.sql
    └── 202607170002_verify_apiaries_v1.sql

docs/
└── database/
    └── apiaries-v1-setup.md
```

## What the migration creates

- A V1 `apiaries` table
- The ten approved member-facing fields
- Protected exact and display locations
- Pending, active, inactive, and archived workflow states
- Row Level Security
- Member submission and update functions
- Admin approval and archive functions
- A privacy-safe `get_member_apiaries()` map function
- A `get_pending_apiaries()` admin-review function
- Backward-compatible role/status/user columns on the existing `members` table

## Recommended installation

1. Back up the Supabase database.
2. Open **Supabase → SQL Editor**.
3. Run `202607170001_create_apiaries_v1.sql`.
4. Run `202607170002_verify_apiaries_v1.sql`.
5. Assign at least one member the `admin` role.
6. Sign in once and call `claim_member_account()` to link the auth user to the allowlist record.
7. Add a test submission through `submit_apiary()`.
8. Approve it with `approve_apiary()`.
9. Confirm `get_member_apiaries()` returns the safe display point only.

Do not remove `apiaries.json` from GitHub until the Supabase records and map loading have been tested.
