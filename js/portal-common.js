(() => {
  'use strict';

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (!window.supabase || !window.MVBK_CONFIG) {
      throw new Error('Supabase configuration is unavailable.');
    }

    const url = window.MVBK_CONFIG.SUPABASE_URL || window.MVBK_CONFIG.supabaseUrl;
    const key = window.MVBK_CONFIG.SUPABASE_ANON_KEY || window.MVBK_CONFIG.supabaseAnonKey;

    if (!url || !key) throw new Error('Supabase URL or anon key is missing.');

    window.supabaseClient = window.supabase.createClient(url, key);
    return window.supabaseClient;
  }

  async function initPage() {
    const client = getClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      window.location.href = '../index.html';
      throw new Error('Sign-in required.');
    }

    await client.rpc('claim_member_account');

    const { data: adminData, error: adminError } = await client.rpc('is_club_admin');
    if (adminError) console.warn('Unable to determine admin role:', adminError);

    const result = {
      client,
      session: sessionData.session,
      isAdmin: adminData === true
    };

    renderNavigation(result);
    return result;
  }

  function renderNavigation({ isAdmin }) {
    const host = document.getElementById('portalNav');
    if (!host) return;

    const prefix = window.location.pathname.includes('/portal/') ? '..' : '.';

    host.innerHTML = `
      <nav class="portal-nav" aria-label="Main navigation">
        <a class="portal-brand" href="${prefix}/portal/dashboard.html">
          <span>🐝</span>
          <strong>MVBK Apiary Manager</strong>
        </a>
        <button class="nav-toggle" type="button" aria-expanded="false">Menu</button>
        <div class="nav-links">
          <a href="${prefix}/portal/dashboard.html">Dashboard</a>
          <a href="${prefix}/index.html">Map</a>
          <a href="${prefix}/portal/my-apiaries.html">My Apiaries</a>
          <a href="${prefix}/portal/add-apiary.html">Add Apiary</a>
          ${isAdmin ? `<a href="${prefix}/admin/pending-apiaries.html">Pending Review</a>` : ''}
          ${isAdmin ? `<a href="${prefix}/admin/import-apiaries.html">Import</a>` : ''}
          <button class="nav-signout" type="button">Sign out</button>
        </div>
      </nav>
    `;

    const toggle = host.querySelector('.nav-toggle');
    const links = host.querySelector('.nav-links');
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    host.querySelector('.nav-signout').addEventListener('click', async () => {
      await getClient().auth.signOut();
      window.location.href = '../index.html';
    });
  }

  function showFatalError(error) {
    console.error(error);
    document.body.innerHTML = `
      <main class="portal-main">
        <section class="portal-card">
          <h1>Unable to open the portal</h1>
          <p>${escapeHtml(error.message || String(error))}</p>
          <a class="primary-button" href="../index.html">Return to sign in</a>
        </section>
      </main>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  window.MVBKPortal = { getClient, initPage, showFatalError, escapeHtml };
})();
