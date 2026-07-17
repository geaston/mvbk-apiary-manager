
const mapCenter = [42.69, -74.40];
    const map = L.map('map').setView(mapCenter, 11);

    // Supabase auth settings.
    // Replace these two values with your own Supabase project URL and anon public key.
    const { SUPABASE_URL, SUPABASE_ANON_KEY, ENABLE_LANDCOVER_FEATURES, ENABLE_DCA_FEATURES } = window.MVBK_CONFIG;
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const authScreen = document.getElementById('authScreen');
    const authEmail = document.getElementById('authEmail');
    const magicLinkBtn = document.getElementById('magicLinkBtn');
    const authMessage = document.getElementById('authMessage');
    const signOutBtn = document.getElementById('signOutBtn');

    let currentUser = null;
    let mapDataHasLoaded = false;

    function showAuthScreen(message = '') {
      authScreen.style.display = 'flex';
      if (message) authMessage.textContent = message;
    }

    function hideAuthScreen() {
      authScreen.style.display = 'none';
      authMessage.textContent = '';
    }

    async function sendMagicLink() {
      const email = authEmail.value.trim();
      if (!email) {
        authMessage.textContent = 'Enter your email address first.';
        return;
      }

      authMessage.textContent = 'Sending magic link...';

      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) {
        console.error('Magic link error:', error);
        authMessage.textContent = error.message;
        return;
      }

      authMessage.textContent = 'Check your email for the login link.';
    }

    async function signOut() {
      await supabaseClient.auth.signOut();
      currentUser = null;
      mapDataHasLoaded = false;
      showAuthScreen('Signed out.');
    }

    async function isApprovedMember(email) {
      if (!email) return false;

      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabaseClient
        .from('members')
        .select('email')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (error) {
        console.error('Member allowlist check failed:', error);
        authMessage.textContent = 'Could not verify membership. Contact the club admin.';
        return false;
      }

      return !!data;
    }

    async function allowMemberOrSignOut(session) {
      const email = session && session.user && session.user.email;
      const allowed = await isApprovedMember(email);

      if (!allowed) {
        await supabaseClient.auth.signOut();
        currentUser = null;
        mapDataHasLoaded = false;
        showAuthScreen('This email is not approved for access. Contact the club admin.');
        return false;
      }

      currentUser = session.user;
      hideAuthScreen();

      if (!mapDataHasLoaded) {
        mapDataHasLoaded = true;
        loadData();
      }

      return true;
    }

    async function requireSupabaseSession() {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.error('Session check failed:', error);
        showAuthScreen(error.message);
        return;
      }

      const session = data.session;
      if (!session) {
        showAuthScreen();
        return;
      }

      await allowMemberOrSignOut(session);
    }

    magicLinkBtn.addEventListener('click', sendMagicLink);
    authEmail.addEventListener('keydown', event => {
      if (event.key === 'Enter') sendMagicLink();
    });
    if (signOutBtn) signOutBtn.addEventListener('click', signOut);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;

      if (currentUser && session) {
        allowMemberOrSignOut(session)
          .catch(error => {
            console.error('Membership check failed:', error);
            currentUser = null;
            mapDataHasLoaded = false;
            showAuthScreen('Unable to verify membership. Contact the club admin.');
          });
      } else {
        showAuthScreen();
      }
    });
