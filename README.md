# MVBK Apiary Manager

Member-only Leaflet map for the Mohawk Valley Beekeepers Club. Authentication and county data use Supabase. Landcover and DCA code are preserved but disabled through feature flags.

## Project structure

```text
mvbk-apiary-manager/
├── index.html
├── css/
│   ├── main.css
│   └── mobile.css
├── js/
│   ├── config.js
│   ├── auth.js
│   ├── map.js
│   ├── landcover.js
│   ├── counties.js
│   ├── forage.js
│   ├── apiaries.js
│   ├── ui.js
│   ├── data.js
│   └── events.js
├── assets/
│   ├── icons/
│   └── images/
└── data/
```

The JavaScript files are loaded as ordered classic browser scripts. This conservative split keeps the existing app behavior while making each feature easier to find and edit. Do not arbitrarily reorder the script tags in `index.html`.

## Feature flags

Edit `js/config.js`:

```js
ENABLE_LANDCOVER_FEATURES: false,
ENABLE_DCA_FEATURES: false
```

## Local testing

Because the app uses `fetch()`, serve it over HTTP rather than opening `index.html` directly.

With the VS Code Live Server extension, right-click `index.html` and select **Open with Live Server**.

The current V1 code expects `apiaries.json` at the repository root. Keep your existing file there until apiaries are migrated to Supabase.

## Rename the GitHub repository

1. Open `https://github.com/geaston/mvbc`.
2. Select **Settings**.
3. Under **Repository name**, change `mvbc` to `mvbk-apiary-manager`.
4. Click **Rename**.
5. In the VS Code terminal, update the local remote:

```bash
git remote set-url origin https://github.com/geaston/mvbk-apiary-manager.git
git remote -v
```

GitHub normally redirects the old URL, but updating the remote keeps the local project explicit.

## Publish the refactor

Copy these files into your cloned repository, then run:

```bash
git pull
git add .
git commit -m "Refactor app into feature components"
git push
```

## GitHub Pages

In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

Add the deployed URL to the Supabase authentication redirect allowlist. It will normally be:

```text
https://geaston.github.io/mvbk-apiary-manager/
```

## Security

The browser Supabase anon/publishable key is public by design. Protect member, county, and future apiary data with Supabase Row Level Security policies. Never place a Supabase service-role key in this repository.

## Clean baseline

This version contains only the four working pages and uses consistent navigation across the map and member portal. Placeholder administrator pages are intentionally omitted. See `PROJECT_STRUCTURE.md`.
