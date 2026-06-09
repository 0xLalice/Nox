from __future__ import annotations

import unittest
from pathlib import Path


class InstallScriptTest(unittest.TestCase):
    def test_backend_installer_documents_venv_and_shim(self):
        source = Path("backend/install.sh").read_text(encoding="utf-8")
        self.assertIn("$HOME/.nox", source)
        self.assertIn("python3 -m venv", source)
        self.assertIn("sysconfig.get_paths()", source)
        self.assertIn("cp -a", source)
        self.assertIn("$HOME/.local/bin", source)
        self.assertIn("ln -sfn", source)
        self.assertNotIn("pip install", source)
        self.assertNotIn("latest-desktop-token", source)
        self.assertNotIn("token.txt", source)


if __name__ == "__main__":
    unittest.main()
