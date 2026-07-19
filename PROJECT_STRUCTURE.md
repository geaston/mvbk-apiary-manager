# MVBK Apiary Manager Structure

This cleaned baseline intentionally keeps four pages:

```text
index.html                    Map and sign-in
portal/dashboard.html         Member landing page
portal/my-apiaries.html       Member apiary list
portal/add-apiary.html        Member intake form
```

Shared code is grouped by responsibility:

```text
js/auth.js                    Map-page authentication
js/map.js                     Leaflet setup
js/apiaries.js                Apiary map records
js/counties.js                County layer
js/landcover.js               Land-cover layer
js/forage.js                  Forage calculations
js/data.js                    Data loading
js/events.js                  Map UI events
js/ui.js                      Map rendering helpers
js/portal-common.js           Portal authentication and navigation
js/add-apiary.js              Add Apiary page
js/my-apiaries.js             My Apiaries page
```

## Administrator pages

No placeholder admin pages are included. When a real administrator page is built, keep its content hidden initially and call:

```javascript
MVBKPortal.requireAdmin().then(({ client }) => {
  document.getElementById('adminContent').hidden = false;
  // Load protected admin data here.
});
```

The related database RPC must independently enforce `is_club_admin()`.
