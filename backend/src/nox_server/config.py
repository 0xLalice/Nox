from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from .crypto import generate_self_signed_cert, hash_secret, make_secret
from .paths import config_path, ensure_home, ensure_state_file, queue_path, secure_write, tls_cert_path, tls_key_path

DEFAULT_BIND = "0.0.0.0:8765"
DEFAULT_MAX_MESSAGE_CHARS = 500
DEFAULT_MAX_QUEUE_MESSAGES = 50
DEFAULT_TTL_SECONDS = 604800


@dataclass(frozen=True)
class Config:
    bind: str = DEFAULT_BIND
    public_url: str = "wss://example.com/nox/ws"
    token_verifier: str = ""
    tls_cert: str = ""
    tls_key: str = ""
    max_message_chars: int = DEFAULT_MAX_MESSAGE_CHARS
    max_queue_messages: int = DEFAULT_MAX_QUEUE_MESSAGES
    message_ttl_seconds: int = DEFAULT_TTL_SECONDS
    revoked: bool = False

    @classmethod
    def from_file(cls, path: Path | None = None) -> "Config":
        data = json.loads((path or config_path()).read_text(encoding="utf-8"))
        return cls(
            bind=data.get("bind", DEFAULT_BIND),
            public_url=data.get("publicUrl", "wss://example.com/nox/ws"),
            token_verifier=data.get("tokenVerifier", ""),
            tls_cert=data.get("tlsCert", ""),
            tls_key=data.get("tlsKey", ""),
            max_message_chars=int(data.get("maxMessageChars", DEFAULT_MAX_MESSAGE_CHARS)),
            max_queue_messages=int(data.get("maxQueueMessages", DEFAULT_MAX_QUEUE_MESSAGES)),
            message_ttl_seconds=int(data.get("messageTtlSeconds", DEFAULT_TTL_SECONDS)),
            revoked=bool(data.get("revoked", False)),
        )

    def to_json(self) -> str:
        return json.dumps(
            {
                "bind": self.bind,
                "publicUrl": self.public_url,
                "tokenVerifier": self.token_verifier,
                "tlsCert": self.tls_cert,
                "tlsKey": self.tls_key,
                "maxMessageChars": self.max_message_chars,
                "maxQueueMessages": self.max_queue_messages,
                "messageTtlSeconds": self.message_ttl_seconds,
                "revoked": self.revoked,
            },
            indent=2,
        ) + "\n"


def validate_bind(bind: str) -> None:
    if ":" not in bind:
        raise ValueError("bind must be HOST:PORT")
    host, port_text = bind.rsplit(":", 1)
    if not host:
        raise ValueError("bind host is required")
    port = int(port_text)
    if port < 1 or port > 65535:
        raise ValueError("bind port must be between 1 and 65535")


def validate_public_url(public_url: str) -> None:
    parsed = urlparse(public_url)
    if parsed.scheme != "wss":
        raise ValueError("Nox v0.1 requires a wss:// public URL")
    if parsed.path != "/nox/ws":
        raise ValueError("public URL path must be /nox/ws")
    if parsed.query or parsed.fragment:
        raise ValueError("public URL must not include query or fragment")


def uses_tls(cfg: Config) -> bool:
    return bool(cfg.tls_cert and cfg.tls_key)


def initialize(public_url: str, bind: str = DEFAULT_BIND) -> tuple[str, str]:
    validate_bind(bind)
    validate_public_url(public_url)
    ensure_home()

    parsed = urlparse(public_url)
    tls_cert = ""
    tls_key = ""
    fingerprint = ""
    if parsed.scheme == "wss":
        cert_path = tls_cert_path()
        key_path = tls_key_path()
        fingerprint = generate_self_signed_cert(public_url, cert_path, key_path)
        tls_cert = str(cert_path)
        tls_key = str(key_path)

    secret = make_secret()
    cfg = Config(bind=bind, public_url=public_url, token_verifier=hash_secret(secret), tls_cert=tls_cert, tls_key=tls_key)
    secure_write(config_path(), cfg.to_json())
    ensure_state_file(queue_path())
    return secret, fingerprint


def replace_token(cfg: Config) -> str:
    secret = make_secret()
    updated = Config(
        bind=cfg.bind,
        public_url=cfg.public_url,
        token_verifier=hash_secret(secret),
        tls_cert=cfg.tls_cert,
        tls_key=cfg.tls_key,
        max_message_chars=cfg.max_message_chars,
        max_queue_messages=cfg.max_queue_messages,
        message_ttl_seconds=cfg.message_ttl_seconds,
        revoked=False,
    )
    secure_write(config_path(), updated.to_json())
    return secret


def with_revoked(cfg: Config, revoked: bool) -> Config:
    return Config(
        bind=cfg.bind,
        public_url=cfg.public_url,
        token_verifier=cfg.token_verifier,
        tls_cert=cfg.tls_cert,
        tls_key=cfg.tls_key,
        max_message_chars=cfg.max_message_chars,
        max_queue_messages=cfg.max_queue_messages,
        message_ttl_seconds=cfg.message_ttl_seconds,
        revoked=revoked,
    )
