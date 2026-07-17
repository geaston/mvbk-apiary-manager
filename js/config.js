// Public client-side configuration for the MVBK Apiary Manager.
// The Supabase publishable/anon key is designed to be used in browser apps.
// Security must be enforced with Supabase Row Level Security policies.
window.MVBK_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://pnxzuufixuaahejmwlws.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_4pKGagaeUFSMgp16qcCZzA_kTsmGSVl',

  // Features preserved for future releases but disabled in V1.
  ENABLE_LANDCOVER_FEATURES: false,
  ENABLE_DCA_FEATURES: false
});
