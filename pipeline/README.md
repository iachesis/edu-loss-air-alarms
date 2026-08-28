# Analytical pipeline maintenance package

This directory is the public-safe maintenance source for the UNICEF Deliverable 2 analytical payloads. It is the same executable source used to generate the payloads published by the Stage-B release candidate. It preserves the governed analytical model; its maintenance changes are limited to source acquisition/provenance, fail-closed validation, checkpoint identity, controlled `not_covered` missingness, governed version metadata, and regression evidence.

## Publication boundary

Included here:

- standard-library Python pipeline and CLI;
- deterministic configuration and governed assumptions safe for publication;
- aggregate geography/reference tables;
- controlled-input identity manifest;
- focused unit and integration tests;
- Stage-B comparison and integration utilities.

Deliberately excluded:

- school-level education snapshot rows;
- downloaded raw alarm-source bytes;
- build directories, checkpoints, logs and caches;
- historical internal review archives;
- local paths and credentials.

The six required education snapshots are described only by filename, snapshot date, byte size, SHA-256 and role in [`config/controlled_inputs.json`](config/controlled_inputs.json). A maintainer must receive those controlled files through the authorized channel and place them together in a separate directory. Preflight and build fail if any file is missing, renamed, size-mismatched or hash-mismatched.

## Requirements

- Python 3.11 or newer;
- enough local space for the content-addressed alarm source, checkpoints and build output;
- the exact controlled education-input bundle described above;
- network access to GitHub for a current-source production build.

There are no runtime Python dependencies outside the standard library. `uv` is used when already available; otherwise the runner uses `python3`.

## Current-source production build

From this directory:

```bash
./run_local.sh preflight --controlled-input-root <controlled-input-directory>
./run_local.sh test
./run_local.sh fresh-build --controlled-input-root <controlled-input-directory>
./run_local.sh review
```

The current-source path resolves the configured GitHub file to its latest file-changing commit and blob before download, then downloads the immutable commit URL. The downloader checks HTTP status, non-empty output, `Content-Length` when supplied, resolved byte size, Git blob SHA-1 and post-write SHA-256. It promotes a temporary file only after those checks pass and stores the verified bytes by content hash.

`fresh-build` is required for a new production refresh. A completed build cannot be treated as an interrupted run. Only a `RUNNING` or `PARTIAL` checkpoint may resume, and only when source SHA-256, upstream commit, upstream blob and project fingerprint all match.

## Explicit pinned local source

An immutable local source is a distinct, non-live mode and requires its expected SHA-256:

```bash
./run_local.sh preflight \
  --alarm-source <pinned-source.csv> \
  --alarm-source-sha256 <sha256> \
  --controlled-input-root <controlled-input-directory>

./run_local.sh fresh-build \
  --alarm-source <pinned-source.csv> \
  --alarm-source-sha256 <sha256> \
  --controlled-input-root <controlled-input-directory>
```

Optional `--alarm-source-upstream-commit` and `--alarm-source-git-blob` values bind a known upstream identity. The manifest records this as `explicit_pinned_local_source`; it never claims that a local file was retrieved live.

## Outputs and acceptance gates

Generated files live below `output/`, which is ignored by Git. A full build produces:

- six canonical analytical CSVs;
- all 56 analytical dashboard payloads;
- detailed mapping, source-quality and long-interval audit artifacts;
- governed-version and complete source-provenance metadata;
- a 26-check national reconciliation report;
- restart/checkpoint state bound to immutable identities.

A current full build is acceptable only when every planned batch is present, all valid unique official rows map deterministically, all canonical keys are unique, month/year and percentage reconciliations pass, school-location weighting and education totals reconcile, and each public payload matches its canonical source table. The two known non-positive source rows and retained long intervals remain explicit review evidence; they do not become silent transformations.

## Tests

```bash
./run_local.sh test
```

The tests use synthetic school and alarm fixtures. They do not contain controlled education rows or the downloaded official source. Coverage includes immutable acquisition and adversarial download failures, detailed mapping gates, checkpoint identity, DST transitions, cross-midnight and interval-union behavior, non-positive/long intervals, multi-year weighting, deterministic payload identity, governed metadata, and `not_covered` propagation.

The dashboard’s separate Node standard-library tests run from the repository root:

```bash
node --test tests/*.test.mjs
```

## Controlled semantics

The canonical `not_covered` status applies to `UA01` and `UA44` because the configured source does not supply their permanent siren regimes under the governed methodology. Their analytical alarm measures remain null and are never converted to zero. Mixed national aggregates retain the correct available and expected denominators and remain partial where covered school locations contribute.

The single governed metadata source is [`config/governed_versions.json`](config/governed_versions.json). Required missing or inconsistent entries fail preflight/build. The current governed values are methodology `0.2`, indicator dictionary `0.3`, input data contract `0.1`, processing package `0.1`, local execution package `0.1`, and assumptions `0.1`.
