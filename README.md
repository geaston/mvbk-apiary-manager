# MVBK Apiary Map

A member-only Leaflet map for the Mohawk Valley Beekeepers Club, using Supabase authentication and PostGIS county boundaries.

## Project structure

```text
mvbk-apiary-map/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── config.js
│   └── app.js
└── README.md
```

- `index.html` contains the page structure and third-party library references.
- `css/styles.css` contains all application styling.
- `js/config.js` contains Supabase browser configuration and feature flags.
- `js/app.js` contains authentication, map, data-loading, filtering, and rendering logic.

## Run locally

Do not open `index.html` directly with a `file://` URL. Start a local web server from the project folder.

With Python:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload all files and folders from this project.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save and wait for the GitHub Pages URL to appear.

## Supabase authentication setup

In Supabase, open **Authentication → URL Configuration** and add both your local and GitHub Pages URLs as allowed redirect URLs. Examples:

```text
http://localhost:8000/
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY-NAME/
```

Set the GitHub Pages URL as the Site URL after launch if it is the primary deployment.

## Security note

The publishable/anon key in `js/config.js` is visible to site visitors by design. Protect `members`, `apiaries`, `counties`, and future tables with Supabase Row Level Security. Do not put a Supabase service-role key in this repository.

## V1 feature flags

Landcover/bloom analysis and DCA features remain preserved but disabled:

```js
ENABLE_LANDCOVER_FEATURES: false,
ENABLE_DCA_FEATURES: false
```

They can be revisited after the core Supabase apiary migration is complete.
