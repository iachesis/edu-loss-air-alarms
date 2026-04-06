Recommended project tree

air-alarms-dashboard/
├─ index.html
├─ styles.css
├─ js/
│  ├─ app.js
│  ├─ config.js
│  ├─ constants.js
│  ├─ state.js
│  ├─ data-loader.js
│  ├─ selectors.js
│  ├─ map-view.js
│  ├─ charts.js
│  ├─ table-view.js
│  ├─ detail-view.js
│  ├─ ui-controls.js
│  └─ formatters.js
└─ public/
   └─ data/
      ├─ payloads/
      │  ├─ dashboard_payload_manifest.json
      │  ├─ national_all_time.json
      │  ├─ national_school_year.json
      │  ├─ national_school_month.json
      │  ├─ oblast_all_time.json
      │  ├─ oblast_school_year.json
      │  ├─ oblast_school_month.json
      │  ├─ hromada_all_time.json
      │  ├─ hromada_school_year.json
      │  └─ hromada_school_month_by_oblast/
      └─ geo/
         ├─ oblasts_web.json
         ├─ geo_asset_manifest.json
         └─ hromadas_by_oblast/

Put dashboard payload outputs from step 11 into:
public/data/payloads/

Put geo outputs from step 10 into:
public/data/geo/

This app is plain static HTML/CSS/JS and is GitHub Pages compatible.
