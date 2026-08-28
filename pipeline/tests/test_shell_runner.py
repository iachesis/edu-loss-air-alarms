from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ShellRunnerTests(unittest.TestCase):
    def test_all_action_is_safe_with_no_optional_arguments(self):
        bash = shutil.which("bash")
        if bash is None:
            self.skipTest("bash is unavailable")

        script_text = (ROOT / "run_local.sh").read_text(encoding="utf-8")
        # macOS commonly ships Bash 3.2. With `set -u`, expanding an empty
        # array can raise "unbound variable". Keep this path scalar-only.
        self.assertNotIn("PREFLIGHT_ARGS=()", script_text)
        self.assertNotIn('${PREFLIGHT_ARGS[@]}', script_text)

        with tempfile.TemporaryDirectory() as temp:
            temp_root = Path(temp)
            runner = temp_root / "run_local.sh"
            shutil.copy2(ROOT / "run_local.sh", runner)
            runner.chmod(0o755)

            fake_bin = temp_root / "bin"
            fake_bin.mkdir()
            log_path = temp_root / "calls.log"
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                "printf '%s\\n' \"$*\" >> \"$FAKE_UV_LOG\"\n"
                "exit 0\n",
                encoding="utf-8",
            )
            fake_uv.chmod(0o755)

            env = os.environ.copy()
            env["PATH"] = f"{fake_bin}:{env.get('PATH', '')}"
            env["FAKE_UV_LOG"] = str(log_path)

            result = subprocess.run(
                [bash, str(runner), "all"],
                cwd=temp_root,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = log_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(calls), 4)
            self.assertIn("airalarms.py preflight", calls[0])
            self.assertNotIn("--alarm-source", calls[0])
            self.assertIn("airalarms.py local-build --output output/full", calls[2])

    def test_all_forwards_pinned_identity_and_controlled_input_root_to_preflight(self):
        bash = shutil.which("bash")
        if bash is None:
            self.skipTest("bash is unavailable")
        with tempfile.TemporaryDirectory() as temp:
            temp_root = Path(temp)
            runner = temp_root / "run_local.sh"
            shutil.copy2(ROOT / "run_local.sh", runner)
            runner.chmod(0o755)
            fake_bin = temp_root / "bin"
            fake_bin.mkdir()
            log_path = temp_root / "calls.log"
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                "printf '%s\\n' \"$*\" >> \"$FAKE_UV_LOG\"\n"
                "exit 0\n",
                encoding="utf-8",
            )
            fake_uv.chmod(0o755)
            env = os.environ.copy()
            env["PATH"] = f"{fake_bin}:{env.get('PATH', '')}"
            env["FAKE_UV_LOG"] = str(log_path)
            result = subprocess.run(
                [
                    bash, str(runner), "all",
                    "--alarm-source", "pinned.csv",
                    "--alarm-source-sha256", "abc123",
                    "--controlled-input-root", "controlled",
                ],
                cwd=temp_root,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = log_path.read_text(encoding="utf-8").splitlines()
            self.assertIn(
                "airalarms.py preflight --alarm-source pinned.csv --alarm-source-sha256 abc123 --controlled-input-root controlled",
                calls[0],
            )
            self.assertIn("--controlled-input-root controlled", calls[2])


if __name__ == "__main__":
    unittest.main()
