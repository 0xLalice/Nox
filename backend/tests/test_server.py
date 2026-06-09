from __future__ import annotations

import os
import tempfile
import unittest

from nox_server.config import Config, initialize
from nox_server.crypto import verify_secret


class ServerTest(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("NOX_HOME", None)

    def test_server_auth_material_uses_printed_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            secret, _ = initialize("ws://127.0.0.1:8765/nox/ws")
            cfg = Config.from_file()
            self.assertTrue(verify_secret(secret, cfg.token_verifier))
            self.assertFalse(verify_secret("wrong", cfg.token_verifier))


if __name__ == "__main__":
    unittest.main()
