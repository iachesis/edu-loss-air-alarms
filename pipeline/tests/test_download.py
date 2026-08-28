from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.pipeline import download_alarm_source


class DownloadTests(unittest.TestCase):
    def test_downloader_streams_to_destination(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            source = temp_path / "source.csv"
            target = temp_path / "nested" / "target.csv"
            source.write_text("a,b\n1,2\n", encoding="utf-8")
            download_alarm_source(source.as_uri(), target)
            self.assertEqual(target.read_bytes(), source.read_bytes())


if __name__ == "__main__":
    unittest.main()
