from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from .local_runner import run_local_build
from .preflight import run_preflight
from .review import create_review_archive


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="airalarms", description="Build audited air-alarm education dashboard payloads")
    sub = parser.add_subparsers(dest="command", required=True)

    preflight = sub.add_parser("preflight", help="Check the local machine and project inputs")
    preflight.add_argument("--output", default="output/full/preflight/preflight.json")
    preflight.add_argument("--alarm-source", type=Path)
    preflight.add_argument("--alarm-source-sha256")
    preflight.add_argument("--controlled-input-root", type=Path)
    preflight.add_argument("--skip-network", action="store_true")
    preflight.add_argument("--minimum-free-gb", type=float, default=4.0)

    local = sub.add_parser("local-build", help="Run the restartable complete local build")
    local.add_argument("--alarm-source", type=Path)
    local.add_argument("--school-year", action="append", dest="school_years")
    local.add_argument("--oblast-id", action="append", dest="oblast_ids")
    local.add_argument("--output", default="output/full")
    local.add_argument("--no-resume", action="store_true")
    local.add_argument("--fresh", action="store_true")
    local.add_argument("--alarm-source-sha256")
    local.add_argument("--alarm-source-upstream-commit")
    local.add_argument("--alarm-source-git-blob")
    local.add_argument("--controlled-input-root", type=Path)
    local.add_argument("--source-cache", type=Path)

    review = sub.add_parser("review-archive", help="Create the single archive to return for review")
    review.add_argument("--output", default="output/full")
    review.add_argument("--destination", type=Path)

    test = sub.add_parser("test", help="Run standard-library unit and integration tests")
    test.add_argument("--report", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = project_root()

    if args.command == "test":
        command = [sys.executable, "-m", "unittest", "discover", "-s", str(root / "tests"), "-v"]
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            args.report.write_text(result.stdout, encoding="utf-8")
            print(result.stdout, end="")
        else:
            result = subprocess.run(command)
        return result.returncode

    if args.command == "preflight":
        report = run_preflight(
            root=root,
            output_path=root / args.output,
            alarm_source=args.alarm_source,
            alarm_source_sha256=args.alarm_source_sha256,
            controlled_input_root=args.controlled_input_root,
            skip_network=args.skip_network,
            minimum_free_gb=args.minimum_free_gb,
        )
        print(f"Preflight: {report['status']}")
        print(f"Report: {root / args.output}")
        return 0 if report["status"] == "PASS" else 1

    if args.command == "local-build":
        state = run_local_build(
            root=root,
            output_dir=root / args.output,
            alarm_source=args.alarm_source,
            school_years=args.school_years,
            oblast_ids=args.oblast_ids,
            resume=not args.no_resume,
            fresh=args.fresh,
            alarm_source_sha256=args.alarm_source_sha256,
            alarm_source_upstream_commit=args.alarm_source_upstream_commit,
            alarm_source_git_blob=args.alarm_source_git_blob,
            controlled_input_root=args.controlled_input_root,
            source_cache_dir=args.source_cache,
        )
        print(f"Local build: {state['status']}")
        if state.get("final_build_id"):
            print(f"Build ID: {state['final_build_id']}")
        return 0 if state["status"] in {"PASS", "PASS_WITH_REVIEW_FLAGS"} else 1

    result = create_review_archive(
        root=root,
        output_dir=root / args.output,
        destination=args.destination,
    )
    print(f"Review archive: {result['archive_path']}")
    print(f"SHA-256: {result['sha256']}")
    return 0
