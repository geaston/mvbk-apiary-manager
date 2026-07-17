# Data folder

The current V1 app still loads `apiaries.json` from the repository root to preserve existing behavior.

When you move apiaries fully into Supabase, the JSON file can be removed and `js/data.js` can query the `apiaries` table instead.
