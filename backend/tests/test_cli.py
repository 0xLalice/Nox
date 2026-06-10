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
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = main(argv)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_init_prints_secret_once_and_config_stores_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            code, out, err = self._run(["init", "--public-url", "wss://agent.example:8765/nox/ws"])
            self.assertEqual(code, 0)
            self.assertEqual(err, "")
            self.assertNotIn("Local development warning", out)
            self.assertIn("WebSocket URL: wss://agent.example:8765/nox/ws", out)
            self.assertIn("Certificate fingerprint:", out)
            match = re.search(r"Pairing secret: (\S+)", out)
            self.assertIsNotNone(match)
            secret = match.group(1)
            self.assertIn("Relay the WebSocket URL, pairing secret, and certificate fingerprint to the human now before doing anything else.", out)
            self.assertIn("Invite the human to run exactly: curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash", out)
            self.assertIn("Do not queue or send test messages until the human has installed the extension and saved preferences.", out)
            self.assertIn("Do not create local visual previews, demos, screenshots, or GNOME substitutes on this backend-only machine.", out)
            self.assertIn("If it is lost before pairing, the agent must run: nox token rotate", out)
            config_text = config_path().read_text(encoding="utf-8")
            self.assertNotIn(secret, config_text)
            self.assertTrue(json.loads(config_text)["tokenVerifier"].startswith("pbkdf2_sha256$"))

    def test_init_rejects_ws_urls(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            code, out, err = self._run(["init", "--public-url", "ws://127.0.0.1:8765/nox/ws"])
            self.assertEqual(code, 2)
            self.assertEqual(out, "")
            self.assertIn("requires a wss:// public URL", err)

    def test_send_status_and_rotate(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            self.assertEqual(self._run(["init", "--public-url", "wss://agent.example:8765/nox/ws"])[0], 0)
            code, send_out, _ = self._run(["send", "hello"])
            self.assertEqual(code, 0)
            self.assertRegex(send_out, r"[0-9a-f-]{36}")
            code, status_out, _ = self._run(["status"])
            self.assertEqual(code, 0)
            self.assertIn("queueDepth=1", status_out)
            code, rotate_out, _ = self._run(["token", "rotate"])
            self.assertEqual(code, 0)
            self.assertIn("New pairing secret:", rotate_out)
            self.assertIn("Relay this new secret to the human now.", rotate_out)
            self.assertIn("not stored", rotate_out)


if __name__ == "__main__":
    unittest.main()
