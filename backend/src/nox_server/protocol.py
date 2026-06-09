from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import struct

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class WebSocketError(Exception):
    pass


async def read_http_headers(reader: asyncio.StreamReader) -> dict[str, str]:
    data = await reader.readuntil(b"\r\n\r\n")
    lines = data.decode("latin1").split("\r\n")
    headers = {":request": lines[0]}
    for line in lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.lower()] = value.strip()
    return headers


async def handshake(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    headers = await read_http_headers(reader)
    parts = headers.get(":request", "").split()
    if len(parts) < 3 or parts[0] != "GET" or parts[1] != "/nox/ws":
        writer.write(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
        await writer.drain()
        raise WebSocketError("unsupported websocket endpoint")
    key = headers.get("sec-websocket-key")
    if not key or headers.get("upgrade", "").lower() != "websocket":
        writer.write(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
        await writer.drain()
        raise WebSocketError("missing websocket key")
    if headers.get("sec-websocket-version") != "13":
        writer.write(b"HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\nConnection: close\r\n\r\n")
        await writer.drain()
        raise WebSocketError("unsupported websocket version")
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode("ascii")).digest()).decode("ascii")
    writer.write(
        (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n"
            "\r\n"
        ).encode("ascii")
    )
    await writer.drain()


async def read_frame(reader: asyncio.StreamReader) -> tuple[int, bytes]:
    first = await reader.readexactly(2)
    opcode = first[0] & 0x0F
    masked = bool(first[1] & 0x80)
    length = first[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", await reader.readexactly(8))[0]
    mask = await reader.readexactly(4) if masked else b""
    payload = await reader.readexactly(length) if length else b""
    if masked:
        payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
    return opcode, payload


async def send_frame(writer: asyncio.StreamWriter, opcode: int, payload: bytes = b"") -> None:
    length = len(payload)
    header = bytearray([0x80 | opcode])
    if length < 126:
        header.append(length)
    elif length <= 0xFFFF:
        header.extend([126])
        header.extend(struct.pack("!H", length))
    else:
        header.extend([127])
        header.extend(struct.pack("!Q", length))
    writer.write(bytes(header) + payload)
    await writer.drain()


async def send_json(writer: asyncio.StreamWriter, frame: dict) -> None:
    await send_frame(writer, 0x1, json.dumps(frame, separators=(",", ":")).encode("utf-8"))


async def read_json(reader: asyncio.StreamReader) -> dict | None:
    opcode, payload = await read_frame(reader)
    if opcode == 0x8:
        return None
    if opcode == 0x9:
        return {"type": "_ping", "payload": payload}
    if opcode != 0x1:
        raise WebSocketError(f"unsupported opcode {opcode}")
    return json.loads(payload.decode("utf-8"))
