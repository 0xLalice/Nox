from __future__ import annotations

import os
import stat
import tempfile
import unittest
from pathlib import Path

from nox_server.paths import config_path, ensure_home, nox_home, secure_write


class PathsTest(unittest.TestCase):
    def test_nox_home_uses_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = os.path.join(tmp, "home")
            self.assertEqual(nox_home(), Path(tmp) / "home")
            os.environ.pop("NOX_HOME", None)

    def test_secure_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = os.path.join(tmp, "home")
            home = ensure_home()
            secure_write(config_path(), "{}\n")
            self.assertEqual(stat.S_IMODE(home.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(config_path().stat().st_mode), 0o600)
            os.environ.pop("NOX_HOME", None)


if __name__ == "__main__":
    unittest.main()
