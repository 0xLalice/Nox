from __future__ import annotations

import os
import tempfile
import unittest

from nox_server.config import Config
from nox_server.queue import acknowledge_through, append_message, read_pending


class QueueTest(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("NOX_HOME", None)

    def test_append_and_ack_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["NOX_HOME"] = tmp
            cfg = Config(token_verifier="hash", max_message_chars=20, max_queue_messages=5)
            first = append_message("hello", cfg)
            second = append_message("again", cfg)
            self.assertEqual([item["id"] for item in read_pending()], [first.id, second.id])
            self.assertEqual(acknowledge_through(first.id), 1)
            self.assertEqual([item["id"] for item in read_pending()], [second.id])


if __name__ == "__main__":
    unittest.main()
