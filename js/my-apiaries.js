(() => {
  'use strict';

  let apiaries = [];

  const list = document.getElementById('apiaryList');
  const search = document.getElementById('apiarySearch');
  const statusFilter = document.getElementById('statusFilter');
  const message = document.getElementById('listMessage');

  function render() {
    const term = search.value.trim().toLowerCase();
    const status = statusFilter.value;

    const filtered = apiaries.filter(apiary => {
      const matchesText = !term || [
        apiary.apiary_name,
        apiary.owner_display_name,
        apiary.county_name,
        apiary.yard_type
      ].some(value => String(value || '').toLowerCase().includes(term));

      return matchesText && (!status || apiary.status === status);
    });

    if (!filtered.length) {
      list.innerHTML = '<p class="empty-state">No apiaries match the current filters.</p>';
      return;
    }

    list.innerHTML = filtered.map(apiary => `
      <article class="apiary-record">
        <div>
          <div class="record-heading">
            <h2>${MVBKPortal.escapeHtml(apiary.apiary_name)}</h2>
            <span class="status-pill status-${MVBKPortal.escapeHtml(apiary.status)}">
              ${MVBKPortal.escapeHtml(apiary.status)}
            </span>
          </div>
          <p>${MVBKPortal.escapeHtml(apiary.county_name)} · ${MVBKPortal.escapeHtml(apiary.yard_type)}</p>
        </div>
        <dl>
          <div><dt>Hives</dt><dd>${apiary.hive_count ?? 0}</dd></div>
          <div><dt>Mite count</dt><dd>${apiary.mite_count ?? '—'}</dd></div>
          <div><dt>Treated</dt><dd>${apiary.treated ? 'Yes' : 'No'}</dd></div>
          <div><dt>Inspected</dt><dd>${apiary.nys_inspected ? 'Yes' : 'No'}</dd></div>
        </dl>
      </article>
    `).join('');
  }

  function updateSummary() {
    document.getElementById('totalApiaries').textContent = apiaries.length;
    document.getElementById('activeApiaries').textContent =
      apiaries.filter(a => a.status === 'active').length;
    document.getElementById('pendingApiaries').textContent =
      apiaries.filter(a => a.status === 'pending').length;
    document.getElementById('totalHives').textContent =
      apiaries.reduce((sum, a) => sum + Number(a.hive_count || 0), 0);
  }

  search.addEventListener('input', render);
  statusFilter.addEventListener('change', render);

  MVBKPortal.initPage()
    .then(async ({ client }) => {
      const { data, error } = await client.rpc('get_own_apiaries');
      if (error) throw error;
      apiaries = Array.isArray(data) ? data : [];
      updateSummary();
      render();
    })
    .catch(error => {
      console.error(error);
      list.innerHTML = '<p class="empty-state">Unable to load your apiaries.</p>';
      message.textContent = error.message;
    });
})();
