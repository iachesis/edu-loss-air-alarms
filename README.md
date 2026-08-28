# Air Alarms and the School Day in Ukraine

Public analytical dashboard showing estimated overlap between recorded air alarms and modelled school hours in Ukraine, 2022/23–2025/26.

The dashboard supports comparison across Ukraine, oblasts and hromadas. It measures overlap under a common school-time model; it does not observe actual lesson cancellations, attendance, shelter time or learning loss.

## Modelled school hours

Modelled school hours are a common comparison window: Monday to Friday, 08:00–15:00 in `Europe/Kyiv`, excluding the school-break periods used by the methodology. They are not the actual timetable of any individual school.

Recorded alarm intervals are converted to `Europe/Kyiv`. Exact duplicates are removed, and overlapping or touching intervals are merged. Only positive overlap with modelled school hours contributes to the indicators.

## Four core indicators

1. **Air-alarm time during modelled school hours** — total duration of positive overlap between recorded air-alarm intervals and modelled school hours during the selected period.
2. **Share of modelled school time under air alarm** — overlap time divided by modelled school time for which comparable alarm-source coverage is available.
3. **Modelled school days with an air alarm** — a day is counted only when at least one recorded air alarm has positive overlap with modelled school hours on that day. The displayed percentage is the **share of modelled school days with an air alarm**.
4. **Air-alarm episodes during modelled school hours** — distinct processed air-alarm episodes with at least one positive overlap during the selected period.

For Ukraine and oblasts, hours, days and episode counts are averages per active school location. Hromadas are weighted by their number of active schools. Percentages are calculated from the corresponding weighted totals rather than by averaging percentages.

For a hromada, the value is calculated for the hromada as a whole; it is not an average per school.

## Source geography and coverage

The interface distinguishes the level at which an alarm was reported from whether comparable source coverage is available:

- hromada-level records are used for that hromada;
- raion-level records are applied to hromadas in that raion;
- oblast-level records are applied to hromadas in that oblast;
- mixed results combine records reported at more than one level.

Applying a broader record to a hromada does not mean that a separate hromada-level observation occurred.

Zero, partial coverage, not covered by source, unavailable results and missing map geometry are distinct states. Crimea and Luhansk Oblast are treated as not covered by source in this release. Missing geometry affects mapping only; an analytical value may still be available in the table.

## Education context

School and learner counts describe the education network, not attendance during air alarms. The published context uses these snapshots:

| School year | Education snapshot used |
| ----------- | ----------------------- |
| 2022/23 | 1 January 2023 |
| 2023/24 | 20 April 2024 |
| 2024/25 | 20 March 2025 |
| 2025/26 | 9 March 2026 |

For 2022/23, in-person learners are derived as total learners minus remote learners because the more detailed modality split was unavailable. In later years, in-person, remote and mixed learners are reported separately. “Other modalities” is the remaining number after those categories are subtracted from the total and includes categories not shown separately.

Raw school-level rows are not published through the site.

## Geography and periods

The dashboard includes:

- Ukraine;
- 26 oblast-level territories;
- 1,773 hromadas;
- map geometry for 1,767 hromadas, with six geometry gaps.

Users can view a whole school year, one month, a custom month range or all available school-calendar data.

## Repository structure

The deployable site is static and has no application backend, runtime database, tracking, cookies or runtime dependency on third-party network services. Browser libraries are vendored in the repository.

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
src/resources.js           Ukrainian and English interface copy
src/styles.css             Shared responsive presentation
data/release.json          Release, source and analytical provenance
data/payload_manifest.json Static payload manifest
data/geography_lookup.json Geography catalogue and search metadata
data/geography/            Oblast and hromada GeoJSON
data/*_monthly.json        Monthly analytical payloads
data/*_school_year.json    School-year analytical payloads
pipeline/                  Reproducible analytical pipeline and tests
pipeline/config/           Versions, source contract and input manifest
pipeline/evidence/stage-b/ Regression and integration evidence
pipeline/tests/            Synthetic regression tests; no school-level rows
vendor/                    Vendored browser libraries
```

The repository excludes the raw alarm CSV and school-level education rows. A maintainer supplies the education input bundle outside the repository; [`pipeline/config/controlled_inputs.json`](pipeline/config/controlled_inputs.json) defines the required filenames, roles, snapshot dates, byte sizes and SHA-256 identities. See [`pipeline/README.md`](pipeline/README.md) for acquisition, preflight, build and review procedures.

## Local serving

Serve the repository root over HTTP:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

Opening the HTML directly with a `file://` URL is not supported because the application loads local JSON and GeoJSON assets with `fetch`.

Run the frontend tests with:

```bash
node --test tests/*.test.mjs
```

## Release information

- Website release ID: `AAE-WEB-1.1.0`
- Website status: release candidate pending a separate data-correctness audit
- Analytical build ID: `AAE-FULL-88db64d06afa99610f`
- Air-alarm source: [Ukrainian Air Raid Sirens Dataset — file used for this release](https://raw.githubusercontent.com/Vadimkin/ukrainian-air-raid-sirens-dataset/f3bbc50ab34a8100018f2d95f45c6ba053b0c77a/datasets/official_data_uk.csv)
- Source coverage: 15 March 2022 through 28 August 2026 UTC
- Machine-readable release metadata: [`data/release.json`](data/release.json)
- Static payload manifest: [`data/payload_manifest.json`](data/payload_manifest.json)

The analytical values and formulas remain subject to the separate data-correctness audit. The public [`methodology.html`](methodology.html) page explains interpretation; [`data.html`](data.html) documents sources, snapshot dates, coverage and technical release details.
