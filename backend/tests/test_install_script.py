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
        self.assertIn("Open 8765/tcp", source)
        self.assertIn("nox init --public-url wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws", source)
        self.assertIn("certificate fingerprint", source)
        self.assertIn("uses this remote WSS URL and certificate fingerprint for pairing", source)
        for forbidden in [
            "Local development only",
            "ws://127.0.0.1",
            "localhost",
            "loopback",
            "same-machine",
            "SSH tunnel",
            "tunnel",
        ]:
            self.assertNotIn(forbidden, source)
        self.assertNotIn("pip install", source)
        self.assertNotIn("latest-desktop-token", source)
        self.assertNotIn("token.txt", source)


if __name__ == "__main__":
    unittest.main()
