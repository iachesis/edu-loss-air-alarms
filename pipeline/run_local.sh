#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if command -v uv >/dev/null 2>&1; then
  RUN=(uv run --offline python)
elif command -v python3 >/dev/null 2>&1; then
  RUN=(python3)
else
  echo "Python 3.11 or newer is required." >&2
  exit 2
fi

ACTION="${1:-help}"
shift || true

case "$ACTION" in
  preflight)
    "${RUN[@]}" airalarms.py preflight "$@"
    ;;
  test)
    mkdir -p output/full/tests
    "${RUN[@]}" airalarms.py test --report output/full/tests/test_report.txt "$@"
    ;;
  build)
    "${RUN[@]}" airalarms.py local-build --output output/full "$@"
    ;;
  fresh-build)
    "${RUN[@]}" airalarms.py local-build --output output/full --fresh "$@"
    ;;
  review)
    "${RUN[@]}" airalarms.py review-archive --output output/full "$@"
    ;;
  all)
    # Bash 3.2 (the system Bash on many Macs) treats expansion of an
    # empty array as an unbound variable when `set -u` is active. Keep
    # the preflight-only option in scalar variables so `all` works with
    # no optional arguments as well as with a local alarm source.
    PREFLIGHT_SOURCE=""
    PREFLIGHT_SOURCE_SHA256=""
    PREFLIGHT_CONTROLLED_ROOT=""
    EXPECT_OPTION=""
    for arg in "$@"; do
      if [[ -n "$EXPECT_OPTION" ]]; then
        case "$EXPECT_OPTION" in
          source) PREFLIGHT_SOURCE="$arg" ;;
          sha256) PREFLIGHT_SOURCE_SHA256="$arg" ;;
          controlled) PREFLIGHT_CONTROLLED_ROOT="$arg" ;;
        esac
        EXPECT_OPTION=""
        continue
      fi
      case "$arg" in
        --alarm-source)
          EXPECT_OPTION="source"
          ;;
        --alarm-source=*)
          PREFLIGHT_SOURCE="${arg#*=}"
          ;;
        --alarm-source-sha256)
          EXPECT_OPTION="sha256"
          ;;
        --alarm-source-sha256=*)
          PREFLIGHT_SOURCE_SHA256="${arg#*=}"
          ;;
        --controlled-input-root)
          EXPECT_OPTION="controlled"
          ;;
        --controlled-input-root=*)
          PREFLIGHT_CONTROLLED_ROOT="${arg#*=}"
          ;;
      esac
    done

    if [[ -n "$EXPECT_OPTION" ]]; then
      echo "A Stage-B source/input option is missing its value." >&2
      exit 2
    fi

    if [[ -n "$PREFLIGHT_SOURCE" ]]; then
      if [[ -z "$PREFLIGHT_SOURCE_SHA256" ]]; then
        echo "--alarm-source requires --alarm-source-sha256." >&2
        exit 2
      fi
      if [[ -n "$PREFLIGHT_CONTROLLED_ROOT" ]]; then
        "$0" preflight --alarm-source "$PREFLIGHT_SOURCE" --alarm-source-sha256 "$PREFLIGHT_SOURCE_SHA256" --controlled-input-root "$PREFLIGHT_CONTROLLED_ROOT"
      else
        "$0" preflight --alarm-source "$PREFLIGHT_SOURCE" --alarm-source-sha256 "$PREFLIGHT_SOURCE_SHA256"
      fi
    elif [[ -n "$PREFLIGHT_CONTROLLED_ROOT" ]]; then
      "$0" preflight --controlled-input-root "$PREFLIGHT_CONTROLLED_ROOT"
    else
      "$0" preflight
    fi
    "$0" test
    "$0" build "$@"
    "$0" review
    ;;
  help|*)
    cat <<'EOF'
Air Alarms and Education local runner

  ./run_local.sh preflight     Check the Mac, inputs and source access
  ./run_local.sh test          Run all automated tests
  ./run_local.sh build         Run or resume the complete national build
  ./run_local.sh fresh-build   Delete old build outputs and start again
  ./run_local.sh review        Create the one ZIP to return for review
  ./run_local.sh all           Preflight, test, build and create review ZIP

Optional examples:
  ./run_local.sh preflight --controlled-input-root <controlled-input-directory>
  ./run_local.sh build --controlled-input-root <controlled-input-directory>
  ./run_local.sh build --alarm-source <pinned-source.csv> --alarm-source-sha256 <sha256> --controlled-input-root <controlled-input-directory>
  ./run_local.sh build --school-year 2024_2025 --oblast-id UA12 --controlled-input-root <controlled-input-directory>
EOF
    ;;
esac
