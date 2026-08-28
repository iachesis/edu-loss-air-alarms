from __future__ import annotations

import hashlib
import json
import os
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

from .utils import ensure_dir, sha256_file, utc_now_iso


UrlOpen = Callable[..., Any]


def git_blob_sha1_file(path: Path) -> str:
    """Return the canonical Git blob SHA-1 for the exact file bytes."""
    size = path.stat().st_size
    digest = hashlib.sha1()
    digest.update(f"blob {size}\0".encode("ascii"))
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json_url(url: str, *, urlopen: UrlOpen, timeout: int = 60) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "air-alarms-education/0.3",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        status_value = getattr(response, "status", 200)
        status = 200 if status_value is None else int(status_value)
        if status < 200 or status >= 300:
            raise RuntimeError(f"GitHub API returned HTTP {status} for {url}")
        return json.loads(response.read().decode("utf-8"))


def resolve_github_source(
    source_config: dict[str, Any],
    *,
    urlopen: UrlOpen = urllib.request.urlopen,
) -> dict[str, Any]:
    """Resolve a configured moving GitHub file to an immutable commit and blob."""
    owner = source_config.get("repository_owner")
    repository = source_config.get("repository_name")
    path = source_config.get("path")
    branch = source_config.get("branch")
    configured_url = source_config.get("configured_source_url") or source_config.get("raw_url")
    missing = [
        key
        for key, value in {
            "repository_owner": owner,
            "repository_name": repository,
            "path": path,
            "branch": branch,
            "configured_source_url": configured_url,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"GitHub source configuration is incomplete: {missing}")

    encoded_path = urllib.parse.quote(str(path), safe="/")
    encoded_branch = urllib.parse.quote(str(branch), safe="")
    commits_url = (
        f"https://api.github.com/repos/{owner}/{repository}/commits"
        f"?path={encoded_path}&sha={encoded_branch}&per_page=1"
    )
    commits = _read_json_url(commits_url, urlopen=urlopen)
    if not isinstance(commits, list) or not commits or not commits[0].get("sha"):
        raise RuntimeError("GitHub did not return a commit for the configured source path")
    commit_sha = str(commits[0]["sha"])

    contents_url = (
        f"https://api.github.com/repos/{owner}/{repository}/contents/{encoded_path}"
        f"?ref={urllib.parse.quote(commit_sha, safe='')}"
    )
    content = _read_json_url(contents_url, urlopen=urlopen)
    if content.get("type") != "file":
        raise RuntimeError("Configured GitHub source did not resolve to a file")
    blob_sha = str(content.get("sha", ""))
    size = content.get("size")
    if len(blob_sha) != 40 or not isinstance(size, int) or size <= 0:
        raise RuntimeError("GitHub source resolution omitted a valid blob SHA or byte size")

    immutable_raw_url = (
        f"https://raw.githubusercontent.com/{owner}/{repository}/{commit_sha}/{path}"
    )
    api_download_url = content.get("download_url")
    if api_download_url and api_download_url != immutable_raw_url:
        raise RuntimeError("GitHub immutable download URL disagrees with the resolved object")

    return {
        "configured_source_url": configured_url,
        "repository_owner": owner,
        "repository_name": repository,
        "repository_path": path,
        "repository_branch": branch,
        "resolved_upstream_commit_sha": commit_sha,
        "upstream_git_blob_sha1": blob_sha,
        "expected_resolved_byte_size": size,
        "immutable_resolved_raw_url": immutable_raw_url,
        "resolved_at_utc": utc_now_iso(),
    }


def download_verified_source(
    url: str,
    destination: Path,
    *,
    expected_size: int | None = None,
    expected_git_blob_sha1: str | None = None,
    expected_sha256: str | None = None,
    urlopen: UrlOpen = urllib.request.urlopen,
    timeout: int = 180,
) -> dict[str, Any]:
    """Download to a temporary file and promote only after all identity checks pass."""
    ensure_dir(destination.parent)
    started_at = utc_now_iso()
    fd, temp_name = tempfile.mkstemp(prefix=f".{destination.name}.", suffix=".part", dir=destination.parent)
    temp = Path(temp_name)
    actual_bytes = 0
    declared_length: int | None = None
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "air-alarms-education/0.3"})
        with os.fdopen(fd, "wb") as output:
            fd = -1
            with urlopen(request, timeout=timeout) as response:
                status_value = getattr(response, "status", 200)
                status = 200 if status_value is None else int(status_value)
                if status < 200 or status >= 300:
                    raise RuntimeError(f"Source download returned HTTP {status}")
                raw_length = response.headers.get("Content-Length") if getattr(response, "headers", None) else None
                if raw_length not in (None, ""):
                    try:
                        declared_length = int(raw_length)
                    except ValueError as exc:
                        raise ValueError(f"Invalid HTTP Content-Length: {raw_length!r}") from exc
                    if declared_length < 0:
                        raise ValueError("HTTP Content-Length cannot be negative")
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    actual_bytes += len(chunk)
            output.flush()
            os.fsync(output.fileno())

        if actual_bytes <= 0:
            raise ValueError("Downloaded alarm source is empty")
        if declared_length is not None and actual_bytes != declared_length:
            raise ValueError(
                f"HTTP Content-Length mismatch: declared {declared_length}, received {actual_bytes}"
            )
        if expected_size is not None and actual_bytes != expected_size:
            raise ValueError(f"Resolved byte-size mismatch: expected {expected_size}, received {actual_bytes}")

        actual_sha256 = sha256_file(temp)
        actual_blob = git_blob_sha1_file(temp)
        if expected_sha256 is not None and actual_sha256 != expected_sha256:
            raise ValueError(f"SHA-256 mismatch: expected {expected_sha256}, received {actual_sha256}")
        if expected_git_blob_sha1 is not None and actual_blob != expected_git_blob_sha1:
            raise ValueError(
                f"Git blob mismatch: expected {expected_git_blob_sha1}, received {actual_blob}"
            )

        os.replace(temp, destination)
        if sha256_file(destination) != actual_sha256 or git_blob_sha1_file(destination) != actual_blob:
            raise RuntimeError("Promoted source failed post-write identity verification")
        return {
            "retrieval_started_at_utc": started_at,
            "retrieval_completed_at_utc": utc_now_iso(),
            "http_content_length_declared": declared_length,
            "actual_bytes_received": actual_bytes,
            "sha256": actual_sha256,
            "recomputed_git_blob_sha1": actual_blob,
        }
    finally:
        if fd >= 0:
            os.close(fd)
        temp.unlink(missing_ok=True)


def acquire_live_github_source(
    source_config: dict[str, Any],
    cache_dir: Path,
    *,
    urlopen: UrlOpen = urllib.request.urlopen,
) -> tuple[Path, dict[str, Any]]:
    resolution = resolve_github_source(source_config, urlopen=urlopen)
    return acquire_resolved_github_source(resolution, cache_dir, urlopen=urlopen)


def acquire_resolved_github_source(
    resolution: dict[str, Any],
    cache_dir: Path,
    *,
    urlopen: UrlOpen = urllib.request.urlopen,
) -> tuple[Path, dict[str, Any]]:
    """Download one already-resolved immutable GitHub object exactly once."""
    staging = ensure_dir(cache_dir / "staging") / (
        f"{resolution['resolved_upstream_commit_sha']}-{resolution['upstream_git_blob_sha1']}.csv"
    )
    download = download_verified_source(
        resolution["immutable_resolved_raw_url"],
        staging,
        expected_size=resolution["expected_resolved_byte_size"],
        expected_git_blob_sha1=resolution["upstream_git_blob_sha1"],
        urlopen=urlopen,
    )
    content_path = ensure_dir(cache_dir / "sha256") / f"{download['sha256']}.csv"
    try:
        if content_path.exists():
            if (
                content_path.stat().st_size != download["actual_bytes_received"]
                or sha256_file(content_path) != download["sha256"]
                or git_blob_sha1_file(content_path) != download["recomputed_git_blob_sha1"]
            ):
                raise RuntimeError("Existing content-addressed source failed identity verification")
        else:
            os.replace(staging, content_path)
    finally:
        staging.unlink(missing_ok=True)
    provenance = {
        "source_mode": "live_resolved_source",
        **resolution,
        **download,
        "content_addressed_filename": content_path.name,
    }
    return content_path, provenance


def verify_pinned_local_source(
    path: Path,
    *,
    expected_sha256: str,
    upstream_commit_sha: str | None = None,
    upstream_git_blob_sha1: str | None = None,
) -> dict[str, Any]:
    if not expected_sha256:
        raise ValueError("An explicit pinned local source requires --alarm-source-sha256")
    if not path.is_file():
        raise FileNotFoundError(path)
    started = utc_now_iso()
    actual_sha = sha256_file(path)
    actual_blob = git_blob_sha1_file(path)
    if actual_sha != expected_sha256:
        raise ValueError(f"Pinned local source SHA-256 mismatch: expected {expected_sha256}, received {actual_sha}")
    if upstream_git_blob_sha1 and actual_blob != upstream_git_blob_sha1:
        raise ValueError(
            f"Pinned local source Git blob mismatch: expected {upstream_git_blob_sha1}, received {actual_blob}"
        )
    return {
        "source_mode": "explicit_pinned_local_source",
        "local_source_filename": path.name,
        "configured_source_url": None,
        "repository_owner": None,
        "repository_name": None,
        "repository_path": None,
        "repository_branch": None,
        "resolved_upstream_commit_sha": upstream_commit_sha,
        "upstream_git_blob_sha1": upstream_git_blob_sha1,
        "immutable_resolved_raw_url": None,
        "retrieval_started_at_utc": None,
        "retrieval_completed_at_utc": None,
        "local_verification_started_at_utc": started,
        "local_verification_completed_at_utc": utc_now_iso(),
        "http_content_length_declared": None,
        "expected_resolved_byte_size": path.stat().st_size,
        "actual_bytes_received": path.stat().st_size,
        "sha256": actual_sha,
        "recomputed_git_blob_sha1": actual_blob,
        "content_addressed_filename": None,
    }
