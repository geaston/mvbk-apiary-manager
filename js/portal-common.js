(() => {
  'use strict';

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;

    if (!window.supabase || !window.MVBK_CONFIG) {
      throw new Error('Supabase configuration is unavailable.');
    }

    const url = window.MVBK_CONFIG.SUPABASE_URL;
    const key = window.MVBK_CONFIG.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Supabase URL or anon key is missing.');
    }

    window.supabaseClient = window.supabase.createClient(url, key);
    return window.supabaseClient;
  }

  async function getAccessContext() {
    const client = getClient();
    const { data: sessionData, error: sessionError } =
      await client.auth.getSession();

    if (sessionError) throw sessionError;

    const session = sessionData.session;
    if (!session) {
      return { client, session: null, isAdmin: false };
    }

    const { error: claimError } = await client.rpc('claim_member_account');
    if (claimError) {
      console.warn('Unable to claim member account:', claimError);
    }

    const { data: adminData, error: adminError } =
      await client.rpc('is_club_admin');

    if (adminError) {
      console.warn('Unable to determine administrator role:', adminError);
    }

    return {
      client,
      session,
      isAdmin: adminError ? false : adminData === true
    };
  }

  async function initPage() {
    const context = await getAccessContext();

    if (!context.session) {
      window.location.href = '../index.html';
      throw new Error('Sign-in required.');
    }

    renderNavigation(context);
    return context;
  }

  async function requireAdmin() {
    const context = await initPage();

    if (!context.isAdmin) {
      renderAccessDenied();
      throw new Error('Club administrator role required.');
    }

    return context;
  }

  function renderNavigation() {
    const host = document.getElementById('portalNav');
    if (!host) return;

    const currentPage = window.location.pathname.split('/').pop();
    const link = (href, label, fileName) => {
      const active = currentPage === fileName;
      return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
    };

    host.innerHTML = `
      <nav class="portal-nav" aria-label="Main navigation">
        <a class="portal-brand" href="./dashboard.html">
          <span aria-hidden="true">🐝</span>
          <strong>MVBK Apiary Manager</strong>
        </a>

        <button
          class="nav-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="portalNavLinks">
          Menu
        </button>

        <div class="nav-links" id="portalNavLinks">
          ${link('./dashboard.html', 'Dashboard', 'dashboard.html')}
          <a href="../index.html">Map</a>
          ${link('./my-apiaries.html', 'My Apiaries', 'my-apiaries.html')}
          ${link('./add-apiary.html', 'Add Apiary', 'add-apiary.html')}
          <button class="nav-signout" type="button">Sign out</button>
        </div>
      </nav>
    `;

    const toggle = host.querySelector('.nav-toggle');
    const links = host.querySelector('.nav-links');

    toggle?.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    host.querySelector('.nav-signout')?.addEventListener('click', async () => {
      await getClient().auth.signOut();
      window.location.href = '../index.html';
    });
  }

  function renderAccessDenied() {
    const main = document.querySelector('main');
    if (!main) return;

    main.innerHTML = `
      <section class="portal-card access-denied-card">
        <p class="eyebrow">Restricted page</p>
        <h1>Administrator access required</h1>
        <p>Your account does not have permission to open this page.</p>
        <a class="primary-button" href="./dashboard.html">Return to dashboard</a>
      </section>
    `;
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

  window.MVBKPortal = {
    getClient,
    getAccessContext,
    initPage,
    requireAdmin,
    showFatalError,
    escapeHtml
  };
})();
