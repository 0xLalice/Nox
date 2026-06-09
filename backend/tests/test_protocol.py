from __future__ import annotations

import asyncio
import base64
import hashlib
import os
import unittest

from nox_server.protocol import GUID, handshake


class Reader:
    def __init__(self, data: bytes):
        self.data = data

    async def readuntil(self, sep: bytes) -> bytes:
        return self.data


class Writer:
    def __init__(self):
        self.data = b""

    def write(self, data: bytes) -> None:
        self.data += data

    async def drain(self) -> None:
        return None


class ProtocolTest(unittest.TestCase):
    def test_websocket_handshake_accepts_nox_path(self):
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            "GET /nox/ws HTTP/1.1\r\n"
            "Host: localhost\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        ).encode("ascii")
        writer = Writer()
        asyncio.run(handshake(Reader(request), writer))
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode("ascii")).digest()).decode("ascii")
        self.assertIn(b"101 Switching Protocols", writer.data)
        self.assertIn(accept.encode("ascii"), writer.data)


if __name__ == "__main__":
    unittest.main()
