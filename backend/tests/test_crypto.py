from __future__ import annotations

import unittest

from nox_server.crypto import format_fingerprint, hash_secret, make_secret, verify_secret


class CryptoTest(unittest.TestCase):
    def test_secret_hash_verifies_without_storing_plaintext(self):
        secret = make_secret()
        verifier = hash_secret(secret)
        self.assertNotIn(secret, verifier)
        self.assertTrue(verify_secret(secret, verifier))
        self.assertFalse(verify_secret(secret + "x", verifier))

    def test_fingerprint_formatting(self):
        self.assertEqual(format_fingerprint("AABBcc"), "AA:BB:CC")


if __name__ == "__main__":
    unittest.main()
