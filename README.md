# How Air Alarms Disrupt the School Day in Ukraine

Public analytical dashboard for UNICEF Deliverable 2: **Model for quantification of disruption of educational activities due to air alarms and dashboard**.

The dashboard estimates overlap between recorded air-alarm intervals and an assumed school operating window. It supports public communication, comparative analysis, and policy or donor discussion across Ukraine, oblasts, and hromadas.

## Product purpose

The product provides a consistent way to compare how recorded air alarms intersect with assumed school operating time. It is intended for UNICEF, education authorities, analysts, donors, and the public.

The dashboard is an analytical model, not a monitoring system for individual schools or learners. Its results describe estimated overlap under a common set of assumptions.

## Three core measures

1. **School time under alarm** — the duration of recorded alarm intervals that overlaps the assumed school operating window, together with its share of available assumed school time.
2. **School days affected** — the number and share of available assumed school days with at least one positive alarm overlap.
3. **School-time alarm episodes** — distinct processed alarm episodes with positive overlap during assumed school time.

For oblast and national views, absolute values such as hours, affected days, and episodes are averages per active school location. A value such as `87.8` affected days is therefore an average across active school locations, not a fractional calendar day experienced by one institution. Hromada values remain direct geographic results under the frozen analytical contract.

## Education context

School and learner figures provide contextual information about the education network. They are not measurements of attendance, learner presence, or exposure during an alarm.

For the 2022/23 school year, the in-person figure is derived as total learners minus remote learners because a more detailed modality classification was not available. Later years report in-person, remote, and mixed modalities separately; other modalities are a derived residual, as documented in [`data/modality_rules.json`](data/modality_rules.json).

## Geography and periods

The dashboard supports three geographic levels:

- Ukraine;
- oblast;
- hromada.

Oblast geometry loads with the initial page. Hromada data and geometry load for the relevant oblast after an oblast or hromada is selected. Six controlled hromadas have no geometry in the frozen source; the interface does not fabricate geometry and keeps their analytical and table results available.

Users can view:

- a whole school year;
- a month;
- a custom month range;
- all available data.

## Methodological concept

The analytical chain distinguishes three things:

1. **Observed input:** recorded air-alarm intervals from the frozen source.
2. **Model assumption:** Monday–Friday school days, relevant school-calendar exclusions, and an assumed 08:00–15:00 operating window in `Europe/Kyiv`.
3. **Modelled result:** the overlap between the recorded intervals and the assumed operating window.

Alarm timestamps are converted from UTC to `Europe/Kyiv`, including daylight-saving transitions. Exact duplicates are removed, and overlapping or touching intervals are unioned before the school-window overlap is calculated. Hromada declarations are used directly; raion- and oblast-level declarations are allocated to their contained hromadas while preserving the original geographic precision label.

At oblast and national levels, absolute measures are weighted averages per active school location. Shares are calculated from the corresponding weighted numerators and denominators; percentages are not averaged.

See the public [`methodology.html`](methodology.html) page for the concise rendered explanation.

## Explicit limitations

The dashboard does **not** directly measure:

- learning loss;
- lessons actually cancelled;
- attendance;
- actual time spent in shelters;
- actual school timetables;
- homework disruption;
- sleep disruption;
- individual learner exposure.

It is not a causal estimate, a school-level administrative record, or an automatic prioritisation score. A covered zero, partial coverage, analytical unavailability, and unavailable geometry are distinct states; unavailable analytical values are not replaced with zero.

## Architecture

This repository is the deployable static site. It has no application backend, runtime database, package-install step, tracking, cookies, or runtime dependency on third-party network services.

The browser stack is vendored in the repository:

- vanilla HTML, CSS, and JavaScript modules;
- Leaflet for maps;
- Apache ECharts for charts;
- Fuse.js for geography search;
- i18next for UKR/ENG switching;
- precomputed JSON and GeoJSON assets.

Major repository paths:

```text
index.html                 Main dashboard
methodology.html           Public methodology page
data.html                  Public data and release page
src/main.js                Application state, loading and rendering
src/logic.js               Period, aggregation and formatting logic
src/charts.js              Time-series, heatmap and modality charts
src/map.js                 Leaflet map rendering and viewport controls
src/search.js              Geography search
src/content-page.js        Supporting-page rendering
src/resources.js           UKR/ENG interface copy
src/styles.css             Shared responsive presentation
data/release.json          Release, source and analytical provenance
data/payload_manifest.json Static payload manifest
data/geography_lookup.json Geography catalogue and search metadata
data/geography/            Oblast and hromada GeoJSON
data/*_monthly.json        Monthly analytical payloads
data/*_school_year.json    School-year analytical payloads
vendor/                    Vendored browser libraries
```

## Local serving

Serve the repository root over HTTP:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Opening the HTML directly with a `file://` URL is not supported because the application loads local JSON and GeoJSON assets with `fetch`.

## Provenance

- Website release ID: `AAE-WEB-1.0.0`
- Analytical build ID: `AAE-FULL-9c94bc374ab5e7cf29`
- Analytical build status: `FROZEN_APPROVED`
- Alarm source: [Ukrainian Air Raid Sirens Dataset — official data](https://raw.githubusercontent.com/Vadimkin/ukrainian-air-raid-sirens-dataset/main/datasets/official_data_uk.csv)
- Frozen source SHA-256: `6415f582020a9b731a38a5f56d325b24d22cc9a61c0e7d58971ec6f41cd68004`
- Frozen source coverage: 15 March 2022 through 30 July 2026 UTC
- Machine-readable release metadata: [`data/release.json`](data/release.json)
- Static payload manifest: [`data/payload_manifest.json`](data/payload_manifest.json)

The source retrieval timestamp was not recorded in the frozen analytical build; that provenance gap remains explicit in the release metadata. Website copy, interaction, and release-metadata changes do not create a new analytical build, and this release does not regenerate analytical data.

## Intended use

The dashboard is intended for:

- public communication about the scale and distribution of school-day alarm overlap;
- comparison across time and geography;
- high-level policy and donor discussion;
- transparent exploration of a common analytical model and its limitations.

It should be interpreted alongside local operational knowledge and other education evidence, not as a direct observation of learning outcomes or individual experience.
