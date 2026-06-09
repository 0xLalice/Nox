from __future__ import annotations

import asyncio
import json
import logging
import ssl
from pathlib import Path

from .config import Config
from .crypto import verify_secret
from .paths import config_path
from .protocol import WebSocketError, handshake, read_json, send_frame, send_json
from .queue import acknowledge_through, cleanup_expired

QUEUE_POLL_SECONDS = 0.2
LOGGER = logging.getLogger("nox")


def peer_name(writer: asyncio.StreamWriter) -> str:
    peer = writer.get_extra_info("peername")
    if isinstance(peer, tuple):
        return ":".join(str(part) for part in peer[:2])
    return str(peer or "unknown")


class NoxServer:
    def __init__(self, cfg: Config, queue_file: Path, config_file: Path):
        self.cfg = cfg
        self.queue_file = queue_file
        self.config_file = config_file
        self.clients: set[asyncio.StreamWriter] = set()
        self.last_size = queue_file.stat().st_size if queue_file.exists() else 0
        self.config_mtime = config_file.stat().st_mtime if config_file.exists() else 0

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        authenticated = False
        peer = peer_name(writer)
        try:
            await handshake(reader, writer)
            hello = await asyncio.wait_for(read_json(reader), timeout=10)
            if (
                not hello
                or hello.get("type") != "hello"
                or hello.get("version") != 1
                or self.cfg.revoked
                or not verify_secret(str(hello.get("token", "")), self.cfg.token_verifier)
            ):
                LOGGER.warning("auth failed remote=%s", peer)
                await send_json(writer, {"type": "error", "code": "auth_failed"})
                await send_frame(writer, 0x8)
                return

            authenticated = True
            await self.replace_existing_clients()
            self.clients.add(writer)
            await self.send_queue(writer)
            while True:
                frame = await read_json(reader)
                if frame is None:
                    break
                frame_type = frame.get("type")
                if frame_type == "_ping":
                    await send_frame(writer, 0xA, frame.get("payload", b""))
                elif frame_type == "ping":
                    await send_json(writer, {"type": "pong"})
                elif frame_type == "ack_all":
                    acknowledge_through(str(frame.get("lastId", "")), self.queue_file)
                    self.last_size = self.queue_file.stat().st_size if self.queue_file.exists() else 0
                else:
                    await send_json(writer, {"type": "error", "code": "unknown_frame"})
        except asyncio.IncompleteReadError:
            pass
        except (ConnectionError, WebSocketError, json.JSONDecodeError, TimeoutError) as exc:
            LOGGER.warning("connection failure remote=%s error=%s", peer, exc)
        finally:
            if authenticated:
                self.clients.discard(writer)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def send_queue(self, writer: asyncio.StreamWriter) -> None:
        pending = cleanup_expired(self.queue_file)
        total = len(pending)
        await send_json(writer, {"type": "ready", "queueDepth": total})
        for index, item in enumerate(pending, start=1):
            await send_json(
                writer,
                {
                    "type": "message",
                    "id": item["id"],
                    "text": item["text"],
                    "position": index,
                    "total": total,
                    "createdAt": item["createdAt"],
                    "expiresAt": item["expiresAt"],
                },
            )

    async def replace_existing_clients(self) -> None:
        clients = list(self.clients)
        self.clients.clear()
        for client in clients:
            try:
                await send_json(client, {"type": "error", "code": "replaced"})
                await send_frame(client, 0x8)
                client.close()
            except Exception:
                pass

    async def poll_queue(self) -> None:
        while True:
            await asyncio.sleep(QUEUE_POLL_SECONDS)
            await self.reload_config_if_changed()
            current_size = self.queue_file.stat().st_size if self.queue_file.exists() else 0
            if not self.clients:
                self.last_size = current_size
                continue
            if current_size != self.last_size:
                self.last_size = current_size
                await asyncio.gather(*(self.send_queue(client) for client in list(self.clients)), return_exceptions=True)

    async def reload_config_if_changed(self) -> None:
        try:
            mtime = self.config_file.stat().st_mtime
        except FileNotFoundError:
            return
        if mtime == self.config_mtime:
            return
        old_verifier = self.cfg.token_verifier
        old_revoked = self.cfg.revoked
        self.cfg = Config.from_file(self.config_file)
        self.config_mtime = mtime
        if self.cfg.token_verifier != old_verifier or self.cfg.revoked != old_revoked:
            clients = list(self.clients)
            self.clients.clear()
            for client in clients:
                try:
                    await send_json(client, {"type": "error", "code": "token_changed"})
                    await send_frame(client, 0x8)
                    client.close()
                except Exception:
                    pass


async def serve(cfg: Config, queue_file: Path) -> None:
    host, port_text = cfg.bind.rsplit(":", 1)
    ssl_context = None
    if cfg.public_url.startswith("wss://"):
        if not cfg.tls_cert or not cfg.tls_key:
            raise ValueError("wss:// public URL requires tls.crt and tls.key")
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(cfg.tls_cert, cfg.tls_key)
    nox = NoxServer(cfg, queue_file, config_path())
    server = await asyncio.start_server(nox.handle, host, int(port_text), ssl=ssl_context)
    asyncio.create_task(nox.poll_queue())
    LOGGER.info("listening bind=%s publicUrl=%s", cfg.bind, cfg.public_url)
    async with server:
        await server.serve_forever()
