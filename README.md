# How Air Alarms Disrupt the School Day in Ukraine

Public analytical dashboard for understanding how recorded air alarms overlap with assumed school time in Ukraine.

The dashboard estimates overlap between recorded air-alarm intervals and an assumed school operating window. It supports public communication, comparative analysis, and policy or donor discussion across Ukraine, oblasts, and hromadas.

## Product purpose

The product provides a consistent way to compare how recorded air alarms intersect with assumed school operating time. It is intended for UNICEF, education authorities, analysts, donors, and the public.

The dashboard is an analytical model, not a monitoring system for individual schools or learners. Its results describe estimated overlap under a common set of assumptions.

## Four core indicators

1. **Air-alarm time during assumed school hours** — the duration of positive overlap between recorded air-alarm intervals and assumed school operating time during the selected period.
2. **Share of assumed school time under air alarm** — positive-overlap seconds divided by available assumed school seconds.
3. **Assumed school days with an air alarm** — the number of assumed school days with at least one positive alarm overlap; the displayed percentage is their share of available assumed school days.
4. **Air-alarm episodes overlapping assumed school time** — distinct processed alarm episodes with positive overlap during the selected period.

For oblast and national views, absolute values such as hours, affected days, and episodes are averages per active school location over the selected period. A value such as `135.2` episodes for Ukraine in 2025/26 therefore means an average of 135.2 distinct processed episodes per active school location over that school year; it does not mean episodes per day. Hromada values remain direct territorial results under the governed analytical contract.

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

It is not a causal estimate, a school-level administrative record, or an automatic prioritisation score. A covered zero, partial coverage, `not_covered`, generic analytical unavailability, and unavailable geometry are distinct states. `UA01` and `UA44` are marked `not_covered` because the controlled source configuration identifies their permanent siren regimes as outside source coverage; their analytical values remain null rather than becoming zero.

## Architecture

This repository contains the deployable static site and the public-safe maintenance source for its analytical pipeline. The site has no application backend, runtime database, package-install step, tracking, cookies, or runtime dependency on third-party network services.

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
pipeline/                  Public-safe pipeline, tests, controlled configuration and evidence
pipeline/config/           Governed versions, source contract and controlled-input manifest
pipeline/evidence/stage-b/ Machine-readable Stage-B regression and integration evidence
pipeline/tests/            Synthetic regression tests; no controlled education rows
vendor/                    Vendored browser libraries
```

The pipeline deliberately excludes the raw alarm CSV, school-level education rows, build directories, caches, and internal review archives. A maintainer supplies the controlled education bundle outside the repository; [`pipeline/config/controlled_inputs.json`](pipeline/config/controlled_inputs.json) defines the required filenames, roles, snapshot dates, byte sizes, and SHA-256 identities. The runner fails when an input is absent or hash-mismatched. See [`pipeline/README.md`](pipeline/README.md) for the verified acquisition, preflight, clean-build, resume, differential, and review procedures.

## Local serving

Serve the repository root over HTTP:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Opening the HTML directly with a `file://` URL is not supported because the application loads local JSON and GeoJSON assets with `fetch`.

## Provenance

- Website release ID: `AAE-WEB-1.1.0` (candidate pending independent acceptance)
- Analytical build ID: `AAE-FULL-88db64d06afa99610f`
- Analytical build status: `PASS_WITH_REVIEW_FLAGS` with 26/26 reconciliation checks and no hard failures
- Immutable alarm source: [Ukrainian Air Raid Sirens Dataset — official data at the resolved commit](https://raw.githubusercontent.com/Vadimkin/ukrainian-air-raid-sirens-dataset/f3bbc50ab34a8100018f2d95f45c6ba053b0c77a/datasets/official_data_uk.csv)
- Resolved upstream commit: `f3bbc50ab34a8100018f2d95f45c6ba053b0c77a`
- Verified Git blob SHA-1: `c7b84747df0c434cf33d9e8d241c7554ca894168`
- Verified source SHA-256: `108954bb2bb28db064069de724fbd67a74bd2a581460bb98e59421e887780445`
- Source retrieval: started `2026-08-28T19:38:42Z`, completed `2026-08-28T19:38:57Z`
- Source coverage: 15 March 2022 through 28 August 2026 UTC
- Governed methodology / indicator dictionary: `0.2` / `0.3`
- Machine-readable release metadata: [`data/release.json`](data/release.json)
- Static payload manifest: [`data/payload_manifest.json`](data/payload_manifest.json)
- Stage-B validation record: [`data/stage_b_validation.json`](data/stage_b_validation.json)

All 56 analytical payloads were regenerated through the repaired pipeline. A field-level differential against frozen build `AAE-FULL-9c94bc374ab5e7cf29` found no changes to actual analytical numeric values and no added or missing analytical keys. The intended differences are complete source provenance, governed document versions, the new build identity, and `not_covered`/null semantics for controlled areas. Source coverage through July and August does not make those months instructional months: published metrics remain bounded by the governed school calendar and September–June school-year windows.

## Intended use

The dashboard is intended for:

- public communication about the scale and distribution of school-day alarm overlap;
- comparison across time and geography;
- high-level policy and donor discussion;
- transparent exploration of a common analytical model and its limitations.

It should be interpreted alongside local operational knowledge and other education evidence, not as a direct observation of learning outcomes or individual experience.
