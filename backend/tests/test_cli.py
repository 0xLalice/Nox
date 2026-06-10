from __future__ import annotations

import contextlib
import io
import json
import os
import re
import tempfile
import unittest

from nox_server.cli import main
from nox_server.paths import config_path


class CliTest(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("NOX_HOME", None)

    def _run(self, argv):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = main(argv)
        return code, stdout.getvalue()

    def test_init_prints_secret_once_and_config_stores_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            code, out = self._run(["init", "--public-url", "ws://127.0.0.1:8765/nox/ws"])
            self.assertEqual(code, 0)
            self.assertIn("Local development warning", out)
            self.assertIn("For remote human setup, use: nox init --public-url wss://HOST:8765/nox/ws", out)
            self.assertIn("Do not use localhost or SSH tunnels for normal remote setup.", out)
            match = re.search(r"Pairing secret: (\S+)", out)
            self.assertIsNotNone(match)
            secret = match.group(1)
            self.assertIn("not stored and cannot be shown again", out)
            config_text = config_path().read_text(encoding="utf-8")
            self.assertNotIn(secret, config_text)
            self.assertTrue(json.loads(config_text)["tokenVerifier"].startswith("pbkdf2_sha256$"))

    def test_wss_init_prints_fingerprint_without_local_dev_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            code, out = self._run(["init", "--public-url", "wss://example.com:8765/nox/ws"])
            self.assertEqual(code, 0)
            self.assertNotIn("Local development warning", out)
            self.assertIn("Certificate fingerprint:", out)

    def test_send_status_and_rotate(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            self.assertEqual(self._run(["init", "--public-url", "ws://127.0.0.1:8765/nox/ws"])[0], 0)
            code, send_out = self._run(["send", "hello"])
            self.assertEqual(code, 0)
            self.assertRegex(send_out, r"[0-9a-f-]{36}")
            code, status_out = self._run(["status"])
            self.assertEqual(code, 0)
            self.assertIn("queueDepth=1", status_out)
            code, rotate_out = self._run(["token", "rotate"])
            self.assertEqual(code, 0)
            self.assertIn("New pairing secret:", rotate_out)
            self.assertIn("not stored", rotate_out)


if __name__ == "__main__":
    unittest.main()
