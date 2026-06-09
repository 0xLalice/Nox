from __future__ import annotations

import json
import os
import stat
import tempfile
import unittest

from nox_server.config import Config, initialize, replace_token, validate_public_url
from nox_server.crypto import verify_secret
from nox_server.paths import config_path, queue_path


class ConfigTest(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("NOX_HOME", None)

    def test_public_url_validation(self):
        validate_public_url("wss://example.com:8765/nox/ws")
        validate_public_url("ws://127.0.0.1:8765/nox/ws")
        with self.assertRaises(ValueError):
            validate_public_url("ws://example.com:8765/nox/ws")
        with self.assertRaises(ValueError):
            validate_public_url("wss://example.com:8765/other")

    def test_initialize_writes_hash_only_and_no_token_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            secret, fingerprint = initialize("ws://127.0.0.1:8765/nox/ws")
            self.assertEqual(fingerprint, "")
            data = json.loads(config_path().read_text(encoding="utf-8"))
            self.assertNotIn(secret, config_path().read_text(encoding="utf-8"))
            self.assertTrue(data["tokenVerifier"].startswith("pbkdf2_sha256$"))
            self.assertTrue(verify_secret(secret, data["tokenVerifier"]))
            self.assertTrue(queue_path().exists())
            self.assertEqual(stat.S_IMODE(queue_path().stat().st_mode), 0o600)
            self.assertFalse(list(config_path().parent.glob("*token*")))
            self.assertFalse(list(config_path().parent.glob("*secret*")))

    def test_rotate_replaces_verifier(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            first_secret, _ = initialize("ws://127.0.0.1:8765/nox/ws")
            first_cfg = Config.from_file()
            second_secret = replace_token(first_cfg)
            second_cfg = Config.from_file()
            self.assertNotEqual(first_secret, second_secret)
            self.assertNotEqual(first_cfg.token_verifier, second_cfg.token_verifier)
            self.assertFalse(verify_secret(first_secret, second_cfg.token_verifier))
            self.assertTrue(verify_secret(second_secret, second_cfg.token_verifier))


if __name__ == "__main__":
    unittest.main()
